import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { remarkReadingTime } from "./src/plugins/remarkReadingTime.mjs";

function getContentDates() {
  const contentDir = "./src/content";
  const dateMap = new Map();

  for (const collection of ["posts", "notes"]) {
    const dir = path.join(contentDir, collection);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!frontmatter) continue;

      const slug = file.replace(/\.(md|mdx)$/, "");
      const updatedMatch = frontmatter[1].match(/updatedDate:\s*(\S+)/);
      const pubMatch = frontmatter[1].match(/pubDate:\s*(\S+)/);
      const date = updatedMatch ? updatedMatch[1] : pubMatch?.[1];

      if (date) {
        dateMap.set(`/${collection}/${slug}/`, new Date(date));
      }
    }
  }

  return dateMap;
}

const contentDates = getContentDates();

export default defineConfig({
  site: "https://hogwai.github.io",
  base: "/",
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    mdx(),
    sitemap({
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        const lastmod = contentDates.get(pathname);
        if (lastmod) {
          item.lastmod = lastmod;
        }
        return item;
      },
    }),
  ],
  markdown: {
    remarkPlugins: [remarkReadingTime],
    shikiConfig: {
      theme: "github-dark-dimmed",
      langs: ["java", "typescript", "javascript", "bash", "json", "yaml"],
      wrap: true,
    },
  },
});
