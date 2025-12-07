---
title: |
  Replicating the SQL exists statement behavior for DynamoDB
description: "Ways to emulate the SQL 'exists' statement behavior with DynamoDb java client"
pubDate: 2025-11-13
tags:
  [
    "dynamodb",
    "java",
    "performance"
  ]
draft: false
---

## Introduction

## Wrapping up

## References

1. <a id="ref1"></a>[ArrayList.java#L139: elementData](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/ArrayList.java#L139)
2. <a id="ref2"></a>[ArrayList.java#L275: contains(Object o)](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/ArrayList.java#L275)
3. <a id="ref3"></a>[HashSet.java#L213: contains(Object o)](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/HashSet.java#L213)
3. <a id="ref4"></a>[Collection.java#L747: stream()](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/Collection.java#L747)

## Demo

A showcase of the concepts illustrated in this post is available here: [micronaut-java-dynamodb-exists](https://github.com/Hogwai/hogwai.github.io-content/tree/main/micronaut-java-dynamodb-exists)
