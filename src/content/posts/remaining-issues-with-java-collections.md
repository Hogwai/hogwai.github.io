---
title: |
  Remaining issues with Java Collections
description: "Specific and not-so-obvious problems you may encounter that have not yet been resolved"
pubDate: 2025-11-05
tags:
  [
    "java",
    "collections",
    "performance",
  ]
draft: false
---

## Introduction

At the time of writing, Java 25 has been available for over a month, showcasing the platform's continuous evolution. However, some performance challenges with collections remain.

Let's take a look at what these issues are and how to mitigate them.

## `ArrayList<E>`

When you initialize an `ArrayList`, it will create an array (`Object[]`) as backing structure to store the elements<sup><a href="#ref1">[1]</a></sup>.

The array is used for every operation: `indexOf`, `contains`, `get` etc...

### `contains(Object o)`

Now here's the first problem.

An array only knows two things about the elements it stores: their order and their respective indexes.
This means that for each operation, the work can only be done using these two pieces of information.

Let's look at the implementation of `contains`<sup><a href="#ref2">[2]</a></sup>:

```java
public boolean contains(Object o) {
    return indexOf(o) >= 0;
}
```

```java
public int indexOf(Object o) {
    return indexOfRange(o, 0, size);
}
```

```java
int indexOfRange(Object o, int start, int end) {
    Object[] es = elementData;
    if (o == null) {
        for (int i = start; i < end; i++) {
            if (es[i] == null) {
                return i;
            }
        }
    } else {
        for (int i = start; i < end; i++) {
            if (o.equals(es[i])) {
                return i;
            }
        }
    }
    return -1;
}
```

In `indexOfRange`, we can see that the lookup is done by iterating over the array and checking for each element if it matches with the given `Object o`.

That gives an O(n) complexity, which means that the time consumed during a `contains` will be proportional to the size of the array.

It's negligible if the collection is small, but what if it's huge?

### HashSet

As we saw, the ArrayList `contains` implementation is not suitable for every size.

A better solution is to leverage a more suitable data structure: `HashSet`.
It is based on a hash table to provide consistent average-time performance for basic operations such as adding, deleting, and searching.

#### `contains(Object o)`

Let's see the implementation<sup><a href="#ref3">[3]</a></sup>:

```java
transient HashMap<E,Object> map;
```

```java
public boolean contains(Object o) {
    return map.containsKey(o);
}
```

`HashSet` uses its underlying `HashMap` to store the object as a key, which in most cases results in O(1) complexity.

So, if we have a large collection and/or a collection that is frequently looked up (contains, remove), `HashSet` is definitely a more efficient choice.

#### Utility methods

It is not always possible (or desirable) to replace all `ArrayLists` with `HashSets`.

In such cases, creating a temporary `HashSet` is often an excellent compromise.

##### Converting the ArrayList

```java
Set<String> lookup = new HashSet<>(list);
if (lookup.contains(x)) { 
  LOG.info("Found");
}
```

##### Utility method

```java
public static <T> boolean fastContains(Collection<T> collection, T element) {
    if (collection == null || collection.isEmpty()) {
      return false;
    }

    if (collection.size() < 10) {
        return collection.contains(element);
    }

    return new HashSet<>(collection).contains(element);
}
```

```java
List<String> list = List.of("elem", "element", "el");
if (CollectionUtils.fastContains(list, "element")) { 
  LOG.info("Found");
}
```

##### Utility method (Java 8+)

```java
public static <T> Predicate<T> fastContains(Collection<T> collection) {
    if (collection == null || collection.isEmpty()) return t -> false;
    if (collection.size() < 10) return collection::contains;

    Set<T> set = new HashSet<>(collection);
    return set::contains;
}
```

```java
List<String> list = List.of("elem", "element", "el");
Predicate<String> lookup = CollectionUtils.fastContains(list);
if (lookup.test("el")) { 
  LOG.info("Found");
}

```

## `stream()`

```java
collection.stream()
          .filter(s -> s.length() > 1)
          .map(String::toUpperCase)
          .sorted()
          .distinct()
          .toList();
```

When we call stream()<sup><a href="#ref4">[4]</a></sup> on a collection, certain objects are initialized to prepare the execution of the pipeline: ReferencePipeline, Spliterator etc...

The problem is that this happens regardless of whether the given collection is empty or not.

In other words we initialize objects that we are not sure will be used.

Heinz Kabutz wrote an excellent [article](https://www.javaspecialists.eu/archive/Issue295-Faster-Empty-Streams.html) on the matter.

### Solutions

#### Adding a guard

The most straighforward solution is to simply adding a check on the emptiness of a collection:

```java
if (collection != null && !collection.isEmpty()) {
  List<String> formattedList = collection.stream()
                                          .filter(s -> s.length() > 1)
                                          .map(String::toUpperCase)
                                          .toList();
}
```

#### Using Java 8

It can also be done in more functional way:

```java
List<String> formattedList = Optional.ofNullable(collection)
                                      .filter(c -> !c.isEmpty())
                                      .map(coll -> .stream()
                                                    .filter(s -> s.length() > 1)
                                                    .map(String::toUpperCase)
                                                    .toList())
                                      .orElseGet(Collections::emptyList);
```

## Wrapping up

To sum things up:

- Choose the right structure for the job: Using a `HashSet` or converting an `ArrayList` is highly beneficial when the collection is large and/or requires frequent lookups, offering a significant performance boost.
- Initialize only when you are certain to use it: As we've seen with Stream pipelines, even an empty collection can trigger the creation of multiple intermediate objects before being discarded.

## References

1. <a id="ref1"></a>[ArrayList.java#L139: elementData](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/ArrayList.java#L139)
2. <a id="ref2"></a>[ArrayList.java#L275: contains(Object o)](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/ArrayList.java#L275)
3. <a id="ref3"></a>[HashSet.java#L213: contains(Object o)](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/HashSet.java#L213)
3. <a id="ref4"></a>[Collection.java#L747: stream()](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/Collection.java#L747)
