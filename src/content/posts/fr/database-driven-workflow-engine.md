---
title: "Construire un moteur de workflows Spring Batch piloté par base de données"
description: "Comment exploiter la puissance d'un JobExecutionDecider pour permettre des chaînes configurables à l'exécution, sans redéploiement"
pubDate: 2026-06-21
tags: ["java", "spring-batch", "spring-boot", "workflow", "database"]
draft: false
---

De manière générale, les jobs Spring Batch sont assez rigides : `stepA => stepB => stepC`. On peut, bien sur, utiliser des flows mais tout reste en mémoire.
Cela ne pose pas de problèmes tant que les steps et l'ordre d'exécution ne changent pas. Mais que se passe-t-il quand différentes sources de données nécessitent des pipelines de traitement différents ? Quand les fichiers d'un client ont besoin de validation et d'enrichissement alors que ceux d'un autre partent directement au chargement ? Quand vous devez ajouter, supprimer ou réordonner des étapes sans toucher au code source ?

Cet article présente comment mettre en place un moteur de workflow piloté depuis la base de données et non en mémoire.

---

## Le problème des pipelines classiques

Prenons un système d'import de données. Un job Spring Batch classique ressemble à ceci :

```java
@Bean
public Job dataImportJob(Step validateStep, Step parseStep,
                         Step loadStep, Step archiveStep) {
    return new JobBuilder("dataImport", jobRepository)
        .start(validateStep)
        .next(parseStep)
        .next(loadStep)
        .next(archiveStep)
        .build();
}
```

Cela fonctionne jusqu'à ce que l'on est besoin de :

- Pipelines différents par source de données : des fichiers CSV qui sautent l'enrichissement, des fichiers XML nécessitent une transformation XSLT, des fichiers EDI ont besoin d'une conversion EDI-vers-XML
- Gestion d'erreur conditionnelle : certaines sources qui doivent s'arrêter sur erreur, d'autres qui doivent sauter et continuer
- Tests A/B de nouveaux steps : essayer un nouveau step de déduplication sur 10% du trafic
- Workflows spécifiques par client : le client A a besoin d'un step d'audit supplémentaire, pas le client B

Chacun de ces changements signifie : modifier le code, compiler, exécuter les tests, déployer et espérer que rien n'a cassé.

Il y a une meilleure facon : stocker la topologie de la pipeline dans la base de données.

---

## Le modèle de données : la pipeline en tant que données

L'idée centrale est une hiérarchie d'entités à cinq niveaux :

```text
Chain                 =  Un workflow logique (ex. "ORDER_PROCESSING")
  └── ChainConfiguration  =  Une variante de pipeline nommée (ex. "premium-order")
        └── ChainStep     =  Un liant d'step avec règles de routage
              └── Step    =  Une unité de traitement réutilisable (ex. "validateOrder")
                    └── ChainStatus = référence de statut (ACTIVE, SUSPENDED, ...)
```

Chaque `ChainStep` stocke deux cibles de routage (une pour le succès, une pour l'échec), créant un graphe conditionnel au niveau de la base de données.

### Les entités

```java
@Entity
@Table(name = "ts_chain")
public class Chain {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chn_id", unique = true, updatable = false, nullable = false)
    private Integer id;

    @Column(name = "chn_name")
    private String chainName;

    @Column(name = "chn_description")
    private String description;

    @ManyToOne
    @JoinColumn(name = "chn_sts_id", insertable = false, updatable = false)
    private ChainStatus status;

    @Column(name = "chn_creation_date")
    private LocalDateTime creationDate;

    @Column(name = "chn_update_date")
    private LocalDateTime updateDate;

    @OneToMany(mappedBy = "chain", cascade = CascadeType.ALL)
    private List<ChainConfiguration> chainConfigurations;
}
```

```java
@Entity
@Table(name = "ts_chain_config")
public class ChainConfiguration {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chn_cfg_id", unique = true, updatable = false, nullable = false)
    private Integer id;

    @Column(name = "chn_cfg_name")
    private String confName;

    @Column(name = "chn_cfg_description")
    private String description;

    @ManyToOne
    @JoinColumn(name = "chn_sts_id", insertable = false, updatable = false)
    private ChainStatus chainStatus;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chn_id")
    private Chain chain;

    @OneToMany(mappedBy = "chainConfiguration", cascade = CascadeType.ALL)
    @OrderBy("id")
    private List<ChainStep> chainSteps;

    @Column(name = "chn_cfg_creation_date")
    private LocalDateTime creationDate;

    @Column(name = "chn_cfg_update_date")
    private LocalDateTime updateDate;
}
```

```java
@Entity
@Table(name = "ts_chain_step")
public class ChainStep {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chn_stp_id", unique = true, updatable = false, nullable = false)
    private Integer id;

    @Column(name = "chn_stp_next_step_on_success")
    private String nextStepOnSuccess;

    @Column(name = "chn_stp_next_step_on_failure")
    private String nextStepOnFailure;

    @ManyToOne
    @JoinColumn(name = "chn_sts_id", insertable = false, updatable = false)
    private ChainStatus chainStatus;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "chn_cfg_id")
    private ChainConfiguration chainConfiguration;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "stp_id")
    private Step currentStep;

    @Column(name = "chn_stp_creation_date")
    private LocalDateTime creationDate;

    @Column(name = "chn_stp_update_date")
    private LocalDateTime updateDate;
}
```

```java
@Entity
@Table(name = "ts_step")
public class Step {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "stp_id", unique = true, updatable = false, nullable = false)
    private Integer id;

    @Column(name = "stp_name")
    private String stepName;

    @Column(name = "stp_description")
    private String description;

    @Column(name = "stp_creation_date")
    private LocalDateTime creationDate;

    @Column(name = "stp_update_date")
    private LocalDateTime updateDate;
}
```

### Comment les données pilotent la pipeline

Prenons une chaîne d'exécution `ORDER_PROCESSING` avec trois configurations. Chaque configuration est un ensemble de lignes dans `ts_chain_step` :

| Configuration  | Step 1        | Step 2         | Step 3         | Step 4        | Step 5       | Step 6           | Step 7           | Step 8           | Step 9       |
| -------------- | ------------- | -------------- | -------------- | ------------- | ------------ | ---------------- | ---------------- | ---------------- | ------------ |
| standard-order | validateOrder | checkInventory | processPayment | calculateTax  | fulfillOrder | sendConfirmation | updateAccounting | archiveOrder     |              |
| premium-order  | validateOrder | checkInventory | processPayment | applyDiscount | calculateTax | fulfillOrder     | sendConfirmation | updateAccounting | archiveOrder |
| flagged-order  | validateOrder | checkInventory | escalateOrder  | archiveOrder  |              |                  |                  |                  |              |

Rien n'est codé en dur : ajouter une nouvelle variante de pipeline est une simple instruction `INSERT`.

---

## Le Décideur : Rendre Spring Batch Dynamique

La "magie" opère dans un `JobExecutionDecider`. Après chaque step, Spring Batch consulte le décideur pour déterminer le prochain step.

```java
@Component
public class ChainStepDecider implements JobExecutionDecider {

    private final ChainStepRepository chainStepRepository;

    public ChainStepDecider(ChainStepRepository chainStepRepository) {
        this.chainStepRepository = chainStepRepository;
    }

    @Override
    public FlowExecutionStatus decide(JobExecution jobExecution,
                                      StepExecution stepExecution) {
        String config = jobExecution.getJobParameters()
            .getString("chainConfigName");

        // Special case: chainInformationStep or null stepExecution
        // look up the first step of this configuration
        if (stepExecution == null
                || "chainInformationStep".equals(stepExecution.getStepName())) {
            var steps = chainStepRepository.findFirstStepByConfigName(
                config, PageRequest.of(0, 1));
            String firstStepName = steps.isEmpty()
                ? null : steps.getFirst().getCurrentStep().getStepName();
            if (firstStepName != null) {
                return new FlowExecutionStatus(firstStepName);
            }
            return FlowExecutionStatus.FAILED;
        }

        // Normal flow: look up the current step's routing
        String stepName = stepExecution.getStepName();
        ChainStep currentStep = chainStepRepository
            .findByStepAndConfiguration(stepName, config).orElse(null);

        if (currentStep == null) {
            return FlowExecutionStatus.FAILED;
        }

        if (stepExecution.getStatus() == BatchStatus.COMPLETED) {
            return new FlowExecutionStatus(
                currentStep.getNextStepOnSuccess());
        } else {
            return new FlowExecutionStatus(
                currentStep.getNextStepOnFailure());
        }
    }
}
```

Le repository dispose de deux requêtes. La première est une simple recherche par nom pour le routage après chaque step. La seconde trouve le step initial d'une configuration :

```java
@Repository
public interface ChainStepRepository extends JpaRepository<ChainStep, Integer> {

    @Query("""
        select chs
        from ChainStep chs
        where chs.currentStep.stepName = :stepName
        and chs.chainConfiguration.confName = :confName
        """)
    Optional<ChainStep> findByStepAndConfiguration(
        @Param("stepName") String stepName,
        @Param("confName") String confName);

    @Query("""
        SELECT cs FROM ChainStep cs JOIN FETCH cs.currentStep
        WHERE cs.chainConfiguration.confName = :configName
        ORDER BY cs.id
        """)
    List<ChainStep> findFirstStepByConfigName(
        @Param("configName") String configName, Pageable pageable);

    void deleteAllByChainConfiguration(ChainConfiguration chainConfiguration);

    List<ChainStep> findAllByChainConfiguration(
        ChainConfiguration chainConfiguration);
}
```

---

## Assemblage : la définition du job

Voici comment le job est assemblé. Chaque transition de step passe par le décideur. Le décideur retourne le nom de la prochaine step, et le DSL de flux de Spring Batch le fait correspondre au bean de step correspondant via les constantes `StepEnum`.

```java
@Configuration
public class ConfigurableChainConfig {

    private final ChainStepDecider chainStepDecider;
    private final ProcessCompletionListener processCompletionListener;

    public ConfigurableChainConfig(ChainStepDecider chainStepDecider,
                                   ProcessCompletionListener listener) {
        this.chainStepDecider = chainStepDecider;
        this.processCompletionListener = listener;
    }

    @Bean
    public Job configurableOrderProcessingChain(
            JobRepository jobRepository,
            Step validateOrderStep,
            Step checkInventoryStep,
            Step processPaymentStep,
            Step applyDiscountStep,
            Step calculateTaxStep,
            Step fulfillOrderStep,
            Step sendConfirmationStep,
            Step updateAccountingStep,
            Step escalateOrderStep,
            Step archiveOrderStep,
            Step chainInformationStep) {
        return new JobBuilder(
                "configurableOrderProcessingChain", jobRepository)
            .start(chainInformationStep)
            .next(chainStepDecider)
                .on(VALIDATE_ORDER_STEP.getPattern()).to(validateOrderStep)
            .next(chainStepDecider)
                .on(CHECK_INVENTORY_STEP.getPattern()).to(checkInventoryStep)
            .next(chainStepDecider)
                .on(PROCESS_PAYMENT_STEP.getPattern()).to(processPaymentStep)
            .next(chainStepDecider)
                .on(APPLY_DISCOUNT_STEP.getPattern()).to(applyDiscountStep)
            .next(chainStepDecider)
                .on(CALCULATE_TAX_STEP.getPattern()).to(calculateTaxStep)
            .next(chainStepDecider)
                .on(FULFILL_ORDER_STEP.getPattern()).to(fulfillOrderStep)
            .next(chainStepDecider)
                .on(SEND_CONFIRMATION_STEP.getPattern())
                    .to(sendConfirmationStep)
            .next(chainStepDecider)
                .on(UPDATE_ACCOUNTING_STEP.getPattern())
                    .to(updateAccountingStep)
            .next(chainStepDecider)
                .on(ESCALATE_ORDER_STEP.getPattern()).to(escalateOrderStep)
            .next(chainStepDecider)
                .on(ARCHIVE_ORDER_STEP.getPattern()).to(archiveOrderStep)
            .end()
            .listener(processCompletionListener)
            .build();
    }

    @Bean
    public Step chainInformationStep(JobRepository jobRepository,
            PlatformTransactionManager transactionManager,
            Tasklet chainInformationTasklet) {
        return new StepBuilder("chainInformationStep", jobRepository)
            .tasklet(chainInformationTasklet, transactionManager)
            .build();
    }

    @Bean
    public Step validateOrderStep(JobRepository jobRepository,
            PlatformTransactionManager transactionManager,
            OrderProcessingTasklet tasklet) {
        return new StepBuilder(
            VALIDATE_ORDER_STEP.getPattern(), jobRepository)
            .tasklet(tasklet, transactionManager).build();
    }
    // ... les steps suivants suivent le même principe
}
```

Le `chainInformationStep` est un premier step simple qui donne des informations sur la chaîne :

```java
@Component
@StepScope
public class ChainInformationTasklet implements Tasklet {

    private final String chainConfiguration;

    public ChainInformationTasklet(
            @Value("#{jobParameters[chainConfigName]}")
            String chainConfiguration) {
        this.chainConfiguration = chainConfiguration;
    }

    @Override
    public RepeatStatus exécute(StepContribution contribution,
                                ChunkContext chunkContext) {
        LOGGER.info("Launching chain configuration: {}",
            chainConfiguration);
        LOGGER.info("Job parameters: {}",
            chunkContext.getStepContext().getJobParameters());
        return RepeatStatus.FINISHED;
    }
}
```

### Déroulement à l'exécution

```text
1. Appel REST : GET /chain-config/invoke?config=premium-order&orderId=ORD_001

2. Le job démarre, chainInformationStep enregistre le nom de la config

3. Le décideur s'exécute (première fois : stepExecution=null) :
   - Lit "chainConfigName" = "premium-order" depuis JobParameters
   - Appelle findFirstStepByConfigName("premium-order")
   - Retourne FlowExecutionStatus("validateOrder")

4. Spring Batch fait correspondre "validateOrder"
   et dispatche vers le bean validateOrderStep

5. Après la fin de validateOrder, le décideur s'exécute à nouveau :
   - Lit StepExecution.getStepName() = "validateOrder"
   - Interroge la BD : findByStepAndConfiguration("validateOrder",
       "premium-order")
   - Si COMPLETED : retourne nextStepOnSuccess = "checkInventory"
   - Si FAILED : retourne nextStepOnFailure = "escalateOrder"

6. Continuer jusqu'à ce qu'une étape retourne null comme nextStepOnSuccess
   (Spring Batch traite un FlowExecutionStatus non reconnu comme une terminaison)
```

---

## L'API REST : Gérer les configurations

La puissance réelle devient visible quand on ajoute une API CRUD. Les configurations de chaînes peuvent être creees, lues, mises à jour et invoquees sans toucher a l'application.

### DTOs

```java
public record ChainConfigurationRecord(
    String chainName,
    String chainConfName,
    String chainConfDescription,
    List<ChainStepRecord> chainStepRecords
) implements Serializable {}

public record ChainStepRecord(
    String stepName,
    String nextStepOnSuccess,
    String nextStepOnFailure
) implements Serializable {}

public record StepRecord(
    String stepName,
    String stepDescription
) implements Serializable {}
```

### Controller

```java
@RestController
@RequestMapping("/chain-config")
public class ChainConfigurationController {

    private final ChainConfigurationService chainConfigurationService;
    private final Job configurableOrderProcessingChain;
    private final JobLauncher jobLauncher;
    private final StepService stepService;

    @GetMapping("/steps")
    public ResponseEntity<List<StepRecord>> getAllSteps() {
        return ResponseEntity.ok(
            stepService.getAllStepsForChainConfigurations());
    }

    @GetMapping("/{chainConfName}")
    public ResponseEntity<ChainConfigurationRecord> getByName(
            @PathVariable String chainConfName) {
        return ResponseEntity.ok(
            chainConfigurationService
                .getChainConfigurationByName(chainConfName));
    }

    @PostMapping("/create")
    public ResponseEntity<ChainConfigurationRecord> create(
            @RequestBody ChainConfigurationRecord record) {
        return ResponseEntity.ok(
            chainConfigurationService
                .createChainConfiguration(record));
    }

    @PutMapping("/update")
    public String update(
            @RequestBody ChainConfigurationRecord record) {
        ChainConfigurationRecord updated =
            chainConfigurationService
                .updateChainConfiguration(record);
        return "Configuration %s updated successfully"
            .formatted(updated.chainConfName());
    }

    @GetMapping("/invoke")
    public String invoke(
            @RequestParam("config") String config,
            @RequestParam("orderId") String orderId)
            throws JobParametersInvalidException,
                   JobExecutionAlreadyRunningException,
                   JobRestartException,
                   JobInstanceAlreadyCompleteException {

        JobParameters jobParameters = new JobParametersBuilder()
            .addLong("time", System.currentTimeMillis())
            .addString("chainConfigName", config)
            .addString("idProcess", orderId)
            .toJobParameters();

        jobLauncher.run(
            configurableOrderProcessingChain, jobParameters);
        return "Pipeline '%s' launched for order %s"
            .formatted(config, orderId);
    }
}
```

### Créer une nouvelle chaîne

```bash
POST /chain-config/create
{
  "chainName": "ORDER_PROCESSING",
  "chainConfName": "premium-order",
  "chainConfDescription": "Premium order processing with discounts",
  "chainStepRecords": [
    { "stepName": "validateOrder",
      "nextStepOnSuccess": "checkInventory",
      "nextStepOnFailure": "escalateOrder" },
    { "stepName": "checkInventory",
      "nextStepOnSuccess": "processPayment",
      "nextStepOnFailure": "escalateOrder" },
    { "stepName": "processPayment",
      "nextStepOnSuccess": "applyDiscount",
      "nextStepOnFailure": "escalateOrder" },
    { "stepName": "applyDiscount",
      "nextStepOnSuccess": "calculateTax",
      "nextStepOnFailure": "escalateOrder" },
    { "stepName": "calculateTax",
      "nextStepOnSuccess": "fulfillOrder",
      "nextStepOnFailure": "escalateOrder" },
    { "stepName": "fulfillOrder",
      "nextStepOnSuccess": "sendConfirmation",
      "nextStepOnFailure": "escalateOrder" },
    { "stepName": "sendConfirmation",
      "nextStepOnSuccess": "updateAccounting",
      "nextStepOnFailure": "escalateOrder" },
    { "stepName": "updateAccounting",
      "nextStepOnSuccess": "archiveOrder",
      "nextStepOnFailure": "escalateOrder" },
    { "stepName": "archiveOrder",
      "nextStepOnSuccess": null,
      "nextStepOnFailure": null }
  ]
}
```

### Invoquer la chaîne

```bash
GET /chain-config/invoke?config=premium-order&orderId=ORD_001
```

---

## Validation : Échec Rapide à la Création

La couche service valide que toutes les étapes référencées existent avant d'enregistrer une configuration. Cela capture les fautes de frappe et les étapes manquantes au moment de la conception, pas a 3 heures du matin quand le job batch rencontre une cible de routage manquante.

```java
@Service
public class ChainConfigurationServiceImpl
        implements ChainConfigurationService {

    private final ChainConfigurationRepository chainConfigurationRepository;
    private final StepRepository stepRepository;
    private final ChainRepository chainRepository;
    private final ChainStatusRepository chainStatusRepository;
    private final ChainStepRepository chainStepRepository;

    @Override
    @Transactional
    public ChainConfigurationRecord createChainConfiguration(
            ChainConfigurationRecord record) {

        // Prevent duplicate configuration names
        if (chainConfigurationRepository
                .findByConfName(record.chainConfName()).isPresent()) {
            throw new IllegalArgumentException(
                "The chain configuration %s already exists"
                    .formatted(record.chainConfName()));
        }

        Chain chain = chainRepository
            .findByChainName(record.chainName())
            .orElseThrow(() -> new IllegalArgumentException(
                "Chain with name %s not found"
                    .formatted(record.chainName())));

        LocalDateTime now = LocalDateTime.now();
        ChainConfiguration config = ChainConfiguration.builder()
            .chain(chain)
            .confName(record.chainConfName())
            .description(record.chainConfDescription())
            .chainStatus(chainStatusRepository
                .getReferenceById(ChainStatusEnum.ACTIVE.getId()))
            .creationDate(now)
            .build();

        List<ChainStep> steps = generateChainStepsFromRecords(
            record, config, now);
        config.setChainSteps(steps);
        ChainConfiguration saved =
            chainConfigurationRepository.saveAndFlush(config);

        return ChainConfigurationMapper.INSTANCE
            .toChainConfigurationRecord(saved);
    }

    private List<ChainStep> generateChainStepsFromRecords(
            ChainConfigurationRecord record,
            ChainConfiguration config,
            LocalDateTime currentDate) {

        return record.chainStepRecords().stream()
            .map(stepRecord -> {
                // Validate the step exists
                Step step = stepRepository
                    .findByStepName(stepRecord.stepName())
                    .orElseThrow(() -> new IllegalArgumentException(
                        "Step with name %s not found"
                            .formatted(stepRecord.stepName())));

                // Validate routing targets exist
                verifyStepsExistence(stepRecord);

                return ChainStep.builder()
                    .currentStep(step)
                    .chainConfiguration(config)
                    .chainStatus(chainStatusRepository
                        .getReferenceById(ChainStatusEnum.ACTIVE.getId()))
                    .nextStepOnSuccess(stepRecord.nextStepOnSuccess())
                    .nextStepOnFailure(stepRecord.nextStepOnFailure())
                    .creationDate(currentDate)
                    .build();
            })
            .toList();
    }

    private void verifyStepsExistence(ChainStepRecord stepRecord) {
        // nextStepOnSuccess is mandatory
        if (stepRecord.nextStepOnSuccess() == null) {
            throw new IllegalArgumentException(
                "A next step on success must be provided for step %s"
                    .formatted(stepRecord.stepName()));
        }
        if (!stepRepository.existsByStepName(
                stepRecord.nextStepOnSuccess())) {
            throw new IllegalArgumentException(
                "Step with name %s not found"
                    .formatted(stepRecord.nextStepOnSuccess()));
        }

        // nextStepOnFailure is optional, but must exist if provided
        if (stepRecord.nextStepOnFailure() != null
            && !stepRepository.existsByStepName(
                stepRecord.nextStepOnFailure())) {
            throw new IllegalArgumentException(
                "Step with name %s not found"
                    .formatted(stepRecord.nextStepOnFailure()));
        }
    }
}
```

Un enum fournit une source unique de vérité pour les noms des steps :

```java
@Getter
public enum StepEnum {
    VALIDATE_ORDER_STEP("validateOrder"),
    CHECK_INVENTORY_STEP("checkInventory"),
    PROCESS_PAYMENT_STEP("processPayment"),
    APPLY_DISCOUNT_STEP("applyDiscount"),
    CALCULATE_TAX_STEP("calculateTax"),
    FULFILL_ORDER_STEP("fulfillOrder"),
    SEND_CONFIRMATION_STEP("sendConfirmation"),
    UPDATE_ACCOUNTING_STEP("updateAccounting"),
    ESCALATE_ORDER_STEP("escalateOrder"),
    ARCHIVE_ORDER_STEP("archiveOrder");

    private final String pattern;

    StepEnum(String pattern) {
        this.pattern = pattern;
    }
}
```

---

## Suivi de l'exécution

Un `ProcessCompletionListener` qui enregistre le résultat de chaque exécution de job :

```java
@Component
public class ProcessCompletionListener implements JobExecutionListener {

    @Override
    public void beforeJob(JobExecution jobExecution) {
        LOGGER.info("Starting job '{}' (execution {})",
            jobExecution.getJobInstance().getJobName(),
            jobExecution.getId());
    }

    @Override
    public void afterJob(JobExecution jobExecution) {
        String processId = jobExecution.getJobParameters()
            .getString("idProcess");
        String configName = jobExecution.getJobParameters()
            .getString("chainConfigName");

        if (jobExecution.getStatus() == BatchStatus.FAILED) {
            LOGGER.warn("Job FAILED. Config: {}, Process: {}",
                configName, processId);
        } else {
            LOGGER.info("Job COMPLETED. Config: {}, Process: {}",
                configName, processId);
        }
    }
}
```

---

## Résumé : Quels avantages ?

| Avant (en mémoire)                                         | Après (en base de données)                            |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| Les changements de pipeline nécessitent code + déploiement | Les changements de pipeline nécessitent INSERT/UPDATE |
| N pipelines = N beans de job                               | 1 bean de job + N lignes de configuration             |
| Gestion d'erreur definie en Java                           | Routage d'erreur defini par étape dans la BD          |
| Nouveau client = nouveau code                              | Nouveau client = nouvelle configuration               |
| Risque de régression au déploiement                        | Changement de configuration sans déploiement          |
| Les utilisateurs métier ont besoin du support dev          | L'exploitation peut configurer via API ou SQL         |

### Le coût

- Une requête `ChainStepDecider` pour chaque transition d'étape.
- Un service de configuration pour valider et gérer les configurations de chaînes
- Plus de tables de base de données à maintenir
- Les tests doivent couvrir la logique du décideur et les données de configuration

### Quand utiliser ce pattern ?

- Multiples sources de données avec des besoins de traitement différents
- Variantes de pipelines spécifiques à un client
- Environnements ou les changements de configuration sans déploiement sont importants
- Exigences réglementaires ou d'audit nécessitant le versionnement des pipelines

---

Le code source complet de cet article est disponible sur [database-driven-workflow-engine](https://github.com/Hogwai/hogwai.github.io-content/tree/main/database-driven-workflow-engine).
