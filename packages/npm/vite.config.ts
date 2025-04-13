import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts()],
  define: {
    'process.env.NODE_ENV': JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'browserAppCors',
      formats: ['es', 'umd'],
      fileName: (format) => `index.${format}.js`
    },
  }
});
