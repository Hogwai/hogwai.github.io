---
title: 'WSL: Enable Windows interop to run Windows commands from WSL'
description: 'How to enable and use WSL/Windows interoperability to execute Windows programs directly from a WSL terminal.'
pubDate: 2026-02-21
tags: ["wsl", "windows", "linux", "setup"]
language: "bash"
---

WSL can execute Windows binaries (`.exe`) directly from a Linux terminal thanks to **WSL/Windows interoperability**. This feature is enabled by default but can be turned off.

## Check if interop is enabled

```sh
cat /proc/sys/fs/binfmt_misc/WSLInterop
```

If the file exists and contains `enabled`, interop is active.

## Enable interop

### Via wsl.conf

Add or edit the `/etc/wsl.conf` file:

```ini
[interop]
enabled = true
appendWindowsPath = true
```

- **`enabled`**: allows running Windows binaries from WSL.
- **`appendWindowsPath`**: appends Windows paths to the Linux `$PATH`, making it possible to call `notepad.exe`, `explorer.exe`, etc. directly.

Then restart the WSL distribution from PowerShell:

```powershell
wsl --shutdown
```

### Temporarily (current session only)

```sh
sudo sh -c 'echo 1 > /proc/sys/fs/binfmt_misc/WSLInterop'
```

## Usage

Once interop is enabled, any Windows executable can be called:

```sh
# Open Notepad
notepad.exe

# Open File Explorer in the current directory
explorer.exe .

# Run a PowerShell command
powershell.exe -Command "Get-Process"

# Copy text to the Windows clipboard
echo "hello" | clip.exe
```

> **Note:** The `.exe` extension must be included when calling Windows commands.

## Troubleshooting

If interop does not work after enabling it:

1. Make sure WSL is up to date:

```powershell
wsl --update
```

2. Verify that `wsl.conf` is properly formatted (no spaces around `=`).

3. Fully restart WSL:

```powershell
wsl --shutdown
```

## References

1. [Microsoft documentation — WSL/Windows interoperability](https://learn.microsoft.com/en-us/windows/wsl/filesystems#run-windows-tools-from-linux)
