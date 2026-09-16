---
title: "The hidden allocation cost of eager stream operations"
description: "Eager stream terminal operations allocate objects on every call, even on empty input"
pubDate: 2026-09-16
tags:
  ["java", "streams", "performance", "allocation", "jmh", "eclipse-collections"]
draft: false
---

Streams are the default way to express collection logic in modern Java.
`anyMatch`, `allMatch`, `noneMatch`, `filter(...).findFirst()` and `filter(...).count()` read almost like the sentence they implement and they do the work in a single pass.
But that readability hides a cost: each of these calls builds a small object graph before it touches a single element and it builds that graph whether the collection holds 100000 elements or none at all.

Don Raab described the problem in his Medium post ["Allocation Hungry Any/All/None, FindFirst, and Count Methods on Java Stream"](https://donraab.medium.com/allocation-hungry-any-all-none-findfirst-and-count-methods-on-java-stream-e3ca6d66b265)<sup><a href="#fn1">[1]</a></sup>.
The claim is simple: the stream machinery allocates on every call, while an equivalent `for` loop or an `eclipse-collections`<sup><a href="#fn2">[2]</a></sup> use stays allocation free.

This post puts numbers on that claim.

## What is measured

Each call is measured against four cases:

- a stream call
- a stream call behind an `isEmpty()` guard
- a plain `for` loop from `com.hogwai.util.Iterables`
- Eclipse Collections' eager utility on `Iterate`<sup><a href="#fn2">[2]</a></sup>

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

The guard is there because it removes the stream work when there is nothing to iterate on, a case Heinz Kabutz already called out for stream pipelines<sup><a href="#fn3">[2]</a></sup>.

`Iterables.anyMatch` is the allocation-free baseline and it is nothing more than a loop:

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

The other four benchmarks swap the call:

- `allMatch` with `Iterables.allMatch` and `Iterate.allSatisfy`
- `noneMatch` with `Iterables.noneMatch` and `Iterate.noneSatisfy`
- `filter(...).findFirst()` with `Iterables.findFirst`, `Iterables.detect` and `Iterate.detect`
- `filter(...).count()` with `Iterables.count` and `Iterate.count`

## Results

All numbers below come from the run described above and lower is better everywhere. A score of `~0` in the allocation tables marks the profiler's detection floor, not exactly zero (but pretty close).

### AnyMatch

```java
values.stream().anyMatch(predicate);
```

#### Time (ns/op)

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

On an empty list, the guard drops the call from 12 ns and 144 bytes to 0.36 ns and nothing. On a non-empty list it does nothing for allocation and nothing for time. On a full scan, the loop and Eclipse Collections are both around 30,000 to 46,000 ns depending on where the match sits, against 115,000 to 130,000 ns for the stream and they allocate nothing.

### AllMatch

```java
values.stream().allMatch(predicate);
```

#### Time (ns/op)

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

`allMatch` is the mirror image of `anyMatch` and the numbers say the same thing: the three match operations share one implementation, so they share one allocation profile. The `first` scenario is the one place where the stream costs almost nothing, 14 ns and 144 bytes, because the very first element decides the answer.

### NoneMatch

```java
values.stream().noneMatch(predicate);
```

#### Time (ns/op)

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

Unsurprising and that is the point. Three differently named methods, identical cost.

### FindFirst

```java
values.stream().filter(predicate).findFirst();
```

#### Time (ns/op)

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

The extra `filter` stage shows up in the allocation: 168 to 184 bytes per call instead of 144. It also shows up in the `first` scenario, where the stream now costs 17.6 ns instead of 13.6 ns. Even when the filter matches the first element, the stage still has to be built.

The `Iterables.findFirst` row is a useful reminder that wrapping a hit in an `Optional` also costs 16 bytes, while `detect` returns `null` and stays at the detection floor. The type-safe miss is not free, but it is cheap.

### Count

```java
values.stream().filter(predicate).count();
```

#### Time (ns/op)

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

`count` cannot short-circuit, so it is the worst case for the stream on every non-empty scenario. The loop is roughly 2x faster than the stream and its allocation stays at the profiler's detection floor.

## Where do the bytes come from?

A stream call is not just a loop with nicer syntax, it is a pipeline that has to be assembled before it can run and the assembly requires intermediate structures to be allocated.

### The source

`list.stream()` is the default method on `Collection` and it starts the pipeline:

```java
default Stream<E> stream() {
    return StreamSupport.stream(spliterator(), false);
}
```

`spliterator()` is another default, because the immutable lists returned by `List.copyOf` do not override it:

```java
default Spliterator<E> spliterator() {
    return Spliterators.spliterator(this, 0);
}
```

So `stream()` alone already allocates two objects:

- the iterator-backed `Spliterators.IteratorSpliterator`<sup><a href="#fn4">[3]</a></sup>
- the `ReferencePipeline.Head`<sup><a href="#fn5">[4]</a></sup> that `StreamSupport.stream` builds around it.

### The terminal operation

`anyMatch` is a one-liner that hands the predicate to `MatchOps`:

```java
@Override
public final boolean anyMatch(Predicate<? super P_OUT> predicate) {
    return evaluate(MatchOps.makeRef(predicate, MatchOps.MatchKind.ANY));
}
```

`makeRef` is where the objects appear. It declares the sink class then returns a new `MatchOp` holding a `MatchSink::new` supplier<sup><a href="#fn6">[5]</a></sup>:

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

The `MatchOp` and the supplier are both new on every call and evaluation then calls `sinkSupplier.get()` to create the `MatchSink` itself.
That is five objects for a bare match operation, which is why `anyMatch` lands at roughly 144 bytes. `allMatch` and `noneMatch` are the same code with a different `MatchKind`.

### The counting case

`count()` routes to `ReduceOps.makeRefCounting()`<sup><a href="#fn7">[6]</a></sup>:

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

The anonymous `ReduceOp` subclass is created on every call, unlike the cached operation below. Counting also cannot short-circuit, so every element has to flow through the `CountingSink`, which is why `count` is the heaviest of the five on a full scan.

### The find case

`findFirst()` is the exception: it does not allocate a terminal op at all, because `FindOps` caches them in static fields<sup><a href="#fn8">[7]</a></sup>.

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

The two operations are built once when the class loads and reused forever, so the bytes in `filter().findFirst()` come from the `filter` stage and the sink it wraps, not from the terminal operation.

### The filter stage

`filter()` returns a new anonymous `StatelessOp`, so every `filter(...)` call allocates a stage even before the pipeline runs<sup><a href="#fn9">[8]</a></sup>:

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

### Connecting the sinks

Before any element moves, `wrapSink` walks the stages backwards and wraps the terminal sink once per intermediate stage<sup><a href="#fn10">[9]</a></sup>:

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

A bare match has no intermediate stage, so the loop body never runs. A `filter` adds one stage, so one `Sink.ChainedReference` is created here. That is why `filter().findFirst()` sits at 168 to 184 bytes and `filter().count()` at 176 to 208, against 144 for the bare match calls.

### Why the figures stay flat

None of this depends on the collection size and none of it depends on where the match is found. The pipeline is assembled once per call, before the first element is read and the sinks are then reused as elements flow through them. Short-circuiting only stops the loop earlier, it does not change what was allocated. That is why the allocation figures stay flat across scenarios and why a full 100,000-element scan allocates no more than an empty list.

A guard removes the whole graph in the empty case because the method returns before `stream()` is evaluated.
On a non-empty collection the guard adds nothing.

One nuance about lambdas. A non-capturing method reference such as `String::isEmpty` resolves to a single cached instance per call site, so passing it to `anyMatch` or `filter` allocates nothing.
A capturing lambda such as the benchmark's `value -> value.equals(target)` is a different story:
it needs a field for the captured value and ends up stored inside a pipeline stage.
The JIT cannot scalar-replace an object that reaches the heap. In practice it is allocated on every call. The benchmark hoists its predicate into a field created once in `@Setup`, which isolates the stream cost and keeps the comparison fair.

## What these numbers mean

### The JDK allocates on every call

Roughly 144 bytes for the match operations, 168 to 184 bytes for `filter().findFirst()` and 176 to 208 bytes for `filter().count()`. The amount is set by the pipeline shape, not by the data. A call on an empty list allocates the same as a call on a full scan.

### The `isEmpty()` guard is not a general fix

It removes the stream entirely on empty input, which turns a 12 ns call into a 0.36 ns call and takes allocation to zero.
On non-empty input it is a size check followed by the exact same stream, with the exact same allocation.

### The loop and Eclipse Collections stay flat

On long scans they are 2 to 4 times faster and allocate essentially nothing, because there is no pipeline to build. The only allocation in the group is the 16-byte `Optional` from `Iterables.findFirst`.

The practical rule is the usual one for hot paths: a stream is a readability tool and readability is worth a few hundred bytes when the code runs once per request, not a million times per second.
In a tight loop, in a per-element callback or on a large collection scanned often, the plain loop is both the fastest and the cheapest option and Eclipse Collections is a close second when you already depend on it.

## References

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

## Demo

A showcase of the concepts illustrated in this post is available here: [stream-allocation-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/stream-allocation-benchmark)
