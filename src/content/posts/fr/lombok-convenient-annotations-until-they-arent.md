---
title: |
  Lombok : des annotations pratiques, jusqu'à un certain point
description: "Certaines annotations Lombok peuvent vous jouer de mauvais tours. Découvrez comment éviter leurs comportements indésirables et leurs effets de bord."
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

Lombok est depuis longtemps une véritable aubaine pour les développeurs Java, et le reste encore aujourd'hui.
Il nous libère du fardeau du code répétitif et fastidieux, rendant nos classes plus propres, plus lisibles et plus faciles à maintenir.

Mais, comme tout outil puissant, la commodité peut parfois masquer des pièges subtils.

Cet article vous donnera les clés pour les éviter et faire des choix éclairés et réfléchis.

## Lombok en terrain sûr

Certaines annotations sont simples, directes, et n'interfèrent avec aucun cycle de vie ni état.

### `@Getter` et `@Setter`

Le pain quotidien des Java Beans. Les getters et setters générés par Lombok sont indiscernables de ceux écrits à la main, que l'on utilise l'accès par champ ou par propriété.

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
user.setEmail("johnny@boy.com");

LOG.info("Username: {}", user.getUsername());
LOG.info("Email: {}", user.getEmail());
```

### `@Builder`

Le pattern Builder est idéal pour construire des objets complexes, et `@Builder` le rend particulièrement accessible. Il n'interfère pas avec le cycle de vie de la persistance ni avec l'état des entités.

```java
@Entity
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
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
                .title("How to use Lombok effectively?")
                .description("There is probably a good blog post on that subject!")
                .build();

LOG.info("Title: {}", post.getTitle());
LOG.info("Description: {}", post.getDescription());
```

## Lombok sur les entités JPA

Sur les classes annotées `@Entity`, les problèmes proviennent souvent des interactions avec le chargement paresseux, les relations bidirectionnelles et le regroupement implicite d'annotations.

### `@ToString`

#### Problème 1 : Stack overflow sur les relations bidirectionnelles

C'est le problème le plus classique. Imaginons une relation bidirectionnelle standard : un `User` possède plusieurs `Post`s, et chaque `Post` appartient à un `User`.

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

Si vous tentez quelque chose comme ça :

```java
Optional<User> user = userRepository.findById(1L);
user.ifPresent(usr -> LOG.info("User: {}", usr));
```

Ou comme ça :

```java
Optional<User> user = userRepository.findById(1L);
user.ifPresent(usr -> LOG.info("Posts from user {}: {}", usr.getUsername(), usr.getPosts()));
```

Vous obtiendrez une `StackOverflowError`.
Voici pourquoi.

Lorsque vous utilisez `@ToString` de Lombok sur des entités avec des relations bidirectionnelles (par exemple, un User a plusieurs Posts, et chaque Post référence son User), journaliser une entité revient aussi à journaliser ses relations.

Lombok génère une méthode `toString()` qui inclut tous les champs.
Cela crée une référence circulaire : appeler `user.toString()` déclenche `posts.toString()`, qui appelle `post.toString()` sur chaque élément, lequel rappelle à son tour `user.toString()`...

Il s'ensuit une récursion infinie : user → posts → post → user → ...
La pile d'appels finit par déborder, provoquant une `StackOverflowError`.

#### Problème 2 : Chargement paresseux

Même sans bidirectionnalité, `@ToString` peut engendrer de sérieux problèmes de performance. Le chargement paresseux de JPA signifie que les associations ne sont récupérées qu'au moment où on y accède. La méthode `toString()` de Lombok accède à _tous_ les champs, déclenchant des chargements inattendus.

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

Ici, `posts` est un [PersistenceBag](https://docs.hibernate.org/stable/core/javadocs/org/hibernate/collection/spi/PersistentBag.html) qui sera initialisé lorsque le logger appellera `posts.toString()`.
Si `posts` contient des milliers de `Post`, ils seront tous chargés.

Cela entraîne :

1. **Des requêtes en base inattendues :** Un simple log peut déclencher une requête SQL.
2. **Le problème des N+1 requêtes :** Dans une boucle, cela génère un grand nombre de requêtes supplémentaires.
3. **Une `LazyInitializationException` :** Peut être levée si la session est déjà fermée.

#### Solutions

##### Exclure les champs problématiques

Utilisez `@ToString(exclude = "posts")` ou l'annotation `@ToString.Exclude` sur les champs concernés.

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

##### Redéfinir `toString()`

Pour un contrôle fin sur la sérialisation des entités, vous pouvez redéfinir la méthode `toString()` :

```java
@Override
public String toString() {
    return "User{" +
            "id=" + id +
            ", username='" + username + "\'" +
            "}";
}
```

```java
@Override
public String toString() {
    return "Post{" +
            "id=" + id +
            ", title='" + title + "\'" +
            ", description='" + description + "\'" +
            "}";
}
```

### `@EqualsAndHashCode`

Les mêmes risques s'appliquent qu'avec `@ToString` : la méthode accède à tous les champs, ce qui peut déclencher un chargement paresseux ou provoquer une récursion.
Évitez de l'utiliser sur des entités, sauf si vous le configurez explicitement avec `@EqualsAndHashCode(onlyExplicitlyIncluded = true)`.
Dans la plupart des cas, vous n'en avez pas besoin, et même quand c'est nécessaire, il vaut mieux implémenter ces méthodes manuellement pour définir l'égalité selon vos propres règles.

### `@Data` : le problème du tout-en-un

`@Data` regroupe `@Getter`, `@Setter`, `@RequiredArgsConstructor`, `@ToString` et `@EqualsAndHashCode`.

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

Comme indiqué dans la documentation de Lombok, `@Data` est principalement conçu pour les POJOs simples<sup><a href="#ref1">[1]</a></sup> (c'est-à-dire pour les DTOs et les objets-valeur).

Sur une entité, il vaut mieux être explicite :

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
    private Long id;

    private String username;

    @OneToMany(fetch = FetchType.LAZY)
    private List<Post> posts = new ArrayList<>();
}
```

## Injection de dépendances avec Spring

### `@AllArgsConstructor`

Un pattern que je vois régulièrement consiste à utiliser `@AllArgsConstructor` sur un `@Service` ou un `@Component` Spring pour l'injection par constructeur :

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

Cela semble tout à fait raisonnable au premier abord.

Mais voici le piège :

Comme son nom l'indique, `@AllArgsConstructor` inclut tous les champs, qu'il le devrait ou non.
Il est incapable de distinguer les vraies dépendances des champs annotés avec `@Value`.

#### Solutions

##### Utiliser `@RequiredArgsConstructor`

Préférez `@RequiredArgsConstructor` avec des champs `final` (uniquement les dépendances obligatoires).

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

##### Implémenter le constructeur manuellement

Vous pouvez également écrire le constructeur vous-même.

```java
@Service
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

Avantages :

1. **Sécurité :** La frontière entre dépendances et attributs de valeur est clairement définie.
2. **Immutabilité :** Favorise une bonne conception et la sécurité des threads.
3. **Compatibilité Spring :** Fonctionne parfaitement avec l'injection par constructeur recommandée.

## En résumé

**Règle d'or** : Comprendre ce que font les annotations Lombok sous le capot avant de les apposer sur vos classes.

| Annotation                 | Adapté pour                               | Risques potentiels                    | Alternative / Recommandation         |
| -------------------------- | ----------------------------------------- | ------------------------------------- | ------------------------------------ |
| `@Getter` / `@Setter`      | Tout                                      | Aucun                                 | -                                    |
| `@Builder`                 | Tout (avec `@NoArgsConstructor` pour JPA) | Constructeur sans argument manquant   | Ajouter `@NoArgsConstructor`         |
| `@ToString`                | DTOs, entités simples                     | Récursion, chargement paresseux (JPA) | `@ToString(exclude=...)`             |
| `@EqualsAndHashCode`       | DTOs                                      | Chargement paresseux (JPA)            | Éviter ou configurer explicitement   |
| `@Data`                    | DTOs / objets-valeur                      | Cumule les risques sur les entités    | Éviter sur JPA                       |
| `@AllArgsConstructor`      | Rarement                                  | Court-circuite `@Value` / non-final   | `@RequiredArgsConstructor` + `final` |
| `@RequiredArgsConstructor` | Beans Spring                              | Aucun (avec des champs `final`)       | Préféré pour l'injection             |

## Références

1. <a id="ref1"></a>[Documentation Lombok pour @Data](https://projectlombok.org/features/Data)
2. [Documentation Lombok](https://projectlombok.org/features/)
3. [Lombok and JPA: What may go wrong?](https://jpa-buddy.com/blog/lombok-and-jpa-what-may-go-wrong/)
