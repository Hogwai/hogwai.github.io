---
title: |
  Replicating the SQL exists statement behavior for DynamoDB
description: "Different ways to emulate SQL EXISTS behavior using the DynamoDB Java client"
pubDate: 2026-03-29
tags: ["dynamodb", "java", "performance"]
draft: false
---

In SQL, checking for the existence of a record is a trivial operation:

```sql
SELECT 1 FROM posts WHERE id = '123' LIMIT 1;
```

DynamoDB has no direct equivalent. A standard `GetItem` on a 50 KB item reads the entire 50 KB, even if you only need to know whether it exists.

In this article, we explore efficient strategies for implementing an `exists` check using the AWS SDK for Java v2.

## The Naive Approach vs. Projections

One option is to use a `ProjectionExpression` to retrieve only the partition key instead of the full item. This reduces network transfer and deserialization overhead.

```java
public boolean existsByProjection(String subreddit, String id) {
    GetItemRequest request = GetItemRequest.builder()
            .tableName("posts")
            .key(buildKey(subreddit, id))
            .projectionExpression("subreddit") // Request only the key, not the full item
            .build();

    GetItemResponse response = dynamoDbClient.getItem(request);
    return response.hasItem();
}
```

However, this approach does not reduce cost because DynamoDB calculates consumed RCUs based on the total size of the stored item, regardless of which attributes are projected.

## Halving the Bill: Eventually Consistent Reads

A second optimization is to use eventually consistent reads (which is the default read mode).

Eventually consistent reads may exhibit a replication delay of up to one second under normal conditions. This read mode consumes 1 RCU for items up to 4 KB.

```java
GetItemRequest.builder()
    .key(key)
    .projectionExpression("id")
    .consistentRead(false)
    .build();
```

Strongly consistent reads (`consistentRead(true)`) should be used when your use case strictly requires the most up-to-date data. This mode consumes 2 RCUs for items up to 4 KB.

## The Batch Challenge (BatchGetItem)

To check multiple items at once, you can use `BatchGetItem` instead of making individual sequential calls.

Two behaviors must be handled:

1. Missing items are simply omitted from the response; they are not returned as `null`.
2. Unprocessed keys: Under heavy load, the response may be partial.

Implementation with a retry mechanism:

```java
public Map<String, Boolean> batchExists(String subreddit, List<String> ids) {
    // 1. Prepare keys
    List<Map<String, AttributeValue>> keys = ids.stream()
            .map(id -> buildKey(subreddit, id))
            .toList();

    Map<String, KeysAndAttributes> requestItems = new HashMap<>();
    requestItems.put("posts", KeysAndAttributes.builder()
            .keys(keys)
            .projectionExpression("id") // Only the key
            .build());

    BatchGetItemRequest request = BatchGetItemRequest.builder()
            .requestItems(requestItems)
            .returnConsumedCapacity(ReturnConsumedCapacity.INDEXES)
            .build();

    Map<String, Boolean> result = new HashMap<>();
    ids.forEach(id -> result.put(id, false)); // Default to false

    int attempts = 0;

    // 2. Retry unprocessed keys
    do {
        attempts++;
        BatchGetItemResponse response = dynamoDbClient.batchGetItem(request);

        // Found items
        var foundItems = response.responses().getOrDefault("posts", List.of());
        foundItems.forEach(item -> result.put(item.get("id").s(), true));

        // Unprocessed keys
        if (response.hasUnprocessedKeys() && !response.unprocessedKeys().isEmpty()) {
            request = request.toBuilder()
                             .requestItems(response.unprocessedKeys())
                             .build();
            // Exponential backoff strategy
            backoff(attempts);
        } else {
            break; // Done processing
        }
    } while (attempts < 5);

    return result;
}
```

The `backoff` helper applies an exponential backoff strategy to avoid overloading DynamoDB:

```java
private static void backoff(int attempt) {
    try {
        TimeUnit.MILLISECONDS.sleep((long) Math.pow(2, attempt) * 100);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }
}
```

## Checking Complex Attributes

Beyond simple item existence, you may need to verify whether a specific attribute contains data (e.g., a non-empty list).

### Using `GetItem`

Retrieving only the target attribute via `GetItem` is more direct and efficient than using a `Query` with a `FilterExpression`, because DynamoDB locates the item by its primary key (an O(1) operation) and then returns only the requested attributes when a `ProjectionExpression` is used. RCU cost is still calculated based on the full item size, but you avoid unnecessary network transfer and deserialization of unused attributes.

```java
public boolean hasKeywordsByGetItem(String subreddit, String id) {
    GetItemRequest request = GetItemRequest.builder()
            .tableName("posts")
            .key(buildKey(subreddit, id))
            .projectionExpression("keywords")
            .consistentRead(false)
            .build();

    GetItemResponse response = dynamoDbClient.getItem(request);

    if (!response.hasItem()) {
        return false;
    }

    AttributeValue keywords = response.item().get("keywords");

    // Check if the attribute exists and is non-empty
    return keywords != null && keywords.hasL() && !keywords.l().isEmpty();
}
```

### Using `Query` with `FilterExpression`

The `Query` approach remains useful when you need to retrieve a set of items sharing the same partition key and then refine the results server-side. DynamoDB first reads all items matching the partition/sort key condition, consumes RCUs for each of them, and only then applies the filter in memory. Items discarded by the filter are still billed.

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

`GetItem` should be preferred for single-item checks: it is simpler, avoids query parsing overhead, and makes the intent explicit.

## Performance Summary

| Technique             | Reduces Bandwidth? | Reduces Cost (RCU)? | Ideal Use Case                                                 |
| :-------------------- | :----------------: | :-----------------: | :------------------------------------------------------------- |
| Full GetItem          |         No         |         No          | Retrieving actual data                                         |
| Projection            |        Yes         |         No          | Large items, latency reduction, existence checks (`hasItem()`) |
| Eventually Consistent |         No         |     Yes (-50%)      | Standard existence checks                                      |
| GSI (Keys Only)       |        Yes         |     Yes (-90%)      | Very large items (>40 KB)                                      |

> For items larger than 40 KB, a `KEYS_ONLY` GSI costs 0.5 RCU per read, regardless of the item size in the base table.

## Conclusion

For a standard existence check:

1. `projectionExpression`: Reduces network transfer.
2. `consistentRead(false)`: Halves RCU cost.
3. Handle `UnprocessedKeys` in batch operations.
4. For elements > 40 KB, consider a GSI in KEYS_ONLY to reduce the cost by 90%.

## References

1. <a id="ref1"></a>[DynamoDB GetItem API Reference](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html)
2. <a id="ref2"></a>[DynamoDB BatchGetItem API Reference](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchGetItem.html)
3. <a id="ref3"></a>[DynamoDB Read Consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)
4. <a id="ref4"></a>[DynamoDB Projection Expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ProjectionExpressions.html)

## Demo

A demonstration of the concepts covered in this article is available here: [micronaut-java-dynamodb-exists](https://github.com/Hogwai/hogwai.github.io-content/tree/main/micronaut-java-dynamodb-exists)
