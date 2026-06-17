---
title: |
  Simplify persistence layer interactions without an ORM
description: "Five patterns to reduce JDBC boilerplate using only Java 8"
pubDate: 2026-06-17
tags: ["java", "jdbc", "functional-programming", "java8", "legacy"]
draft: false
---

## Some context

In a previous job, I had to work on a legacy monolith that was 1 or 2 decades old.
It had several characteristics that made it difficult to work with:

- Built with Apache Struts 1 (or lower)
- Stuck on Java 8, due to direct and transitive dependencies, and management's fear of upgrading
- Very inconsistent code quality across files, due to lack of standardization and excessive reliance on contractors
- No ORM
- Using Bitronix as the transaction manager

## The problem

The DAOs (when they existed) were all written differently.
Typical code looked like this:

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

## Pattern 1: named parameter handling

First observation: JDBC only supports positional parameters (`?`), which isn't great for readability.

The idea is to go from this:

```sql
SELECT c.code AS categoryCode, c.label AS categoryLabel,
       i.id AS itemId, i.code AS itemCode, i.name AS itemName, i.price AS itemPrice
FROM categories c
INNER JOIN items i ON i.category_id = c.id
WHERE c.code = ?
  AND i.code IN ?
ORDER BY i.name
```

...to this:

```sql
SELECT c.code AS categoryCode, c.label AS categoryLabel,
       i.id AS itemId, i.code AS itemCode, i.name AS itemName, i.price AS itemPrice
FROM categories c
INNER JOIN items i ON i.category_id = c.id
WHERE c.code = :categoryCode
  AND i.code IN :itemCodes
ORDER BY i.name
```

A `SqlUtil` utility takes named parameters as input and replaces them with `?`.
It also converts lists to parameter enumerations `(?,?,...)` for the IN clause:

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

With the SQL built, we can finally write the method:

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

SQL query construction is externalized. The rest is standard JDBC: try-with-resources, manual index, ResultSet loop.

## Pattern 2: JdbcExecutor

Try-with-resources simplified cleanup, but opening the `PreparedStatement` and looping over the `ResultSet` are still in the method.
`JdbcExecutor` handles them:

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

The caller only provides two lambdas:

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

`PreparedStatement` and `ResultSet` cleanup is handled and no longer appears in the calling code.

## Pattern 3: extract methods

Lambdas are convenient but quickly become verbose when binding or mapping is complex. Extract them to static methods:

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

The call becomes more declarative:

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

## Pattern 4: ParamBinder

`SimpleBinder` still requires manual index management: `ps.setString(1, ...)`, `SqlUtil.bindListAsString(ps, 2, ...)`. One missed update and parameters are misaligned.

`ParamBinder` encapsulates the counter:

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

`IndexedBinder` receives a `ParamBinder` instead of a `PreparedStatement`:

```java
@FunctionalInterface
public interface IndexedBinder {
    void bind(ParamBinder binder) throws SQLException;
}
```

`JdbcExecutor.executeQueryWithIndex` bridges the gap:

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

Usage:

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

## Pattern 5: RowMapper and DataSource-level

Last layer: move connection management into the executor. `RowMapper<T>` and `toList`:

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

`Item.MAPPER` is a constant `RowMapper`:

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

`JdbcExecutor` accepts a `DataSource` directly:

```java
public static <T> T executeQuery(DataSource ds, String query,
                                 IndexedBinder binder, ResultProcessor<T> processor)
        throws SQLException {
    try (Connection conn = ds.getConnection()) {
        return executeQueryWithIndex(conn, query, binder, processor);
    }
}
```

The final method:

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

Try-with-resources have been encapsulated. The mapping is a reusable constant.

The result is a lighter method with declarative code, well-defined responsibilities, and no side effects.

## What these patterns change

| Pattern | Connection   | Statement    | Parameters   | Mapping    |
| ------- | ------------ | ------------ | ------------ | ---------- |
| 1       | caller       | caller       | manual index | caller     |
| 2       | caller       | JdbcExecutor | manual index | lambda     |
| 3       | caller       | JdbcExecutor | manual index | method ref |
| 4       | caller       | JdbcExecutor | ParamBinder  | method ref |
| 5       | JdbcExecutor | JdbcExecutor | ParamBinder  | RowMapper  |

## Conclusion

Each abstraction solves a specific problem: `SqlUtil` for named SQL parameters, `JdbcExecutor` for lifecycle management, `ParamBinder` for index tracking, `RowMapper` for row mapping. Combined, they help avoid common anti-patterns, prevent mistakes, and factor out repetitive code without adding a framework or library.

A project implementing these concepts is available here: [legacy-jdbc-abstractor](https://github.com/Hogwai/hogwai.github.io-content/tree/main/legacy-jdbc-abstractor).
