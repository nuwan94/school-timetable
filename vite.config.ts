/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

// `vite build --mode single` produces dist-single/index.html with every script,
// style and font inlined, so the app runs offline from a pendrive (file://).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react(), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: { __SINGLE_FILE__: JSON.stringify(single) },
    worker: { format: 'es' },
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      ...(single ? { assetsInlineLimit: Number.MAX_SAFE_INTEGER, cssCodeSplit: false } : {}),
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
