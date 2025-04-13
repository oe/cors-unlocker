import path from 'path';
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import eslint from 'vite-plugin-eslint';
import webExtension, { readJsonFile } from "vite-plugin-web-extension";
import tailwindcss from '@tailwindcss/vite';

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
    tailwindcss(),
    webExtension({
      browser: browserTarget,
      webExtConfig: {
        target: 'chromium',
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
