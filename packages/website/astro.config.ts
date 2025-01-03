import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import eslint from 'vite-plugin-eslint';
import mdx from '@astrojs/mdx';

import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [react(), mdx(), tailwind()],
  vite: {
    plugins: [eslint()],
  },
});