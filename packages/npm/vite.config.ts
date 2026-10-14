import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => ({
  plugins: [dts({
    exclude: ['src/**/*.test.ts'],
    // NodeNext requires the declaration's module kind to match each runtime entry.
    afterBuild: () => copyFileSync(new URL('./dist/index.d.ts', import.meta.url), new URL('./dist/index.d.cts', import.meta.url)),
  })],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'wireflip',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => {
        if (format === 'es') return 'index.mjs';
        if (format === 'cjs') return 'index.cjs';
        return 'index.umd.js';
      }
    },
    // In development mode, generate sourcemaps and don't minify
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    // Let vite handle watch mode based on --watch flag
    // Don't override it in config
    // Optimize bundle size
    rollupOptions: {
      output: {
        // Enable tree shaking
        exports: 'named',
      }
    },
    // Enable aggressive tree shaking
    treeshake: true,
  }
}));
