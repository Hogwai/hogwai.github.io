---
title: "Astro: Cannot find module 'astro:content'"
description: 'Correction de l''erreur TypeScript "Cannot find module astro:content or its corresponding type declarations.ts(2307)"'
pubDate: 2025-10-18
tags: ["astro", "setup", "error", "typescript"]
language: "astro"
---

Le module `astro:content` est un module virtuel dont les types sont **générés par Astro** à partir de vos fichiers de contenu et de `config.ts`. S'il n'existe aucun contenu, TypeScript n'a rien à analyser.

## Correction

### Créer un fichier de contenu

Astro a besoin d'au moins un fichier dans la collection :

**`src/content/blog/hello-world.md`**

```markdown
---
title: "Great title"
pubDate: 2025-10-18
description: "Awesome description"
---

Outstanding post
```

### Définir le schéma de la collection

**`src/content/config.ts`**

```ts
import { defineCollection, z } from "astro:content";

const blogCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
  }),
});

export const collections = {
  blog: blogCollection,
};
```

### Lancer `astro sync`

```sh
npx astro sync
```

Cette commande génère `.astro/content.d.ts` avec toutes les définitions de types.

### Redémarrer le serveur TypeScript

Dans VS Code : `Ctrl+Shift+P` → `TypeScript: Restart TS Server`.

## Références

1. [Issue sur le dépôt GitHub d'Astro](https://github.com/withastro/astro/issues/5711)
2. [Commentaire sur l'issue](https://github.com/withastro/astro/issues/5711#issuecomment-1374022020)
