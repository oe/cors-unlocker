import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => ({
  plugins: [dts()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'browserAppCors',
      formats: ['es', 'umd'],
      fileName: (format) => `index.${format}.js`
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
