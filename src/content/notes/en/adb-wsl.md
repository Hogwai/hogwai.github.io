---
title: "ADB: Access adb.exe from WSL"
description: "How to use Windows ADB directly from a WSL terminal without duplicating the SDK installation."
pubDate: 2026-07-19
tags: ["adb", "android", "wsl", "windows", "bash"]
---

The Android SDK is installed on Windows (typically in `%LOCALAPPDATA%\Android\Sdk`) but is not accessible from WSL. Here is how to fix it without duplicating the installation.

## Solution: wrapper in `/usr/local/bin`

The most reliable approach is to create a script that forwards calls to the Windows executable:

```bash
echo '#!/bin/bash
exec /mnt/c/Users/<USER>/AppData/Local/Android/Sdk/platform-tools/adb.exe "$@"' | sudo tee /usr/local/bin/adb > /dev/null && sudo chmod +x /usr/local/bin/adb
```

Replace `<USER>` with your Windows username.

`/usr/local/bin` is high in the default `PATH` and the script works in all contexts (interactive shells, scripts, tools).

## Alternative: PATH addition

Add the Windows path to `~/.bashrc`:

```bash
export PATH="$PATH:/mnt/c/Users/<USER>/AppData/Local/Android/Sdk/platform-tools"
```

**Drawback**: requires an interactive shell (`.bashrc` is not sourced by non-interactive shells). The wrapper approach is more universal.

## Verification

```bash
adb version
adb devices
```

## Note

- WSL/Windows interop (binfmt_misc) must be enabled. See the note [WSL: Enable Windows interoperability](/notes/wsl-windows-interop/).

## References

- [Microsoft Documentation: WSL/Windows Interoperability](https://learn.microsoft.com/en-us/windows/wsl/filesystems#run-windows-tools-from-linux)
