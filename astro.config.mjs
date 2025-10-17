import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://hogwai.github.io/tech-blog',
  base: '/tech-blog',
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-dimmed',
      langs: ['java', 'typescript', 'javascript', 'bash', 'json', 'yaml'],
      wrap: true,
    },
  },
});