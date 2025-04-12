import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import eslint from 'vite-plugin-eslint';
import mdx from '@astrojs/mdx';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react(), mdx()],
  markdown: {
    syntaxHighlight: 'shiki', // or 'prism' if preferred
    shikiConfig: {
      theme: 'github-dark' // or 'nord', 'dracula', etc.
    }
  },
  vite: {
    plugins: [eslint(), tailwindcss()]
  }
});