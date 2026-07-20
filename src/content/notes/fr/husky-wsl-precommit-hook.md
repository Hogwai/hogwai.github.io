---
title: "Husky : corriger le hook pre-commit cassé après un npm install depuis WSL"
description: "Pourquoi un npm install propre depuis WSL casse les hooks pre-commit exécutés par Git for Windows, et comment régénérer les shims .bin."
pubDate: 2026-07-20
tags: ["husky", "wsl", "windows", "npm", "git", "lint-staged"]
draft: true
---

Un `rm -rf node_modules && npm install` depuis WSL casse les hooks husky quand les commits passent par Git for Windows (VS Code, Git Bash).

## Cause

npm sur Windows crée des shims dans `node_modules/.bin/` : un script shell, un fichier `.cmd` et un script `.ps1` par binaire. npm sur WSL crée uniquement des symlinks POSIX.

Le hook s'exécute via Git Bash. lint-staged appelle `prettier`, `eslint`, etc. depuis `.bin/`. Si les entrées sont des symlinks WSL, Windows ne peut pas les suivre.

## Symptôme

```bash
> git commit
[STARTED] prettier --write
[FAILED] prettier --write
'prettier' n'est pas reconnu en tant que commande interne
husky - pre-commit script failed (code 1)
```

## Correctif

Régénérer `.bin/` depuis un shell Windows :

```sh
# Depuis Git Bash (pas WSL)
rm -rf node_modules/.bin && npm install
```

Le hook peut rester simple :

```sh
#!/bin/sh
npx --no-install lint-staged
```

## Pourquoi ne pas déléguer à WSL depuis le hook

Utiliser `wsl bash -lc "..."` dans le hook ne fonctionne pas :

- `bash -lc` source `.bash_profile`, pas `.bashrc`. nvm configuré dans `.bashrc` n'est jamais chargé.
- `.bashrc` ignore les shells non interactifs (`[ -z "$PS1" ] && return`).
- Même en chargeant nvm manuellement, les sous-processus fuient vers le Node Windows via l'interop WSL.

## Prévention

Lancer `npm install` depuis Git Bash au moins une fois après un clone ou après `rm -rf node_modules`. Les `npm install` WSL suivants préservent les shims existants.
