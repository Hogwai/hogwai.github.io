---
title: "Husky: fix pre-commit hook broken after npm install from WSL"
description: "Why a clean npm install from WSL breaks Git for Windows pre-commit hooks, and how to restore the .bin shims."
pubDate: 2026-07-20
tags: ["husky", "wsl", "windows", "npm", "git", "lint-staged"]
draft: false
---

A `rm -rf node_modules && npm install` from WSL breaks husky pre-commit hooks when committing from Git for Windows (VS Code, Git Bash).

## Cause

npm on Windows creates shim files in `node_modules/.bin/`: a shell script, a `.cmd` batch file, and a `.ps1` PowerShell script for each binary. npm on WSL creates POSIX symlinks only.

The hook runs via Git Bash. lint-staged spawns `prettier`, `eslint`, etc. from `.bin/`. If the entries are WSL symlinks, Windows cannot follow them.

## Symptom

```bash
> git commit
[STARTED] prettier --write
[FAILED] prettier --write
'prettier' n'est pas reconnu en tant que commande interne
husky - pre-commit script failed (code 1)
```

## Fix

Regenerate `.bin/` from a Windows shell:

```sh
# From Git Bash (not WSL)
rm -rf node_modules/.bin && npm install
```

The hook can stay simple:

```sh
#!/bin/sh
npx --no-install lint-staged
```

## Why not delegate to WSL from the hook

Trying `wsl bash -lc "..."` from the hook does not work:

- `bash -lc` sources `.bash_profile`, not `.bashrc`. nvm set up in `.bashrc` never loads.
- `.bashrc` skips non-interactive shells (`[ -z "$PS1" ] && return`).
- Even loading nvm manually, subprocesses still leak to the Windows node via WSL interop.

## Prevention

Run `npm install` from Git Bash at least once after cloning or after `rm -rf node_modules`. WSL `npm install` calls afterward preserve the existing shims.
