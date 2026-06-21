---
title: "building a database-driven workflow engine on Spring Batch"
description: "How to leverage the power of a JobExecutionDecider to enable runtime-configurable workflows, without redeployment"
pubDate: 2026-06-21
tags: ["java", "spring-batch", "spring-boot", "workflow", "database"]
draft: false
---

Generally speaking, Spring Batch jobs are quite rigid: `stepA => stepB => stepC`. You can, of course, use flows but everything stays in memory.
This is not a problem as long as the steps and execution order don't change. But what happens when different data sources need different processing pipelines? When one client's files need validation and enrichment while another's go straight to load? When you need to add, remove, or reorder steps without touching the code?

This article shows how to set up a workflow engine driven from the database instead of in-memory configuration.

---

## The Problem with Classic Pipelines

Consider a data import system. Your typical Spring Batch job looks like this:

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

This works as long as the steps and execution order don't change. But what happens when you need:

- Different pipelines per data source: CSV files skip enrichment, XML files need XSLT transform, EDI files need EDI-to-XML conversion
- Conditional error handling: Some sources should pause on error, others should skip and continue
- A/B testing new steps: Try a new deduplication step on 10% of traffic
- Client-specific workflows: Client A needs an extra audit step, Client B does not

Each of these changes means: modify code, build, run tests, deploy, and hope nothing broke.

There is a better way: store the pipeline topology in the database.

---

## The Data Model: Pipeline as Data

The core idea is a five-level entity hierarchy:

```text
Chain                 =  A logical workflow (e.g., "ORDER_PROCESSING")
  └── ChainConfiguration  =  A named pipeline variant (e.g., "premium-order")
        └── ChainStep     =  A step binding with routing rules
              └── Step    =  A reusable processing unit (e.g., "validateOrder")
                    └── ChainStatus = status reference (ACTIVE, SUSPENDED, ...)
```

Each `ChainStep` stores two routing targets (one for success, one for failure), creating a branching directed graph at the database level.

### The Entities

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

### How Data Drives the Pipeline

Let's take an execution chain `ORDER_PROCESSING` with three configurations. Each configuration is a set of rows in `ts_chain_step`:

| Configuration  | Step 1        | Step 2         | Step 3         | Step 4        | Step 5       | Step 6           | Step 7           | Step 8           | Step 9       |
| -------------- | ------------- | -------------- | -------------- | ------------- | ------------ | ---------------- | ---------------- | ---------------- | ------------ |
| standard-order | validateOrder | checkInventory | processPayment | calculateTax  | fulfillOrder | sendConfirmation | updateAccounting | archiveOrder     |              |
| premium-order  | validateOrder | checkInventory | processPayment | applyDiscount | calculateTax | fulfillOrder     | sendConfirmation | updateAccounting | archiveOrder |
| flagged-order  | validateOrder | checkInventory | escalateOrder  | archiveOrder  |              |                  |                  |                  |              |

Nothing is hardcoded: adding a new pipeline variant is a simple `INSERT` statement.

---

## The Decider: Making Spring Batch Dynamic

The "magic" happens in a `JobExecutionDecider`. After each step, Spring Batch consults the decider to determine the next step.

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

The repository has two queries. The first is a simple name-based lookup for routing after each step. The second finds the initial step for a configuration:

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

## Assembly: the job definition

Here is how the job is assembled. Every step transition goes through the decider. The decider returns the name of the next step, and Spring Batch's flow DSL matches it to the corresponding step bean via `StepEnum` constants.

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
    // … remaining steps follow the same pattern
}
```

The `chainInformationStep` is a simple first step that gives information about the chain:

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
    public RepeatStatus execute(StepContribution contribution,
                                ChunkContext chunkContext) {
        LOGGER.info("Launching chain configuration: {}",
            chainConfiguration);
        LOGGER.info("Job parameters: {}",
            chunkContext.getStepContext().getJobParameters());
        return RepeatStatus.FINISHED;
    }
}
```

### How the Flow Works at Runtime

```text
1. REST call: GET /chain-config/invoke?config=premium-order&orderId=ORD_001

2. Job starts, chainInformationStep logs the config name

3. Decider runs (first time: stepExecution=null):
   - Reads "chainConfigName" = "premium-order" from JobParameters
   - Calls findFirstStepByConfigName("premium-order")
   - Returns FlowExecutionStatus("validateOrder")

4. Spring Batch matches "validateOrder"
   and dispatches to validateOrderStep bean

5. After validateOrder completes, Decider runs again:
   - Reads StepExecution.getStepName() = "validateOrder"
   - Queries DB: findByStepAndConfiguration("validateOrder",
       "premium-order")
   - If COMPLETED: returns nextStepOnSuccess = "checkInventory"
   - If FAILED: returns nextStepOnFailure = "escalateOrder"

6. Continue until a step returns null as nextStepOnSuccess
   (Spring Batch treats unmatched FlowExecutionStatus as termination)
```

---

## The REST API: Managing Configurations

The real power becomes visible when you add a CRUD API. Chain configurations can be created, read, updated, and invoked without touching the application.

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

### Creating a New Chain

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

### Invoking the Chain

```bash
GET /chain-config/invoke?config=premium-order&orderId=ORD_001
```

That is a full pipeline run, configured entirely via data.

---

## Validation: Fail Fast at Creation

The service layer validates that all referenced steps exist before saving a configuration. This catches typos and missing steps at design time, not at 3 AM when the batch job hits a missing routing target.

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

An enum provides a single source of truth for step names:

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

## Execution Tracking

A `ProcessCompletionListener` logs the outcome of each job execution:

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

## Summary: What Benefits?

| Before (in memory)                     | After (in database)                    |
| -------------------------------------- | -------------------------------------- |
| Pipeline changes require code + deploy | Pipeline changes require INSERT/UPDATE |
| N pipelines = N job beans              | 1 job bean + N config rows             |
| Error handling defined in Java         | Error routing defined per-step in DB   |
| New client = new code                  | New client = new configuration         |
| Risk of deployment regression          | Zero-deployment configuration change   |
| Business users need dev support        | Ops can configure via API or SQL       |

### The Cost

- A `ChainStepDecider` query for every step transition
- A configuration service to validate and manage chain configs
- More database tables to maintain
- Testing needs to cover the decider logic + the configuration data

### When to Use This Pattern

- Multiple data sources with different processing needs
- Client/customer-specific pipeline variants
- Environments where zero-deployment configuration changes matter
- Regulatory or audit requirements needing pipeline versioning

---

The complete source code for this article is available at [database-driven-workflow-engine](https://github.com/Hogwai/hogwai.github.io-content/tree/main/database-driven-workflow-engine).
