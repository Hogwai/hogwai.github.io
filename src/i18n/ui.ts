export const languages = {
  en: "English",
  fr: "Français",
} as const;

export const flags: Record<keyof typeof languages, string> = {
  en: "\u{1F1EC}\u{1F1E7}",
  fr: "\u{1F1EB}\u{1F1F7}",
};

export type Lang = keyof typeof languages;

export const defaultLang: Lang = "en";

export const ui = {
  en: {
    // Nav
    "nav.home": "Home",
    "nav.posts": "Posts",
    "nav.notes": "Notes",
    "nav.tags": "Tags",
    "nav.projects": "Projects",
    "nav.about": "About",
    // Homepage
    "home.subtitle":
      "Thoughts, tutorials and technical posts about Java (mainly)",
    "home.latestPosts": "Latest posts",
    "home.recentNotes": "Recent notes",
    "home.seeAllPosts": "See all posts",
    "home.seeAllNotes": "See all notes",
    // Posts page
    "posts.title": "All posts",
    "posts.description":
      "All posts on Hogwai Tech Blog — Java, performance, design patterns and more.",
    "posts.searchPlaceholder": "Search a post...",
    "posts.filterByTag": "Filter by tag",
    "posts.reset": "Reset",
    "posts.found_one": "1 post found",
    "posts.found_other": "{count} posts found",
    "posts.noResults": "No posts found",
    "posts.noResultsHint": "Try changing your search criteria",
    "posts.backLink": "Posts",
    // Notes page
    "notes.title": "Notes",
    "notes.subtitle": "Quick fixes, snippets and setup tips.",
    "notes.description":
      "Quick fixes, snippets and setup tips — short-form technical notes.",
    "notes.searchPlaceholder": "Search a note...",
    "notes.filters": "Filters",
    "notes.reset": "Reset",
    "notes.found_one": "1 note found",
    "notes.found_other": "{count} notes found",
    "notes.noResults": "No notes found",
    "notes.noResultsHint": "Try changing your search criteria",
    "notes.backLink": "Notes",
    // Tags
    "tags.title": "Tags",
    "tags.description": "Browse all tags on Hogwai Tech Blog.",
    "tags.backLink": "Tags",
    "tags.postsSection": "Posts",
    "tags.notesSection": "Notes",
    // About
    "about.title": "About",
    "about.description":
      "About Lilian — developer with a passion for the Java ecosystem and the author of Hogwai Tech Blog.",
    "about.welcome": "Welcome to my technical blog",
    "about.whoAmI": "Who am I ?",
    "about.whoAmIText":
      "I'm Lilian, a seasoned developer with a passion for the java ecosystem.",
    "about.theStack": "The stack",
    "about.theStackText": "The blog is made with",
    // Projects
    "projects.title": "Projects",
    "projects.description":
      "Open-source and personal projects built by Lilian.",
    "projects.subtitle": "Some things I built",
    // 404
    "404.title": "404 — Page not found",
    "404.description": "Page not found — Hogwai Tech Blog.",
    "404.text": "Page not found.",
    "404.homeLink": "Home",
    // Footer
    "footer.contentLicense": "Content licensed under",
    // Common
    "common.updated": "Updated",
    "common.source": "Source",
    // Language switch
    "lang.switchLabel": "Read in English",
    "lang.badge": "EN",
  },
  fr: {
    // Nav
    "nav.home": "Accueil",
    "nav.posts": "Articles",
    "nav.notes": "Notes",
    "nav.tags": "Tags",
    "nav.projects": "Projets",
    "nav.about": "A propos",
    // Homepage
    "home.subtitle":
      "Réflexions, tutoriels et posts techniques sur Java (principalement)",
    "home.latestPosts": "Derniers posts",
    "home.recentNotes": "Notes récentes",
    "home.seeAllPosts": "Voir tous les posts",
    "home.seeAllNotes": "Voir toutes les notes",
    // Posts page
    "posts.title": "Tous les posts",
    "posts.description":
      "Tous les posts sur Hogwai Tech Blog — Java, performance, design patterns et plus.",
    "posts.searchPlaceholder": "Rechercher un article...",
    "posts.filterByTag": "Filtrer par tag",
    "posts.reset": "Réinitialiser",
    "posts.found_one": "1 article trouvé",
    "posts.found_other": "{count} posts trouvés",
    "posts.noResults": "Aucun article trouvé",
    "posts.noResultsHint": "Essayez de modifier vos critères de recherche",
    "posts.backLink": "Posts",
    // Notes page
    "notes.title": "Notes",
    "notes.subtitle": "Notes rapides, snippets et astuces.",
    "notes.description":
      "Notes rapides, snippets et astuces — notes techniques courtes.",
    "notes.searchPlaceholder": "Rechercher une note...",
    "notes.filters": "Filtres",
    "notes.reset": "Réinitialiser",
    "notes.found_one": "1 note trouvée",
    "notes.found_other": "{count} notes trouvées",
    "notes.noResults": "Aucune note trouvée",
    "notes.noResultsHint": "Essayez de modifier vos critères de recherche",
    "notes.backLink": "Notes",
    // Tags
    "tags.title": "Tags",
    "tags.description": "Parcourir tous les tags sur Hogwai Tech Blog.",
    "tags.backLink": "Tags",
    "tags.postsSection": "Articles",
    "tags.notesSection": "Notes",
    // About
    "about.title": "A propos",
    "about.description":
      "A propos de Lilian, developpeur passionné par l'écosysteme Java et auteur de Hogwai Tech Blog.",
    "about.welcome": "Bienvenue sur mon blog technique",
    "about.whoAmI": "Qui suis-je ?",
    "about.whoAmIText":
      "Je suis Lilian, développeur experimenté et passionné par l'ecosysteme Java.",
    "about.theStack": "La stack",
    "about.theStackText": "Le blog est fait avec",
    // Projects
    "projects.title": "Projets",
    "projects.description":
      "Projets open-source et personnels réalisés par Lilian.",
    "projects.subtitle": "Quelques projets réalisés",
    // 404
    "404.title": "404 — Page introuvable",
    "404.description": "Page introuvable - Hogwai Tech Blog.",
    "404.text": "Page introuvable.",
    "404.homeLink": "Accueil",
    // Footer
    "footer.contentLicense": "Contenu sous licence",
    // Common
    "common.updated": "Mis à jour",
    "common.source": "Source",
    // Language switch
    "lang.switchLabel": "Lire en français",
    "lang.badge": "FR",
  },
} as const;

export type UIKey = keyof (typeof ui)[typeof defaultLang];
