---
title: |
  Simplifier les interactions avec la couche de persistance sans ORM
description: "Cinq patterns pour réduire le boilerplate JDBC en utilisant uniquement Java 8"
pubDate: 2026-06-17
tags: ["java", "jdbc", "functional-programming", "java8", "legacy"]
draft: false
---

## Un peu de contexte

Durant l'une de mes précédentes expériences, j'ai dû travailler sur un monolithe legacy ayant 1 ou 2 décennies d'âge.
Ce monolithe avait plusieurs caractéristiques qui en faisaient une application peu aisée à manœuvrer:

- Conçu avec Apache Struts 1 (ou inférieur)
- Bloqué sur Java 8, dû aux dépendances directes et transitives et à la peur du management d'effectuer la montée de version
- Disposant d'une qualité de code très variable selon les fichiers, dû à un manque d'harmonisation et un recours excessif à de la prestation
- Sans ORM
- Utilisant Bitronix comme gestionnaire de transactions

## Le problème

Les DAO (s'il y en avait) étaient tous écrits différemment.
Le code type ressemblait à ça :

```java
public List<Item> getItemsByCategory(String categoryCode) {
    Connection conn = null;
    PreparedStatement ps = null;
    ResultSet rs = null;
    try {
        conn = dataSource.getConnection();
        ps = conn.prepareStatement(
            "SELECT ... WHERE c.code = ?");
        ps.setString(1, categoryCode);
        rs = ps.executeQuery();
        List<Item> items = new ArrayList<>();
        while (rs.next()) {
            Item item = new Item();
            item.setCode(rs.getString("code"));
            // ...
            items.add(item);
        }
        return items;
    } catch (SQLException e) {
        throw new RuntimeException("Query failed", e);
    } finally {
        if (rs != null) try { rs.close(); } catch (SQLException e) {}
        if (ps != null) try { ps.close(); } catch (SQLException e) {}
        if (conn != null) try { conn.close(); } catch (SQLException e) {}
    }
}
```

## Pattern 1 : gestion des paramètres nommés

Premier constat : JDBC ne gère que les paramètres positionnels (`?`), ce qui en termes de lisibilité n'est pas optimal.

L'idée est de pouvoir passer de ça:

```sql
SELECT c.code AS categoryCode, c.label AS categoryLabel,
       i.id AS itemId, i.code AS itemCode, i.name AS itemName, i.price AS itemPrice
FROM categories c
INNER JOIN items i ON i.category_id = c.id
WHERE c.code = ?
  AND i.code IN ?
ORDER BY i.name
```

...à ça:

```sql
SELECT c.code AS categoryCode, c.label AS categoryLabel,
       i.id AS itemId, i.code AS itemCode, i.name AS itemName, i.price AS itemPrice
FROM categories c
INNER JOIN items i ON i.category_id = c.id
WHERE c.code = :categoryCode
  AND i.code IN :itemCodes
ORDER BY i.name
```

Ici, un utilitaire `SqlUtil` prend en entrée des paramètres nommés et effectue le remplacement par des `?`.
Il convertit aussi les listes en énumérations de paramètres `(?,?,...)` pour la clause IN :

```java
package com.hogwai.jdbcabstractor.persistence;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;

public final class SqlUtil {

    private SqlUtil() {}

    public static String injectSingleParam(String query, String placeholder) {
        return query.replace(placeholder, "?");
    }

    public static String injectInClause(String query, String placeholder, List<?> values) {
        return query.replace(placeholder, buildInClause(values));
    }

    public static String buildInClause(List<?> values) {
        if (values == null || values.isEmpty()) {
            throw new IllegalArgumentException("List cannot be null or empty for IN clause");
        }
        StringBuilder sb = new StringBuilder("(");
        for (int i = 0; i < values.size(); i++) {
            sb.append("?");
            if (i < values.size() - 1) sb.append(",");
        }
        sb.append(")");
        return sb.toString();
    }

    public static int bindListAsString(PreparedStatement ps, int startIndex, List<?> values)
            throws SQLException {
        for (int i = 0; i < values.size(); i++) {
            ps.setString(startIndex + i, String.valueOf(values.get(i)));
        }
        return startIndex + values.size();
    }
}
```

Le SQL construit, on peut enfin écrire la méthode :

```java
public List<Item> getItems(ItemCriteria criteria) {
    if (criteria == null || isEmpty(criteria.getCategoryCode())
            || isEmpty(criteria.getItemCodes())) {
        return Collections.emptyList();
    }
    String sql = SqlUtil.injectSingleParam(GET_ITEMS_BY_CATEGORY_AND_CODES, ":categoryCode");
    sql = SqlUtil.injectInClause(sql, ":itemCodes", criteria.getItemCodes());

    List<Item> results = new ArrayList<>();
    try (Connection conn = dataSource.getConnection();
         PreparedStatement ps = conn.prepareStatement(sql)) {
        int idx = 1;
        ps.setString(idx++, criteria.getCategoryCode());
        SqlUtil.bindListAsString(ps, idx, criteria.getItemCodes());
        try (ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                results.add(new Item(
                    rs.getInt("itemId"),
                    rs.getString("itemCode"),
                    rs.getString("itemName"),
                    rs.getBigDecimal("itemPrice"),
                    rs.getString("categoryCode"),
                    rs.getString("categoryLabel")
                ));
            }
        }
    } catch (SQLException e) {
        throw new RuntimeException("Query failed", e);
    }
    return results;
}
```

La construction de la requête SQL est externalisée. Le reste est du JDBC standard : try-with-resources, index manuel, boucle sur le ResultSet.

## Pattern 2 : JdbcExecutor

Le try-with-resources a simplifié la fermeture, mais l'ouverture du `PreparedStatement` et la boucle sur le `ResultSet` sont encore dans la méthode.
`JdbcExecutor` les prend en charge :

```java
@FunctionalInterface
public interface SimpleBinder {
    void bind(PreparedStatement ps) throws SQLException;
}

@FunctionalInterface
public interface ResultProcessor<T> {
    T process(ResultSet rs) throws SQLException;
}
```

```java
public static <T> T executeQuery(Connection conn, String query,
                                 SimpleBinder binder, ResultProcessor<T> processor)
        throws SQLException {
    try (PreparedStatement ps = conn.prepareStatement(query)) {
        binder.bind(ps);
        try (ResultSet rs = ps.executeQuery()) {
            return processor.process(rs);
        }
    }
}
```

L'appelant ne fournit plus que deux lambdas :

```java
public List<Item> getItemsWithExecutor(ItemCriteria criteria) {
    if (criteria == null || isEmpty(criteria.getCategoryCode())
            || isEmpty(criteria.getItemCodes())) {
        return Collections.emptyList();
    }
    String sql = SqlUtil.injectSingleParam(GET_ITEMS_BY_CATEGORY_AND_CODES, ":categoryCode");
    sql = SqlUtil.injectInClause(sql, ":itemCodes", criteria.getItemCodes());

    try (Connection conn = dataSource.getConnection()) {
        return JdbcExecutor.executeQuery(conn, sql,
            ps -> {
                ps.setString(1, criteria.getCategoryCode());
                SqlUtil.bindListAsString(ps, 2, criteria.getItemCodes());
            },
            rs -> {
                List<Item> results = new ArrayList<>();
                while (rs.next()) {
                    results.add(new Item(
                        rs.getInt("itemId"),
                        rs.getString("itemCode"),
                        rs.getString("itemName"),
                        rs.getBigDecimal("itemPrice"),
                        rs.getString("categoryCode"),
                        rs.getString("categoryLabel")
                    ));
                }
                return results;
            }
        );
    } catch (SQLException e) {
        throw new RuntimeException("Query failed", e);
    }
}
```

Les fermetures du `PreparedStatement` et du `ResultSet` sont gérées et ne sont plus dans le code appelant.

## Pattern 3 : extraction en méthodes

Les lambdas sont pratiques mais deviennent rapidement verbeuses quand le binding ou le mapping est complexe. On les extrait en méthodes statiques :

```java
private static List<Item> mapResults(ResultSet rs) throws SQLException {
    List<Item> results = new ArrayList<>();
    while (rs.next()) {
        results.add(new Item(
            rs.getInt("itemId"),
            rs.getString("itemCode"),
            rs.getString("itemName"),
            rs.getBigDecimal("itemPrice"),
            rs.getString("categoryCode"),
            rs.getString("categoryLabel")
        ));
    }
    return results;
}

private static void bindParams(ItemCriteria criteria, PreparedStatement ps) throws SQLException {
    int idx = 1;
    ps.setString(idx++, criteria.getCategoryCode());
    SqlUtil.bindListAsString(ps, idx, criteria.getItemCodes());
}
```

L'appel devient plus déclaratif :

```java
public List<Item> getItemsCompact(ItemCriteria criteria) {
    if (criteria == null || isEmpty(criteria.getCategoryCode())
            || isEmpty(criteria.getItemCodes())) {
        return Collections.emptyList();
    }
    String sql = SqlUtil.injectSingleParam(GET_ITEMS_BY_CATEGORY_AND_CODES, ":categoryCode");
    sql = SqlUtil.injectInClause(sql, ":itemCodes", criteria.getItemCodes());

    try (Connection conn = dataSource.getConnection()) {
        return JdbcExecutor.executeQuery(conn, sql,
            ps -> bindParams(criteria, ps),
            ItemService::mapResults
        );
    } catch (SQLException e) {
        throw new RuntimeException("Query failed", e);
    }
}
```

## Pattern 4 : ParamBinder

Le `SimpleBinder` impose encore l'index manuel : `ps.setString(1, ...)`, `SqlUtil.bindListAsString(ps, 2, ...)`. Un oubli de mise à jour et les paramètres sont décalés.

`ParamBinder` encapsule le compteur :

```java
public static class ParamBinder {
    private final PreparedStatement stmt;
    private int index = 1;

    public ParamBinder(PreparedStatement stmt) {
        this.stmt = stmt;
    }

    public ParamBinder setString(String value) throws SQLException {
        stmt.setString(index++, value);
        return this;
    }

    public ParamBinder setList(Iterable<?> values) throws SQLException {
        for (Object val : values) {
            stmt.setObject(index++, val);
        }
        return this;
    }

    // setInt, setLong, setDouble, setBigDecimal, setBoolean...
}
```

`IndexedBinder` reçoit un `ParamBinder` au lieu d'un `PreparedStatement` :

```java
@FunctionalInterface
public interface IndexedBinder {
    void bind(ParamBinder binder) throws SQLException;
}
```

`JdbcExecutor.executeQueryWithIndex` fait le lien :

```java
public static <T> T executeQueryWithIndex(Connection conn, String query,
                                          IndexedBinder binder, ResultProcessor<T> processor)
        throws SQLException {
    try (PreparedStatement stmt = conn.prepareStatement(query)) {
        binder.bind(new ParamBinder(stmt));
        try (ResultSet rs = stmt.executeQuery()) {
            return processor.process(rs);
        }
    }
}
```

Utilisation :

```java
public List<Item> getItemsWithIndexedBinder(ItemCriteria criteria) {
    if (criteria == null || isEmpty(criteria.getCategoryCode())
            || isEmpty(criteria.getItemCodes())) {
        return Collections.emptyList();
    }
    String sql = SqlUtil.injectSingleParam(GET_ITEMS_BY_CATEGORY_AND_CODES, ":categoryCode");
    sql = SqlUtil.injectInClause(sql, ":itemCodes", criteria.getItemCodes());

    try (Connection conn = dataSource.getConnection()) {
        return JdbcExecutor.executeQueryWithIndex(conn, sql,
            binder -> binder
                .setString(criteria.getCategoryCode())
                .setList(criteria.getItemCodes()),
            ItemService::mapResults
        );
    } catch (SQLException e) {
        throw new RuntimeException("Query failed", e);
    }
}
```

## Pattern 5 : RowMapper et DataSource-level

Dernière couche : déplacer la connexion dans l'executor. `RowMapper<T>` et `toList` :

```java
@FunctionalInterface
public interface RowMapper<T> {
    T map(ResultSet rs) throws SQLException;
}
```

```java
public static <T> ResultProcessor<List<T>> toList(RowMapper<T> mapper) {
    return rs -> {
        List<T> results = new ArrayList<>();
        while (rs.next()) {
            results.add(mapper.map(rs));
        }
        return results;
    };
}
```

`Item.MAPPER` est un `RowMapper` constant :

```java
public class Item {
    public static final RowMapper<Item> MAPPER = rs -> {
        Item item = new Item();
        item.setId(rs.getInt("itemId"));
        item.setCode(rs.getString("itemCode"));
        item.setName(rs.getString("itemName"));
        item.setPrice(rs.getBigDecimal("itemPrice"));
        item.setCategoryCode(rs.getString("categoryCode"));
        item.setCategoryLabel(rs.getString("categoryLabel"));
        return item;
    };
    // ...
}
```

`JdbcExecutor` accepte un `DataSource` directement :

```java
public static <T> T executeQuery(DataSource ds, String query,
                                 IndexedBinder binder, ResultProcessor<T> processor)
        throws SQLException {
    try (Connection conn = ds.getConnection()) {
        return executeQueryWithIndex(conn, query, binder, processor);
    }
}
```

La méthode finale :

```java
public List<Item> getItemsWithRowMapper(ItemCriteria criteria) {
    if (criteria == null || isEmpty(criteria.getCategoryCode())
            || isEmpty(criteria.getItemCodes())) {
        return Collections.emptyList();
    }
    String sql = SqlUtil.injectSingleParam(GET_ITEMS_BY_CATEGORY_AND_CODES, ":categoryCode");
    sql = SqlUtil.injectInClause(sql, ":itemCodes", criteria.getItemCodes());

    try {
        IndexedBinder indexedBind = binder -> binder
            .setString(criteria.getCategoryCode())
            .setList(criteria.getItemCodes());
        return JdbcExecutor.executeQuery(dataSource, sql,
            indexedBind,
            JdbcExecutor.toList(Item.MAPPER)
        );
    } catch (SQLException e) {
        throw new RuntimeException("Query failed", e);
    }
}
```

Les try-with-resources ont été encapsulés. Le mapping est une constante réutilisable.

Ici on obtient une méthode plus légère avec du code déclaratif, des responsabilités bien définies et sans effet de bord.

## Ce que ces patterns changent

| Pattern | Connection   | Statement    | Paramètres   | Mapping      |
| ------- | ------------ | ------------ | ------------ | ------------ |
| 1       | appelant     | appelant     | index manuel | appelant     |
| 2       | appelant     | JdbcExecutor | index manuel | lambda       |
| 3       | appelant     | JdbcExecutor | index manuel | ref. méthode |
| 4       | appelant     | JdbcExecutor | ParamBinder  | ref. méthode |
| 5       | JdbcExecutor | JdbcExecutor | ParamBinder  | RowMapper    |

## Conclusion

Chaque abstraction résout un problème spécifique : `SqlUtil` pour le SQL nommé, `JdbcExecutor` pour le cycle de vie, `ParamBinder` pour les index, `RowMapper` pour le mapping. Combinées, elles permettent d'éviter certains anti-patterns et des oublis, tout en factorisant le code répétitif sans avoir à ajouter de framework ou de librairie.

Un projet mettant en œuvre ces concepts est disponible ici : [legacy-jdbc-abstractor](https://github.com/Hogwai/hogwai.github.io-content/tree/main/legacy-jdbc-abstractor).
