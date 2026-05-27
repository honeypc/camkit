import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@camkit/types': resolve(__dirname, '../../packages/types/src/index.ts'),
      '@camkit/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@camkit/utils': resolve(__dirname, '../../packages/utils/src/index.ts'),
    },
  },
});
