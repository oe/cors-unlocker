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

const firefoxExtID = 'cors-unlocker@forth.ink';
const chromeExtID = 'knhlkjdfmgkmelcjfnbbhpphkmjjacng';

const browserTarget = process.env.TARGET || 'chrome';
// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve' || mode === 'development';
  const isFirefox = browserTarget === 'firefox';
  
  return {
    define: {
      __TARGET__: JSON.stringify(browserTarget),
      // Conditional compilation flags
      FIREFOX_BUILD: isFirefox,
      __DEV__: isDev
    },
    build: {
      emptyOutDir: true,
      outDir: `dist/${browserTarget}`,
      // Enable sourcemap only in development, disable in production
      sourcemap: isDev,
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
    // Enable source maps for CSS only in development
    css: {
      devSourcemap: isDev
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
          target: browserTarget === 'firefox' ? 'firefox-desktop' : 'chromium',
          // Only auto-start browser for Chrome in development mode
          startUrl: [
            // chrome extension options page
            browserTarget === 'firefox'
              ? `moz-extension://${firefoxExtID}/src/options/index.html`
              : `chrome-extension://${chromeExtID}/src/options/index.html`,
            'https://www.google.com/ncr',
            'https://forth.ink',
            'http://localhost:4321'
          ]
        },
        manifest: generateManifest
      }),
      // Custom plugin to filter localhost from manifest in production
      {
        name: 'filter-localhost-manifest',
        generateBundle(options, bundle) {
          if (isDev) return; // Skip in development
          
          // Find and modify manifest.json
          const manifestKey = 'manifest.json';
          if (bundle[manifestKey] && bundle[manifestKey].type === 'asset') {
            const manifestAsset = bundle[manifestKey] as any;
            const manifest = JSON.parse(manifestAsset.source as string);
            
            // Filter localhost from externally_connectable.matches (Chrome only)
            if (manifest.externally_connectable?.matches) {
              manifest.externally_connectable.matches = manifest.externally_connectable.matches.filter(
                (match: string) => !match.includes('localhost') && !match.includes('127.0.0.1')
              );
              // Remove externally_connectable if no matches left
              if (manifest.externally_connectable.matches.length === 0) {
                delete manifest.externally_connectable;
              }
            }
            
            // Filter localhost from content_scripts.matches (Firefox only)
            if (manifest.content_scripts && Array.isArray(manifest.content_scripts)) {
              manifest.content_scripts = manifest.content_scripts
                .map((script: any) => {
                  if (script.matches && Array.isArray(script.matches)) {
                    const filteredMatches = script.matches.filter(
                      (match: string) => !match.includes('localhost') && !match.includes('127.0.0.1')
                    );
                    return filteredMatches.length > 0 ? { ...script, matches: filteredMatches } : null;
                  }
                  return script;
                })
                .filter(Boolean); // Remove null entries
              
              // Remove content_scripts if no valid scripts left
              if (manifest.content_scripts.length === 0) {
                delete manifest.content_scripts;
              }
            }
            
            // Update the asset source
            manifestAsset.source = JSON.stringify(manifest, null, 2);
          }
        }
      }
    ]
  };
});
