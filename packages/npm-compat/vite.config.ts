import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ exclude: ['src/**/*.test.ts'] })],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'corsUnlocker',
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'es' ? 'index.mjs' : 'index.cjs',
    },
    rollupOptions: {
      external: ['forth-intercept'],
      output: {
        exports: 'named',
      },
    },
  },
});
