---
title: "Guide pour une utilisation efficace de Pattern"
description: "Conseils pour tirer le meilleur parti de la classe Pattern, tout en évitant les pièges courants"
pubDate: 2025-10-18
tags:
  ["java", "pattern", "regex", "performance", "capturing-groups", "globbing"]
draft: false
---

Les expressions régulières sont un outil puissant dans l'arsenal de tout développeur Java. Elles permettent de valider des entrées, d'analyser des chaînes de caractères et d'effectuer des transformations textuelles complexes en quelques lignes de code. Cependant, cette puissance s'accompagne d'un coût en performance, souvent caché, si on ne l'utilise pas correctement.

La clé pour exploiter efficacement les regex en Java réside dans la compréhension de la classe `java.util.regex.Pattern`. Dans cet article, nous allons explorer les bonnes pratiques d'utilisation de `Pattern`, comment éviter les pièges de performance courants, et pourquoi il faut se méfier des méthodes regex « pratiques » de la classe `String`.

## La règle d'or : compiler une fois, utiliser plusieurs fois

Le concept le plus important à assimiler est que la compilation d'une expression régulière est une opération coûteuse. Lorsque vous appelez `Pattern.compile()`, Java prend votre chaîne regex, l'analyse et construit une représentation interne (souvent un automate fini) qu'il peut utiliser pour la correspondance. Ce processus consomme des cycles CPU.

L'objet `Pattern` lui-même est une représentation compilée et immuable de votre regex. Il est thread-safe et peut être réutilisé indéfiniment. Le `Matcher`, en revanche, est un moteur à état qui effectue l'opération de correspondance réelle sur une chaîne d'entrée donnée.

Voici la manière standard et correcte d'utiliser l'API regex :

```java
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class RegexExample {

    // Une regex simple pour valider une adresse email
    private static final String EMAIL_REGEX = "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$";

    public static void main(String[] args) {
        String email1 = "test.user@example.com";
        String email2 = "not-an-email";

        // 1. Compile la regex UNE SEULE FOIS
        Pattern pattern = Pattern.compile(EMAIL_REGEX, Pattern.CASE_INSENSITIVE);

        // 2. Crée un Matcher pour la première entrée
        Matcher matcher1 = pattern.matcher(email1);
        if (matcher1.matches()) {
            System.out.println("'" + email1 + "' is a valid email.");
        }

        // 3. Réutilise le MÊME objet Pattern pour la seconde entrée
        Matcher matcher2 = pattern.matcher(email2);
        if (!matcher2.matches()) {
            System.out.println("'" + email2 + "' is NOT a valid email.");
        }
    }
}
```

À retenir : Le `Pattern` est le plan de construction ; le `Matcher` est l'ouvrier. On crée le plan une seule fois et on l'utilise pour créer autant d'ouvriers que nécessaire.

## Le piège de performance : pourquoi éviter de recompiler

L'erreur la plus fréquente consiste à placer `Pattern.compile()` dans une boucle ou dans une méthode appelée fréquemment. Cela force la JVM à recompiler le même pattern à chaque itération, ce qui engendre une dégradation significative des performances.

Appeler `Pattern.compile()` a un coût multidimensionnel :

- CPU : la compilation d'une expression régulière (par exemple, la traduction d'une regex textuelle en une structure bytecode interne) est coûteuse en calcul et peut consommer des ressources CPU importantes, surtout si la regex est complexe.
- Mémoire : un `Pattern` compilé est l'un des objets Java les plus gourmands en mémoire<sup><a href="#ref1">[1]</a></sup>.
- Garbage Collection : créer et abandonner fréquemment des instances de `Pattern` accroît la pression sur le ramasse-miettes, car ces objets lourds doivent être récupérés, ce qui peut déclencher des cycles GC plus fréquents ou plus longs.

### La mauvaise approche (inefficace)

````java
public void processLines(List<String> lines) {
    for (String line : lines) {
        // Le Pattern est recompilé à chaque itération
        if (line.matches("\\d+")) {
            // traite le nombre
        }
    }
}

### La bonne approche

La meilleure pratique pour les patterns utilisés de façon répétée est de les compiler une seule fois et de les stocker dans un champ `private static final`. Cela garantit que le pattern n'est compilé qu'une seule fois, au chargement de la classe.

```java
import java.util.regex.Pattern;

public class LineProcessor {
    // Compilé une fois et stocké comme constante.
    private static final Pattern NUMERIC_PATTERN = Pattern.compile("\\d+");

    public void processLines(List<String> lines) {
        for (String line : lines) {
            // Utilise le pattern précompilé
            if (NUMERIC_PATTERN.matcher(line).matches()) {
                // traite le nombre
        }
    }
}
````

En sortant la compilation de la boucle, on obtient un gain de performance considérable, particulièrement lorsqu'on traite des milliers ou des millions de chaînes.

## Attention aux raccourcis : le piège des méthodes regex de `String`

La classe `String` de Java propose plusieurs méthodes pratiques qui acceptent une regex sous forme de chaîne de caractères :

- `matches(String regex)`
- `split(String regex)`
- `split(String regex, int limit)`
- `replaceAll(String regex, String replacement)`
- `replaceFirst(String regex, String replacement)`.

Aussi tentantes qu'elles soient par leur simplicité, elles cachent un secret gênant : chacune de ces méthodes recompile le pattern regex en interne.

Comme l'indique la javadoc<sup><a href="#ref2">[2]</a></sup> :

> An invocation of this method of the form str.matches(regex) yields exactly the same result as the expression
> Pattern.matches(regex, str)

Par exemple, cette ligne de code :

```java
boolean isNumeric = "12345".matches("\\d+");
```

fait essentiellement ceci sous le capot :

```java
boolean isNumeric = Pattern.compile("\\d+").matcher("12345").matches();
```

Si vous appelez `"12345".matches("\\d+")` dans une boucle, vous recompilez le pattern `\\d+` à chaque itération.

### Règle pratique

- Pour des opérations ponctuelles et non critiques en termes de performance, utiliser `String.matches()` est tout à fait acceptable.
- Pour tout code dans un chemin critique, une boucle ou une méthode appelée fréquemment (comme un gestionnaire de requêtes web), il est impératif d'utiliser un `static final Pattern` précompilé.

### Comparaison

```java
// Inefficace : compile la regex à chaque appel
public boolean isEmailValid(String email) {
    return email.matches("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$");
}

// Efficace : utilise le pattern précompilé
public class EmailValidator {
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$", Pattern.CASE_INSENSITIVE);

    public boolean isEmailValid(String email) {
        return EMAIL_PATTERN.matcher(email).matches();
    }
}
```

### Apache Commons Lang

Ce problème se retrouve également dans le package Apache Commons Lang :

- `RegExUtils.java`<sup><a href="#ref3">[3]</a></sup> : classe utilitaire proposant des méthodes comme `replaceFirst` ou `replaceAll`

## Conseil avancé

### Mise en cache de patterns dynamiques

Que faire si vous ne connaissez pas la regex au moment de la compilation ? Par exemple, vous pourriez lire des patterns regex depuis un fichier de configuration. Dans ce cas, impossible d'utiliser un champ `static final`.

La solution consiste à implémenter un cache. Une `ConcurrentHashMap` est idéale pour cela, car elle est thread-safe.

```java
import java.util.regex.Pattern;
import java.util.concurrent.ConcurrentHashMap;

public class PatternCache {
    // Un cache thread-safe pour les patterns compilés
    private static final ConcurrentHashMap<String, Pattern> CACHE = new ConcurrentHashMap<>();

    /**
     * Returns a compiled Pattern, either from the cache or by compiling it for the first time.
     * @param regex The regex string to compile.
     * @return The compiled Pattern object.
     */
    public static Pattern compile(String regex) {
        // computeIfAbsent est une opération atomique. Elle récupère la valeur ou la calcule si absente.
        return CACHE.computeIfAbsent(regex, Pattern::compile);
    }
}

// Usage:
public class DynamicRegexService {
    public void validateInput(String input, String regex) {
        Pattern pattern = PatternCache.compile(regex); // Récupère depuis le cache ou compile
        if (pattern.matcher(input).matches()) {
            System.out.println("Input matches the dynamic regex!");
        }
    }
}
```

Cette approche garantit que chaque chaîne regex unique n'est compilée qu'une seule fois, quel que soit le nombre de fois où elle est utilisée.

## Attention aux groupes capturants : utilisez les groupes judicieusement

Les groupes capturants sont l'une des fonctionnalités les plus utiles des regex, ils permettent d'extraire les parties de l'entrée qui comptent vraiment. Mais ils comportent certains pièges de conception et, dans certains cas, un coût en performance.

### Le coût (étonnamment faible) des groupes capturants

Chaque fois que le moteur regex rencontre `(...)`, il pourrait enregistrer la position de début et de fin pour une récupération ultérieure via `matcher.group(N)`. En pratique, sur un JDK moderne (25+), le JIT est assez intelligent pour optimiser les captures inutilisées. Les benchmarks montrent :

| Benchmark                                  | Score        | vs Non-Capturant |
| ------------------------------------------ | ------------ | ---------------- |
| `CapturingGroupsBenchmark.capturingUnused` | 24 314 ns/op | ~2% plus lent    |
| `CapturingGroupsBenchmark.nonCapturing`    | 24 858 ns/op | référence        |

Pour 1 000 correspondances sur un pattern simple, la différence est négligeable, les groupes capturants inutilisés ont un coût quasi nul sur les JVM modernes.

Cependant, le coût change radicalement lorsque vous extrayez réellement les groupes :

| Benchmark                                            | Score        | vs Référence |
| ---------------------------------------------------- | ------------ | ------------ |
| `CapturingGroupsBenchmark.positionalGroupExtraction` | 33 282 ns/op | +37%         |
| `CapturingGroupsBenchmark.namedGroupExtraction`      | 64 974 ns/op | +167%        |

La leçon : les captures sont sans problème tant que vous les utilisez. Le gaspillage ne vient pas des groupes inutilisés (le JIT s'en charge) mais des extractions inutiles. Si vous n'avez pas besoin du texte capturé, n'appelez pas `matcher.group()`, ou utilisez des groupes non capturants comme documentation d'intention.

### Groupes non capturants `(?:...)`

La syntaxe `(?:...)` groupe des sous-expressions comme `(...)`, mais indique au lecteur : _j'ai seulement besoin de grouper, pas de capturer_.

```java
// Capturant -> signale l'intention d'extraire
Pattern.compile("(\\d+)-(\\w+)");

// Non capturant -> signale « simple groupement »
Pattern.compile("(?:\\d+)-(?:\\w+)");
```

Bonnes pratiques : Utilisez `(?:...)` comme constructeur de groupement par défaut. Il communique l'intention même quand la différence de performance est faible.

### Groupes capturants nommés `(?<name>...)`

Java 7 a introduit les groupes capturants nommés. Au lieu de mémoriser des indices positionnels :

```java
// Positionnel -> fragile, difficile à refactoriser
Pattern p = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})");
Matcher m = p.matcher("2025-10-18");
if (m.matches()) {
    String year = m.group(1);  // que signifiait le groupe 1 déjà ?
    String month = m.group(2);
}
```

Utilisez les groupes nommés pour plus de clarté et de maintenabilité :

```java
// Nommé -> auto-documenté, indépendant de l'ordre
Pattern p = Pattern.compile("(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})");
Matcher m = p.matcher("2025-10-18");
if (m.matches()) {
    String year = m.group("year");
    String month = m.group("month");
    String day = m.group("day");
}
```

Attention au compromis : l'accès à un groupe nommé (`m.group("name")`) est ~2x plus lent que positionnel (`m.group(1)`) car il effectue une recherche dans une HashMap. Utilisez les groupes nommés pour la lisibilité dans les chemins non critiques ; préférez les groupes positionnels dans les boucles d'extraction critiques en performance.

### Attention aux rétroréférences

Les rétroréférences (`\1`, `\2`, ... ou `\k<name>`) permettent de retrouver le même texte qu'un groupe précédent a capturé :

```java
// Correspond à « foo-foo » mais pas à « foo-bar »
Pattern.compile("(\\w+)-\\1");
```

Bien que puissantes, les rétroréférences :

- Forcent le backtracking : le moteur regex de Java est basé sur NFA et inclut normalement des optimisations de mémorisation (JDK-6328855)<sup><a href="#ref4">[4]</a></sup> pour atténuer le temps exponentiel. Ces optimisations sont explicitement désactivées en présence de rétroréférences, car elles ne peuvent pas être modélisées dans un DFA.
- Peuvent déclencher un catastrophique backtracking : surtout lorsqu'elles sont imbriquées ou combinées avec des quantificateurs.
- Désactivent certaines optimisations : les patterns avec rétroréférences ne peuvent pas être accélérés avec `Pattern.LITERAL` ou certaines approches basées sur DFA.

Utilisez les rétroréférences avec parcimonie et uniquement dans les chemins non critiques. Lorsqu'elles sont utilisées dans des patterns dynamiques (chargés depuis une configuration), validez la longueur et la complexité de la regex pour éviter les risques de ReDoS.

## Au-delà de la compilation : performance de la correspondance

L'efficacité de la compilation n'est que la moitié de l'histoire. La façon dont vous _utilisez_ le `Pattern` et le `Matcher` pour la correspondance réelle peut également faire une grande différence, surtout sur des entrées volumineuses ou dans des boucles serrées.

### Borner la recherche avec `region()`

Par défaut, un `Matcher` opère sur la totalité de la chaîne d'entrée. Si vous avez seulement besoin de rechercher dans une portion spécifique, utilisez `region()` pour contraindre la zone de balayage du moteur :

```java
String document = // ... chaîne potentiellement très volumineuse
Pattern pattern = Pattern.compile("error");
Matcher matcher = pattern.matcher(document);

// Rechercher uniquement dans les 10 000 premiers caractères
matcher.region(0, 10_000);
if (matcher.find()) {
    // trouvé tôt, évite de scanner le reste
}
```

C'est particulièrement utile pour l'analyse de logs ou le traitement de gros volumes de données où le motif d'intérêt apparaît près du début.

### Quantificateurs possessifs : couper le backtracking

Les quantificateurs gourmands (`*`, `+`, `?`) essaient de correspondre au maximum, puis reviennent en arrière si le reste du pattern échoue. Les quantificateurs possessifs (`*+`, `++`, `?+`) se comportent de la même manière mais ne reviennent jamais en arrière. Si le reste du pattern échoue, il échoue immédiatement, sans backtracking.

```java
// Gourmand -> reviendra en arrière si « .txt » ne correspond pas
Pattern.compile(".*\\.txt");

// Possessif -> échoue rapidement, pas de backtracking
Pattern.compile(".*+\\.txt");
```

Les benchmarks sur une entrée de 500 caractères sans correspondance confirment l'impact :

| Benchmark                                                | Score     | vs Gourmand      |
| -------------------------------------------------------- | --------- | ---------------- |
| `PossessiveQuantifierBenchmark.greedySuffixMatching`     | 607 ns/op | référence        |
| `PossessiveQuantifierBenchmark.possessiveSuffixMatching` | 330 ns/op | 1,8x plus rapide |

Sur des chaînes plus longues, l'écart croît proportionnellement, la version gourmande revient en arrière caractère par caractère, tandis que la version possessive échoue en un seul passage.

### Groupes atomiques `(?>...)`

Les groupes atomiques sont un outil plus général : une fois que le groupe correspond, le moteur ne revient jamais en arrière pour le réévaluer.

```java
// Sans groupe atomique -> le moteur peut essayer différentes façons de correspondre à « \\d+ »
Pattern.compile("(\\d+):\\d+");

// Avec groupe atomique -> une fois les chiffres consommés, jamais reconsidéré
Pattern.compile("(?>\\d+):\\d+");
```

C'est particulièrement utile dans les patterns qui pourraient autrement souffrir d'un catastrophique backtracking. Les groupes atomiques agissent comme un coupe-circuit.

### Catastrophique backtracking

Certains patterns peuvent entraîner un temps d'exécution exponentiel en raison de quantificateurs imbriqués et du backtracking :

```java
// DANGEREUX -> quantificateurs imbriqués sur des patterns qui se chevauchent
Pattern.compile("(a+)+b");
```

Avec une entrée comme `"aaaaaaaaac"`, le moteur essaie toutes les façons possibles de partitionner les `a` entre le `+` interne et externe avant d'admettre l'échec. Sur JDK 25, avec 22 caractères de `a` :

| Benchmark                                                | Score       | Ralentissement |
| -------------------------------------------------------- | ----------- | -------------- |
| `PossessiveQuantifierBenchmark.catastrophicBacktracking` | 1 312 ns/op | 57x            |
| `PossessiveQuantifierBenchmark.atomicGroupFix`           | 23 ns/op    | référence      |
| `PossessiveQuantifierBenchmark.possessiveFix`            | 28 ns/op    | référence      |

Le JDK moderne inclut des optimisations de mémorisation (JDK-6328855)<sup><a href="#ref4">[4]</a></sup> qui atténuent les cas simples, mais l'écart croît de façon exponentielle avec la longueur de l'entrée. À partir de 30 caractères, la différence devient astronomique. Et lorsque des rétroréférences sont présentes, les atténuations sont complètement désactivées.

Comment se protéger :

- Utilisez les quantificateurs possessifs `++` et les groupes atomiques `(?>...)` pour éliminer les branches de backtracking.
- Gardez les patterns simples dans les chemins critiques.
- Pour les regex dynamiques ou fournies par l'utilisateur (ex. depuis l'exemple de cache ci-dessus), imposez un délai d'attente via `Matcher.usePattern()` ou exécutez la correspondance avec un délai sur le thread.

## Restez en sécurité : échappez les entrées utilisateur avec `Pattern.quote()`

Lorsque vous intégrez des chaînes fournies par l'utilisateur dans une regex, vous devez échapper tous les caractères spéciaux (`.`, `*`, `+`, `(`, `)`, `[`, `]`, etc.) pour éviter un comportement inattendu, ou pire, des attaques par injection.

```java
// NON SÉCURISÉ -> l'entrée utilisateur est traitée comme une regex
String userInput = getSearchTerm();  // pourrait contenir « .* »
Pattern pattern = Pattern.compile(".*" + userInput + ".*");
```

Utilisez `Pattern.quote()` pour traiter une entrée arbitraire comme du texte littéral :

```java
// SÉCURISÉ -> l'entrée utilisateur est échappée
String userInput = getSearchTerm();
Pattern pattern = Pattern.compile(".*" + Pattern.quote(userInput) + ".*");
```

`Pattern.quote()` encapsule l'entrée dans `\Q...\E`, ce qui indique au moteur regex de traiter tout ce qui se trouve à l'intérieur comme des caractères littéraux. Il gère également un cas limite subtil : si l'entrée elle-même contient `\E`, il échappe les séquences `\E` intégrées pour éviter une terminaison prématurée du marqueur<sup><a href="#ref5">[5]</a></sup>. Échappez toujours le contenu dynamique avant de l'intégrer dans une regex.

Mais cela a-t-il un coût ? Les benchmarks disent : pratiquement aucun. Le surcoût de compilation du marquage est minime, et à l'exécution il n'y a aucune différence mesurable :

| Benchmark                                            | Score    | Différence         |
| ---------------------------------------------------- | -------- | ------------------ |
| `PatternQuoteBenchmark.compileWithoutQuoteSafeInput` | 55 ns/op | référence          |
| `PatternQuoteBenchmark.compileWithQuoteSafeInput`    | 77 ns/op | +22 ns compilation |
| `PatternQuoteBenchmark.unquotedSafeMatchingMatch`    | 65 ns/op | référence          |
| `PatternQuoteBenchmark.quotedSafeMatchingMatch`      | 65 ns/op | identique          |

Il n'y a aucune raison de performance pour sauter `Pattern.quote()`. Le bénéfice en sécurité l'emporte largement sur le minuscule coût de compilation.

Il en va de même pour les méthodes de `String` :

```java
// NON SÉCURISÉ
String result = text.replaceAll(userInput, "REDACTED");

// SÉCURISÉ
String result = text.replaceAll(Pattern.quote(userInput), "REDACTED");
```

Remarque : Cela complète la section sur le cache ci-dessus. Si vous mettez en cache des patterns dynamiques qui incluent des entrées utilisateur, échappez l'entrée _avant_ de compiler et de mettre en cache.

## API moderne de Pattern : des méthodes que vous avez peut-être manquées

Java 8 et les versions ultérieures ont ajouté plusieurs méthodes pratiques à `Pattern` qui réduisent le code standard et s'intègrent mieux avec les idiomes Java modernes. Note : ce sont des méthodes de commodité, pas des optimisations de performance, les benchmarks montrent qu'elles sont à peu près équivalentes (ou légèrement plus lentes) que le code manuel équivalent.

### `splitAsStream(CharSequence)`

Au lieu de diviser en un tableau puis de transformer en flux :

```java
// Ancienne manière
Pattern COMMA = Pattern.compile(",");
Stream<String> tokens = Arrays.stream(COMMA.split(input));
```

Utilisez `splitAsStream()` directement (Java 8+) :

```java
// Flux direct -> paresseux, pas de tableau intermédiaire
Pattern COMMA = Pattern.compile(",");
Stream<String> tokens = COMMA.splitAsStream(input);
```

| Benchmark                                        | Score        | Mémoire                   |
| ------------------------------------------------ | ------------ | ------------------------- |
| `ModernPatternAPIBenchmark.splitToArray`         | 11 264 ns/op | alloue String[]           |
| `ModernPatternAPIBenchmark.splitThenArrayStream` | 11 477 ns/op | alloue String[]           |
| `ModernPatternAPIBenchmark.splitToStream`        | 13 409 ns/op | paresseux, pas de tableau |

Lors de la consommation de tous les jetons, `splitAsStream()` est ~19% plus lent que `split()`, la surcharge d'abstraction du flux dépasse l'allocation économisée. La méthode brille lorsque vous traitez seulement les premiers jetons de manière paresseuse, en ignorant le reste sans les générer.

### `asPredicate()` et `asMatchPredicate()`

Lorsque vous devez tester plusieurs chaînes avec le même pattern, ces méthodes fonctionnent avec l'API collections/flux sans avoir à les encapsuler dans une lambda<sup><a href="#ref6">[6]</a></sup> :

```java
Pattern DIGITS = Pattern.compile("\\d+");

// Avec asMatchPredicate() -> correspondance sur toute la chaîne (Java 11+)
List<String> numbers = strings.stream()
    .filter(DIGITS.asMatchPredicate())
    .toList();

// Avec asPredicate() -> correspondance de sous-chaîne (Java 8)
List<String> containsDigits = strings.stream()
    .filter(DIGITS.asPredicate())
    .toList();
```

| Benchmark                                    | Score        | vs Lambda                    |
| -------------------------------------------- | ------------ | ---------------------------- |
| `ModernPatternAPIBenchmark.lambdaMatch`      | 8 677 ns/op  | référence                    |
| `ModernPatternAPIBenchmark.asMatchPredicate` | 9 780 ns/op  | +13%                         |
| `ModernPatternAPIBenchmark.asPredicateFind`  | 14 392 ns/op | +66% (sémantique différente) |

`asMatchPredicate()` est légèrement plus lent qu'une lambda brute en raison de l'abstraction du prédicat. Utilisez-le pour la lisibilité, pas pour la vitesse. `asPredicate()` est notablement plus lent car la sémantique `find()` correspond plus agressivement que `matches()`.

Différence sémantique importante :

- `asPredicate()` utilise `Matcher.find()` : vrai si une sous-chaîne correspond.
- `asMatchPredicate()` utilise `Matcher.matches()` : vrai seulement si la totalité de la chaîne correspond.

```java
Pattern DIGITS = Pattern.compile("\\d+");

// asPredicate() -> « a42b » -> true (trouve « 42 »)
// asMatchPredicate() -> « a42b » -> false (pas que des chiffres)
```

Cela élimine un bogue subtil courant où `asPredicate()` retourne vrai pour des correspondances partielles alors que le développeur s'attendait à une correspondance complète.

### `splitWithDelimiters()` (Java 21)

Java 21 a introduit `Pattern.splitWithDelimiters()`<sup><a href="#ref7">[7]</a></sup> et son équivalent dans `String`. Contrairement à `split()`, qui ignore les délimiteurs, cette méthode retourne à la fois les sous-chaînes et les délimiteurs entrelacés :

```java
Pattern COMMA = Pattern.compile(",");
String[] result = COMMA.splitWithDelimiters("a,b,c", 0);
// ["a", ",", "b", ",", "c"]
```

C'est utile pour les scénarios d'analyse où vous devez préserver ou transformer les délimiteurs avec le contenu.

## Au-delà des regex : quand utiliser le globbing

Toute correspondance de motif n'a pas besoin de regex. Java fournit une syntaxe glob séparée pour la correspondance de noms de fichiers et de chemins. Les globs utilisent une syntaxe générique plus simple et sont souvent plus lisibles pour les motifs orientés fichiers.

### Glob vs regex

| Aspect      | Regex                                    | Glob                                                                                                      |
| ----------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| API Java    | `java.util.regex.Pattern`                | `java.nio.file.FileSystem.getPathMatcher("glob:...")`                                                     |
| `*`         | Zéro ou plus de l'élément précédent      | Zéro ou plusieurs caractères dans un seul composant de chemin (ne traverse pas les limites de répertoire) |
| `?`         | Zéro ou un de l'élément précédent        | Un seul caractère dans un seul composant de chemin                                                        |
| `.`         | N'importe quel caractère                 | Point littéral                                                                                            |
| `**`        | (nécessite un pattern personnalisé)      | Zéro ou plusieurs caractères traversant les limites de répertoire (récursif)                              |
| Cas d'usage | Validation de texte, analyse, extraction | Filtrage de fichiers/répertoires, correspondance de chemins                                               |

### Performance : glob vs regex via `PathMatcher`

`FileSystem.getPathMatcher()` supporte à la fois les préfixes `glob:` et `regex:`. Les benchmarks sur 1 000 chemins montrent une différence claire :

| Benchmark                                 | Score         | vs Regex         |
| ----------------------------------------- | ------------- | ---------------- |
| `PathMatchingBenchmark.globPathMatching`  | 130 399 ns/op | référence        |
| `PathMatchingBenchmark.regexPathMatching` | 71 750 ns/op  | 1,8x plus rapide |

Les patterns glob sont plus lents car ils doivent d'abord être convertis en une représentation regex interne. La conversion a lieu une fois à la création du `PathMatcher`, mais la correspondance elle-même supporte également la surcharge de la couche d'adaptation.

Choisissez glob pour la lisibilité, regex pour la vitesse avec `PathMatcher`.

### Utiliser `PathMatcher` avec les globs

```java
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.PathMatcher;
import java.nio.file.Paths;

// Correspond à tous les fichiers .java
PathMatcher matcher = FileSystems.getDefault()
    .getPathMatcher("glob:*.java");

boolean result = matcher.matches(Paths.get("Main.java"));   // true
boolean result2 = matcher.matches(Paths.get("Main.class")); // false
```

### Patterns glob courants

| Pattern            | Correspond à                                      |
| ------------------ | ------------------------------------------------- |
| `*.java`           | Tout fichier se terminant par `.java`             |
| `build/**/*.class` | Tout fichier `.class` sous `build/` récursivement |
| `src/?at/*`        | Fichiers dans `src/cat/`, `src/hat/`, etc.        |
| `{*.java,*.kt}`    | Fichiers se terminant par `.java` ou `.kt`        |

### Le préfixe `regex:`

Si vous avez déjà un pattern regex, utilisez le préfixe `regex:`, il est plus rapide et évite le coût de conversion glob :

```java
PathMatcher matcher = FileSystems.getDefault()
    .getPathMatcher("regex:.*\\.java");
// Équivalent à glob:*.java, mais ~1,8x plus rapide
```

### Quand choisir quoi

- Utilisez glob pour filtrer des fichiers, répertoires ou chemins, c'est l'API Java idiomatique, plus simple, et plus difficile à mal utiliser.
- Utilisez regex avec `PathMatcher` lorsque vous avez besoin de performance supplémentaire, ou si vous avez déjà un pattern regex.
- Utilisez `java.util.regex.Pattern` pour la validation de texte, l'extraction, les conditions complexes, ou les lookahead/lookbehind en dehors de la correspondance de fichiers.

## Conclusion

Maîtriser la classe `java.util.regex.Pattern` est un moyen simple mais efficace d'améliorer les performances et la robustesse de vos applications Java. En suivant ces recommandations, vous éviterez les pièges courants et produirez un code à la fois propre et performant.

- Compiler une fois : Toujours utiliser `Pattern.compile()` pour créer un objet `Pattern` réutilisable.
- Stocker en `static final` : Pour les patterns regex statiques utilisés fréquemment, les stocker dans un champ `private static final`.
- Se méfier des méthodes de `String` : Éviter `String.matches()`, `String.split()`, etc., dans le code critique en termes de performance. Ces méthodes recompilent la regex à chaque appel.
- Mettre en cache les patterns dynamiques : Pour les regex inconnues au moment de la compilation, utiliser un cache (comme `ConcurrentHashMap`) pour stocker les patterns compilés.
- Préférer les groupes non capturants : Utilisez `(?:...)` par défaut pour signaler l'intention ; passez à `(?<name>...)` pour une extraction lisible dans les chemins non critiques.
- Couper le backtracking avec les quantificateurs possessifs : Utilisez `*+`, `++`, `?+` pour échouer rapidement et éviter le catastrophique backtracking.
- Échapper les entrées utilisateur : Utilisez toujours `Pattern.quote()` lors de l'intégration de chaînes non fiables dans une regex, le surcoût est négligeable.
- Utiliser les méthodes stream-ready : Préférez `splitAsStream()` et `asMatchPredicate()` pour la lisibilité et l'intégration avec le Java moderne.
- Correspondre correctement : Utilisez `asMatchPredicate()` (Java 11) pour les correspondances sur toute la chaîne, `asPredicate()` pour les recherches de sous-chaînes.
- Considérer les API plus récentes : `splitWithDelimiters()` (Java 21) préserve les délimiteurs avec le contenu.
- Choisir glob pour les chemins de fichiers : Utilisez `FileSystem.getPathMatcher("glob:...")` pour la lisibilité ; utilisez le préfixe `regex:` si la performance compte.

En appliquant ces quelques ajustements, vous vous assurez que vos expressions régulières sont non seulement puissantes, mais aussi performantes et prêtes pour la production.

---

## Références

- <a id="ref1"></a>[Demystifying Java Object Sizes: Compact Headers, Compressed Oops, and Beyond](https://blog.vanillajava.blog/2024/12/demystifying-java-object-sizes-compact.html) by Peter Lawrey
- <a id="ref2"></a>[String.matches(String regex)](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html#matches(java.lang.String)>)
- <a id="ref3"></a>[RegExUtils.java](https://github.com/apache/commons-lang/blob/master/src/main/java/org/apache/commons/lang3/RegExUtils.java)
- <a id="ref4"></a>[JDK-6328855 : problèmes de performance de Pattern.matches() avec un temps d'exécution exponentiel](https://bugs.openjdk.org/browse/JDK-6328855)
- <a id="ref5"></a>[Pattern.java : implémentation de Pattern.quote() dans OpenJDK](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/regex/Pattern.java)
- <a id="ref6"></a>[Pattern.asMatchPredicate() : documentation API Java 11+](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/regex/Pattern.html#asMatchPredicate()>)
- <a id="ref7"></a>[JDK-8305486 : ajout de splitWithDelimiters à Pattern et String](https://bugs.openjdk.org/browse/JDK-8305486)

## Demo

Une démonstration des concepts illustrés dans cet article est disponible ici : [regex-performance-benchmark](https://github.com/Hogwai/hogwai.github.io-content/tree/main/regex-performance-benchmark)
