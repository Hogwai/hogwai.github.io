---
title: "Exécuter des instructions SQL en lot avec Java"
description: "Approches génériques et spécifiques aux frameworks pour le batching SQL"
pubDate: 2025-10-30
tags: ["java", "sql", "batching", "performance", "ORM"]
draft: true
---

Les expressions régulières sont un outil puissant dans la boîte à outils de tout développeur Java. Elles permettent de valider des entrées, d'analyser des chaînes de caractères et d'effectuer des transformations textuelles complexes en quelques lignes de code. Toutefois, cette puissance s'accompagne d'un coût caché en termes de performances si elle n'est pas utilisée correctement.

La clé pour exploiter efficacement les regex en Java réside dans la compréhension de la classe `java.util.regex.Pattern`. Dans cet article, nous explorerons les bonnes pratiques d'utilisation de `Pattern`, comment éviter les pièges de performance courants, et pourquoi il faut se méfier des méthodes regex « pratiques » de la classe `String`.

## Approches génériques

### API JDBC

PreparedStatement.addBatch() + executeBatch()
Gestion manuelle des lots, erreurs partielles, getUpdateCounts()

### JPA

Flush manuel en boucle (persist() + flush() + clear() toutes les N entités)
Limites : pas de addBatch direct ; dépend du provider pour l'ordre/optimisation

## Utilisation de builders/DSL

### JOOQ

dslContext.batch(insert...).execute()
Avantage : type-safe, génère du vrai batch JDBC

### MyBatis

SqlSessionFactory.openSession(ExecutorType.BATCH)
`<foreach>` pour lots dynamiques

## Utilisation d'un ORM

### Hibernate

Propriétés : hibernate.jdbc.batch_size, hibernate.order_inserts/updates
@BatchSize sur entités/collections
session.flush()/clear() obligatoire

#### Blaze Persistence

## Pièges et bonnes pratiques

### Le choix de l'approche

Toute abstraction au-dessus du driver introduit une surcharge supplémentaire.

Quand clear() est vital (mémoire, génération d'ID)
Erreurs de batch (tout le lot échoue si une ligne est invalide, sauf avec continueOnError)
Comparaison : JDBC > DSL > ORM pour les performances brutes ; ORM pour la simplicité avec les entités

---

## Références

1. <a id="ref1"></a>[Demystifying Java Object Sizes: Compact Headers, Compressed Oops, and Beyond](https://blog.vanillajava.blog/2024/12/demystifying-java-object-sizes-compact.html) by Peter Lawrey
1. <a id="ref2"></a>[String.matches(String regex)](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html#matches(java.lang.String)>)
1. <a id="ref3"></a>[RegExUtils.java](https://github.com/apache/commons-lang/blob/master/src/main/java/org/apache/commons/lang3/RegExUtils.java)

## Démo

Une démonstration des concepts illustrés dans cet article est disponible ici : [regex-performance-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/regex-performance-benchmark)
