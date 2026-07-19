---
title: "ADB : Accéder à adb.exe depuis WSL"
description: "Comment utiliser le ADB de Windows directement depuis un terminal WSL sans duplication."
pubDate: 2026-07-19
tags: ["adb", "android", "wsl", "windows", "bash"]
---

Le SDK Android est installé sur Windows (généralement dans `%LOCALAPPDATA%\Android\Sdk`) mais n'est pas accessible depuis WSL. Voici comment y remédier sans dupliquer l'installation.

## Solution : wrapper dans `/usr/local/bin`

Le plus fiable est de créer un script qui passe les appels vers l'exécutable Windows :

```bash
echo '#!/bin/bash
exec /mnt/c/Users/<USER>/AppData/Local/Android/Sdk/platform-tools/adb.exe "$@"' | sudo tee /usr/local/bin/adb > /dev/null && sudo chmod +x /usr/local/bin/adb
```

Il faut remplacer `<USER>` par votre nom d'utilisateur Windows.

`/usr/local/bin` est prioritaire dans le `PATH` par défaut et le script fonctionne dans tous les contextes (shells interactifs, scripts, outils).

## Alternative : ajout au PATH

Ajouter le chemin Windows dans `~/.bashrc` :

```bash
export PATH="$PATH:/mnt/c/Users/<USER>/AppData/Local/Android/Sdk/platform-tools"
```

**Inconvénient** : cela nécessite un shell interactif (`.bashrc` n'est pas sourcé par les shells non-interactifs). Le wrapper est plus universel.

## Vérification

```bash
adb version
adb devices
```

## Note

- L'interopérabilité WSL/Windows (binfmt_misc) doit être activée. Voir la note [WSL : Activer l'interopérabilité Windows](/notes/fr/wsl-windows-interop).

## Références

- [Documentation Microsoft: Interopérabilité WSL/Windows](https://learn.microsoft.com/en-us/windows/wsl/filesystems#run-windows-tools-from-linux)
