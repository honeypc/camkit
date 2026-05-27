import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CamKitCore',
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        '@camkit/types',
        '@camkit/utils',
        '@camkit/camera',
        '@camkit/uploader',
        '@camkit/webgl-engine',
        '@camkit/image-tools',
        '@camkit/filters',
        '@camkit/workers'
      ],
      output: {
        globals: {
          '@camkit/types': 'CamKitTypes',
          '@camkit/utils': 'CamKitUtils',
          '@camkit/camera': 'CamKitCamera',
          '@camkit/uploader': 'CamKitUploader',
          '@camkit/webgl-engine': 'CamKitWebGL',
          '@camkit/image-tools': 'CamKitImageTools',
          '@camkit/filters': 'CamKitFilters',
          '@camkit/workers': 'CamKitWorkers'
        },
      },
    },
    minify: false,
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
});
