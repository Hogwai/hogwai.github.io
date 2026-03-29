---
title: |
  Replicating the SQL exists statement behavior for DynamoDB
description: "Ways to emulate the SQL 'exists' statement behavior with DynamoDb java client"
pubDate: 2026-03-29
tags: ["dynamodb", "java", "performance"]
draft: false
---

In SQL, checking if a row exists is trivial:

```sql
SELECT 1 FROM posts WHERE id = '123' LIMIT 1;
```

DynamoDB has no equivalent. A standard `GetItem` on a 50KB item reads the full 50KB, even if you only need to know whether it exists. You pay for the entire read.

This article covers efficient `exists` patterns with the AWS SDK for Java v2.

## 1. The Naive Approach vs. Projections

Use a `ProjectionExpression` to request only the partition key instead of the full item. This reduces network transfer and deserialization cost.

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

### The Hidden Billing Trap

This reduces network transfer, but not RCU consumption. DynamoDB reads the full item from disk before applying the projection.

- Gain: network latency, client CPU.
- Cost: same RCU as a full read.

## 2. Cutting the Bill in Half: Eventual Consistency

If your use case tolerates a sub-second detection delay (most existence checks do), switch to eventual consistency.

```java
GetItemRequest.builder()
    .key(key)
    .projectionExpression("id")
    .consistentRead(false) // <--- The magic line
    .build();
```

`GetItem` defaults to strongly consistent reads. Setting `consistentRead(false)` halves the RCU cost.

## 3. The Batch Challenge (BatchGetItem)

To check multiple items at once, use `BatchGetItem` instead of looping over individual calls.

Two behaviors to handle:

1. Missing items are omitted, not returned as `null`.
2. Unprocessed keys: under load, the response may be partial.

Implementation with retry:

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
            // Exponential backoff strategy
            backoff(attempts);
        } else {
            break; // All clear
        }
    } while (attempts < 5);

    return result;
}
```

Where the `backoff` helper uses exponential backoff to avoid hammering DynamoDB:

```java
private static void backoff(int attempt) {
    try {
        TimeUnit.MILLISECONDS.sleep((long) Math.pow(2, attempt) * 100);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }
}
```

## 4. Checking Complex Attributes

Beyond simple existence, you may need to check if a specific attribute contains data (e.g., a non-empty list).

Fetching only the target attribute via `GetItem` is more direct than using a `Query` with `FilterExpression`, since filters are applied _after_ the read cost is incurred.

```java
public boolean hasKeywordsByGetItem(String subreddit, String id) {
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

### Alternative: Using Query with FilterExpression

The `Query` approach remains useful for more complex conditions. Note that the filter is applied after the read, so RCU consumption is the same.

```java
public boolean hasKeywords(String subreddit, String id) {
    Map<String, AttributeValue> values = new HashMap<>();
    values.put(":subVal", AttributeValue.fromS(subreddit));
    values.put(":idVal", AttributeValue.fromS(id));
    values.put(":zero", AttributeValue.fromN("0"));

    QueryRequest request = QueryRequest.builder()
            .tableName("posts")
            .keyConditionExpression("subreddit = :subVal AND id = :idVal")
            .filterExpression("size(keywords) > :zero")
            .expressionAttributeValues(values)
            .projectionExpression("id")
            .limit(1)
            .build();

    QueryResponse response = dynamoDbClient.query(request);
    return response.count() > 0;
}
```

`GetItem` is preferred for single-item checks: simpler, no query parsing overhead, and the intent is explicit.

## Performance Summary Cheat Sheet

| Technique            | Saves Bandwidth? | Saves Money (RCU)? | Best Use Case                 |
| :------------------- | :--------------: | :----------------: | :---------------------------- |
| GetItem Full         |        No        |         No         | Retrieving actual data        |
| Projection           |       Yes        |         No         | Large items, reducing latency |
| Eventual Consistency |        No        |     Yes (-50%)     | Standard existence checks     |
| GSI (Keys Only)      |       Yes        |     Yes (-90%)     | Massive items (>40KB)         |

> For items >40KB, a `KEYS_ONLY` GSI costs 0.5 RCU per read regardless of the main table item size.

## Conclusion

For a standard `exists` check:

1. `projectionExpression`: reduces network transfer.
2. `consistentRead(false)`: halves RCU cost.
3. Handle `UnprocessedKeys` in batch operations.

## References

1. <a id="ref1"></a>[DynamoDB GetItem API Reference](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html)
2. <a id="ref2"></a>[DynamoDB BatchGetItem API Reference](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchGetItem.html)
3. <a id="ref3"></a>[DynamoDB Read Consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)
4. <a id="ref4"></a>[DynamoDB Projection Expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ProjectionExpressions.html)

## Demo

A showcase of the concepts illustrated in this post is available here: [micronaut-java-dynamodb-exists](https://github.com/Hogwai/hogwai.github.io-content/tree/main/micronaut-java-dynamodb-exists)
