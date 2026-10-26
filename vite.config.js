import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const nm = (p) => readFileSync(fileURLToPath(new URL('./node_modules/' + p, import.meta.url)), 'utf8');

// Leaflet stays inline in index.html (ids wd-leaflet-css / wd-leaflet-js): the PDF export copies it into the print window.
const inlineLeaflet = () => ({
  name: 'wd-inline-leaflet',
  // 'post': after Vite has processed the page, so Leaflet's CSS/JS are inserted exactly as shipped
  transformIndexHtml: { order: 'post', handler(html) {
    return html.replace('/*LEAFLET_CSS*/', () => nm('leaflet/dist/leaflet.css')).replace('/*LEAFLET_JS*/', () => nm('leaflet/dist/leaflet.js'));
  } },
});

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [
      inlineLeaflet(),
      react({
        jsxRuntime: 'classic', // the planner uses the global React, like the original page
        // The planner relies on classic-script hoisting (it was compiled with preset-env). Turning let/const into var
        // keeps that behaviour and avoids "Cannot access X before initialization" errors.
        babel: { plugins: [['@babel/plugin-transform-block-scoping', { tdz: false }]] },
      }),
      single
        ? viteSingleFile({ removeViteModuleLoader: true })
        : VitePWA({
            registerType: 'autoUpdate',
            injectRegister: null,
            includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
            manifest: {
              name: 'Dream Planner RPA — Waking Dream FPV',
              short_name: 'Dream Planner',
              description: 'RPAS operations planner, JSA and flight records for Rubio Enterprises (ReOC)',
              theme_color: '#2d0a5e',
              background_color: '#f8fafc',
              display: 'standalone',
              start_url: './',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              navigateFallback: 'index.html',
              // Map tiles and APIs are live data: never served from the offline cache
              runtimeCaching: [],
            },
          }),
    ],
    resolve: single ? { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/pwa-stub.js', import.meta.url)) } } : {},
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2019',
      chunkSizeWarningLimit: 4000,
      assetsInlineLimit: single ? 100000000 : 4096,
    },
  };
});
