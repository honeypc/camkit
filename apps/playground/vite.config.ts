import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@camkit/types': resolve(__dirname, '../../packages/types/src/index.ts'),
      '@camkit/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@camkit/react': resolve(__dirname, '../../packages/react/src/index.ts'),
    },
  },
});
