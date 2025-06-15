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
export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve' || mode === 'development';
  
  return {
    build: {
      emptyOutDir: true,
      outDir: `dist/${browserTarget}`,
      // Enable sourcemap for development and inline sourcemap for production
      sourcemap: isDev ? true : 'inline',
      // Optimize for debugging in development
      minify: isDev ? false : 'esbuild',
      // Keep function names for better debugging
      rollupOptions: {
        output: {
          // Preserve function names in development for better debugging
          compact: !isDev
        }
      }
    },
    // Development server configuration
    server: {
      // Enable source maps in dev server
      sourcemapIgnoreList: false
    },
    // Enable source maps for CSS
    css: {
      devSourcemap: true
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
            'https://forth.ink',
            'http://localhost:4321'
          ]
        },
        manifest: generateManifest
      })
    ]
  };
});
