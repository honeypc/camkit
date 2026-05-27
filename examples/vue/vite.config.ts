import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@camkit/types': resolve(__dirname, '../../packages/types/src/index.ts'),
      '@camkit/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@camkit/vue': resolve(__dirname, '../../packages/vue/src/index.ts'),
    },
  },
});
