---
title: "Le coût d'allocation caché des opérations de stream eager"
description: "Les opérations terminales eager des streams allouent des objets à chaque appel, même sur une entrée vide"
pubDate: 2026-09-16
tags:
  ["java", "streams", "performance", "allocation", "jmh", "eclipse-collections"]
draft: false
---

Les streams sont la manière par défaut d'exprimer la logique de collection en Java moderne.
`anyMatch`, `allMatch`, `noneMatch`, `filter(...).findFirst()` et `filter(...).count()` se lisent presque comme la phrase qu'ils implémentent et font le travail en une seule passe.
Mais cette lisibilité cache un coût : chacun de ces appels construit un petit graphe d'objets avant de toucher le moindre élément et il construit ce graphe que la collection contienne 100 000 éléments ou aucun.

Don Raab a décrit le problème dans son article Medium ["Allocation Hungry Any/All/None, FindFirst, and Count Methods on Java Stream"](https://donraab.medium.com/allocation-hungry-any-all-none-findfirst-and-count-methods-on-java-stream-e3ca6d66b265)<sup><a href="#fn1">[1]</a></sup>.
L'affirmation est simple : la machinerie des streams alloue à chaque appel, alors qu'une boucle `for` équivalente ou une utilisation de la librairie `eclipse-collections`<sup><a href="#fn2">[2]</a></sup> reste libre de toute allocation.

Cet article pose des chiffres sur cette affirmation.

## Ce qui est mesuré

Chaque appel est mesuré face à quatre cas :

- un appel de stream
- un appel de stream derrière une garde `isEmpty()`
- une simple boucle `for` issue de `com.hogwai.util.Iterables`
- l'utilitaire eager d'Eclipse Collections sur `Iterate`

```java
@Benchmark
public boolean jdkStream() {
    return values.stream().anyMatch(predicate);
}

@Benchmark
public boolean jdkStreamGuarded() {
    if (values.isEmpty()) {
        return false;
    }
    return values.stream().anyMatch(predicate);
}

@Benchmark
public boolean helperLoop() {
    return Iterables.anyMatch(values, predicate);
}

@Benchmark
public boolean eclipseCollections() {
    return Iterate.anySatisfy(values, predicate);
}
```

La garde est là parce qu'elle supprime le travail du stream quand il n'y a rien à parcourir, un cas que Heinz Kabutz a déjà signalé pour les pipelines de stream<sup><a href="#fn3">[2]</a></sup>.

`Iterables.anyMatch` est la base sans allocation et ce n'est rien de plus qu'une boucle :

```java
public static <T> boolean anyMatch(Iterable<T> items, Predicate<? super T> predicate) {
    for (T item : items) {
        if (predicate.test(item)) {
            return true;
        }
    }
    return false;
}
```

Les quatre autres benchmarks remplacent l'appel :

- `allMatch` avec `Iterables.allMatch` et `Iterate.allSatisfy`
- `noneMatch` avec `Iterables.noneMatch` et `Iterate.noneSatisfy`
- `filter(...).findFirst()` avec `Iterables.findFirst`, `Iterables.detect` et `Iterate.detect`
- `filter(...).count()` avec `Iterables.count` et `Iterate.count`

## Résultats

Tous les chiffres ci-dessous proviennent de l'exécution décrite plus haut et plus la valeur est basse, mieux c'est. Un score de `~0` dans les tableaux d'allocation marque le seuil de détection du profileur, pas exactement zéro (mais presque).

### AnyMatch

```java
values.stream().anyMatch(predicate);
```

#### Temps (ns/op)

| Method                    |     empty |     first |          mid |         last |       absent |
| ------------------------- | --------: | --------: | -----------: | -----------: | -----------: |
| `Stream.anyMatch`         |     12.08 |     13.57 |     65022.22 |    124726.69 |    115280.56 |
| `guarded Stream.anyMatch` | **0.361** |     13.81 |     66031.29 |    128021.76 |    130399.62 |
| `Iterables.anyMatch`      |     0.423 |     0.743 | **15479.47** | **31096.35** | **30234.64** |
| `Iterate.anySatisfy`      |     0.383 | **0.740** |     16612.28 |     40736.52 |     46140.81 |

#### Allocation (B/op)

| Method                    |  empty |  first |       mid |      last |    absent |
| ------------------------- | -----: | -----: | --------: | --------: | --------: |
| `Stream.anyMatch`         | 144.00 | 144.00 |    143.59 |    131.39 |     98.33 |
| `guarded Stream.anyMatch` | **~0** | 144.00 |    143.58 |    132.31 |     82.81 |
| `Iterables.anyMatch`      | **~0** | **~0** | **0.098** | **0.197** | **0.192** |
| `Iterate.anySatisfy`      | **~0** | **~0** |     0.105 |     0.258 |     0.311 |

Sur une liste vide, la garde fait passer l'appel de 12 ns et 144 octets à 0,36 ns et rien. Sur une liste non vide, elle ne change rien à l'allocation ni au temps. Sur un parcours complet, la boucle et Eclipse Collections se situent toutes les deux entre 30 000 et 46 000 ns selon l'endroit où se trouve le match, contre 115 000 à 130 000 ns pour le stream et elles n'allouent rien.

### AllMatch

```java
values.stream().allMatch(predicate);
```

#### Temps (ns/op)

| Method                    |     empty |     first |          mid |         last |       absent |
| ------------------------- | --------: | --------: | -----------: | -----------: | -----------: |
| `Stream.allMatch`         |     13.17 |     13.99 |     67382.91 |    124991.24 |    116349.65 |
| `guarded Stream.allMatch` | **0.357** |     14.13 |     68351.66 |    125698.54 |    130865.15 |
| `Iterables.allMatch`      |     0.393 | **0.694** | **14811.47** | **30099.53** | **31289.08** |
| `Iterate.allSatisfy`      |     0.382 |     0.742 |     16042.11 |     44003.74 |     44389.83 |

#### Allocation (B/op)

| Method                    |  empty |  first |       mid |      last |    absent |
| ------------------------- | -----: | -----: | --------: | --------: | --------: |
| `Stream.allMatch`         | 144.00 | 144.00 |    136.30 |    130.91 |     98.42 |
| `guarded Stream.allMatch` | **~0** | 144.00 |    136.47 |    131.42 |     82.62 |
| `Iterables.allMatch`      | **~0** | **~0** | **0.094** | **0.191** | **0.198** |
| `Iterate.allSatisfy`      | **~0** | **~0** |     0.101 |     0.279 |     0.281 |

`allMatch` est l'image miroir de `anyMatch` et les chiffres disent la même chose : les trois opérations de matching partagent une implémentation, donc elles partagent un profil d'allocation. Le scénario `first` est le seul endroit où le stream ne coûte presque rien, 14 ns et 144 octets, parce que le tout premier élément décide de la réponse.

### NoneMatch

```java
values.stream().noneMatch(predicate);
```

#### Temps (ns/op)

| Method                     |     empty |     first |          mid |         last |       absent |
| -------------------------- | --------: | --------: | -----------: | -----------: | -----------: |
| `Stream.noneMatch`         |     12.20 |     13.65 |     67547.33 |    124416.94 |    115951.16 |
| `guarded Stream.noneMatch` | **0.360** |     13.96 |     68346.99 |    128971.91 |    129895.88 |
| `Iterables.noneMatch`      |     0.396 | **0.688** | **14718.21** | **30191.97** | **31304.02** |
| `Iterate.noneSatisfy`      |     0.379 |     0.735 |     16413.21 |     42259.22 |     46026.17 |

#### Allocation (B/op)

| Method                     |  empty |  first |       mid |      last |    absent |
| -------------------------- | -----: | -----: | --------: | --------: | --------: |
| `Stream.noneMatch`         | 144.00 | 144.00 |    136.48 |    131.72 |     98.22 |
| `guarded Stream.noneMatch` | **~0** | 144.00 |    136.63 |    132.37 |     83.50 |
| `Iterables.noneMatch`      | **~0** | **~0** | **0.093** | **0.191** | **0.198** |
| `Iterate.noneSatisfy`      | **~0** | **~0** |     0.104 |     0.268 |     0.292 |

Sans surprise et c'est tout l'intérêt. Trois méthodes aux noms différents, un coût identique.

### FindFirst

```java
values.stream().filter(predicate).findFirst();
```

#### Temps (ns/op)

| Method                                |     empty |     first |          mid |         last |       absent |
| ------------------------------------- | --------: | --------: | -----------: | -----------: | -----------: |
| `Stream.filter().findFirst()`         |     14.97 |     17.61 |     60210.32 |    125820.39 |    118251.70 |
| `guarded Stream.filter().findFirst()` | **0.359** |     17.60 |     60745.89 |    125174.22 |    117942.84 |
| `Iterables.findFirst`                 |     0.408 |      1.74 |     18398.38 |     45708.38 | **30994.93** |
| `Iterables.detect`                    |     0.414 | **0.706** | **15398.21** | **30989.74** |     31010.92 |
| `Iterate.detect`                      |     0.381 |     0.739 |     16741.82 |     40767.43 |     45399.61 |

#### Allocation (B/op)

| Method                                |  empty |  first |       mid |      last |    absent |
| ------------------------------------- | -----: | -----: | --------: | --------: | --------: |
| `Stream.filter().findFirst()`         | 168.00 | 184.00 |    184.38 |    184.80 |    168.75 |
| `guarded Stream.filter().findFirst()` | **~0** | 184.00 |    184.39 |    184.79 |    168.75 |
| `Iterables.findFirst`                 | **~0** |  16.00 |     16.12 |     16.29 | **0.196** |
| `Iterables.detect`                    | **~0** | **~0** | **0.097** | **0.196** | **0.196** |
| `Iterate.detect`                      | **~0** | **~0** |     0.106 |     0.258 |     0.288 |

Le stage `filter` supplémentaire se voit dans l'allocation : 168 à 184 octets par appel au lieu de 144. Il se voit aussi dans le scénario `first`, où le stream coûte désormais 17,6 ns au lieu de 13,6 ns. Même quand le `filter` retient le premier élément, le stage doit quand même être construit.

La ligne `Iterables.findFirst` rappelle utilement qu'envelopper un match dans un `Optional` coûte aussi 16 octets, alors que `detect` renvoie `null` et reste au seuil de détection. Le confort du `Optional` n'est pas gratuit, mais il coûte peu.

### Count

```java
values.stream().filter(predicate).count();
```

#### Temps (ns/op)

| Method                            |     empty |         none |         half |          all |
| --------------------------------- | --------: | -----------: | -----------: | -----------: |
| `Stream.filter().count()`         |     14.34 |     58871.75 |     72139.11 |     75908.07 |
| `guarded Stream.filter().count()` | **0.354** |     61915.40 |     76259.46 |     79184.47 |
| `Iterables.count`                 |     0.411 | **31062.44** | **40120.17** | **29900.15** |
| `Iterate.count`                   |     0.378 |     46491.24 |     61630.73 |     45381.66 |

#### Allocation (B/op)

| Method                            |  empty |      none |      half |       all |
| --------------------------------- | -----: | --------: | --------: | --------: |
| `Stream.filter().count()`         | 176.00 |    192.18 |    207.99 |    208.00 |
| `guarded Stream.filter().count()` | **~0** |    192.19 |    206.97 |    208.00 |
| `Iterables.count`                 | **~0** | **0.197** | **0.254** | **0.189** |
| `Iterate.count`                   | **~0** |     0.351 |     0.466 |     0.287 |

`count` ne peut pas court-circuiter, c'est donc le pire cas pour le stream dans chaque scénario non vide. La boucle est environ 2 fois plus rapide que le stream et son allocation reste au seuil de détection du profileur.

## D'où viennent ces octets ?

Un appel de stream n'est pas juste une boucle avec une plus jolie syntaxe, c'est un pipeline qui doit être assemblé avant de pouvoir s'exécuter et cet assemblage nécessite l'allocation de structures intermédiaires.

### La source

`list.stream()` est la méthode par défaut de `Collection` et elle démarre le pipeline :

```java
default Stream<E> stream() {
    return StreamSupport.stream(spliterator(), false);
}
```

`spliterator()` est une autre méthode par défaut, parce que les listes immuables renvoyées par `List.copyOf` ne la redéfinissent pas :

```java
default Spliterator<E> spliterator() {
    return Spliterators.spliterator(this, 0);
}
```

Donc `stream()` seul alloue déjà deux objets :

- le `Spliterators.IteratorSpliterator` adossé à un itérateur<sup><a href="#fn4">[3]</a></sup>
- le `ReferencePipeline.Head`<sup><a href="#fn5">[4]</a></sup> que `StreamSupport.stream` construit autour.

### L'opération terminale

`anyMatch` tient en une ligne et confie le predicate à `MatchOps` :

```java
@Override
public final boolean anyMatch(Predicate<? super P_OUT> predicate) {
    return evaluate(MatchOps.makeRef(predicate, MatchOps.MatchKind.ANY));
}
```

C'est dans `makeRef` que les objets apparaissent. Elle déclare la classe du sink puis renvoie un nouveau `MatchOp` qui porte un supplier `MatchSink::new`<sup><a href="#fn6">[5]</a></sup> :

```java
public static <T> TerminalOp<T, Boolean> makeRef(Predicate<? super T> predicate,
        MatchKind matchKind) {
    Objects.requireNonNull(predicate);
    Objects.requireNonNull(matchKind);
    class MatchSink extends BooleanTerminalSink<T> {
        MatchSink() {
            super(matchKind);
        }

        @Override
        public void accept(T t) {
            if (!stop && predicate.test(t) == matchKind.stopOnPredicateMatches) {
                stop = true;
                value = matchKind.shortCircuitResult;
            }
        }
    }

    return new MatchOp<>(StreamShape.REFERENCE, matchKind, MatchSink::new);
}
```

Le `MatchOp` et le supplier sont tous les deux nouveaux à chaque appel et l'évaluation appelle ensuite `sinkSupplier.get()` pour créer le `MatchSink` lui-même.
Cela fait cinq objets pour une simple opération de matching, ce qui explique pourquoi `anyMatch` atterrit autour de 144 octets. `allMatch` et `noneMatch` sont le même code avec un `MatchKind` différent.

### Le cas du count

`count()` est routé vers `ReduceOps.makeRefCounting()`<sup><a href="#fn7">[6]</a></sup> :

```java
public static <T> TerminalOp<T, Long>
makeRefCounting() {
    return new ReduceOp<T, Long, CountingSink<T>>(StreamShape.REFERENCE) {
        @Override
        public CountingSink<T> makeSink() { return new CountingSink.OfRef<>(); }

        @Override
        public <P_IN> Long evaluateSequential(PipelineHelper<T> helper,
                                              Spliterator<P_IN> spliterator) {
            long size = helper.exactOutputSizeIfKnown(spliterator);
            if (size != -1)
                return size;
            return super.evaluateSequential(helper, spliterator);
        }

        @Override
        public <P_IN> Long evaluateParallel(PipelineHelper<T> helper,
                                            Spliterator<P_IN> spliterator) {
            long size = helper.exactOutputSizeIfKnown(spliterator);
            if (size != -1)
                return size;
            return super.evaluateParallel(helper, spliterator);
        }

        @Override
        public int getOpFlags() {
            return StreamOpFlag.NOT_ORDERED;
        }
    };
}
```

La sous-classe anonyme de `ReduceOp` est créée à chaque appel, contrairement à l'opération mise en cache ci-dessous. Le comptage ne peut pas non plus court-circuiter, donc chaque élément doit passer par le `CountingSink`, ce qui explique pourquoi `count` est le plus lourd des cinq sur un parcours complet.

### Le cas du find

`findFirst()` est l'exception : elle n'alloue pas du tout d'opération terminale, parce que `FindOps` les met en cache dans des champs statiques<sup><a href="#fn8">[7]</a></sup>.

```java
public static <T> TerminalOp<T, Optional<T>> makeRef(boolean mustFindFirst) {
    return (TerminalOp<T, Optional<T>>)
            (mustFindFirst ? FindSink.OfRef.OP_FIND_FIRST : FindSink.OfRef.OP_FIND_ANY);
}
```

```java
static final TerminalOp<?, ?> OP_FIND_FIRST, OP_FIND_ANY;
static {
    Predicate<Optional<Object>> isPresent = Optional::isPresent;
    Supplier<TerminalSink<Object, Optional<Object>>> newSink
            = FindSink.OfRef::new;
    OP_FIND_FIRST = new FindOp<>(true, StreamShape.REFERENCE,
            Optional.empty(), isPresent, newSink);
    OP_FIND_ANY = new FindOp<>(false, StreamShape.REFERENCE,
            Optional.empty(), isPresent, newSink);
}
```

Les deux opérations sont construites une fois au chargement de la classe et réutilisées indéfiniment, donc les octets de `filter().findFirst()` viennent du stage `filter` et du sink qu'il enveloppe, pas de l'opération terminale.

### Le stage filter

`filter()` renvoie un nouveau `StatelessOp` anonyme, donc chaque appel à `filter(...)` alloue un stage avant même que le pipeline s'exécute<sup><a href="#fn9">[8]</a></sup> :

```java
@Override
public final Stream<P_OUT> filter(Predicate<? super P_OUT> predicate) {
    Objects.requireNonNull(predicate);
    return new StatelessOp<>(this, StreamShape.REFERENCE,
            StreamOpFlag.NOT_SIZED) {
        @Override
        Sink<P_OUT> opWrapSink(int flags, Sink<P_OUT> sink) {
            return new Sink.ChainedReference<>(sink) {
                @Override
                public void begin(long size) {
                    downstream.begin(-1);
                }

                @Override
                public void accept(P_OUT u) {
                    if (predicate.test(u))
                        downstream.accept(u);
                }
            };
        }
    };
}
```

### L'assemblage des sinks

Avant qu'un seul élément ne circule, `wrapSink` parcourt les stages à l'envers et enveloppe le sink terminal une fois par stage intermédiaire<sup><a href="#fn10">[9]</a></sup> :

```java
@Override
@SuppressWarnings("unchecked")
final <P_IN> Sink<P_IN> wrapSink(Sink<E_OUT> sink) {
    Objects.requireNonNull(sink);

    for ( @SuppressWarnings("rawtypes") AbstractPipeline p=AbstractPipeline.this; p.depth > 0; p=p.previousStage) {
        sink = p.opWrapSink(p.previousStage.combinedFlags, sink);
    }
    return (Sink<P_IN>) sink;
}
```

Un matching brut n'a pas de stage intermédiaire, donc le corps de la boucle ne s'exécute jamais. Un `filter` ajoute un stage, donc un `Sink.ChainedReference` est créé ici. C'est pourquoi `filter().findFirst()` se situe entre 168 et 184 octets et `filter().count()` entre 176 et 208, contre 144 pour les appels de matching bruts.

### Pourquoi les chiffres restent stables

Rien de tout cela ne dépend de la taille de la collection ni de l'endroit où le match est trouvé. Le pipeline est assemblé une fois par appel, avant la lecture du premier élément et les sinks sont ensuite réutilisés au fil des éléments qui les traversent. Le court-circuit arrête simplement la boucle plus tôt, il ne change pas ce qui a été alloué. C'est pourquoi les chiffres d'allocation restent stables d'un scénario à l'autre et pourquoi un parcours complet de 100 000 éléments n'alloue pas plus qu'une liste vide.

Une garde supprime tout le graphe dans le cas vide parce que la méthode retourne avant que `stream()` ne soit évalué.
Sur une collection non vide, la garde n'ajoute rien.

Une nuance à propos des lambdas. Une référence de méthode non capturante comme `String::isEmpty` se résout en une seule instance mise en cache par site d'appel, donc la passer à `anyMatch` ou `filter` n'alloue rien.
Une lambda capturante comme le `value -> value.equals(target)` du benchmark est une autre histoire :
elle a besoin d'un champ pour la valeur capturée et finit stockée à l'intérieur d'un stage du pipeline.
Le JIT ne peut pas décomposer en scalaires un objet qui atteint le tas. En pratique, elle est allouée à chaque appel. Le benchmark hisse son predicate dans un champ créé une fois dans `@Setup`, ce qui isole le coût du stream et garde la comparaison équitable.

## Ce que ces chiffres signifient

### Le JDK alloue à chaque appel

Environ 144 octets pour les opérations de matching, 168 à 184 octets pour `filter().findFirst()` et 176 à 208 octets pour `filter().count()`. Le montant est déterminé par la forme du pipeline, pas par les données. Un appel sur une liste vide alloue autant qu'un appel sur un parcours complet.

### La garde `isEmpty()` n'est pas une solution générale

Elle supprime entièrement le stream sur une entrée vide, ce qui transforme un appel de 12 ns en un appel de 0,36 ns et ramène l'allocation à zéro.
Sur une entrée non vide, c'est une vérification de taille suivie exactement du même stream, avec exactement la même allocation.

### La boucle et Eclipse Collections restent à zéro

Sur les longs parcours, elles sont 2 à 4 fois plus rapides et n'allouent pratiquement rien, parce qu'il n'y a aucun pipeline à construire. La seule allocation du groupe est le `Optional` de 16 octets de `Iterables.findFirst`.

La règle pratique est la règle habituelle pour les hot paths : un stream est un outil de lisibilité et la lisibilité vaut quelques centaines d'octets quand le code s'exécute une fois par requête, pas un million de fois par seconde.
Dans une boucle serrée, dans un callback par élément ou sur une grande collection parcourue souvent, la simple boucle est à la fois l'option la plus rapide et la moins coûteuse et Eclipse Collections arrive juste derrière quand vous en dépendez déjà.

## Références

- <a id="fn1"></a>[Allocation Hungry Any/All/None, FindFirst, and Count Methods on Java Stream](https://donraab.medium.com/allocation-hungry-any-all-none-findfirst-and-count-methods-on-java-stream-e3ca6d66b265?sk=84629376cedf192618276bfc6668e97a), Don Raab
- <a id="fn2"></a>[Eclipse Collections](https://github.com/eclipse-collections/eclipse-collections)
- <a id="fn3"></a>[Faster Empty Streams](https://www.javaspecialists.eu/archive/Issue295-Faster-Empty-Streams.html), Heinz Kabutz
- <a id="fn4"></a>[Collection.java: default spliterator()](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/Collection.java#L728)
- <a id="fn5"></a>[ReferencePipeline.java: Head](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/stream/ReferencePipeline.java#L762)
- <a id="fn6"></a>[MatchOps.java: makeRef()](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/stream/MatchOps.java#L79)
- <a id="fn7"></a>[ReduceOps.java: makeRefCounting()](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/stream/ReduceOps.java#L247)
- <a id="fn8"></a>[FindOps.java: OP_FIND_FIRST](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/stream/FindOps.java#L197)
- <a id="fn9"></a>[ReferencePipeline.java: anyMatch, filter, count](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/stream/ReferencePipeline.java#L667)
- <a id="fn10"></a>[AbstractPipeline.java: wrapSink()](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/stream/AbstractPipeline.java#L604)

## Démonstration

Une démonstration des concepts illustrés dans cet article est disponible ici : [stream-allocation-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/stream-allocation-benchmark)
