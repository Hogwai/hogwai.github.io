---
title: "Vite: enable polling under WSL for hot reload"
description: "Why Vite hot reload does not detect file changes from WSL and how to enable polling in the Astro config."
pubDate: 2026-08-24
tags: ["vite", "wsl", "astro", "hot-reload", "windows"]
draft: false
---

When a project lives on a Windows drive mounted in WSL (`/mnt/c/...`), Vite hot reload never triggers: you edit a file, nothing changes in the browser.

## Cause

WSL2 uses the 9P protocol to access Windows files through `/mnt/c`. `inotify` events do not cross this layer. The Vite watcher (chokidar) relies on them and never sees the modifications.

## Fix

Enable polling in the Vite config. With Astro, that goes in `astro.config.mjs`:

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

Hot reload works again, at the cost of some extra CPU: the watcher scans files at regular intervals instead of listening for kernel events.

## Alternative

Move the project into the native WSL filesystem (`~/projects/...` instead of `/mnt/c/...`). `inotify` events then work normally, without polling. But if your editor runs on the Windows side, file access goes through `\\wsl$`, which has its own limitations.

## References

- [WSL issue #4739: file changes made by Windows apps don't trigger notifications for Linux apps](https://github.com/microsoft/WSL/issues/4739). The WSL team confirms there that the Plan 9 server does not support file watching.
- [WSL issue #6255: React hot reload broken](https://github.com/microsoft/WSL/issues/6255). Same confirmation from Craig Loewen (Microsoft): no file watching on Windows files through `/mnt/c`.
- [Stack Overflow: how to turn on inotify in WSL2](https://stackoverflow.com/questions/70273307/how-to-turn-on-inotify-in-wsl2). Details why inotify works on ext4 but not on 9P mounts.
- [DEV: HMR not working in Vite on WSL2](https://dev.to/proparitoshsingh/hmr-not-working-in-vite-on-wsl2-5h2k). The same `usePolling: true` fix applied to a plain Vite project.
- [Microsoft Learn: WSL interop](https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop#common-mistakes). Official recommendation to keep Linux projects out of `/mnt/c` because of the 9P protocol.
