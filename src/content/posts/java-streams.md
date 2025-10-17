---
title: 'Introduction aux Streams Java'
description: 'Découvrez la puissance des Streams pour manipuler des collections en Java'
pubDate: 2025-10-17
tags: ['java', 'streams', 'functional-programming']
draft: false
---

## Qu'est-ce qu'un Stream ?

Les Streams Java, introduits dans Java 8, permettent de traiter des collections de données de manière déclarative et fonctionnelle. Un Stream n'est pas une structure de données, mais une vue sur une source de données qui supporte des opérations de traitement.

## Exemple basique

Voici un exemple simple de filtrage et transformation :

```java
List<String> names = Arrays.asList("Alice", "Bob", "Charlie", "David");

List<String> filtered = names.stream()
    .filter(name -> name.startsWith("A"))
    .map(String::toUpperCase)
    .collect(Collectors.toList());

System.out.println(filtered); // [ALICE]
```

## Opérations intermédiaires vs terminales

### Opérations intermédiaires

Les opérations intermédiaires retournent un nouveau Stream et sont **lazy** (évaluées uniquement quand nécessaire) :

- `filter()` - Filtre les éléments selon un prédicat
- `map()` - Transforme chaque élément
- `sorted()` - Trie les éléments
- `distinct()` - Élimine les doublons
- `limit()` - Limite le nombre d'éléments

### Opérations terminales

Les opérations terminales déclenchent le traitement et retournent un résultat :

- `collect()` - Collecte les résultats dans une collection
- `forEach()` - Itère sur chaque élément
- `reduce()` - Réduit à une valeur unique
- `count()` - Compte les éléments
- `anyMatch()` / `allMatch()` / `noneMatch()` - Vérifie des conditions

## Exemple avancé avec objets

```java
public class Employee {
    private String name;
    private int age;
    private double salary;
    private String department;
    
    // Constructeur, getters, setters...
    
    public Employee(String name, int age, double salary, String department) {
        this.name = name;
        this.age = age;
        this.salary = salary;
        this.department = department;
    }
    
    // Getters...
}

// Utilisation
List<Employee> employees = Arrays.asList(
    new Employee("Alice", 35, 75000, "IT"),
    new Employee("Bob", 28, 55000, "HR"),
    new Employee("Charlie", 42, 85000, "IT"),
    new Employee("David", 31, 65000, "Finance")
);

// Calculer le salaire moyen des employés IT de plus de 30 ans
double avgSalary = employees.stream()
    .filter(e -> e.getDepartment().equals("IT"))
    .filter(e -> e.getAge() > 30)
    .mapToDouble(Employee::getSalary)
    .average()
    .orElse(0.0);

System.out.println("Salaire moyen IT (>30 ans): " + avgSalary);
```

## Groupement et collecteurs avancés

```java
// Grouper les employés par département
Map<String, List<Employee>> byDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::getDepartment));

// Compter les employés par département
Map<String, Long> countByDept = employees.stream()
    .collect(Collectors.groupingBy(
        Employee::getDepartment,
        Collectors.counting()
    ));

// Trouver le salaire max par département
Map<String, Optional<Employee>> maxSalaryByDept = employees.stream()
    .collect(Collectors.groupingBy(
        Employee::getDepartment,
        Collectors.maxBy(Comparator.comparingDouble(Employee::getSalary))
    ));
```

## Parallélisation

Les Streams peuvent être facilement parallélisés pour améliorer les performances sur de grandes collections :

```java
long count = employees.parallelStream()
    .filter(e -> e.getSalary() > 60000)
    .count();
```

**Attention** : La parallélisation a un coût (overhead). Elle n'est bénéfique que pour :

- De grandes collections (> 10 000 éléments)
- Des opérations coûteuses par élément
- Des opérations sans effets de bord

## Bonnes pratiques

1. **Éviter les effets de bord** dans les lambdas - Les Streams doivent être sans état
2. **Ne pas modifier la source** pendant le traitement
3. **Utiliser les méthodes de référence** quand possible (`String::toUpperCase` plutôt que `s -> s.toUpperCase()`)
4. **Privilégier `parallelStream()` avec précaution** - Mesurer les performances avant
5. **Fermer les streams de fichiers** avec try-with-resources

```java
// Mauvais exemple - effet de bord
List<String> results = new ArrayList<>();
names.stream()
    .forEach(name -> results.add(name.toUpperCase())); // ❌

// Bon exemple
List<String> results = names.stream()
    .map(String::toUpperCase)
    .collect(Collectors.toList()); // ✅
```

## Stream depuis d'autres sources

Les Streams ne viennent pas uniquement des collections :

```java
// Depuis un tableau
String[] array = {"a", "b", "c"};
Arrays.stream(array).forEach(System.out::println);

// Depuis une range
IntStream.range(1, 10).forEach(System.out::println);

// Depuis un fichier
try (Stream<String> lines = Files.lines(Paths.get("file.txt"))) {
    lines.filter(line -> line.contains("error"))
         .forEach(System.out::println);
}

// Stream infini
Stream.iterate(0, n -> n + 2)
    .limit(10)
    .forEach(System.out::println); // 0, 2, 4, 6, 8...
```

## Conclusion

Les Streams rendent le code Java plus lisible, expressif et maintenable. Ils permettent de :

- Écrire du code déclaratif plutôt qu'impératif
- Bénéficier d'optimisations automatiques (lazy evaluation, short-circuiting)
- Paralléliser facilement le traitement
- Composer des opérations complexes de manière claire

Maîtriser les Streams est essentiel pour tout développeur Java moderne !
