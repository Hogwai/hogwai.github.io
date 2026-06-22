---
title: "A guide to efficient Pattern usage"
description: "Tips for getting the most out of the Pattern class, while avoiding pitfalls"
pubDate: 2025-10-18
tags:
  ["java", "pattern", "regex", "performance", "capturing-groups", "globbing"]
draft: false
---

Regular expressions are a powerful tool in every Java developer's toolkit. They allow us to validate input, parse strings, and perform complex text transformations with just a few lines of code. However, this power comes with a hidden performance cost if not used correctly.

The key to unlocking efficient regex in Java lies in understanding the `java.util.regex.Pattern` class. In this post, we'll explore the best practices for using `Pattern`, how to avoid common performance pitfalls, and why you should be wary of the "convenient" regex methods on the `String` class.

## The golden rule: compile once, use many times

The most important concept to grasp is that compiling a regular expression is an expensive operation. When you call `Pattern.compile()`, Java takes your regex string, parses it, and builds an internal representation (often a finite automaton) that it can use for matching. This process consumes CPU cycles.

The `Pattern` object itself is an immutable, compiled representation of your regex. It is thread-safe and can be reused indefinitely. The `Matcher`, on the other hand, is a stateful engine that performs the actual match operation on a given input string.

Here is the standard, correct way to use the regex API:

```java
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class RegexExample {

    // A simple regex to validate an email address
    private static final String EMAIL_REGEX = "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$";

    public static void main(String[] args) {
        String email1 = "test.user@example.com";
        String email2 = "not-an-email";

        // 1. Compile the regex ONCE
        Pattern pattern = Pattern.compile(EMAIL_REGEX, Pattern.CASE_INSENSITIVE);

        // 2. Create a Matcher for the first input
        Matcher matcher1 = pattern.matcher(email1);
        if (matcher1.matches()) {
            System.out.println("'" + email1 + "' is a valid email.");
        }

        // 3. Reuse the SAME Pattern object for the second input
        Matcher matcher2 = pattern.matcher(email2);
        if (!matcher2.matches()) {
            System.out.println("'" + email2 + "' is NOT a valid email.");
        }
    }
}
```

Key takeaway: The `Pattern` is the blueprint; the `Matcher` is the worker. You create the blueprint once and use it to create as many workers as you need.

## The performance trap: why you should never re-compile

The most common mistake is putting `Pattern.compile()` inside a loop or a frequently called method. This forces the JVM to recompile the same regex over and over again, leading to a significant performance hit.

Calling `Pattern.compile()` has a multi-dimensional performance cost:

- CPU: Compiling a regular expression (e.g. translating a textual regular expression into an internal bytecode structure) is computationally expensive and may consume significant CPU resources, especially if the regex is complex.
- Memory: A compiled Pattern is one of the most memory-intensive Java objects<sup><a href="#ref1">[1]</a></sup>.
- Garbage Collection: Frequently creating and discarding Pattern instances increases pressure on the garbage collector, as these heavy objects must be reclaimed, potentially triggering more frequent or longer GC cycles.

### The wrong way (inefficient)

```java
public void processLines(List<String> lines) {
    for (String line : lines) {
        // Pattern is re-compiled on every iteration
        if (line.matches("\\d+")) {
            // process number
        }
    }
}
```

### The right way

The best practice for regex patterns that are used repeatedly is to compile them once and store them in a `private static final` field. This ensures the pattern is compiled only once when the class is loaded.

```java
import java.util.regex.Pattern;

public class LineProcessor {
    // Compiled once and stored as a constant.
    private static final Pattern NUMERIC_PATTERN = Pattern.compile("\\d+");

    public void processLines(List<String> lines) {
        for (String line : lines) {
            // Use the pre-compiled pattern
            if (NUMERIC_PATTERN.matcher(line).matches()) {
                // process number
            }
        }
    }
}
```

By moving the compilation out of the loop, you get a massive performance improvement, especially when processing thousands or millions of strings.

## Beware of convenience: the `String` regex trap

The Java `String` class provides several convenient methods that accept a regex as a string parameter:

- `matches(String regex)`
- `split(String regex)`
- `split(String regex, int limit)`
- `replaceAll(String regex, String replacement)`
- `replaceFirst(String regex, String replacement)`.

While they are tempting for their simplicity, they hide a dirty secret: every single one of these methods recompiles the regex pattern internally.

As stated in the javadoc<sup><a href="#ref2">[2]</a></sup>:

> An invocation of this method of the form str.matches(regex) yields exactly the same result as the expression
> Pattern.matches(regex, str)

For example, this line of code:

```java
boolean isNumeric = "12345".matches("\\d+");
```

is essentially doing this under the hood:

```java
boolean isNumeric = Pattern.compile("\\d+").matcher("12345").matches();
```

If you call `"12345".matches("\\d+")` in a loop, you are recompiling the `\\d+` pattern on every iteration.

### Rule of thumb

- For one-off, non-performance-critical operations, using `String.matches()` is perfectly fine.
- For any code in a hot path, a loop, or a frequently called method (like a web request handler), you MUST use a pre-compiled `static final Pattern`.

### Comparison

```java
// Inefficient: Compiles the regex on every call
public boolean isEmailValid(String email) {
    return email.matches("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$");
}

// Efficient: Uses the pre-compiled pattern
public class EmailValidator {
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$", Pattern.CASE_INSENSITIVE);

    public boolean isEmailValid(String email) {
        return EMAIL_PATTERN.matcher(email).matches();
    }
}
```

### Apache Commons Lang

The issue is also present in the Apache Commons Lang package:

- `RegExUtils.java`<sup><a href="#ref3">[3]</a></sup>: Utility class providing methods like `replaceFirst` or `replaceAll`

## Advanced tip

### Caching dynamic patterns

What if you don't know the regex at compile time? For example, you might be reading regex patterns from a configuration file. In this case, you can't use a `static final` field.

The solution is to implement a cache. A `ConcurrentHashMap` is perfect for this, as it's thread-safe.

```java
import java.util.regex.Pattern;
import java.util.concurrent.ConcurrentHashMap;

public class PatternCache {
    // A thread-safe cache for compiled patterns
    private static final ConcurrentHashMap<String, Pattern> CACHE = new ConcurrentHashMap<>();

    /**
     * Returns a compiled Pattern, either from the cache or by compiling it for the first time.
     * @param regex The regex string to compile.
     * @return The compiled Pattern object.
     */
    public static Pattern compile(String regex) {
        // computeIfAbsent is an atomic operation. It gets the value or computes it if absent.
        return CACHE.computeIfAbsent(regex, Pattern::compile);
    }
}

// Usage:
public class DynamicRegexService {
    public void validateInput(String input, String regex) {
        Pattern pattern = PatternCache.compile(regex); // Get from cache or compile
        if (pattern.matcher(input).matches()) {
            System.out.println("Input matches the dynamic regex!");
        }
    }
}
```

This approach ensures that each unique regex string is compiled only once, no matter how many times it's used.

## Mind your captures: use groups judiciously

Capturing groups are one of the most useful features of regex, they let you extract the parts of the input that actually matter. But they come with some design pitfalls and, in some cases, a performance cost.

### The (surprisingly small) performance cost of capturing

Every time the regex engine encounters `(...)`, it could record the start and end position for later retrieval via `matcher.group(N)`. In practice, on modern JDK (25+), the JIT is smart enough to optimize away unused captures. The benchmarks show:

| Benchmark                                  | Score        | vs Non-Capturing |
| ------------------------------------------ | ------------ | ---------------- |
| `CapturingGroupsBenchmark.capturingUnused` | 24,314 ns/op | ~2% slower       |
| `CapturingGroupsBenchmark.nonCapturing`    | 24,858 ns/op | baseline         |

For 1,000 matches on a simple pattern, the difference is within the noise, unused capturing groups have essentially zero overhead on modern JVMs.

However, the cost changes dramatically when you do extract groups:

| Benchmark                                            | Score        | vs Baseline |
| ---------------------------------------------------- | ------------ | ----------- |
| `CapturingGroupsBenchmark.positionalGroupExtraction` | 33,282 ns/op | +37%        |
| `CapturingGroupsBenchmark.namedGroupExtraction`      | 64,974 ns/op | +167%       |

The takeaway: captures are fine as long as you use them. The waste is not in unused groups (JIT handles that) but in unnecessary extraction. If you don't need the captured text, don't call `matcher.group()`, or use non-capturing groups as documentation of intent.

### Non-capturing groups `(?:...)`

The syntax `(?:...)` groups sub-expressions just like `(...)`, but tells the reader: _I only need grouping, not capturing_.

```java
// Capturing -> signals intent to extract
Pattern.compile("(\\d+)-(\\w+)");

// Non-capturing -> signals "just grouping"
Pattern.compile("(?:\\d+)-(?:\\w+)");
```

**Best practice:** Use `(?:...)` as your default grouping construct. It communicates intent even when the performance difference is small.

### Named capturing groups `(?<name>...)`

Java 7 introduced named capturing groups. Instead of remembering positional indices:

```java
// Positional -> brittle, hard to refactor
Pattern p = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})");
Matcher m = p.matcher("2025-10-18");
if (m.matches()) {
    String year = m.group(1);  // what did group 1 mean again?
    String month = m.group(2);
}
```

Use named groups for clarity and maintainability:

```java
// Named -> self-documenting, order-independent
Pattern p = Pattern.compile("(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})");
Matcher m = p.matcher("2025-10-18");
if (m.matches()) {
    String year = m.group("year");
    String month = m.group("month");
    String day = m.group("day");
}
```

But be aware of the trade-off: named group access (`m.group("name")`) is ~2x slower than positional (`m.group(1)`) because it performs a HashMap lookup. Use named groups for readability in non-hot paths; reach for positional groups in performance-critical extraction loops.

### Beware of backreferences

Backreferences (`\1`, `\2`, ... or `\k<name>`) let you match the same text that a previous group captured:

```java
// Matches "foo-foo" but not "foo-bar"
Pattern.compile("(\\w+)-\\1");
```

While powerful, backreferences:

- Force backtracking: Java's regex engine is NFA-based and normally includes memoization optimizations (JDK-6328855)<sup><a href="#ref4">[4]</a></sup> to mitigate exponential runtime. These optimizations are explicitly disabled when backreferences are present, because backreferences cannot be modeled in a DFA at all.
- Can trigger catastrophic backtracking: especially when nested or combined with quantifiers.
- Disable certain optimizations: patterns with backreferences cannot be accelerated with `Pattern.LITERAL` or certain DFA-based approaches.

Use backreferences sparingly and only in non-hot paths. When used in dynamic patterns (loaded from config), validate the regex length and complexity to avoid ReDoS risk.

## Beyond compilation: matching performance

Compilation efficiency is only half the story. How you _use_ the `Pattern` and `Matcher` for actual matching can also make a big difference, especially on large inputs or tight loops.

### Bound the search with `region()`

By default, a `Matcher` operates on the entire input string. If you only need to search within a specific portion, use `region()` to constrain the engine's scanning range:

```java
String document = // ... potentially very large string
Pattern pattern = Pattern.compile("error");
Matcher matcher = pattern.matcher(document);

// Only search the first 10,000 characters
matcher.region(0, 10_000);
if (matcher.find()) {
    // found early, avoided scanning the rest
}
```

This is especially useful for log parsing or processing large payloads where the pattern of interest appears near the start.

### Possessive quantifiers: cut the backtracking

Greedy quantifiers (`*`, `+`, `?`) try to match as much as possible, then backtrack if the rest of the pattern fails. Possessive quantifiers (`*+`, `++`, `?+`) behave similarly but never give back what they matched. If the rest of the pattern fails, it fails immediately, no backtracking.

```java
// Greedy -> will backtrack if ".txt" doesn't match
Pattern.compile(".*\\.txt");

// Possessive -> fails fast, no backtracking
Pattern.compile(".*+\\.txt");
```

The benchmarks on a 500-character non-matching input confirm the impact:

| Benchmark                                                | Score     | vs Greedy   |
| -------------------------------------------------------- | --------- | ----------- |
| `PossessiveQuantifierBenchmark.greedySuffixMatching`     | 607 ns/op | baseline    |
| `PossessiveQuantifierBenchmark.possessiveSuffixMatching` | 330 ns/op | 1.8x faster |

On longer strings the gap grows proportionally, the greedy version backtracks character by character, while the possessive version fails in a single pass.

### Atomic groups `(?>...)`

Atomic groups are a more general tool: once the group matches, the engine never backtracks into it.

```java
// Without atomic group -> engine may try different ways to match "\\d+"
Pattern.compile("(\\d+):\\d+");

// With atomic group -> once digits are consumed, never reconsider
Pattern.compile("(?>\\d+):\\d+");
```

This is particularly valuable in patterns that would otherwise suffer catastrophic backtracking. Atomic groups act as a circuit breaker.

### Catastrophic backtracking

Certain patterns can cause exponential runtime due to nested quantifiers and backtracking:

```java
// DANGEROUS -> nested quantifiers on overlapping patterns
Pattern.compile("(a+)+b");
```

Given input like `"aaaaaaaaac"`, the engine tries every possible way to partition the `a`s between the inner and outer `+` before admitting failure. On JDK 25, with 22 characters of `a`:

| Benchmark                                                | Score       | Slowdown |
| -------------------------------------------------------- | ----------- | -------- |
| `PossessiveQuantifierBenchmark.catastrophicBacktracking` | 1,312 ns/op | 57x      |
| `PossessiveQuantifierBenchmark.atomicGroupFix`           | 23 ns/op    | baseline |
| `PossessiveQuantifierBenchmark.possessiveFix`            | 28 ns/op    | baseline |

Modern JDK includes memoization optimizations (JDK-6328855)<sup><a href="#ref4">[4]</a></sup> that mitigate simple cases, but the gap grows exponentially with input length. At 30+ characters, the difference becomes astronomical. And when backreferences are present, the mitigations are disabled entirely.

How to protect yourself:

- Use possessive quantifiers `++` and atomic groups `(?>...)` to eliminate backtracking branches.
- Keep patterns simple in hot paths.
- For dynamic/user-supplied regexes (e.g., from the caching example above), impose a timeout via `Matcher.usePattern()` or run matching with a thread timeout.

## Stay safe: escape user input with `Pattern.quote()`

When you embed user-provided strings into a regex, you must escape any special characters (`.`, `*`, `+`, `(`, `)`, `[`, `]`, etc.) to prevent unexpected behavior, or worse, injection attacks.

```java
// UNSAFE -> user input treated as regex
String userInput = getSearchTerm();  // might contain ".*"
Pattern pattern = Pattern.compile(".*" + userInput + ".*");
```

Use `Pattern.quote()` to treat arbitrary input as literal text:

```java
// SAFE -> user input is escaped
String userInput = getSearchTerm();
Pattern pattern = Pattern.compile(".*" + Pattern.quote(userInput) + ".*");
```

`Pattern.quote()` wraps the input in `\Q...\E`, which tells the regex engine to treat everything inside as literal characters. It also handles a subtle edge case: if the input itself contains `\E`, it escapes embedded `\E` sequences to prevent premature quote termination<sup><a href="#ref5">[5]</a></sup>. Always escape dynamic content before embedding it in a regex.

But does it cost anything? The benchmarks say: essentially no. The compile-time overhead of quoting is small, and at runtime there is zero measurable difference:

| Benchmark                                            | Score    | Difference     |
| ---------------------------------------------------- | -------- | -------------- |
| `PatternQuoteBenchmark.compileWithoutQuoteSafeInput` | 55 ns/op | baseline       |
| `PatternQuoteBenchmark.compileWithQuoteSafeInput`    | 77 ns/op | +22 ns compile |
| `PatternQuoteBenchmark.unquotedSafeMatchingMatch`    | 65 ns/op | baseline       |
| `PatternQuoteBenchmark.quotedSafeMatchingMatch`      | 65 ns/op | identical      |

There is no performance reason to skip `Pattern.quote()`. The safety benefit far outweighs the tiny compile cost.

The same applies to `String` methods:

```java
// UNSAFE
String result = text.replaceAll(userInput, "REDACTED");

// SAFE
String result = text.replaceAll(Pattern.quote(userInput), "REDACTED");
```

**Note:** This complements the caching section above. If you're caching dynamic patterns that include user input, escape the input _before_ compiling and caching.

## Modern Pattern API: methods you might have missed

Java 8 and later added several convenience methods to `Pattern` that reduce boilerplate and integrate better with modern Java idioms. Note: these are convenience methods, not performance optimizations, the benchmarks show they're roughly on par with (or slightly slower than) the equivalent manual code.

### `splitAsStream(CharSequence)`

Instead of splitting into an array and then streaming:

```java
// Old way
Pattern COMMA = Pattern.compile(",");
Stream<String> tokens = Arrays.stream(COMMA.split(input));
```

Use `splitAsStream()` directly (Java 8+):

```java
// Direct stream -> lazy, no intermediate array
Pattern COMMA = Pattern.compile(",");
Stream<String> tokens = COMMA.splitAsStream(input);
```

| Benchmark                                        | Score        | Memory             |
| ------------------------------------------------ | ------------ | ------------------ |
| `ModernPatternAPIBenchmark.splitToArray`         | 11,264 ns/op | allocates String[] |
| `ModernPatternAPIBenchmark.splitThenArrayStream` | 11,477 ns/op | allocates String[] |
| `ModernPatternAPIBenchmark.splitToStream`        | 13,409 ns/op | lazy, no array     |

When consuming all tokens, `splitAsStream()` is ~19% slower than `split()`, the stream abstraction overhead outweighs the saved allocation. The method shines when you only process the first few tokens lazily, skipping the rest without generating them.

### `asPredicate()` and `asMatchPredicate()`

When you need to test many strings against the same pattern, these methods work with the collections/streams API without wrapping in a lambda<sup><a href="#ref6">[6]</a></sup>:

```java
Pattern DIGITS = Pattern.compile("\\d+");

// With asMatchPredicate() -> full-string match (Java 11+)
List<String> numbers = strings.stream()
    .filter(DIGITS.asMatchPredicate())
    .toList();

// With asPredicate() -> substring match (Java 8)
List<String> containsDigits = strings.stream()
    .filter(DIGITS.asPredicate())
    .toList();
```

| Benchmark                                    | Score        | vs Lambda                  |
| -------------------------------------------- | ------------ | -------------------------- |
| `ModernPatternAPIBenchmark.lambdaMatch`      | 8,677 ns/op  | baseline                   |
| `ModernPatternAPIBenchmark.asMatchPredicate` | 9,780 ns/op  | +13%                       |
| `ModernPatternAPIBenchmark.asPredicateFind`  | 14,392 ns/op | +66% (different semantics) |

`asMatchPredicate()` is slightly slower than a raw lambda due to the predicate abstraction. Use it for readability, not speed. `asPredicate()` is notably slower because `find()` semantics match more aggressively than `matches()`.

Important semantic difference:

- `asPredicate()` uses `Matcher.find()`: true if any substring matches.
- `asMatchPredicate()` uses `Matcher.matches()`: true only if the entire string matches.

```java
Pattern DIGITS = Pattern.compile("\\d+");

// asPredicate() -> "a42b" -> true (finds "42")
// asMatchPredicate() -> "a42b" -> false (not all digits)
```

This removes a common subtle bug where `asPredicate()` returns true for partial matches when the developer expected a full match.

### `splitWithDelimiters()` (Java 21)

Java 21 introduced `Pattern.splitWithDelimiters()`<sup><a href="#ref7">[7]</a></sup> and its `String` counterpart. Unlike `split()`, which discards the delimiters, this method returns both the substrings and the delimiters interleaved:

```java
Pattern COMMA = Pattern.compile(",");
String[] result = COMMA.splitWithDelimiters("a,b,c", 0);
// ["a", ",", "b", ",", "c"]
```

This is useful for parsing scenarios where you need to preserve or transform the delimiters along with the content.

## Beyond regex: when to use globbing

Not all pattern matching needs regex. Java provides a separate glob syntax for matching file and path names. Globs use a simpler wildcard syntax and are often more readable for file-oriented patterns.

### Glob vs regex

| Aspect   | Regex                                 | Glob                                                                                         |
| -------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Java API | `java.util.regex.Pattern`             | `java.nio.file.FileSystem.getPathMatcher("glob:...")`                                        |
| `*`      | Zero or more of the preceding element | Zero or more characters within a single path component (does not cross directory boundaries) |
| `?`      | Zero or one of the preceding element  | Any single character within a single path component                                          |
| `.`      | Any character                         | Literal period                                                                               |
| `**`     | (requires custom pattern)             | Zero or more characters crossing directory boundaries (recursive)                            |
| Use case | Text validation, parsing, extraction  | File/directory filtering, path matching                                                      |

### Performance: glob vs regex via `PathMatcher`

`FileSystem.getPathMatcher()` supports both `glob:` and `regex:` prefixes. The benchmarks on 1,000 paths show a clear difference:

| Benchmark                                 | Score         | vs Regex    |
| ----------------------------------------- | ------------- | ----------- |
| `PathMatchingBenchmark.globPathMatching`  | 130,399 ns/op | baseline    |
| `PathMatchingBenchmark.regexPathMatching` | 71,750 ns/op  | 1.8x faster |

Glob patterns are slower because they need to be converted to an internal regex representation first. The conversion happens once at `PathMatcher` creation, but the matching itself also carries overhead from the adaptation layer.

Choose glob for readability, regex for speed when using `PathMatcher`.

### Using `PathMatcher` with globs

```java
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.PathMatcher;
import java.nio.file.Paths;

// Match all .java files
PathMatcher matcher = FileSystems.getDefault()
    .getPathMatcher("glob:*.java");

boolean result = matcher.matches(Paths.get("Main.java"));   // true
boolean result2 = matcher.matches(Paths.get("Main.class")); // false
```

### Common glob patterns

| Pattern            | Matches                                      |
| ------------------ | -------------------------------------------- |
| `*.java`           | Any file ending in `.java`                   |
| `build/**/*.class` | Any `.class` file under `build/` recursively |
| `src/?at/*`        | Files in `src/cat/`, `src/hat/`, etc.        |
| `{*.java,*.kt}`    | Files ending in `.java` or `.kt`             |

### The `regex:` prefix

If you already have a regex pattern, use the `regex:` prefix, it's faster and avoids the glob conversion cost:

```java
PathMatcher matcher = FileSystems.getDefault()
    .getPathMatcher("regex:.*\\.java");
// Equivalent to glob:*.java, but ~1.8x faster
```

### When to choose what

- Use glob when filtering files, directories, or paths, it's the idiomatic Java API, simpler, and harder to get wrong.
- Use regex with `PathMatcher` when you need the extra performance, or when you already have a regex pattern.
- Use `java.util.regex.Pattern` when you need text validation, extraction, complex conditions, or lookahead/lookbehind outside of file matching.

## Conclusion

Mastering the `java.util.regex.Pattern` class is a simple yet effective way to improve the performance and robustness of Java applications. By following these guidelines, one can avoid common traps and write code that is both clean and fast.

- **Compile Once:** Always use `Pattern.compile()` to create a reusable `Pattern` object.
- **Store as `static final`:** For frequently used, static regex patterns, store them in a `private static final` field.
- **Beware of `String` Methods:** Avoid `String.matches()`, `String.split()`, etc., in performance-critical code. They recompile the regex on every call.
- **Cache Dynamic Patterns:** For regexes that are not known at compile time, use a cache (like `ConcurrentHashMap`) to store compiled patterns.
- **Prefer Non-Capturing Groups:** Use `(?:...)` by default to signal intent; switch to `(?<name>...)` for readable extraction in non-hot paths.
- **Cut Backtracking with Possessive Quantifiers:** Use `*+`, `++`, `?+` to fail fast and avoid catastrophic backtracking.
- **Escape User Input:** Always use `Pattern.quote()` when embedding untrusted strings into a regex, the overhead is negligible.
- **Use Stream-Ready Methods:** Prefer `splitAsStream()` and `asMatchPredicate()` for readability and integration with modern Java.
- **Match the Right Way:** Use `asMatchPredicate()` (Java 11) for full-string matches, `asPredicate()` for substring searches.
- **Consider Newer APIs:** `splitWithDelimiters()` (Java 21) preserves delimiters alongside content.
- **Choose Glob for File Paths:** Use `FileSystem.getPathMatcher("glob:...")` for readability; use the `regex:` prefix if performance matters.

By making these small changes, you ensure your regular expressions are not only powerful but also performant and ready for production.

---

## References

1. <a id="ref1"></a>[Demystifying Java Object Sizes: Compact Headers, Compressed Oops, and Beyond](https://blog.vanillajava.blog/2024/12/demystifying-java-object-sizes-compact.html) by Peter Lawrey
1. <a id="ref2"></a>[String.matches(String regex)](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html#matches(java.lang.String)>)
1. <a id="ref3"></a>[RegExUtils.java](https://github.com/apache/commons-lang/blob/master/src/main/java/org/apache/commons/lang3/RegExUtils.java)
1. <a id="ref4"></a>[JDK-6328855: Pattern.matches() performance issues with exponential runtime](https://bugs.openjdk.org/browse/JDK-6328855)
1. <a id="ref5"></a>[Pattern.java: OpenJDK Pattern.quote() implementation](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/regex/Pattern.java#L1500)
1. <a id="ref6"></a>[Pattern.asMatchPredicate(): Java 11+ API docs](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/regex/Pattern.html#asMatchPredicate()>)
1. <a id="ref7"></a>[JDK-8305486: Add splitWithDelimiters methods to Pattern and String](https://bugs.openjdk.org/browse/JDK-8305486)

## Demo

A showcase of the concepts illustrated in this post is available here: [regex-performance-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/regex-performance-benchmark)
