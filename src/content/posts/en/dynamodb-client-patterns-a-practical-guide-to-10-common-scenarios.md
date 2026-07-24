---
title: "DynamoDB client patterns: a practical guide to 10 common scenarios"
description: "10 DynamoDB access patterns with metrics: Select.COUNT, condition expressions, batch, projection, GSI vs filter, pagination, scan vs query, TTL, optimistic locking, transactions"
pubDate: 2026-07-23
tags: ["java", "dynamodb", "aws", "nosql", "patterns"]
draft: false
---

The AWS SDK for Java v2 offers two levels of DynamoDB client. The low-level `DynamoDbClient` gives you full control over every request parameter but requires manual translation between Java objects and `Map<String, AttributeValue>`. The `DynamoDbEnhancedClient` adds a typed, object-mapping layer on top.

Below the client layer, the SDK also lets you swap the HTTP transport that carries requests and responses:

| HTTP client                              | 1000 GetItem calls | Relative speedup |
| ---------------------------------------- | ------------------ | ---------------- |
| `UrlConnectionHttpClient` (JDK built-in) | 2,446 ms           | baseline         |
| `ApacheHttpClient` (connection pooling)  | 927 ms             | **2.6x faster**  |
| `AwsCrtHttpClient` (non-blocking I/O)    | 180 ms             | **13.6x faster** |

Same workload, same RCU (500.0). The speedup comes from connection reuse and I/O model, not from reduced capacity consumption.

This article walks through 10 common DynamoDB access patterns, with both the low-level and enhanced client approaches, and concrete metrics for each.

## Counting items

Getting a count of matching items seems simple. The instinct is to fetch all items and call `size()`:

```java
var response = client.query(QueryRequest.builder()
        .tableName("movies")
        .keyConditionExpression("genre = :genre")
        .expressionAttributeValues(Map.of(":genre", AttributeValue.fromS(genre)))
        .build());
int count = response.items().size();
```

The obvious improvement is `Select.COUNT`:

```java
var response = client.query(QueryRequest.builder()
        .tableName("movies")
        .keyConditionExpression("genre = :genre")
        .expressionAttributeValues(Map.of(":genre", AttributeValue.fromS(genre)))
        .select(Select.COUNT)
        .build());
int count = response.count();
```

But both approaches share a critical limitation. DynamoDB reads up to 1 MB of data before returning results. `Select.COUNT` counts items within that 1 MB window. If your partition holds more data, you need to paginate through `LastEvaluatedKey` and sum the `count` values across pages. RCU consumption is also identical in both cases, since DynamoDB reads the full item data internally before counting.

The enhanced client does not expose `Select.COUNT` directly. Its `table.query(...).items()` always returns full deserialized objects. For a count with the enhanced client, you still use `items().size()` and handle pagination the same way. This is the case where the low-level client gives you an optimization that the mapping layer cannot.

**Takeaway**: `Select.COUNT` saves network transfer but not RCU. The enhanced client does not support it -- stick with the low-level client for count-only queries.

## Condition expressions

Conditional writes let you guard operations based on item state. The classic use case is creating an item only if it does not already exist. Without a condition, this takes two round-trips: a `GetItem` to check, then a `PutItem` to write. Between the two checks, another client can sneak in and create the same item -- a race condition.

```java
// one round-trip, atomic check-and-set
client.putItem(PutItemRequest.builder()
        .tableName("movies")
        .item(movie.toItemMap())
        .conditionExpression("attribute_not_exists(genre) AND attribute_not_exists(movieId)")
        .build());
```

The project logs both approaches:

```text
[METRIC] Condition bad (getItem + putItem): 2 RTs, race condition window
[METRIC] Condition good (ConditionExpression): 1 RT, atomic
```

One round-trip instead of two. No race window. The condition is evaluated atomically by DynamoDB -- there is no gap between the check and the write.

When the condition fails, DynamoDB throws `ConditionalCheckFailedException`. Log it at INFO level, not ERROR.

The enhanced client supports conditions through `table.putItem(r -> r.conditionExpression(...))`. Same behavior, same one-round-trip cost. The trade-off is that the enhanced client does not expose `ReturnValues` on conditional puts, which the low-level client does.

## Batch operations

Writing items one at a time in a loop costs N round-trips. For 5 items, the project logs:

```text
[METRIC] Batch write bad (5 putItem calls): 5 RTs
[METRIC] Batch write good (BatchWriteItem): 1 RT, 10.0 WCU, 5 items
```

Five round-trips become one. The WCU is the same (10.0 in this run) because the same items are written. The savings come from eliminating network overhead.

```java
// one call, up to 25 items
var writeRequests = movies.stream()
        .map(m -> WriteRequest.builder()
                .putRequest(b -> b.item(m.toItemMap()).build())
                .build())
        .toList();
var response = client.batchWriteItem(BatchWriteItemRequest.builder()
        .requestItems(Map.of("movies", writeRequests))
        .build());
```

`BatchWriteItem` has three important constraints:

- **25 items per call**: the API rejects anything beyond this.
- **16 MB total request size**: keys and attribute values must fit in a single payload.
- **Not atomic**: individual puts succeed or fail independently. Failed operations appear in `UnprocessedItems`. The project's repository retries them up to 3 times with exponential backoff:

```java
while (!unprocessed.isEmpty() && attempt < 3) {
    attempt++;
    Thread.sleep(100L * attempt);
    response = client.batchWriteItem(BatchWriteItemRequest.builder()
            .requestItems(unprocessed)
            .build());
    unprocessed = response.unprocessedItems();
}
```

The enhanced client exposes `table.batchPutItem(movies)`. Same limits, same constraints. You pass a collection of beans instead of building `WriteRequest` objects manually. The disadvantage: the enhanced client does not expose `consumedCapacity` per table, which the low-level client does for cost analysis.

Neither client supports condition expressions in batch writes. That is a DynamoDB API constraint, not a client limitation.

## Projection

A `ProjectionExpression` limits which attributes DynamoDB returns. The project measures the difference explicitly using an `estimateItemBytes` utility that sums attribute name lengths and value sizes:

```text
[METRIC] Projection bad (full item): 5 items, ~1045 bytes transferred
[METRIC] Projection good (ProjectionExpression): 5 items, ~205 bytes transferred
```

That is ~209 B per item for the full 8-attribute object versus ~41 B per item for 2 projected fields. An **80% reduction** in transferred data.

The code that computes this is straightforward -- it iterates over the item's attribute map and sums name and value lengths:

```java
public static long estimateItemBytes(Map<String, AttributeValue> item) {
    long bytes = 0;
    for (var entry : item.entrySet()) {
        bytes += entry.getKey().length();
        var av = entry.getValue();
        if (av.s() != null) bytes += av.s().length();
        if (av.n() != null) bytes += av.n().length();
        if (av.ss() != null) {
            for (String s : av.ss()) bytes += s.length();
        }
    }
    return bytes;
}
```

A common misconception is that projection expressions also reduce RCU consumption. They do not. DynamoDB reads the full item from disk and applies the projection afterward. RCU is calculated from the stored item size, not from what gets returned to the application. The same applies to `FilterExpression` in queries and scans: filtering happens after the 1 MB read window.

```java
var response = client.query(QueryRequest.builder()
        .tableName("movies")
        .keyConditionExpression("genre = :genre")
        .expressionAttributeValues(Map.of(":genre", AttributeValue.fromS(genre)))
        .projectionExpression("movieId, title, releaseYear")
        .build());
```

The enhanced client supports projection via `.attributesToProject(fields)` on `QueryEnhancedRequest`. The RCU limitation is the same. The enhanced client deserializes projected fields into your bean, leaving non-requested fields as `null`. The low-level client returns raw maps, which are slightly cheaper to process if you only need a few values.

**When projection helps**: if your items are large (hundreds of KB or more), reducing network transfer improves latency. It will not save you money on RCU.

## GSI vs FilterExpression

Filtering on non-key attributes is a common source of confusion. Consider finding all movies by a specific author.

The project logs what happens with a `FilterExpression`:

```text
[METRIC] GSI vs Filter bad (FilterExpression): scanned 12 items, matched 3 in partition, 0.5 RCU
[METRIC] GSI vs Filter good (GSI query): only 3 matching items, 0.5 RCU
```

Same RCU (0.5), but the filter path read 12 items from disk and discarded 9. The GSI read only the 3 matching items. On a larger table, the gap widens -- a filter that discards 90% of your data still bills you for the full 1 MB read window.

```java
// reads up to 1 MB of items, then discards non-matching
var response = client.query(QueryRequest.builder()
        .tableName("movies")
        .keyConditionExpression("genre = :genre")
        .filterExpression("author = :author")
        .expressionAttributeValues(Map.of(
                ":genre", AttributeValue.fromS(genre),
                ":author", AttributeValue.fromS(author)))
        .build());

// reads only matching items via GSI
var response = client.query(QueryRequest.builder()
        .tableName("movies")
        .indexName("author-index")
        .keyConditionExpression("author = :author")
        .expressionAttributeValues(Map.of(":author", AttributeValue.fromS(author)))
        .build());
```

A GSI query reads only the matching items. The trade-off is additional storage cost for the index and eventual consistency (though strong consistency is available if configured).

The enhanced client supports this via `QueryConditional.keyEqualTo(...)` and `.indexName("author-index")`. Same logic, cleaner API.

The rule of thumb: if a filter would discard most of the scanned data, the filter is hiding an access pattern that should be modeled differently.

## Pagination

DynamoDB returns paginated results using `Limit` and `ExclusiveStartKey`. The client does not paginate automatically -- you must handle the loop.

The project compares an unbounded query (no pagination) against a paginated one:

```text
[METRIC] Pagination bad (unbounded): 12 items all in memory at once
[METRIC] Pagination good (page=1, size=5): 5 items, hasMore=true
[METRIC] Pagination good (page=2, size=5): 5 items, hasMore=false
```

The unbounded path loads everything into memory. The paginated path processes items in bounded batches:

```java
List<Map<String, AttributeValue>> allItems = new ArrayList<>();
Map<String, AttributeValue> lastKey = null;
int pageSize = 10;

do {
    var response = client.query(QueryRequest.builder()
            .tableName("movies")
            .keyConditionExpression("genre = :genre")
            .expressionAttributeValues(Map.of(":genre", AttributeValue.fromS(genre)))
            .limit(pageSize)
            .exclusiveStartKey(lastKey)
            .build());
    allItems.addAll(response.items());
    lastKey = response.lastEvaluatedKey();
} while (lastKey != null);
```

DynamoDB does not support offset-based pagination. Simulating page numbers (page 1 = first N items, page 2 = next N, etc.) requires scanning through all previous pages on each request. This is O(N) in the number of pages. The project's documentation notes this explicitly: "page-number pagination on DynamoDB requires iterating through (page-1) cursors, which makes O(N) round-trips for page N."

The enhanced client wraps this in a `Page<Movie>` object. Each page exposes `.items()` and `.lastEvaluatedKey()`. The enhanced client always deserializes items into beans, even when you only need a few fields. The low-level client returns raw maps, which can be selectively transformed.

For stateless pagination, Base64-encode `LastEvaluatedKey` as a pagination token. This is what DynamoDB's own pagination tokens do.

## Scan vs Query

`Scan` reads every item in the table. `Query` reads only items matching a partition key. The project logs the difference:

```text
[METRIC] Scan bad (full table scan): 3 items across all partitions, 0.5 RCU
[METRIC] Query good (partition query): 2 items, 0.5 RCU
```

Same RCU for small tables, but the scan cost grows linearly with the table. The query cost stays flat because it targets a single partition.

```java
var scanResult = client.scan(ScanRequest.builder()
        .tableName("movies")
        .returnConsumedCapacity(ReturnConsumedCapacity.TOTAL)
        .build());

var queryResult = client.query(QueryRequest.builder()
        .tableName("movies")
        .keyConditionExpression("genre = :genre")
        .expressionAttributeValues(Map.of(":genre", AttributeValue.fromS(genre)))
        .returnConsumedCapacity(ReturnConsumedCapacity.TOTAL)
        .build());
```

Scans should never appear in a request path. If a read path needs a scan, the access pattern is not modeled correctly.

The enhanced client exposes `table.scan()` which returns `Iterable<Page<Movie>>`. Pages load lazily as you iterate. More convenient than manual pagination, identical RCU cost.

### Parallel scan

For unavoidable scan jobs, `Scan` supports `TotalSegments` and `Segment` to divide work across workers:

```java
var segmentResult = client.scan(ScanRequest.builder()
        .tableName("movies")
        .totalSegments(4)
        .segment(segmentId)
        .build());
```

Each worker processes a disjoint segment. RCU scales proportionally with the number of segments. Useful for one-off data migrations where throughput matters more than cost.

## Time-to-Live (TTL)

TTL lets DynamoDB delete old items automatically based on a timestamp attribute. Enable it once per table by specifying the attribute name, then write items with an epoch-second timestamp:

```java
item.setExpireAt(Instant.now().plusSeconds(ttlSeconds).getEpochSecond());
```

The deletion is a background process. DynamoDB typically removes expired items within two days of their expiration timestamp. During that window, expired items are still visible in reads, queries, and scans. This is by design -- TTL is not a real-time expiration mechanism.

TTL deletion does not consume write capacity units. It is free. One practical use case: a session table where old sessions are automatically cleaned up without running a scheduled delete job.

## Optimistic locking

DynamoDB does not have native row-level locking. The standard workaround is optimistic locking with a version attribute. The project demonstrates the difference:

```text
[METRIC] Locking bad (unconditional): lost update risk, concurrent writes may overwrite each other
[METRIC] Locking good (version=3): update succeeded, version now 4
[METRIC] Locking good: version conflict (expected=3, actual differs)
```

The bad path writes unconditionally -- two concurrent clients can overwrite each other. The good path checks the version:

```java
client.updateItem(UpdateItemRequest.builder()
        .tableName("movies")
        .key(Map.of(
                "genre", AttributeValue.fromS(genre),
                "movieId", AttributeValue.fromS(movieId)))
        .updateExpression("SET #attr = :val, version = :newVer")
        .conditionExpression("version = :expectedVer OR attribute_not_exists(version)")
        .expressionAttributeNames(Map.of("#attr", attributeName))
        .expressionAttributeValues(Map.of(
                ":val", AttributeValue.fromS(value),
                ":expectedVer", AttributeValue.fromN(String.valueOf(currentVersion)),
                ":newVer", AttributeValue.fromN(String.valueOf(newVersion))))
        .build());
```

When `version` matches, the update succeeds and increments. On conflict, DynamoDB throws `ConditionalCheckFailedException`.

The `OR attribute_not_exists(version)` clause handles items without a version attribute (legacy data). This creates a theoretical window where two concurrent first-writes could both succeed. For strict correctness, use a separate `PutItem` with `attribute_not_exists` for creation and reserve the version check for updates.

The enhanced client handles this with `@DynamoDbVersionAttribute` on your bean. The SDK reads the current version, applies the condition, and retries on conflict. No `conditionExpression` to write. The trade-off: you cannot customize retry behavior or access the raw `UpdateItemResponse`.

## Transactions

DynamoDB transactions (`TransactWriteItems`) provide ACID guarantees across up to 100 items in one or more tables. The project logs the outcome:

```text
[METRIC] Transaction bad (individual puts): 5/5 items written, no atomicity
[METRIC] Transaction good (TransactWriteItems): 5 items atomically written
```

The bad path writes items individually. If one fails, the others remain written -- partial writes with no rollback. The good path wraps everything in a transaction:

```java
var transactItems = movies.stream()
        .map(m -> TransactWriteItem.builder()
                .put(Put.builder()
                        .tableName("movies")
                        .item(m.toItemMap())
                        .build())
                .build())
        .toList();
client.transactWriteItems(TransactWriteItemsRequest.builder()
        .transactItems(transactItems)
        .build());
```

Transactions use a two-phase commit internally: prepare then commit. This means they consume **2x the write capacity** of individual puts. If an item is 1 KB, a transactional write consumes 2 WCU instead of 1. The same multiplier applies to reads via `TransactGetItems` (2x RCU).

Additional constraints:

- Maximum 100 actions per transaction
- Maximum 4 MB total request size
- All-or-nothing: if any action fails, all are rolled back
- `TransactionCanceledException` on cancellation

The enhanced client supports transactions through `table.transactWriteItems(...)` with beans instead of builders. Cleaner for simple operations, but you lose `ReturnValues` per action and per-item condition expressions.

The 2x capacity multiplier adds up quickly. Reserve transactions for cases where you genuinely need atomicity. For single-item updates, a conditional update is cheaper.

## Summary table

| #   | Pattern       | Naive                | Good                  | Low-level API                                                 | Enhanced API                               | Key insight                                        |
| --- | ------------- | -------------------- | --------------------- | ------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| 1   | Count         | `items().size()`     | `Select.COUNT`        | `QueryRequest.select(COUNT)`                                  | Not exposed                                | Same RCU, paginates through 1 MB                   |
| 2   | Condition     | Unconditional put    | `conditionExpression` | `conditionExpression(...)`                                    | `putItem(r -> r.conditionExpression(...))` | `ConditionalCheckFailedException` is control flow  |
| 3   | Batch         | N round-trips        | `BatchWriteItem`      | `WriteRequest` builders                                       | `batchPutItem(Collection)`                 | 25 items / 16 MB, retry UnprocessedItems           |
| 4   | Projection    | Full item fetch      | Projection expression | `.projectionExpression(...)`                                  | `.attributesToProject(...)`                | Reduces network, not RCU                           |
| 5   | Filter vs GSI | Filter on table      | GSI query             | `.indexName(...)` + `.keyConditionExpression(...)`            | `.indexName(...)` + `QueryConditional`     | Filter reads then discards. GSI reads only matches |
| 6   | Pagination    | Offset skip          | Cursor-based          | `exclusiveStartKey` + `lastEvaluatedKey()`                    | `Page<Movie>` with `lastEvaluatedKey()`    | Page numbers are O(N)                              |
| 7   | Scan vs Query | `Scan`               | `Query` by PK         | `.scan()` / `.query()`                                        | `.scan()` / `.query()` (lazy pages)        | Scan reads every partition                         |
| 8   | TTL           | Manual cleanup       | `expireAt` attribute  | Any `PutItem`                                                 | Any `PutItem`                              | ~48h deletion window, expired visible until then   |
| 9   | Locking       | Unconditional update | Version condition     | Manual `conditionExpression`                                  | `@DynamoDbVersionAttribute`                | Annotation is simpler; manual gives more control   |
| 10  | Transactions  | Individual puts      | Batch write           | `TransactWriteItemsRequest` with `TransactWriteItem` builders | `transactWriteItems(...)` with beans       | 2x WCU, 100 items / 4 MB                           |

All metrics in this article come from the [dynamodb-client-patterns](https://github.com/Hogwai/hogwai.github.io-content/tree/main/dynamodb-client-patterns) showcase project, which implements each pattern with both the low-level and enhanced client, tested end-to-end against DynamoDB Local.

## Key takeaways

- **HTTP client choices matter at scale.** `url-connection` works for most cases. Switch to `apache` for proxy/TLS needs, `crt` for maximum throughput with many connections. All three work with both DynamoDB clients transparently.
- **The low-level client gives you control; the enhanced client gives you speed.** Use whichever fits the task. Many projects benefit from both in the same codebase for different operations.
- **The enhanced client is not a superset.** Features like `Select.COUNT`, `ReturnValues`, and per-table `consumedCapacity` on batch operations are only available through the low-level client. Start with the enhanced client for productivity, drop to the low-level client when you hit a limit.
- **RCU/WCU is based on stored item size, not what you return.** Projection and filter do not reduce capacity consumption in either client.
- **1 MB is the fundamental pagination boundary.** Whether you count, query, or scan, DynamoDB processes data in 1 MB chunks.
- **Batch operations save round-trips but are not free.** Each BatchWriteItem is one network call, but partial failures must be retried.
- **GSIs solve filter problems at the storage level.** If a filter discards most of your data, you are paying for a read that should not happen.
- **TTL is eventual, not real-time.** The ~48 hour window is a feature for most use cases, but a problem if you need immediate deletion.
- **Transactions are atomic and expensive.** The 2x capacity multiplier is worth paying for correctness, but not for convenience.
- **The best pattern is the one you do not need.** Most access patterns in DynamoDB are driven by single-item gets and queries by partition key. Everything else is an optimization or a trade-off.
