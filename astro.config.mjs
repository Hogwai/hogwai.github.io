import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://hogwai.github.io',
  base: '/',
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    mdx()
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-dimmed',
      langs: ['java', 'typescript', 'javascript', 'bash', 'json', 'yaml'],
      wrap: true,
    },
  },
});