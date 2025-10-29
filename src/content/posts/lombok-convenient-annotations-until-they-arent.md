---
title: |
  Lombok: Convenient annotations until they aren't
description: "Some Lombok annotations do not have your best interests at heart. Learn how to avoid undesirable behaviors and side effects"
pubDate: 2025-10-30
tags:
  [
    "java",
    "spring-boot",
    "spring-data-jpa",
    "hibernate",
    "lombok",
    "annotation",
  ]
draft: false
---

## Introduction

Lombok has long been and continues to be a gift for Java developers.
It frees us from the burden of writing tedious, repetitive code, making our classes cleaner, more readable, and easier to maintain.

But, as with any powerful tool, convenience can sometimes hide subtle pitfalls.

This article aims to help you avoid them by giving you the keys to make thoughtful, informed choices.

## Lombok on safe ground

Some annotations are simple, direct, and don't interfere with any lifecycle or state.

### `@Getter` and `@Setter`

The bread and butter of Java Beans. Lombok-generated getters and setters are indistinguishable from hand-written ones, whether using field or property access.

```java
@Entity
@Getter
@Setter
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String username;
    private String email;
}
```

```java
User user = new User();
user.setUsername("John");
user.setEmail("johnny@boy.com")

LOG.info("Username: {}", user.getUsername());
LOG.info("Email: {}", user.getEmail());
```

### `@Builder`

The Builder pattern is fantastic for constructing complex objects, and `@Builder` makes it really easy. It doesn't interfere with persistence lifecycle or entity state.

```java
@Entity
@Getter
@Builder
public class Post {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;
    private String description;
}
```

```java
Post post = Post.builder()
                .title("How to use Lombok effectively ?")
                .description("There is probably a good blog post on that subject!")
                .build();

LOG.info("Title: {}", post.getTitle());
LOG.info("Description: {}", post.getDescription());
```

## Lombok on JPA entities

On `@Entity` classes, issues often stem from interactions with lazy loading, bidirectional relationships, and implicit bundling.

### `@ToString`

#### Problem 1: Stack overflow on bidirectional relationships

This is the most classic issue. Imagine a standard bidirectional relationship: a `User` has many `Post`s, and each `Post` belongs to a `User`.

```java
@Entity
@ToString
public class User {
    // ...
    @OneToMany(mappedBy = "user")
    private List<Post> posts = new ArrayList<>();
}
```

```java
@Entity
@ToString
public class Post {
    // ...
    @ManyToOne
    private User user;
}
```

If you try something like that:

```java
Optional<User> user = userRepository.findById(1L);
user.ifPresent(usr -> LOG.info("User: {}", usr));
```

Or like that:

```java
List<Post> user = userRepository.findById(1L);
user.ifPresent(usr -> LOG.info("Posts from user {}: {}", usr.getUsername(), usr.getPosts()));
```

You will get a `StackOverflowError`.
Here's why.

When you use Lombok's `@ToString` on entities with bidirectional relationships (e.g., a User has many Posts, and each Post references its User), logging an entity also logs its relationships.

Lombok generates a `toString()` method that includes all fields.
This is a circular reference: calling `user.toString()` triggers `posts.toString()`, which calls each `post.toString()`, which in turn calls `user.toString()` again...

It creates an infinite recursion: user → posts → post → user → ...
Eventually, the call stack overflows, resulting in a `StackOverflowError`.

#### Problem 2: Lazy loading

Even without bidirectionality, `@ToString` can cause major performance issues. JPA's lazy loading means associations aren't fetched until accessed. Lombok's `toString()` accesses _all_ fields, triggering unexpected loads.

```java
@Entity
@ToString
public class User {
    // ...
    @OneToMany(fetch = FetchType.LAZY)
    private List<Post> posts = new ArrayList<>();
}
```

```java
Optional<User> user = userRepository.findById(1L);
user.ifPresent(usr -> LOG.info("User: {}", usr));
```

Here, `posts` is a [PersistenceBag](https://docs.hibernate.org/stable/core/javadocs/org/hibernate/collection/spi/PersistentBag.html) that will be initialized when the logger calls `posts.toString()`.
If `posts` contains thousands of `Post`, they will all be fetched.

This leads to:

1. **Unexpected Database Hits:** Your simple log now queries the DB.
2. **N+1 Query Problem:** In a loop, it generates a lot of extra queries.
3. **LazyInitializationException:** Can be thrown if the session is closed.

#### Solutions

##### Excluding the fields

Use `@ToString(exclude = "posts")` or `@ToString.Exclude` on problematic fields.

```java
@Entity
@Getter
@ToString(exclude = "posts")
public class User {
    // ...
    @OneToMany(fetch = FetchType.LAZY)
    private List<Post> posts = new ArrayList<>();
}
```

```java
@Entity
@Getter
@ToString
public class Post {
    // ...
    @ManyToOne
    @ToString.Exclude // Prevents back-reference recursion
    private User user;
}
```

##### Overriding `toString()`

To have a fine-grained control on the serialization of the entities, you can override the `toString()` method:

```java
@Override
public String toString() {
    return "User{" +
            "id=" + id +
            ", username='" + username + "'" +
            "}";
}
```

```java
@Override
public String toString() {
    return "Post{" +
            "id=" + id +
            ", title='" + title + '\'' +
            ", description='" + description + '\'' +
            "}";
}
```

### `@EqualsAndHashCode`

Similar risks apply to `@ToString`: it accesses all fields, which can trigger lazy loading or cause recursion.
Avoid using it on entities unless explicitly configured with `@EqualsAndHashCode(onlyExplicitlyIncluded = true)`.
In most cases, you don’t need it, and even when you do, it’s usually better to implement these methods manually, so you can define equality according to your own rules.

### `@Data`: All-in-One Problem

`@Data` bundles `@Getter`, `@Setter`, `@RequiredArgsConstructor`, `@ToString`, and `@EqualsAndHashCode`.

```java
@Entity
@Data // Includes @ToString and @EqualsAndHashCode
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String username;

    @OneToMany(fetch = FetchType.LAZY)
    private List<Post> posts = new ArrayList<>();
}
```

As stated in the Lombok documentation, `@Data` is primarly designed for simple POJOs<sup><a href="#ref1">[1]</a></sup> (i.e. for DTOs and value objects).

For an entity, it is better to be explicit:

```java
@Entity
@Setter
@Getter
@AllArgsConstructor
@NoArgsConstructor
@ToString(exclude = "posts") // Explicit about toString
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private final Long id;

    private String username;

    @OneToMany(fetch = FetchType.LAZY)
    private List<Post> posts = new ArrayList<>();
}
```

## Dependency Injection in Spring

### `@AllArgsConstructor`

A common pattern I see regurlarly is using `@AllArgsConstructor` on a Spring `@Service` or `@Component` for constructor injection:

```java
@Service
@AllArgsConstructor
public class UserService {
    @Value("${property}")
    private String springManagedProperty;

    private final UserRepository userRepository;
    private final EmailService emailService;
}
```

This seems like a perfectly fine solution at first.

But here's the catch:

As its name suggests, `@AllArgsConstructor` includes all fields, whether it should or not.
It cannot distinguish legitimate dependencies from fields annotated with `@Value`.

#### Solutions

##### Use `@RequiredArgsConstructor`

Prefer `@RequiredArgsConstructor` with `final` fields (only mandatory dependencies).

```java
@Service
@RequiredArgsConstructor
public class UserService {
    @Value("${property}")
    private String springManagedProperty;

    private final UserRepository userRepository;
    private final EmailService emailService;
}
```

##### Implement the constructor manually

You can also implement the constructor yourself.

```java
@Service
@RequiredArgsConstructor
public class UserService {
    @Value("${property}")
    private String springManagedProperty;

    private final UserRepository userRepository;
    private final EmailService emailService;

    public UserService(UserRepository userRepository, EmailService emailService) {
        this.userRepository = userRepository;
        this.emailService = emailService;
    }
}
```

Benefits:

1. **Safety:** Clear boundary between dependancies and value attributes.
2. **Immutability:** Promotes good design and thread safety.
3. **Spring Compatibility:** Works perfectly with the recommended constructor injection.

## Wrapping up

**Golden Rule**: Understand what Lombok annotations do under the hood before pasting them on your classes.

| Annotation                 | Safe for              | Potential Risks               | Alternative / Recommendation         |
| -------------------------- | --------------------- | ----------------------------- | ------------------------------------ |
| `@Getter` / `@Setter`      | All                   | None                          | -                                    |
| `@Builder`                 | All                   | None                          | -                                    |
| `@ToString`                | DTOs, simple entities | Recursion, lazy loading (JPA) | `@ToString(exclude=...)`             |
| `@EqualsAndHashCode`       | DTOs                  | Lazy loading (JPA)            | Avoid or configure explicitly        |
| `@Data`                    | DTOs / value objects  | Bundles risks on entities     | Avoid on JPA                         |
| `@AllArgsConstructor`      | Rarely                | Bypasses `@Value` / non-final | `@RequiredArgsConstructor` + `final` |
| `@RequiredArgsConstructor` | Spring beans          | None (if `final` fields used) | Preferred for DI                     |

## References

1. <a id="ref1"></a>[Lombok documentation for @Data](https://projectlombok.org/features/Data)
2. [Lombok documentation](https://projectlombok.org/features/)
