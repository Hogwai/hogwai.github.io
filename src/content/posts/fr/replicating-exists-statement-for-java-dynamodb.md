---
title: |
  Reproduire le comportement du EXISTS SQL avec DynamoDB
description: "Différentes façons d'émuler le comportement du EXISTS SQL avec le client Java DynamoDB"
pubDate: 2026-03-29
tags: ["dynamodb", "java", "performance"]
draft: false
---

En SQL, vérifier l'existence d'un élément est une opération triviale :

```sql
SELECT 1 FROM posts WHERE id = '123' LIMIT 1;
```

DynamoDB n'a pas d'équivalent. Un `GetItem` classique sur un élément de 50 Ko lit les 50 Ko en entier, même si l'on souhaite seulement savoir s'il existe.

Dans cet article, nous abordons des stratégies efficaces pour implémenter un `exists` avec le SDK AWS pour Java v2.

## L'approche naïve vs. les projections

Une première possibilité est d'utiliser une `ProjectionExpression` afin de ne récupérer que la clé de partition plutôt que l'élément complet. Cela réduit le transfert réseau et le coût de désérialisation.

```java
public boolean existsByProjection(String subreddit, String id) {
    GetItemRequest request = GetItemRequest.builder()
            .tableName("posts")
            .key(buildKey(subreddit, id))
            .projectionExpression("subreddit") // On ne demande que la clé, pas l'élément
            .build();

    GetItemResponse response = dynamoDbClient.getItem(request);
    return response.hasItem();
}
```

Toutefois, cette approche ne réduit pas le coût car DynamoDB calcule les RCU consommées sur la taille totale de l'élément stocké, indépendamment des attributs projetés.

## Diviser la facture par deux : la cohérence éventuelle

La deuxième astuce possible est d'effectuer des lectures à cohérence éventuelle (qui est l'option par défaut de lecture).

La cohérence éventuelle peut présenter un délai de réplication d'au plus une seconde dans des conditions normales.
Ce mode de lecture consomme 1 RCU pour un élément jusqu'à 4 Ko.

```java
GetItemRequest.builder()
    .key(key)
    .projectionExpression("id")
    .consistentRead(false)
    .build();
```

La cohérence forte est à utiliser `consistentRead(true)` si le cas d'usage exige impérativement la fraîcheur de la donnée.
Ce mode de lecture consomme 2 RCU pour un élément jusqu'à 4 Ko.

## Le défi du batch (BatchGetItem)

Pour vérifier plusieurs éléments en une seule fois, on peut utiliser `BatchGetItem` plutôt que de faire des vérifications individuelles successives.

Deux comportements à gérer :

- Les éléments absents sont simplement omis de la réponse, ils ne sont pas retournés comme `null`.
- Clés non traitées : sous forte charge, la réponse peut être partielle.

Implémentation avec mécanisme de retry :

```java
public Map<String, Boolean> batchExists(String subreddit, List<String> ids) {
    // 1. Préparation des clés
    List<Map<String, AttributeValue>> keys = ids.stream()
            .map(id -> buildKey(subreddit, id))
            .toList();

    Map<String, KeysAndAttributes> requestItems = new HashMap<>();
    requestItems.put("posts", KeysAndAttributes.builder()
            .keys(keys)
            .projectionExpression("id") // Que la clé
            .build());

    BatchGetItemRequest request = BatchGetItemRequest.builder()
            .requestItems(requestItems)
            .returnConsumedCapacity(ReturnConsumedCapacity.INDEXES)
            .build();

    Map<String, Boolean> result = new HashMap<>();
    ids.forEach(id -> result.put(id, false)); // Faux par défaut

    int attempts = 0;

    // 2. Retry pour les clés non traitées
    do {
        attempts++;
        BatchGetItemResponse response = dynamoDbClient.batchGetItem(request);

        // Items trouvés
        var foundItems = response.responses().getOrDefault("posts", List.of());
        foundItems.forEach(item -> result.put(item.get("id").s(), true));

        // Clés non traitées
        if (response.hasUnprocessedKeys() && !response.unprocessedKeys().isEmpty()) {
            request = request.toBuilder()
                             .requestItems(response.unprocessedKeys())
                             .build();
            // Stratégie de backoff exponentiel
            backoff(attempts);
        } else {
            break; // Fin de traitement
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

## Vérifier des attributs complexes

Au-delà de la simple existence d'un élément, on peut avoir besoin de vérifier si un attribut spécifique contient des données (par exemple, une liste non vide).

### Utilisation de `GetItem`

Récupérer uniquement l'attribut cible via `GetItem` est plus direct et économe qu'utiliser une `Query` avec `FilterExpression`, car DynamoDB localise l'élément par sa clé primaire (opération O(1)), puis ne renvoie que les attributs demandés si l'on utilise une `ProjectionExpression`.
Le coût en RCU est calculé par rapport à la taille de l'élément, mais on évite le transfert réseau et la désérialisation des attributs inutiles.

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

    // Vérifier si l'attribut existe et n'est pas vide
    return keywords != null && keywords.hasL() && !keywords.l().isEmpty();
}
```

### Utiliser `Query` avec `FilterExpression`

L'approche par `Query` reste utile lorsque l'on doit récupérer un ensemble d'éléments partageant la même clé de partition, puis affiner côté serveur les résultats.
DynamoDB lit d'abord tous les éléments correspondant à la condition de partition/sort key, consomme les RCU pour chacun d'eux, puis seulement applique le filtre en mémoire. Les éléments écartés par le filtre ont quand même été facturés.

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

| Technique            | Réduit la bande passante ? | Réduit les coûts (RCU) ? | Cas d'usage idéal                                                           |
| :------------------- | :------------------------: | :----------------------: | :-------------------------------------------------------------------------- |
| GetItem complet      |            Non             |           Non            | Récupération des données réelles                                            |
| Projection           |            Oui             |           Non            | Grands éléments, réduction de latence, vérification d'existence (hasItem()) |
| Cohérence éventuelle |            Non             |        Oui (-50%)        | Vérifications d'existence standard                                          |
| GSI (Keys Only)      |            Oui             |        Oui (-90%)        | Très grands éléments (>40 Ko)                                               |

> Pour des éléments de plus de 40 Ko, un GSI en `KEYS_ONLY` coûte 0,5 RCU par lecture, indépendamment de la taille de l'élément dans la table principale.

## Conclusion

Pour une vérification d'existence standard :

- `projectionExpression` : réduit le transfert réseau.
- `consistentRead(false)` : divise le coût en RCU par deux.
- Gérer les `UnprocessedKeys` dans les opérations par batch.
- Pour les éléments > 40 Ko, envisager un GSI en KEYS_ONLY pour réduire le coût de 90 %.

## Références

- <a id="ref1"></a>[DynamoDB GetItem API Reference](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html)
- <a id="ref2"></a>[DynamoDB BatchGetItem API Reference](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_BatchGetItem.html)
- <a id="ref3"></a>[DynamoDB Read Consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)
- <a id="ref4"></a>[DynamoDB Projection Expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ProjectionExpressions.html)

## Démo

Une démonstration des concepts abordés dans cet article est disponible ici : [micronaut-java-dynamodb-exists](https://github.com/Hogwai/hogwai.github.io-content/tree/main/micronaut-java-dynamodb-exists)
