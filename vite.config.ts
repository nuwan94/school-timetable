/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';

// The offline file has no public/ folder beside it, so its favicon is inlined.
const inlineFavicon = (): Plugin => ({
  name: 'inline-favicon',
  transformIndexHtml: (html) =>
    html
      .replace('href="./favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(readFileSync('public/favicon.svg', 'utf8'))}"`)
      .replace(/\s*<link rel="(icon|apple-touch-icon|manifest)" href="\.\/[^"]*"[^>]*>/g, ''),
});

// `vite build --mode single` produces dist-single/index.html with every script,
// style and font inlined, so the app runs offline from a pendrive (file://).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react(), ...(single ? [inlineFavicon(), viteSingleFile({ removeViteModuleLoader: true })] : [])],
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
