---
title: "WSL : Activer l'interopérabilité Windows pour exécuter des commandes Windows depuis WSL"
description: "Comment activer et utiliser l'interopérabilité WSL/Windows pour lancer des programmes Windows directement depuis un terminal WSL."
pubDate: 2026-02-21
tags: ["wsl", "windows", "linux", "setup"]
language: "bash"
---

WSL permet d'exécuter des binaires Windows (`.exe`) directement depuis un terminal Linux grâce à **l'interopérabilité WSL/Windows**. Cette fonctionnalité est activée par défaut, mais peut être désactivée.

## Vérifier si l'interop est activé

```sh
cat /proc/sys/fs/binfmt_misc/WSLInterop
```

Si le fichier existe et contient `enabled`, l'interop est actif.

## Activer l'interop

### Via wsl.conf

Ajoutez ou modifiez le fichier `/etc/wsl.conf` :

```ini
[interop]
enabled = true
appendWindowsPath = true
```

- **`enabled`** : autorise l'exécution de binaires Windows depuis WSL.
- **`appendWindowsPath`** : ajoute les chemins Windows au `$PATH` Linux, ce qui permet d'appeler `notepad.exe`, `explorer.exe`, etc. directement.

Redémarrez ensuite la distribution WSL depuis PowerShell :

```powershell
wsl --shutdown
```

### Temporairement (session en cours uniquement)

```sh
sudo sh -c 'echo 1 > /proc/sys/fs/binfmt_misc/WSLInterop'
```

## Utilisation

Une fois l'interop activé, n'importe quel exécutable Windows peut être appelé :

```sh
# Ouvrir le Bloc-notes
notepad.exe

# Ouvrir l'Explorateur de fichiers dans le répertoire courant
explorer.exe .

# Exécuter une commande PowerShell
powershell.exe -Command "Get-Process"

# Copier du texte dans le presse-papiers Windows
echo "hello" | clip.exe
```

> **Remarque :** L'extension `.exe` doit être incluse lors de l'appel de commandes Windows.

## Dépannage

Si l'interop ne fonctionne pas après l'avoir activé :

1. Vérifiez que WSL est à jour :

```powershell
wsl --update
```

2. Assurez-vous que `wsl.conf` est correctement formaté (pas d'espaces autour du `=`).

3. Redémarrez complètement WSL :

```powershell
wsl --shutdown
```

## Références

1. [Documentation Microsoft — Interopérabilité WSL/Windows](https://learn.microsoft.com/en-us/windows/wsl/filesystems#run-windows-tools-from-linux)
