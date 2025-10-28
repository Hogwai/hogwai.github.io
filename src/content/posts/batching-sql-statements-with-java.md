---
title: "Batching SQL statements with Java"
description: "Agnostic and platform-specific ways to batch SQL statements"
pubDate: 2025-10-30
tags: ["java", "sql", "batching", "performance", "ORM"]
draft: false
---

Regular expressions are a powerful tool in every Java developer's toolkit. They allow us to validate input, parse strings, and perform complex text transformations with just a few lines of code. However, this power comes with a hidden performance cost if not used correctly.

The key to unlocking efficient regex in Java lies in understanding the `java.util.regex.Pattern` class. In this post, we'll explore the best practices for using `Pattern`, how to avoid common performance pitfalls, and why you should be wary of the "convenient" regex methods on the `String` class.

## Using agnostic ways

### JDBC API

PreparedStatement.addBatch() + executeBatch()
Gestion manuelle des lots, erreurs partielles, getUpdateCounts()

### JPA

Flush manuel en boucle (persist() + flush() + clear() toutes les N entités)
Limites : pas de addBatch direct ; dépend du provider pour l'ordre/optimisation

## Using builders/DSL

### JOOQ

dslContext.batch(insert...).execute()
Avantage : type-safe, génère du vrai batch JDBC

### MyBatis

SqlSessionFactory.openSession(ExecutorType.BATCH)
`<foreach>` pour lots dynamiques

## Using an ORM

### Hibernate

Propriétés : hibernate.jdbc.batch_size, hibernate.order_inserts/updates
@BatchSize sur entités/collections
session.flush()/clear() obligatoire

#### Blaze Persistence

## Pièges et bonnes pratiques

### The choice

Any abstraction over the driver brings its own overhead.

Quand clear() est vital (mémoire, ID generation)
Erreurs de batch (tout le lot échoue si une ligne KO, sauf continueOnError)
Comparaison : JDBC > DSL > ORM pour perfs brutes ; ORM pour simplicité avec entités

---

## References

1. <a id="ref1"></a>[Demystifying Java Object Sizes: Compact Headers, Compressed Oops, and Beyond](https://blog.vanillajava.blog/2024/12/demystifying-java-object-sizes-compact.html) by Peter Lawrey
1. <a id="ref2"></a>[String.matches(String regex)](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html#matches(java.lang.String)>)
1. <a id="ref3"></a>[RegExUtils.java](https://github.com/apache/commons-lang/blob/master/src/main/java/org/apache/commons/lang3/RegExUtils.java)

## Demo

A showcase of the concepts illustrated in this post is available here: [regex-performance-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/regex-performance-benchmark)
