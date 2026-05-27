import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CamKitReact',
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@camkit/types', '@camkit/core'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@camkit/types': 'CamKitTypes',
          '@camkit/core': 'CamKitCore',
        },
      },
    },
    minify: false,
  },
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
});
