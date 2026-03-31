---
title: |
  Reproduire le comportement du EXISTS SQL avec DynamoDB
description: "Différentes façons d'émuler le comportement du EXISTS SQL avec le client Java DynamoDB"
pubDate: 2026-03-29
tags: ["dynamodb", "java", "performance"]
draft: false
---

En SQL, vérifier qu'une ligne existe est trivial :

```sql
SELECT 1 FROM posts WHERE id = '123' LIMIT 1;
```

DynamoDB n'a pas d'équivalent. Un `GetItem` classique sur un élément de 50 Ko lit les 50 Ko en entier, même si vous souhaitez seulement savoir s'il existe. Vous payez pour la lecture complète.

Cet article présente des stratégies efficaces pour implémenter un `exists` avec le SDK AWS pour Java v2.

## 1. L'approche naïve vs. les projections

Utilisez une `ProjectionExpression` pour ne récupérer que la clé de partition plutôt que l'élément complet. Cela réduit le transfert réseau et le coût de désérialisation.

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

### Le piège de facturation caché

La projection réduit le transfert réseau, mais pas la consommation de RCU. DynamoDB lit l'élément en entier depuis le disque avant d'appliquer la projection.

- Gain : latence réseau, CPU côté client.
- Coût : identique à une lecture complète en termes de RCU.

## 2. Diviser la facture par deux : la cohérence éventuelle

Si votre cas d'usage tolère un délai de détection inférieur à la seconde (ce qui est généralement le cas pour une vérification d'existence), passez en cohérence éventuelle.

```java
GetItemRequest.builder()
    .key(key)
    .projectionExpression("id")
    .consistentRead(false) // <--- The magic line
    .build();
```

`GetItem` utilise par défaut des lectures fortement cohérentes. Passer `consistentRead(false)` divise le coût en RCU par deux.

## 3. Le défi du batch (BatchGetItem)

Pour vérifier plusieurs éléments en une seule fois, utilisez `BatchGetItem` plutôt que des appels individuels en boucle.

Deux comportements à gérer :

1. Les éléments absents sont simplement omis de la réponse, ils ne sont pas retournés comme `null`.
2. Clés non traitées : sous forte charge, la réponse peut être partielle.

Implémentation avec mécanisme de retry :

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

Le helper `backoff` applique une stratégie de backoff exponentiel pour ne pas surcharger DynamoDB :

```java
private static void backoff(int attempt) {
    try {
        TimeUnit.MILLISECONDS.sleep((long) Math.pow(2, attempt) * 100);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }
}
```

## 4. Vérifier des attributs complexes

Au-delà de la simple existence d'un élément, vous pouvez avoir besoin de vérifier si un attribut spécifique contient des données (par exemple, une liste non vide).

Récupérer uniquement l'attribut cible via `GetItem` est plus direct qu'utiliser une `Query` avec `FilterExpression`, car les filtres sont appliqués _après_ que le coût de lecture a été engagé.

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

### Alternative : utiliser Query avec FilterExpression

L'approche par `Query` reste utile pour des conditions plus complexes. À noter que le filtre est appliqué après la lecture, donc la consommation de RCU est identique.

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

`GetItem` est à privilégier pour les vérifications sur un seul élément : plus simple, sans surcoût de parsing de requête, et l'intention est explicite.

## Récapitulatif des performances

| Technique            | Réduit la bande passante ? | Réduit les coûts (RCU) ? | Cas d'usage idéal                     |
| :------------------- | :------------------------: | :----------------------: | :------------------------------------ |
| GetItem complet      |            Non             |           Non            | Récupération des données réelles      |
| Projection           |            Oui             |           Non            | Grands éléments, réduction de latence |
| Cohérence éventuelle |            Non             |        Oui (-50%)        | Vérifications d'existence standard    |
| GSI (Keys Only)      |            Oui             |        Oui (-90%)        | Très grands éléments (>40 Ko)         |

> Pour des éléments de plus de 40 Ko, un GSI en `KEYS_ONLY` coûte 0,5 RCU par lecture, indépendamment de la taille de l'élément dans la table principale.

## Conclusion

Pour une vérification d'existence standard :

1. `projectionExpression` : réduit le transfert réseau.
2. `consistentRead(false)` : divise le coût en RCU par deux.
3. Gérer les `UnprocessedKeys` dans les opérations par batch.

## Références

1. <a id="ref1"></a>[DynamoDB GetItem API Reference](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html)
2. <a id="ref2"></a>[DynamoDB BatchGetItem API Reference](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchGetItem.html)
3. <a id="ref3"></a>[DynamoDB Read Consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)
4. <a id="ref4"></a>[DynamoDB Projection Expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ProjectionExpressions.html)

## Démo

Une démonstration des concepts abordés dans cet article est disponible ici : [micronaut-java-dynamodb-exists](https://github.com/Hogwai/hogwai.github.io-content/tree/main/micronaut-java-dynamodb-exists)
