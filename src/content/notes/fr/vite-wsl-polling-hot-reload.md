---
title: "Vite : activer le polling sous WSL pour le hot reload"
description: "Pourquoi le hot reload de Vite ne détecte pas les modifications de fichiers depuis WSL et comment activer le polling dans la config Astro."
pubDate: 2026-08-24
tags: ["vite", "wsl", "astro", "hot-reload", "windows"]
draft: false
---

Quand un projet vit sur un disque Windows monté dans WSL (`/mnt/c/...`), le hot reload de Vite ne se déclenche pas : on modifie un fichier, rien ne bouge dans le navigateur.

## Cause

WSL2 utilise le protocole 9P pour accéder aux fichiers Windows via `/mnt/c`. Les événements `inotify` ne remontent pas à travers cette couche.
Le watcher de Vite (chokidar) s'appuie dessus et ne voit jamais les modifications.

## Correctif

Activer le polling dans la config Vite. Avec Astro, ça se passe dans `astro.config.mjs` :

```js
export default defineConfig({
  vite: {
    server: {
      watch: {
        usePolling: true,
      },
    },
  },
});
```

Le hot reload fonctionne à nouveau, au prix d'un peu plus de CPU : le watcher scanne les fichiers à intervalle régulier au lieu d'écouter des événements du noyau.

## Alternative

Déplacer le projet dans le système de fichiers natif de WSL (`~/projets/...` plutôt que `/mnt/c/...`). Les événements `inotify` fonctionnent alors normalement, sans polling. Mais si l'éditeur tourne côté Windows, l'accès aux fichiers passe par `\\wsl$`, ce qui a ses propres limites.

## Références

- [Issue WSL #4739 : les modifications de fichiers Windows ne déclenchent pas de notifications côté Linux](https://github.com/microsoft/WSL/issues/4739). L'équipe WSL y confirme que le serveur Plan 9 ne supporte pas le file watching.
- [Issue WSL #6255 : hot reload React cassé](https://github.com/microsoft/WSL/issues/6255). Même confirmation de Craig Loewen (Microsoft) : pas de file watching sur les fichiers Windows via `/mnt/c`.
- [Stack Overflow : comment activer inotify dans WSL2](https://stackoverflow.com/questions/70273307/how-to-turn-on-inotify-in-wsl2). Détaille pourquoi inotify fonctionne sur ext4 mais pas sur les montages 9P.
- [DEV : HMR not working in Vite on WSL2](https://dev.to/proparitoshsingh/hmr-not-working-in-vite-on-wsl2-5h2k). Le même correctif `usePolling: true` appliqué à un projet Vite classique.
- [Microsoft Learn : WSL interop](https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop#common-mistakes). Recommandation officielle de garder les projets Linux hors de `/mnt/c` à cause du protocole 9P.
