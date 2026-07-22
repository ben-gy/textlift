// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Textlift self-hosts the entire Tesseract stack (worker, WASM cores, English
// traineddata) so that the default workflow is 100% same-origin and works
// offline. Only optional extra languages are fetched from jsDelivr at runtime.
export default defineConfig({
  base: '/',
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/tesseract.js/dist/worker.min.js',
          dest: 'tesseract',
        },
        {
          // SIMD build for every browser since ~2021; plain-LSTM fallback for
          // the rest. Both are Emscripten single-file builds (WASM embedded).
          src: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
          dest: 'tesseract-core',
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
          dest: 'tesseract-core',
        },
        {
          // English traineddata (LSTM best-int), self-hosted so eng OCR never
          // touches a CDN and works offline.
          src: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
          dest: 'tessdata',
        },
      ],
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Textlift — private in-browser OCR',
        short_name: 'Textlift',
        description:
          'Extract text from images, screenshots and scanned PDFs entirely in your browser. No uploads, ever.',
        theme_color: '#0f766e',
        background_color: '#faf9f7',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm,gz}'],
        // Precache the SIMD core + English data; skip the rare non-SIMD
        // fallback core so the precache stays lean (~7.5 MB total).
        globIgnores: ['**/tesseract-core-lstm.wasm.js'],
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
    // tesseract.js is loaded as a plain script worker from /tesseract — keep
    // Vite from trying to pre-bundle its worker internals.
    exclude: ['tesseract.js'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
