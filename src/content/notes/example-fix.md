---
title: "Fix: Astro content collection not found after rename"
description: "Quick fix when Astro throws 'collection not found' after renaming a collection."
pubDate: 2026-02-18
tags: ["astro", "fix"]
language: "bash"
source: "https://docs.astro.build/en/guides/content-collections/"
---

After renaming a collection, restart the dev server and delete `.astro/` cache:

```bash
rm -rf .astro && npm run dev
```

Astro regenerates the type definitions on next start.
