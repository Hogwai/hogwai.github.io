#!/usr/bin/env node

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const [, , type, ...titleParts] = process.argv;
const title = titleParts.join(" ");

if (!type || !title) {
  console.error("Usage: node scripts/new-content.js <post|note> <title>");
  process.exit(1);
}

if (type !== "post" && type !== "note") {
  console.error('Type must be "post" or "note"');
  process.exit(1);
}

const slug = title
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const dir =
  type === "post"
    ? join("src", "content", "posts", "en")
    : join("src", "content", "notes", "en");

const filePath = join(dir, `${slug}.md`);

if (existsSync(filePath)) {
  console.error(`File already exists: ${filePath}`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });

const today = new Date().toISOString().split("T")[0];

const frontmatter =
  type === "post"
    ? `---
title: "${title}"
description: ""
pubDate: ${today}
tags: []
draft: true
---

`
    : `---
title: "${title}"
pubDate: ${today}
tags: []
draft: true
---

`;

writeFileSync(filePath, frontmatter);
console.log(`Created ${filePath}`);
