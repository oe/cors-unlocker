import path from 'path';
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import eslint from 'vite-plugin-eslint';
import webExtension, { readJsonFile } from "vite-plugin-web-extension";
import tailwindcss from 'tailwindcss';

function generateManifest() {
  const manifest = readJsonFile("src/manifest.json");
  const pkg = readJsonFile("package.json");
  return {
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    ...manifest,
  };
}

const extID = 'knhlkjdfmgkmelcjfnbbhpphkmjjacng';

const browserTarget = process.env.TARGET || 'chrome';

// https://vitejs.dev/config/
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern'
      }
    },
    postcss: {
      plugins: [tailwindcss]
    }
  },
  build: {
    emptyOutDir: true,
    outDir: `dist/${browserTarget}`
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    react(),
    eslint(),
    // @ts-expect-error webExtension is not in the vite plugin list
    webExtension({
      browser: browserTarget,
      webExtConfig: {
        startUrl: [
          // chrome extension options page
          `chrome-extension://${extID}/src/options/index.html`,
          'https://www.google.com/ncr',
          'https://forth.ink'
        ]
      },
      manifest: generateManifest
    })
  ]
});
