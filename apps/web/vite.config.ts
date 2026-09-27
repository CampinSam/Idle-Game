import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Mirrors src/services/api.ts: API_BASE = VITE_API_URL?.replace(/\/$/, '') ?? '/api'
const rawApiUrl = (process.env.VITE_API_URL ?? '').replace(/\/$/, '');

// Only absolute URLs (http/https) indicate a cross-origin backend.
// new URL() throws on relative paths, so guard before calling it.
const isCrossOrigin =
  rawApiUrl.startsWith('http://') || rawApiUrl.startsWith('https://');

function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build runtimeCaching using RegExp urlPatterns constructed at config time.
// Workbox serialises function urlPatterns via .toString() — any closure variable
// captured from this module scope is lost in the generated SW.  RegExps are
// embedded verbatim and always resolve correctly.
function buildRuntimeCaching() {
  if (isCrossOrigin) {
    const parsed = new URL(rawApiUrl);
    const eo = reEscape(parsed.origin);
    const ep = reEscape(parsed.pathname.replace(/\/?$/, ''));

    return [
      {
        urlPattern: new RegExp(`^${eo}/media/`),
        handler: 'CacheFirst' as const,
        options: {
          cacheName: 'derp-media',
          expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: new RegExp(`^${eo}${ep}/audio/config(?:\\?.*)?$`),
        handler: 'StaleWhileRevalidate' as const,
        options: {
          cacheName: 'derp-audio-config',
          expiration: { maxEntries: 4, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      {
        urlPattern: new RegExp(`^${eo}${ep}/`),
        handler: 'NetworkOnly' as const,
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
        handler: 'CacheFirst' as const,
        options: {
          cacheName: 'derp-google-fonts',
          expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
        handler: 'CacheFirst' as const,
        options: {
          cacheName: 'derp-google-fonts',
          expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ];
  }

  // Same-origin: VITE_API_URL unset or relative (e.g. /api, /v1).
  // Path known at build time — embed as a RegExp literal so no closure is needed.
  const apiPath = rawApiUrl || '/api';
  const ep = reEscape(apiPath);

  return [
    {
      urlPattern: /\/media\//,
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'derp-media',
        expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: new RegExp(`${ep}/audio/config(?:\\?.*)?$`),
      handler: 'StaleWhileRevalidate' as const,
      options: {
        cacheName: 'derp-audio-config',
        expiration: { maxEntries: 4, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      urlPattern: new RegExp(`${ep}/`),
      handler: 'NetworkOnly' as const,
    },
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'derp-google-fonts',
        expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
      handler: 'CacheFirst' as const,
      options: {
        cacheName: 'derp-google-fonts',
        expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ];
}

// navigateFallbackDenylist: pathnames that must never fall back to index.html.
// For cross-origin deployments the frontend has no /api/ routes, so the static
// defaults suffice.  For same-origin, derive the API path from VITE_API_URL so
// a non-default prefix (e.g. /v2) is also covered.
function buildNavigateFallbackDenylist(): RegExp[] {
  const base = [/^\/media\//, /^\/v1\//];
  if (isCrossOrigin) {
    // API is on a different origin — the SPA origin won't receive /api/ navigates.
    return [/^\/api\//, ...base];
  }
  const apiPath = rawApiUrl || '/api';
  return [new RegExp(`^${reEscape(apiPath)}/`), ...base];
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'derp.svg',
        'favicon-32.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Derp Universe',
        short_name: 'Derp',
        description: 'Season-based idle strategy RPG.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0c0a1a',
        theme_color: '#1e1b3a',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2,ttf}'],
        // Admin editor bundle exceeds Workbox's 2 MiB default on a clean build.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: buildNavigateFallbackDenylist(),
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: buildRuntimeCaching(),
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@derp/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@derp/math': path.resolve(__dirname, '../../packages/math/src'),
    },
  },
  server: {
    port: Number(process.env.AGENT_WEB_PORT || 5000),
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.AGENT_API_PORT || 3001}`,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ''),
      },
      '/media': {
        target: `http://127.0.0.1:${process.env.AGENT_API_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
});
