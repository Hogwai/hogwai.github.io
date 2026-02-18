---
title: |
  Replicating the SQL exists statement behavior for DynamoDB
description: "Ways to emulate the SQL 'exists' statement behavior with DynamoDb java client"
pubDate: 2025-12-13
tags:
  [
    "dynamodb",
    "java",
    "performance"
  ]
draft: false
---

If you come from the relational database world, checking if a row exists is the most trivial operation imaginable:

```sql
SELECT 1 FROM posts WHERE id = '123' LIMIT 1;
```

It is fast, lightweight, and virtually free for the database engine.

However, in **DynamoDB**, this native operation doesn't exist. If you perform a standard `GetItem` on a 50KB item (containing HTML bodies, large JSON blobs, or metadata) just to check if it's there, **you pay to read the full 50KB**.

In this article, we will explore how to implement an efficient `exists` pattern using the **AWS SDK for Java v2**, avoiding common billing traps and network bottlenecks.

## 1. The Naive Approach vs. Projections

The first step in optimization is reducing **Network Bandwidth**. If your application runs on AWS Lambda or Fargate, deserializing a large JSON object consumes unnecessary CPU and memory.

The trick is to use a `ProjectionExpression` to request *only* the partition key (or a tiny attribute).

```java
public boolean existsByProjection(String subreddit, String id) {
    GetItemRequest request = GetItemRequest.builder()
            .tableName("posts")
            .key(buildKey(subreddit, id))
            .projectionExpression("subreddit") // Only ask for the key!
            .build();

    GetItemResponse response = dynamoDbClient.getItem(request);
    return response.hasItem();
}
```

### ⚠️ The Hidden Billing Trap

While this method drastically reduces network transfer time, **it does not reduce your Read Capacity Unit (RCU) consumption**. DynamoDB reads the *entire* item from disk, applies the projection, and then charges you for the full size.

* **Gain:** Network latency, Client CPU.
* **Cost:** Same as a full read.

## 2. Cutting the Bill in Half: Eventual Consistency

If your use case can tolerate that an item inserted less than a second ago might not be immediately detected (which is acceptable for 99% of existence checks), you have a golden optimization: **Eventual Consistency**.

```java
GetItemRequest.builder()
    .key(key)
    .projectionExpression("id")
    .consistentRead(false) // <--- The magic line
    .build();
```

By default, `GetItem` uses "Strongly Consistent Reads." By switching to `consistentRead(false)`, you consume **half the RCUs**. This is the easiest way to save money on high-throughput checks.

## 3. The Batch Challenge (BatchGetItem)

If you need to verify the existence of 20 items, do not write a `for` loop with 20 network calls. Use `BatchGetItem`.

However, `BatchGetItem` in Java has two distinct behaviors that catch developers off guard:

1. **Missing items are omitted:** It doesn't return `null`; the key is simply absent from the response.
2. **Throttling (Unprocessed Keys):** If the database is under load, the request might succeed partially.

Here is a **Production-Ready** implementation that handles retries:

```java
public Map<String, Boolean> batchExists(String subreddit, List<String> ids) {
    // 1. Prepare keys
    List<Map<String, AttributeValue>> keys = ids.stream()
            .map(id -> buildKey(subreddit, id))
            .toList();

    Map<String, KeysAndAttributes> requestItems = new HashMap<>();
    requestItems.put("posts", KeysAndAttributes.builder()
            .keys(keys)
            .projectionExpression("id") // Network optimization
            .build());

    BatchGetItemRequest request = BatchGetItemRequest.builder()
            .requestItems(requestItems)
            .returnConsumedCapacity(ReturnConsumedCapacity.INDEXES)
            .build();

    Map<String, Boolean> result = new HashMap<>();
    ids.forEach(id -> result.put(id, false)); // Default to false

    int attempts = 0;
    
    // 2. Retry Loop for Unprocessed Keys
    do {
        attempts++;
        BatchGetItemResponse response = dynamoDbClient.batchGetItem(request);
        
        // Mark found items
        var foundItems = response.responses().getOrDefault("posts", List.of());
        foundItems.forEach(item -> result.put(item.get("id").s(), true));

        // Check for throttling / unprocessed keys
        if (response.hasUnprocessedKeys() && !response.unprocessedKeys().isEmpty()) {
            request = request.toBuilder()
                             .requestItems(response.unprocessedKeys())
                             .build();
            // Simple backoff strategy
            try { Thread.sleep(100L * attempts); } catch (InterruptedException e) {}
        } else {
            break; // All clear
        }
    } while (attempts < 5);

    return result;
}
```

## 4. Checking Complex Attributes

Sometimes, "existing" isn't enough. You want to know if a post "has keywords" (e.g., a non-empty list).

You might be tempted to use a `Query` with a `FilterExpression`. However, filters are applied *after* the read cost is incurred. A cleaner approach in Java is to fetch the specific attribute via `GetItem`.

```java
public boolean hasKeywords(String subreddit, String id) {
    GetItemRequest request = GetItemRequest.builder()
            .tableName("posts")
            .key(buildKey(subreddit, id))
            .projectionExpression("keywords") // Fetch only this column
            .consistentRead(false)            // Save RCUs
            .build();

    GetItemResponse response = dynamoDbClient.getItem(request);
    
    if (!response.hasItem()) return false;
    
    AttributeValue keywords = response.item().get("keywords");
    // Check if attribute exists and is a non-empty list
    return keywords != null && keywords.hasL() && !keywords.l().isEmpty();
}
```

## Performance Summary Cheat Sheet

| Technique | Saves Bandwidth? | Saves Money (RCU)? | Best Use Case |
| :--- | :---: | :---: | :--- |
| **GetItem Full** | ❌ No | ❌ No | Retrieving actual data |
| **Projection** | ✅ Yes | ❌ No | Large items, reducing latency |
| **Eventual Consistency** | ❌ No | ✅ **Yes (-50%)** | Standard existence checks |
| **GSI (Keys Only)** | ✅ Yes | ✅ **Yes (-90%)** | Massive items (>40KB) |

> **Pro Tip:** If your items are massive (e.g., >40KB), consider creating a **Global Secondary Index (GSI)** with `KEYS_ONLY`. Reading from that index will cost the minimum 0.5 RCU, regardless of the item size in the main table.

## Conclusion

Optimizing DynamoDB is a game of trade-offs.
For a standard `exists` check:

1. Use `projectionExpression` to save your **Network**.
2. Use `consistentRead(false)` to save your **Wallet**.
3. Always handle `UnprocessedKeys` when using **Batch** operations.

Happy Coding! 🚀

## References

1. <a id="ref1"></a>[ArrayList.java#L139: elementData](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/ArrayList.java#L139)
2. <a id="ref2"></a>[ArrayList.java#L275: contains(Object o)](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/ArrayList.java#L275)
3. <a id="ref3"></a>[HashSet.java#L213: contains(Object o)](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/HashSet.java#L213)
3. <a id="ref4"></a>[Collection.java#L747: stream()](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/Collection.java#L747)

## Demo

A showcase of the concepts illustrated in this post is available here: [micronaut-java-dynamodb-exists](https://github.com/Hogwai/hogwai.github.io-content/tree/main/micronaut-java-dynamodb-exists)
