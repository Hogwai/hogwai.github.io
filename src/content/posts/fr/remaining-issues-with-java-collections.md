---
title: |
  Problèmes persistants avec les collections Java
description: "Des problèmes spécifiques et peu évidents que vous pouvez rencontrer et qui n'ont pas encore été résolus"
pubDate: 2025-11-05
tags: ["java", "collections", "performance", "internal"]
draft: false
---

## Introduction

Au moment où ces lignes sont écrites, Java 25 est disponible depuis plus d'un mois, témoignant de l'évolution continue de la plateforme. Pourtant, certains problèmes de performance liés aux collections persistent.

Voyons ensemble de quoi il s'agit et comment les atténuer.

## `ArrayList<E>`

Lorsque vous instanciez une `ArrayList`, elle crée un tableau (`Object[]`) comme structure interne pour stocker les éléments<sup><a href="#ref1">[1]</a></sup>.

Ce tableau est utilisé pour chaque opération : `indexOf`, `contains`, `get`, etc.

### Utilisation de `contains(Object o)`

Voici le premier problème.

Un tableau ne connaît que deux choses sur les éléments qu'il stocke : leur ordre et leur index respectif.
Cela signifie que toute opération ne peut s'appuyer que sur ces deux informations.

Regardons l'implémentation de `contains`<sup><a href="#ref2">[2]</a></sup> :

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

Dans `indexOfRange`, on voit que la recherche s'effectue en itérant sur le tableau et en comparant chaque élément à l'`Object o` fourni.

Cela donne une complexité O(n), ce qui signifie que le temps d'exécution d'un appel à `contains` est proportionnel à la taille du tableau.

C'est négligeable si la collection est petite, mais qu'en est-il lorsqu'elle est très grande ?

### Utilisation de `containsAll(Collection<?> c)`

La même logique s'applique à `containsAll(Collection<?> c)`, mais avec une complexité temporelle en O(n\*m), car chaque élément de la collection passée en paramètre doit être comparé à chaque élément de l'autre.

De plus, IntelliJ émet un [avertissement](https://www.jetbrains.com/help/inspectopedia/SlowListContainsAll.html) à ce sujet.

```java
public boolean check(List<String> list, Collection<String> collection) {
  // O(n*m) complexity
  return list.containsAll(collection);
}
```

### Solutions

Comme nous venons de le voir, les implémentations de `contains` et `containsAll` ne sont pas adaptées à toutes les tailles de collection.

Une meilleure solution consiste à tirer parti d'une structure de données plus appropriée : le `HashSet`.
Il repose sur une table de hachage pour offrir des performances moyennes constantes sur les opérations de base telles que l'ajout, la suppression et la recherche.

#### Utiliser un HashSet

Voici l'implémentation<sup><a href="#ref3">[3]</a></sup> :

```java
transient HashMap<E,Object> map;
```

```java
public boolean contains(Object o) {
    return map.containsKey(o);
}
```

`HashSet` utilise son `HashMap` sous-jacent pour stocker l'objet comme clé, ce qui résulte dans la plupart des cas en une complexité O(1).

Ainsi, si la collection est grande et/ou fait l'objet de nombreuses recherches (contains, remove), `HashSet` est clairement le choix le plus efficace.

#### Convertir la collection

Il n'est pas toujours possible (ni souhaitable) de remplacer toutes les `ArrayList` par des `HashSet`.

Dans ce cas, créer un `HashSet` temporaire est souvent un excellent compromis.

```java
Set<String> lookup = new HashSet<>(list);
if (lookup.contains(x)) {
  LOG.info("Found");
}
```

##### Méthode utilitaire

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

##### Méthode utilitaire (Java 8+)

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

#### Utiliser `containsAll(Collection<?> c)`

De la même manière, convertir la collection en `HashSet` est la bonne approche :

```java
public boolean check(List<String> list, Collection<String> collection) {
  // O(n+m) complexity
  return new HashSet<>(list).containsAll(collection);
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

Lorsque l'on appelle `stream()`<sup><a href="#ref4">[4]</a></sup> sur une collection, certains objets sont initialisés pour préparer l'exécution du pipeline : `ReferencePipeline`, `Spliterator`, etc.

Le problème, c'est que cela se produit que la collection soit vide ou non.

Autrement dit, on initialise des objets dont on n'est pas certain qu'ils seront utilisés.

Heinz Kabutz a écrit un excellent [article](https://www.javaspecialists.eu/archive/Issue295-Faster-Empty-Streams.html) sur le sujet.

### Solutions

#### Ajouter une garde

La solution la plus directe consiste simplement à vérifier que la collection n'est pas vide :

```java
if (collection != null && !collection.isEmpty()) {
  List<String> formattedList = collection.stream()
                                          .filter(s -> s.length() > 1)
                                          .map(String::toUpperCase)
                                          .toList();
}
```

#### Utiliser Java 8

On peut également procéder de manière plus fonctionnelle :

```java
List<String> formattedList = Optional.ofNullable(collection)
                                      .filter(c -> !c.isEmpty())
                                      .map(coll -> .stream()
                                                    .filter(s -> s.length() > 1)
                                                    .map(String::toUpperCase)
                                                    .toList())
                                      .orElseGet(Collections::emptyList);
```

## En résumé

Pour récapituler :

- Choisissez la bonne structure pour le bon usage : utiliser un `HashSet` ou convertir une `ArrayList` est très avantageux lorsque la collection est grande et/ou nécessite des recherches fréquentes, avec un gain de performance significatif à la clé.
- N'initialisez que ce dont vous êtes sûr d'avoir besoin : comme nous l'avons vu avec les pipelines Stream, même une collection vide peut déclencher la création de plusieurs objets intermédiaires avant d'être abandonnée.

## Références

1. <a id="ref1"></a>[ArrayList.java#L139: elementData](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/ArrayList.java#L139)
2. <a id="ref2"></a>[ArrayList.java#L275: contains(Object o)](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/ArrayList.java#L275)
3. <a id="ref3"></a>[HashSet.java#L213: contains(Object o)](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/HashSet.java#L213)
4. <a id="ref4"></a>[Collection.java#L747: stream()](https://github.com/openjdk/jdk/blob/a0e70c4e9489fc3d8f35c3aec9423fe0839ed0bd/src/java.base/share/classes/java/util/Collection.java#L747)

## Démonstration

Une démonstration des concepts illustrés dans cet article est disponible ici : [collections-issues-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/collections-issues-benchmark)
