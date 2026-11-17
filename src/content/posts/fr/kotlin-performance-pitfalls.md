---
title: "Les pièges de performance de Kotlin"
description: "Un benchmark JMH de la performance Kotlin/JVM"
pubDate: 2026-11-17
tags: ["kotlin", "jvm", "performance", "jmh", "collections", "regex"]
draft: false
---

Kotlin simplifie le code de collection. `any {}`, `firstOrNull {}` et `count {}` se lisent comme la phrase qu'ils implémentent, et le compilateur les transforme en boucle. Cette boucle ne construit pas de pipeline de stream et n'alloue pas d'objet lambda.

Mais Kotlin/JVM tourne sur la même JDK que Java. Il utilise `java.util.List`, `java.util.regex.Pattern` et le même ramasse-miettes. La question intéressante n'est donc pas de savoir si Kotlin est plus rapide que Java en général. Elle est de savoir quels pièges de performance Java disparaissent, lesquels survivent derrière une API plus agréable et lesquels Kotlin ajoute.

Trois de ces pièges ont déjà été mesurés en Java :

- [les opérations terminales eager des streams](/fr/posts/the-hidden-allocation-cost-of-eager-stream-operations) allouent à chaque appel et tournent plusieurs fois plus lentement qu'une boucle.
- [`List.contains` et `List.containsAll`](/fr/posts/remaining-issues-with-java-collections) sont des parcours linéaires avec une combinaison quadratique.
- [la compilation de regex, les groupes capturants et le backtracking](/fr/posts/a-guide-to-efficient-pattern-usage) coûtent plus qu'ils n'en ont l'air.

Cet article exécute des benchmarks équivalents en Kotlin.

## Ce qui est mesuré

Quatre classes de benchmarks JMH couvrent les cas :

| Benchmark             | Compare                                                                                            | Paramètres                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `AllocationBenchmark` | `any {}`, boucles indexées, `asSequence()`, `stream()` sur `List<Int>`, `Array<Int>` et `IntArray` | `empty`, `first`, `mid`, `last`, `absent` sur 1 000 éléments |
| `CountBenchmark`      | `count {}`, `filter {}.size`, `filter().count()` sur séquence et stream                            | tout correspond, plus deux méthodes sans correspondance      |
| `ContainsBenchmark`   | `List` vs `Set`, `contains` et `containsAll`, `toSet()`, `intersect`                               | 10, 1 000 et 100 000 éléments                                |
| `RegexBenchmark`      | `Regex(...)` vs précompilée, `findAll` paresseux, boucle `Matcher`, `split`, groupes capturants    | une ligne de log et un log de 500 lignes                     |

Les mesures utilisent Kotlin 2.4.0 et JMH 1.37 sur Eclipse Temurin JDK 25.0.3, sous Linux dans WSL2. Chaque benchmark tourne sur 3 forks avec 5 itérations de warmup et 10 itérations de mesure de 300 ms, avec le profileur GC activé et `-XX:+UseCompactObjectHeaders` sur chaque JVM lancée par fork.

## Les extensions inline sont des boucles

Le premier benchmark cherche une valeur dans une liste. Il compare `any {}` à une boucle indexée, à `Sequence`, à `Stream` et aux variantes sur tableaux primitifs :

```kotlin
@Benchmark
open fun anyInlineList(): Boolean = list.any { it == TARGET }
```

`any` est rapide et n'alloue rien pour deux raisons : il est inline (compilé dans l'appelant) et il retourne immédiatement quand la collection est vide.

```kotlin
public inline fun <T> Iterable<T>.any(predicate: (T) -> Boolean): Boolean {
    if (this is Collection && isEmpty()) return false
    for (element in this) if (predicate(element)) return true
    return false
}
```

Temps en ns/op, plus bas c'est mieux :

| Method                         |    empty | first |    mid |      last |    absent |
| ------------------------------ | -------: | ----: | -----: | --------: | --------: |
| `list.any {}`                  |     0.35 |  0.71 | 137.36 |    280.62 |    327.17 |
| `for` indexé sur `List`        |     0.35 |  0.67 | 143.38 |    281.64 |    297.53 |
| `list.asSequence().any {}`     |     0.34 |  0.71 | 137.35 |    332.53 |    364.62 |
| `list.stream().anyMatch {}`    |     9.39 | 10.67 | 662.75 |  1,337.48 |  1,154.13 |
| `Array<Int>.any {}`            |     0.26 |  0.37 |  57.87 |    184.90 |    118.94 |
| `IntArray.any {}`              | **0.26** |  0.36 |  39.04 |     77.99 |     78.14 |
| `for` indexé sur `IntArray`    |     0.27 |  0.37 |  39.17 | **77.76** | **77.67** |
| `IntArray.asSequence().any {}` |     0.26 |  0.36 |  57.86 |     93.36 |    113.17 |

Allocation en B/op, plus bas c'est mieux :

| Method                         |  empty |  first |    mid |   last | absent |
| ------------------------------ | -----: | -----: | -----: | -----: | -----: |
| `list.any {}`                  |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `for` indexé sur `List`        |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `list.asSequence().any {}`     |     ~0 |     ~0 |     ~0 |  24.01 |  24.01 |
| `list.stream().anyMatch {}`    | 152.00 | 152.00 | 152.01 | 138.69 | 152.02 |
| `Array<Int>.any {}`            |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `IntArray.any {}`              |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `for` indexé sur `IntArray`    |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `IntArray.asSequence().any {}` |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |

Deux résultats ressortent de ces tableaux.

Premièrement, `list.any {}` égale la boucle indexée écrite à la main en fin de liste, 281 ns contre 282 ns, et reste au plancher d'allocation. `ArrayList.iterator()` crée un objet itérateur à chaque appel, mais il ne s'échappe pas de la boucle, donc l'analyse d'échappement le supprime. Le prédicat est inline dans la boucle, donc il n'y a aucun objet fonction à allouer ni à appeler.

Deuxièmement, `list.stream().anyMatch {}` est la seule variante qui alloue à chaque appel, y compris les cas vide et premier élément. Elle coûte environ 152 octets par appel et est quatre à cinq fois plus lente sur un parcours complet : 1 337 ns contre 281 ns au dernier élément. Les 152 octets viennent du pipeline de stream que `stream().anyMatch {}` construit à chaque appel.

`asSequence()` est moins cher que `stream()` mais plus cher que l'appel inline. Ce n'est pas un `Stream`, mais un wrapper autour de l'itérateur de la collection. Sur une `List`, il ajoute jusqu'à 24 octets par appel une fois que le parcours atteint la fin et il est 11 à 18 % plus lent sur les parcours complets : 332 ns contre 281 ns au dernier élément, 365 contre 327 quand la valeur est absente. Pour un seul `any`, il n'y a aucune raison de payer ce coût.

### firstOrNull : le même travail sans la liste

Le benchmark suivant utilise la même recherche mais retourne la valeur correspondante au lieu d'un booléen :

```kotlin
@Benchmark
open fun firstOrNullList(): Int? = list.firstOrNull { it == TARGET }

@Benchmark
open fun filterThenFirstList(): Int? = list.filter { it == TARGET }.firstOrNull()
```

Temps en ns/op :

| Method                                      | empty |    first |    mid |     last |   absent |
| ------------------------------------------- | ----: | -------: | -----: | -------: | -------: |
| `list.firstOrNull {}`                       |  0.36 | **0.72** | 138.37 |   281.74 |   280.76 |
| `list.filter {}.firstOrNull()`              |  0.36 |   325.35 | 323.16 |   325.77 |   319.14 |
| `list.asSequence().filter {}.firstOrNull()` |  0.36 |     0.68 | 137.48 |   281.56 |   279.67 |
| `list.stream().filter {}.findFirst()`       | 11.06 |    13.90 | 633.04 | 1,244.76 | 1,231.60 |

Allocation en B/op :

| Method                                      |  empty |  first |    mid |   last | absent |
| ------------------------------------------- | -----: | -----: | -----: | -----: | -----: |
| `list.firstOrNull {}`                       |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `list.filter {}.firstOrNull()`              |     ~0 |  56.01 |  56.01 |  56.01 |  24.01 |
| `list.asSequence().filter {}.firstOrNull()` |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `list.stream().filter {}.findFirst()`       | 176.00 | 192.00 | 192.01 | 192.03 | 176.03 |

`firstOrNull {}` s'arrête au premier match et n'alloue rien. `filter {}.firstOrNull()` fait l'inverse : il construit une `ArrayList` complète de tous les matches, puis regarde son premier élément et jette le reste. Quand la cible est au début, cela coûte 325 ns et 56 octets au lieu de 0,72 ns et rien. Le résultat est correct, mais la méthode construit et jette une liste de matches.

La version Sequence n'alloue rien ici et égale `firstOrNull {}` en temps. La paresse aide parce que `filter` est fusionné dans l'itération et le `firstOrNull` terminal arrête la chaîne. La version eager matérialise chaque match, la version paresseuse s'arrête au premier.

## count n'a pas besoin de liste

`count {}` remplace directement le réflexe Java `filter().count()` :

| Method                                                |      ns/op |      B/op |
| ----------------------------------------------------- | ---------: | --------: |
| `list.count {}`                                       | **326.49** |    **~0** |
| `list.filter {}.size`                                 |   3,190.05 | 14,936.07 |
| `list.asSequence().filter {}.count()`                 |     529.44 |     40.01 |
| `list.stream().filter {}.count()`                     |     787.23 |    216.02 |
| `list.count {}` sur une liste sans correspondance     |     325.66 |        ~0 |
| `list.stream().filter {}.count()` sans correspondance |     629.13 |    200.01 |

`filter {}.size` est de loin la pire variante. Il construit une `ArrayList` de 1 000 éléments à 14 936 octets par appel pour lire un entier et prend environ dix fois le temps. La syntaxe est courte, mais `filter` est eager : il retourne une liste complète et `size` ne lit que sa longueur.

Les lignes sans correspondance montrent que le coût du stream ne dépend pas de la réponse. Il alloue environ 200 octets même quand aucun élément ne correspond. `count {}` reste au plancher et aux mêmes 326 ns, parce que c'est une boucle avec un compteur.

## Boxing : List<Int>, Array<Int>, IntArray

Le même tableau montre un second effet : le type de stockage de la collection. Sur un parcours complet :

| Source       | `any {}` au dernier | Stockage             |
| ------------ | ------------------: | -------------------- |
| `List<Int>`  |           280.62 ns | `ArrayList<Integer>` |
| `Array<Int>` |           184.90 ns | `Integer[]`          |
| `IntArray`   |            77.99 ns | `int[]`              |

`List<Int>` et `Array<Int>` stockent des objets `Integer` boxés. `IntArray` stocke des `int` primitifs de façon contiguë. La lambda inline est identique dans les trois cas, donc la différence tient entièrement au stockage et à l'accès : deux niveaux d'indirection et une étape de conversion vers le type primitif pour les variantes objet, un simple chargement de tableau pour `IntArray`.

Kotlin n'a pas de `Sequence` primitive, donc il abandonne un outil que Java possède : `IntStream`. `IntStream` de Java garde un pipeline primitif de la source à l'opération terminale. La `Sequence` de Kotlin est générique, donc `IntArray.asSequence()` retourne une `Sequence<Int>` et boxe à la frontière de l'API. Dans le benchmark, l'analyse d'échappement cache l'allocation, ce qui explique pourquoi la colonne B/op reste au plancher. Ce résultat est fragile : il tient tant que les valeurs restent dans la boucle. Si elles sont retenues dans une liste, passées à une fonction non inline ou laissées s'échapper, les allocations de boxing deviennent réelles.

La règle pratique n'est pas de remplacer chaque `List<Int>` par un `IntArray`. Les tableaux sont mutables, de taille fixe et moins agréables à utiliser. La règle est de mesurer le chemin chaud : si une collection primitive est parcourue assez souvent pour que 200 ns comptent, `IntArray` plus les extensions inline est l'option la moins chère sur Kotlin/JVM. Si les valeurs sont petites et que le code s'exécute une fois par requête, la liste boxée suffit.

## Les collections n'ont pas changé

Kotlin n'enveloppe pas `java.util.List` dans une nouvelle implémentation. `listOf`, `mutableListOf` et `toList()` retournent des listes JDK et `in` compile vers `contains`. La complexité est donc celle de la JDK :

| Method                              |    10 | 1 000 |    100 000 |
| ----------------------------------- | ----: | ----: | ---------: |
| `list.contains(present)`            | 0.004 | 0.162 |     16.797 |
| `list.contains(absent)`             | 0.006 | 0.311 |     31.870 |
| `present in list`                   | 0.004 | 0.162 |     16.816 |
| `set.contains(present)`             | 0.001 | 0.002 |  **0.002** |
| `set.contains(absent)`              | 0.001 | 0.001 |  **0.001** |
| `list.containsAll(present)`         | 0.003 | 1.355 | 16,896.449 |
| `list.containsAll(absent)`          | 0.005 | 0.328 |     32.292 |
| `list.toSet().containsAll(present)` | 0.069 | 6.572 |  1,788.622 |
| `list.toSet().containsAll(absent)`  | 0.068 | 6.458 |  1,737.858 |
| `set.containsAll(present)`          | 0.004 | 0.032 |      3.330 |
| `set.containsAll(absent)`           | 0.003 | 0.003 |      0.003 |
| `list.intersect(present).isEmpty()` | 0.031 | 4.178 | 51,116.660 |

Les temps sont en microsecondes par opération.

À 100 000 éléments, `List.contains` prend 16,8 µs contre 2 ns pour `Set.contains`, environ 8 400 fois plus lent. Sur les mêmes données, `List.containsAll` atteint 16,9 ms. Le sous-ensemble `present` contient 1 000 éléments et chacun d'eux déclenche un parcours complet de la liste de 100 000 éléments. C'est le comportement `O(n*m)` du `containsAll` par défaut : il parcourt l'argument et appelle `contains` sur le récepteur pour chaque élément.

La ligne `absent` est bien moins chère, 32 µs, parce que le premier élément de l'argument n'est pas dans la liste, donc `containsAll` retourne après un seul parcours complet. C'est un rappel utile : le coût dépend de l'endroit où se trouve la réponse, pas seulement de la taille.

`list.toSet().containsAll(...)` mesure la conversion à l'intérieur de l'appel. À 100 000 éléments, la conversion seule coûte environ 1,8 ms, donc elle n'est rentable que si la même collection est interrogée de nombreuses fois. Pour un seul `containsAll` sur un sous-ensemble présent, elle reste moins chère que 16,9 ms, mais pour une seule vérification absente, elle est cinquante fois plus chère que l'appel direct. Convertir une fois, à la frontière, et garder le set.

`intersect` est la variante la plus lente du tableau, 51 ms. La méthode en une ligne cache deux coûts : elle crée un set mutable à partir du récepteur et appelle `retainAll` avec l'argument. `retainAll` parcourt le set et appelle `contains` sur l'argument, donc passer une `List` le retransforme en `O(n*m)`, plus l'allocation du set. Ce n'est pas une solution au problème de structure de données.

## Regex : le même moteur, deux pièges Kotlin

`kotlin.text.Regex` est une fine enveloppe autour de `java.util.regex.Pattern` sur la JVM. Le classement est donc le même qu'avec `java.util.regex` brut. La couche Kotlin ajoute deux pièges.

Temps en ns/op et allocation en B/op :

| Method                                      |    ns/op |       B/op |
| ------------------------------------------- | -------: | ---------: |
| `Regex("userId=\\d+")` dans le benchmark    |    102.0 |   1,240.00 |
| `"userId=\\d+".toRegex()` dans le benchmark |    102.0 |   1,240.00 |
| `Regex("userId=(\\d+)")` précompilée        |     39.0 |     136.00 |
| `java.util.regex.Pattern` précompilé        | **31.0** |     128.00 |
| `findAll(log)` jamais consommé              |  **2.0** |      40.00 |
| `findAll(log).count()`                      | 29,409.0 |  88,200.62 |
| `findAll(log).map { it.value }.toList()`    | 32,473.0 | 118,936.69 |
| boucle `Matcher.find()`                     | 20,770.0 |     128.44 |
| `csv.split(",")`                            |  1,694.0 |  11,016.04 |
| `csv.split(Regex(","))`                     |  2,055.0 |  11,072.04 |
| `find(line)?.groupValues?.get(1)`           |     46.0 |     240.00 |
| `find(...)?.value` sans groupe capturant    |     47.0 |     216.00 |
| `line.matches(regex)`                       |      8.0 |      64.00 |

Le premier piège est que le motif est compilé à chaque appel. `Regex(...)` et `String.toRegex()` compilent le motif avant le matching et il n'y a aucun cache derrière l'un ou l'autre constructeur. Sur ce motif court, l'écart est de 102 ns et 1 240 octets contre 39 ns et 136 octets pour une `Regex` précompilée et 31 ns pour le `Pattern` brut. Les chiffres absolus sont petits parce que le motif est petit. L'écart grandit avec la complexité du motif et l'allocation grandit à chaque appel.

Le second piège est que `findAll` est paresseux. Il retourne une `Sequence` et une séquence ne fait rien tant qu'une opération terminale ne la consomme pas :

```kotlin
// Retourne une séquence sans aucun match. C'est un no-op silencieux.
val matches = idRegex.findAll(log)

// Exécute la regex et compte les matches.
val count = idRegex.findAll(log).count()
```

Le benchmark mesure directement cette différence : 2 ns et 40 octets pour la séquence non consommée, 29,4 µs et 88 Ko une fois que `count()` s'exécute. Oublier l'opération terminale n'est pas un problème de performance, c'est un problème de justesse qui ressemble à un gain de performance.

Une fois consommé, `findAll` est aussi plus cher qu'une boucle `Matcher` simple. Sur 500 matches, il alloue 88 Ko, environ 176 octets par match, contre 128 octets au total pour la boucle. L'implémentation délègue à `generateSequence`, qui appelle `MatchResult.next()` pour chaque match :

```kotlin
public actual fun findAll(input: CharSequence, startIndex: Int = 0): Sequence<MatchResult> {
    // ...
    return generateSequence({ find(input, startIndex) }, MatchResult::next)
}
```

Chaque étape de la séquence appelle `MatchResult.next()`, qui crée un nouveau `Matcher` à partir du motif et exécute `findNext`, puis enveloppe le résultat dans un `MatcherMatchResult`. C'est un matcher et un objet résultat par occurrence, plus l'état de l'itérateur de séquence. La boucle `Matcher.find()` réutilise un seul matcher pour tout le parcours.

`split` a le même problème quand il reçoit une `Regex` au lieu d'un délimiteur littéral. `csv.split(",")` utilise le délimiteur littéral et ne touche jamais le moteur de regex : 1,69 µs et 11 016 octets pour 200 champs. `csv.split(Regex(","))` construit un `Matcher` et coûte 2,06 µs. La différence de temps est modeste ici parce que la production de 200 chaînes domine, mais la version regex n'a aucune raison d'exister pour un délimiteur fixe.

Les groupes capturants sont bon marché par match et chers en volume. `find(line)?.groupValues?.get(1)` coûte 46 ns et 240 octets, contre 47 ns et 216 octets pour le `find(line)?.value` sans capture. La différence de 24 octets est la liste paresseuse `groupValues` qui enveloppe le tableau de groupes du matcher. Un seul match n'a pas d'importance. Une boucle sur un million de lignes de log en a.

Enfin, `line.matches(regex)` n'est pas un `containsMatchIn` plus rapide. Il demande si l'entrée entière correspond au motif, donc il retourne `false` dès le premier caractère ici et termine en 8 ns. Un benchmark qui le compare à `find` mesure deux questions différentes. Utiliser `containsMatchIn` ou `find` quand le motif peut apparaître n'importe où dans l'entrée.

## Ce qu'il faut retenir

1. **Le problème d'allocation des streams Java ne se reproduit pas.** `any {}`, `firstOrNull {}` et `count {}` sont `inline` et compilent vers une boucle simple. Ils n'allouent rien de mesurable, contre environ 152 octets par appel pour `stream().anyMatch {}`, qui est aussi quatre à cinq fois plus lent sur un parcours complet.
2. **`Sequence` est paresseux, pas gratuit.** Il ajoute jusqu'à 24 octets par appel sur une `List` et rend les parcours complets jusqu'à 45 % plus lents selon le type de source. C'est le bon outil pour une chaîne qui court-circuite ou évite des listes intermédiaires, pas un remplacement par défaut de chaque appel de collection.
3. **L'équivalent de `filter().count()` est `count {}`.** `filter {}.size` construit toute la liste de résultats : 14 936 octets et dix fois le temps pour une liste de 1 000 éléments.
4. **Le boxing est là où Kotlin n'a pas l'échappatoire de Java.** `List<Int>` et `Array<Int>` stockent des valeurs boxées et `Sequence<Int>` boxe à la frontière de l'API. Il n'existe pas de `Sequence` primitive équivalente à `IntStream`, donc le chemin rapide pour les données primitives est `IntArray` plus les extensions inline.
5. **Les collections sont inchangées.** `contains` et `containsAll` sont des implémentations JDK derrière une façade Kotlin, avec le même comportement `O(n)` et `O(n*m)`. `in`, `listOf` et `toSet()` rendent le piège plus facile à écrire, pas plus difficile.
6. **Regex, c'est le même moteur avec deux pièges en plus.** `Regex(...)` et `toRegex()` n'ont pas de cache de compilation et `findAll()` est paresseux, donc il ne fait silencieusement rien sans opération terminale tout en allouant un matcher et un objet résultat par match.

Choisir la structure de données selon le motif d'accès, garder l'allocation hors de la boucle chaude et laisser la lisibilité gagner quand le code s'exécute une fois par requête. Kotlin supprime l'allocation de la lambda et du pipeline de stream dans les extensions de collection, mais il ne change pas le coût des structures de données ni du moteur de regex.

## Limites

- Ce sont des microbenchmarks. Les chiffres montrent des ordres de grandeur et des classements relatifs sur cette machine, pas des promesses pour une charge de production.
- L'analyse d'échappement est sensible au code environnant. Les scores d'allocation `~0` pour `Sequence<Int>` et pour l'itérateur de liste tiennent tant que les objets restent dans la boucle du benchmark. Du code qui les retient allouera.
- L'annotation `@Param` s'applique à la classe entière, donc `AllocationBenchmark` exécute ses quatre variantes `findFirst` pour chaque scénario `any`. La famille `count` vit dans sa propre classe pour éviter de répéter cinq fois un jeu de données qui ne dépend pas du scénario.
- Les résultats de stream utilisent l'extension `java.util.List.stream()` de Kotlin. Les 152 octets par appel sont dans la variation habituelle entre builds de JDK et harnais (une mesure comparable de stream Java se situe autour de 144 octets).
- Aucun équivalent de `parallel()` n'est mesuré. `Sequence` n'en a pas et le traitement parallèle de collections en Kotlin passe par des coroutines ou un `java.util.stream` explicite.
- Tout ici est Kotlin/JVM. Kotlin/Native et Kotlin/JS utilisent des implémentations de collections différentes.

## Références

- [stdlib Kotlin : `_Collections.kt`](https://github.com/JetBrains/kotlin/blob/master/libraries/stdlib/common/src/generated/_Collections.kt), `any`, `firstOrNull`, `count` et `asSequence`
- [stdlib Kotlin : `Regex.kt` pour la JVM](https://github.com/JetBrains/kotlin/blob/master/libraries/stdlib/jvm/src/kotlin/text/regex/Regex.kt), `findAll`, `split` et `MatcherMatchResult`
- [OpenJDK `AbstractCollection.containsAll`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/AbstractCollection.java)
- [OpenJDK `ArrayList.contains`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/ArrayList.java)

Un projet qui illustre ces concepts est disponible ici : [kotlin-performance-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/kotlin-performance-benchmark)
