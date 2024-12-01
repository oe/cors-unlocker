import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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
    emptyOutDir: true
  },
  plugins: [
    react(),
    webExtension({
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
