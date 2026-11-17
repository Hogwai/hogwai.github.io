---
title: "Kotlin performance pitfalls"
description: "A JMH benchmark of Kotlin/JVM performance"
pubDate: 2026-11-17
tags: ["kotlin", "jvm", "performance", "jmh", "collections", "regex"]
draft: false
---

Kotlin makes collection code shorter. `any {}`, `firstOrNull {}` and `count {}` read like the sentence they implement and the compiler turns them into a loop. That loop does not build a stream pipeline or allocate a lambda object.

But Kotlin/JVM runs on the same JDK as Java. It uses `java.util.List`, `java.util.regex.Pattern` and the same garbage collector. The interesting question is therefore not whether Kotlin is faster than Java in general. It is which Java performance traps disappear, which ones survive behind a nicer API and which ones Kotlin adds.

Three of those traps were already measured in Java:

- [eager stream terminal operations](/posts/the-hidden-allocation-cost-of-eager-stream-operations) allocate on every call and run several times slower than a loop.
- [`List.contains` and `List.containsAll`](/posts/remaining-issues-with-java-collections) are linear scans with a quadratic combination.
- [regex compilation, capturing groups and backtracking](/posts/a-guide-to-efficient-pattern-usage) cost more than they look.

This post runs equivalent benchmarks in Kotlin.

## What is measured

Four JMH benchmark classes cover the cases:

| Benchmark             | Compares                                                                                        | Parameters                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `AllocationBenchmark` | `any {}`, indexed loops, `asSequence()`, `stream()` on `List<Int>`, `Array<Int>` and `IntArray` | `empty`, `first`, `mid`, `last`, `absent` on 1,000 elements |
| `CountBenchmark`      | `count {}`, `filter {}.size`, sequence and stream `filter().count()`                            | all match, plus two all-miss methods                        |
| `ContainsBenchmark`   | `List` vs `Set`, `contains` and `containsAll`, `toSet()`, `intersect`                           | 10, 1,000 and 100,000 elements                              |
| `RegexBenchmark`      | `Regex(...)` vs precompiled, lazy `findAll`, `Matcher` loop, `split`, capturing groups          | one log line and a 500-line log                             |

The measurements use Kotlin 2.4.0 and JMH 1.37 on Eclipse Temurin JDK 25.0.3, on Linux under WSL2. Each benchmark runs 3 forks with 5 warmup and 10 measurement iterations of 300 ms, with the GC profiler enabled and `-XX:+UseCompactObjectHeaders` on every forked JVM.

## Inline extensions are loops

The first benchmark searches for one value in a list. It compares `any {}` with an indexed loop, `Sequence`, `Stream` and primitive-array variants:

```kotlin
@Benchmark
open fun anyInlineList(): Boolean = list.any { it == TARGET }
```

`any` is fast and allocates nothing for two reasons: it is inline (compiled into the caller) and it returns immediately when the collection is empty.

```kotlin
public inline fun <T> Iterable<T>.any(predicate: (T) -> Boolean): Boolean {
    if (this is Collection && isEmpty()) return false
    for (element in this) if (predicate(element)) return true
    return false
}
```

Time in ns/op, lower is better:

| Method                         |    empty | first |    mid |      last |    absent |
| ------------------------------ | -------: | ----: | -----: | --------: | --------: |
| `list.any {}`                  |     0.35 |  0.71 | 137.36 |    280.62 |    327.17 |
| indexed `for` on `List`        |     0.35 |  0.67 | 143.38 |    281.64 |    297.53 |
| `list.asSequence().any {}`     |     0.34 |  0.71 | 137.35 |    332.53 |    364.62 |
| `list.stream().anyMatch {}`    |     9.39 | 10.67 | 662.75 |  1,337.48 |  1,154.13 |
| `Array<Int>.any {}`            |     0.26 |  0.37 |  57.87 |    184.90 |    118.94 |
| `IntArray.any {}`              | **0.26** |  0.36 |  39.04 |     77.99 |     78.14 |
| indexed `for` on `IntArray`    |     0.27 |  0.37 |  39.17 | **77.76** | **77.67** |
| `IntArray.asSequence().any {}` |     0.26 |  0.36 |  57.86 |     93.36 |    113.17 |

Allocation in B/op, lower is better:

| Method                         |  empty |  first |    mid |   last | absent |
| ------------------------------ | -----: | -----: | -----: | -----: | -----: |
| `list.any {}`                  |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| indexed `for` on `List`        |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `list.asSequence().any {}`     |     ~0 |     ~0 |     ~0 |  24.01 |  24.01 |
| `list.stream().anyMatch {}`    | 152.00 | 152.00 | 152.01 | 138.69 | 152.02 |
| `Array<Int>.any {}`            |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `IntArray.any {}`              |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| indexed `for` on `IntArray`    |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `IntArray.asSequence().any {}` |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |

Two results stand out in these tables.

First, `list.any {}` matches the hand-written indexed loop at the end of the list, 281 ns against 282 ns and stays at the allocation floor. `ArrayList.iterator()` creates an iterator object on every call, but it does not escape the loop, so escape analysis removes it. The predicate is inlined into the loop, so there is no function object to allocate or call.

Second, `list.stream().anyMatch {}` is the only variant that allocates on every call, including the empty and first-element cases. It costs about 152 bytes per call and is four to five times slower on a full scan: 1,337 ns against 281 ns at the last element. The 152 bytes come from the stream pipeline that `stream().anyMatch {}` builds on every call.

`asSequence()` is cheaper than `stream()` but more expensive than the inline call. It is not a `Stream` but a wrapper around the collection iterator.
On a `List` it adds up to 24 bytes per call once the scan reaches the end and it is 11 to 18 percent slower on full scans: 332 ns against 281 ns at the last element, 365 against 327 when the value is absent. For a single `any`, there is no reason to pay that.

### firstOrNull: the same work without the list

The next benchmark uses the same search but returns the matching value instead of a boolean:

```kotlin
@Benchmark
open fun firstOrNullList(): Int? = list.firstOrNull { it == TARGET }

@Benchmark
open fun filterThenFirstList(): Int? = list.filter { it == TARGET }.firstOrNull()
```

Time in ns/op:

| Method                                      | empty |    first |    mid |     last |   absent |
| ------------------------------------------- | ----: | -------: | -----: | -------: | -------: |
| `list.firstOrNull {}`                       |  0.36 | **0.72** | 138.37 |   281.74 |   280.76 |
| `list.filter {}.firstOrNull()`              |  0.36 |   325.35 | 323.16 |   325.77 |   319.14 |
| `list.asSequence().filter {}.firstOrNull()` |  0.36 |     0.68 | 137.48 |   281.56 |   279.67 |
| `list.stream().filter {}.findFirst()`       | 11.06 |    13.90 | 633.04 | 1,244.76 | 1,231.60 |

Allocation in B/op:

| Method                                      |  empty |  first |    mid |   last | absent |
| ------------------------------------------- | -----: | -----: | -----: | -----: | -----: |
| `list.firstOrNull {}`                       |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `list.filter {}.firstOrNull()`              |     ~0 |  56.01 |  56.01 |  56.01 |  24.01 |
| `list.asSequence().filter {}.firstOrNull()` |     ~0 |     ~0 |     ~0 |     ~0 |     ~0 |
| `list.stream().filter {}.findFirst()`       | 176.00 | 192.00 | 192.01 | 192.03 | 176.03 |

`firstOrNull {}` stops at the first match and allocates nothing. `filter {}.firstOrNull()` does the opposite: it builds a complete `ArrayList` of every match, then looks at its first element and throws the rest away. When the target is first, that is 325 ns and 56 bytes instead of 0.72 ns and nothing. The result is correct, but the method builds and discards a list of matches.

The sequence version is allocation-free here and matches `firstOrNull {}` on time. Laziness helps because `filter` is fused into the iteration and the terminal `firstOrNull` stops the chain.
The eager version materializes every match but the lazy version stops at the first.

## count does not need a list

`count {}` is the direct replacement for the Java `filter().count()` habit:

| Method                                                |      ns/op |      B/op |
| ----------------------------------------------------- | ---------: | --------: |
| `list.count {}`                                       | **326.49** |    **~0** |
| `list.filter {}.size`                                 |   3,190.05 | 14,936.07 |
| `list.asSequence().filter {}.count()`                 |     529.44 |     40.01 |
| `list.stream().filter {}.count()`                     |     787.23 |    216.02 |
| `list.count {}` on an all-miss list                   |     325.66 |        ~0 |
| `list.stream().filter {}.count()` on an all-miss list |     629.13 |    200.01 |

`filter {}.size` is the worst variant by a wide margin. It builds a 1,000-element `ArrayList` at 14,936 bytes per call to read one integer and takes about ten times the time. The syntax is short, but `filter` is eager: it returns a full list and `size` only reads its length.

The all-miss rows show that the stream cost does not depend on the answer. It allocates about 200 bytes even when no element matches. `count {}` stays at the floor and at the same 326 ns, because it is a loop with a counter.

## Boxing: List<Int>, Array<Int>, IntArray

The same table shows a second effect: the storage type of the collection. On a full scan:

| Source       | `any {}` at last | Storage              |
| ------------ | ---------------: | -------------------- |
| `List<Int>`  |        280.62 ns | `ArrayList<Integer>` |
| `Array<Int>` |        184.90 ns | `Integer[]`          |
| `IntArray`   |         77.99 ns | `int[]`              |

`List<Int>` and `Array<Int>` store boxed `Integer` objects. `IntArray` stores primitive `int` values contiguously. The inline lambda is identical in all three cases, so the difference is entirely in storage and access: two levels of indirection and an unboxing step for the object variants, a plain array load for `IntArray`.

Kotlin has no primitive `Sequence`, so it gives up a tool Java has: `IntStream`. Java's `IntStream` keeps a primitive pipeline from source to terminal operation. Kotlin's `Sequence` is generic, so `IntArray.asSequence()` returns a `Sequence<Int>` and boxes at the API boundary. In the benchmark, escape analysis hides the allocation, which is why the B/op column stays at the floor. That result is fragile: it holds while the values stay inside the loop. Retain them in a list, pass them to a non-inlined function or let them escape and the boxes become real.

The practical rule is not to replace every `List<Int>` with an `IntArray`. Arrays are mutable, fixed-size and less pleasant to use. The rule is to measure the hot path: if a primitive collection is scanned often enough for 200 ns to matter, `IntArray` plus inline extensions is the cheapest option on Kotlin/JVM. If the values are small and the code runs once per request, the boxed list is fine.

## Collections did not change

Kotlin does not wrap `java.util.List` in a new implementation. `listOf`, `mutableListOf` and `toList()` return JDK lists and `in` compiles to `contains`. The complexity is therefore the JDK's:

| Method                              |    10 | 1,000 |    100,000 |
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

Times are in microseconds per operation.

At 100,000 elements, `List.contains` takes 16.8 µs against 2 ns for `Set.contains`, about 8,400 times slower. On the same data, `List.containsAll` reaches 16.9 ms. The `present` subset contains 1,000 elements and every one of them triggers a full scan of the 100,000-element list. That is the O(n*m) behaviour of the default `containsAll`: it walks the argument and calls `contains` on the receiver for each element.

The `absent` row is much cheaper, 32 µs, because the first argument element is not in the list, so `containsAll` returns after one full scan. It is a useful reminder that the cost depends on where the answer is, not only on the size.

`list.toSet().containsAll(...)` measures the conversion inside the call. At 100,000 elements the conversion alone costs about 1.8 ms, so it only pays off when the same collection is queried many times. For a single `containsAll` on a present subset it is still cheaper than 16.9 ms, but for a single absent check it is fifty times more expensive than the direct call. Convert once, at the boundary and keep the set.

`intersect` is the slowest variant in the table, 51 ms. The one-liner hides two costs: it creates a mutable set from the receiver and calls `retainAll` with the argument. `retainAll` walks the set and calls `contains` on the argument, so passing a `List` turns it into O(n*m) again, plus the set allocation. It is not a fix for the data structure.

## Regex: same engine, two Kotlin traps

`kotlin.text.Regex` is a thin wrapper over `java.util.regex.Pattern` on the JVM. The ranking is therefore the same as with raw `java.util.regex`. The Kotlin layer adds two traps of its own.

Time in ns/op and allocation in B/op:

| Method                                     |    ns/op |       B/op |
| ------------------------------------------ | -------: | ---------: |
| `Regex("userId=\\d+")` in the benchmark    |    102.0 |   1,240.00 |
| `"userId=\\d+".toRegex()` in the benchmark |    102.0 |   1,240.00 |
| precompiled `Regex("userId=(\\d+)")`       |     39.0 |     136.00 |
| precompiled `java.util.regex.Pattern`      | **31.0** |     128.00 |
| `findAll(log)` never consumed              |  **2.0** |      40.00 |
| `findAll(log).count()`                     | 29,409.0 |  88,200.62 |
| `findAll(log).map { it.value }.toList()`   | 32,473.0 | 118,936.69 |
| `Matcher.find()` loop                      | 20,770.0 |     128.44 |
| `csv.split(",")`                           |  1,694.0 |  11,016.04 |
| `csv.split(Regex(","))`                    |  2,055.0 |  11,072.04 |
| `find(line)?.groupValues?.get(1)`          |     46.0 |     240.00 |
| non-capturing `find(line)?.value`          |     47.0 |     216.00 |
| `line.matches(regex)`                      |      8.0 |      64.00 |

The first trap is that the pattern is compiled on every call. `Regex(...)` and `String.toRegex()` compile the pattern before matching and there is no cache behind either constructor. On this short pattern the gap is 102 ns and 1,240 bytes against 39 ns and 136 bytes for a precompiled `Regex` and 31 ns for the raw `Pattern`. The absolute numbers are small because the pattern is small. The gap grows with pattern complexity and the allocation grows with every call.

The second trap is that `findAll` is lazy. It returns a `Sequence` and a sequence does nothing until a terminal operation consumes it:

```kotlin
// Returns a sequence and matches nothing. This is a silent no-op.
val matches = idRegex.findAll(log)

// Runs the regex and counts the matches.
val count = idRegex.findAll(log).count()
```

The benchmark measures that difference directly: 2 ns and 40 bytes for the unconsumed sequence, 29.4 µs and 88 KB once `count()` runs. Forgetting the terminal operation is not a performance problem, it is a correctness problem that looks like a performance win.

Once consumed, `findAll` is also more expensive than a plain `Matcher` loop. On 500 matches it allocates 88 KB, about 176 bytes per match, against 128 bytes in total for the loop. The implementation delegates to `generateSequence`, which calls `MatchResult.next()` for each match:

```kotlin
public actual fun findAll(input: CharSequence, startIndex: Int = 0): Sequence<MatchResult> {
    // ...
    return generateSequence({ find(input, startIndex) }, MatchResult::next)
}
```

Each step of the sequence calls `MatchResult.next()`, which creates a new `Matcher` from the pattern and runs `findNext`, then wraps the result in a `MatcherMatchResult`. That is a matcher and a result object per occurrence, plus the sequence iterator state. The `Matcher.find()` loop reuses one matcher for the whole scan.

`split` has the same problem when it receives a `Regex` instead of a literal delimiter. `csv.split(",")` uses the literal delimiter and never touches the regex engine: 1.69 µs and 11,016 bytes for 200 fields. `csv.split(Regex(","))` builds a `Matcher` and pays 2.06 µs. The time difference is modest here because producing 200 strings dominates, but the regex version has no reason to exist for a fixed delimiter.

Capturing groups are cheap per match and expensive in bulk. `find(line)?.groupValues?.get(1)` costs 46 ns and 240 bytes, against 47 ns and 216 bytes for the non-capturing `find(line)?.value`. The 24-byte difference is the lazy `groupValues` list that wraps the matcher's group array. One match does not matter. A loop over a million log lines does.

Finally, `line.matches(regex)` is not a faster `containsMatchIn`. It asks whether the whole input matches the pattern, so it returns `false` on the first character here and finishes in 8 ns. A benchmark that compares it with `find` is measuring two different questions. Use `containsMatchIn` or `find` when the pattern can appear anywhere in the input.

## What to take away

1. **The Java stream allocation problem does not reproduce.** `any {}`, `firstOrNull {}` and `count {}` are `inline` and compile to a plain loop. They allocate nothing measurable, against about 152 bytes per call for `stream().anyMatch {}`, which is also four to five times slower on a full scan.
2. **`Sequence` is lazy, not free.** It adds up to 24 bytes per call on a `List` and makes full scans up to 45 percent slower depending on the source type. It is the right tool for a chain that short-circuits or avoids intermediate lists, not a default replacement for every collection call.
3. **The equivalent of `filter().count()` is `count {}`.** `filter {}.size` builds the whole result list: 14,936 bytes and ten times the time for a 1,000-element list.
4. **Boxing is where Kotlin lacks Java's escape hatch.** `List<Int>` and `Array<Int>` store boxed values and `Sequence<Int>` boxes at the API boundary. There is no primitive `Sequence` equivalent to `IntStream`, so the fast path for primitive data is `IntArray` plus inline extensions.
5. **Collections are untouched.** `contains` and `containsAll` are JDK implementations behind a Kotlin facade, with the same O(n) and O(n*m) behaviour. `in`, `listOf` and `toSet()` make the trap easier to write, not harder.
6. **Regex is the same engine with two extra traps.** `Regex(...)` and `toRegex()` have no compile cache and `findAll()` is lazy, so it silently does nothing without a terminal operation while allocating a matcher and a result object per match.

Pick the data structure for the access pattern, keep the allocation out of the hot loop and let readability win when the code runs once per request. Kotlin removes the lambda and stream pipeline allocation from the collection helpers, but it does not change the cost of the data structures or the regex engine.

## Limits

- These are microbenchmarks. The numbers show orders of magnitude and relative rankings on this machine, not promises for a production workload.
- Escape analysis is sensitive to the surrounding code. The `~0` allocation scores for `Sequence<Int>` and for the list iterator hold while the objects stay inside the benchmark loop. Code that retains them will allocate.
- The `@Param` annotation applies to the whole class, so `AllocationBenchmark` runs its four `findFirst` variants for every `any` scenario. The `count` family lives in its own class to avoid repeating a dataset that does not depend on the scenario.
- The stream results use Kotlin's `java.util.List.stream()` extension. The 152 bytes per call is within the usual variation between JDK builds and harnesses (a comparable Java stream measurement lands around 144 bytes).
- No `parallel()` equivalent is measured. `Sequence` has none and parallel collection processing in Kotlin means coroutines or an explicit `java.util.stream`.
- Everything here is Kotlin/JVM. Kotlin/Native and Kotlin/JS use different collection implementations.

## References

- [Kotlin stdlib: `_Collections.kt`](https://github.com/JetBrains/kotlin/blob/master/libraries/stdlib/common/src/generated/_Collections.kt), `any`, `firstOrNull`, `count` and `asSequence`
- [Kotlin stdlib: `Regex.kt` for the JVM](https://github.com/JetBrains/kotlin/blob/master/libraries/stdlib/jvm/src/kotlin/text/regex/Regex.kt), `findAll`, `split` and `MatcherMatchResult`
- [OpenJDK `AbstractCollection.containsAll`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/AbstractCollection.java)
- [OpenJDK `ArrayList.contains`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/ArrayList.java)

A project demonstrating the concepts is available here: [kotlin-performance-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/kotlin-performance-benchmark)
