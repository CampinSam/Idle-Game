// vite.config.ts
import { defineConfig } from "file:///home/runner/workspace/node_modules/.pnpm/vite@5.4.21_@types+node@25.2.2_lightningcss@1.30.2_terser@5.46.0/node_modules/vite/dist/node/index.js";
import react from "file:///home/runner/workspace/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@25.2.2_lightningcss@1.30.2_terser@5.46.0_/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///home/runner/workspace/node_modules/.pnpm/vite-plugin-pwa@1.2.0_vite@5.4.21_@types+node@25.2.2_lightningcss@1.30.2_terser@5.46.0__workb_kmuayxk4r2gwni2bnlc7hbbhmu/node_modules/vite-plugin-pwa/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "/home/runner/workspace/apps/web";
var rawApiUrl = (process.env.VITE_API_URL ?? "").replace(/\/$/, "");
var isCrossOrigin = rawApiUrl.startsWith("http://") || rawApiUrl.startsWith("https://");
function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildRuntimeCaching() {
  if (isCrossOrigin) {
    const parsed = new URL(rawApiUrl);
    const eo = reEscape(parsed.origin);
    const ep2 = reEscape(parsed.pathname.replace(/\/?$/, ""));
    return [
      {
        urlPattern: new RegExp(`^${eo}/media/`),
        handler: "CacheFirst",
        options: {
          cacheName: "derp-media",
          expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] }
        }
      },
      {
        urlPattern: new RegExp(`^${eo}${ep2}/audio/config(?:\\?.*)?$`),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "derp-audio-config",
          expiration: { maxEntries: 4, maxAgeSeconds: 24 * 60 * 60 }
        }
      },
      {
        urlPattern: new RegExp(`^${eo}${ep2}/`),
        handler: "NetworkOnly"
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
        handler: "CacheFirst",
        options: {
          cacheName: "derp-google-fonts",
          expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] }
        }
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
        handler: "CacheFirst",
        options: {
          cacheName: "derp-google-fonts",
          expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] }
        }
      }
    ];
  }
  const apiPath = rawApiUrl || "/api";
  const ep = reEscape(apiPath);
  return [
    {
      urlPattern: /\/media\//,
      handler: "CacheFirst",
      options: {
        cacheName: "derp-media",
        expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] }
      }
    },
    {
      urlPattern: new RegExp(`${ep}/audio/config(?:\\?.*)?$`),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "derp-audio-config",
        expiration: { maxEntries: 4, maxAgeSeconds: 24 * 60 * 60 }
      }
    },
    {
      urlPattern: new RegExp(`${ep}/`),
      handler: "NetworkOnly"
    },
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
      handler: "CacheFirst",
      options: {
        cacheName: "derp-google-fonts",
        expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] }
      }
    },
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
      handler: "CacheFirst",
      options: {
        cacheName: "derp-google-fonts",
        expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] }
      }
    }
  ];
}
function buildNavigateFallbackDenylist() {
  const base = [/^\/media\//, /^\/v1\//];
  if (isCrossOrigin) {
    return [/^\/api\//, ...base];
  }
  const apiPath = rawApiUrl || "/api";
  return [new RegExp(`^${reEscape(apiPath)}/`), ...base];
}
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: [
        "derp.svg",
        "favicon-32.png",
        "apple-touch-icon.png"
      ],
      manifest: {
        name: "Derp Universe",
        short_name: "Derp",
        description: "Season-based idle strategy RPG.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#0c0a1a",
        theme_color: "#1e1b3a",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/pwa-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff,woff2,ttf}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: buildNavigateFallbackDenylist(),
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: buildRuntimeCaching()
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "@derp/shared": path.resolve(__vite_injected_original_dirname, "../../packages/shared/src"),
      "@derp/math": path.resolve(__vite_injected_original_dirname, "../../packages/math/src")
    }
  },
  server: {
    port: 5e3,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (path2) => path2.replace(/^\/api/, "")
      },
      "/media": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9ydW5uZXIvd29ya3NwYWNlL2FwcHMvd2ViXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9ydW5uZXIvd29ya3NwYWNlL2FwcHMvd2ViL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3J1bm5lci93b3Jrc3BhY2UvYXBwcy93ZWIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuXG4vLyBNaXJyb3JzIHNyYy9zZXJ2aWNlcy9hcGkudHM6IEFQSV9CQVNFID0gVklURV9BUElfVVJMPy5yZXBsYWNlKC9cXC8kLywgJycpID8/ICcvYXBpJ1xuY29uc3QgcmF3QXBpVXJsID0gKHByb2Nlc3MuZW52LlZJVEVfQVBJX1VSTCA/PyAnJykucmVwbGFjZSgvXFwvJC8sICcnKTtcblxuLy8gT25seSBhYnNvbHV0ZSBVUkxzIChodHRwL2h0dHBzKSBpbmRpY2F0ZSBhIGNyb3NzLW9yaWdpbiBiYWNrZW5kLlxuLy8gbmV3IFVSTCgpIHRocm93cyBvbiByZWxhdGl2ZSBwYXRocywgc28gZ3VhcmQgYmVmb3JlIGNhbGxpbmcgaXQuXG5jb25zdCBpc0Nyb3NzT3JpZ2luID1cbiAgcmF3QXBpVXJsLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSB8fCByYXdBcGlVcmwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKTtcblxuZnVuY3Rpb24gcmVFc2NhcGUoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHMucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbn1cblxuLy8gQnVpbGQgcnVudGltZUNhY2hpbmcgdXNpbmcgUmVnRXhwIHVybFBhdHRlcm5zIGNvbnN0cnVjdGVkIGF0IGNvbmZpZyB0aW1lLlxuLy8gV29ya2JveCBzZXJpYWxpc2VzIGZ1bmN0aW9uIHVybFBhdHRlcm5zIHZpYSAudG9TdHJpbmcoKSBcdTIwMTQgYW55IGNsb3N1cmUgdmFyaWFibGVcbi8vIGNhcHR1cmVkIGZyb20gdGhpcyBtb2R1bGUgc2NvcGUgaXMgbG9zdCBpbiB0aGUgZ2VuZXJhdGVkIFNXLiAgUmVnRXhwcyBhcmVcbi8vIGVtYmVkZGVkIHZlcmJhdGltIGFuZCBhbHdheXMgcmVzb2x2ZSBjb3JyZWN0bHkuXG5mdW5jdGlvbiBidWlsZFJ1bnRpbWVDYWNoaW5nKCkge1xuICBpZiAoaXNDcm9zc09yaWdpbikge1xuICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwocmF3QXBpVXJsKTtcbiAgICBjb25zdCBlbyA9IHJlRXNjYXBlKHBhcnNlZC5vcmlnaW4pO1xuICAgIGNvbnN0IGVwID0gcmVFc2NhcGUocGFyc2VkLnBhdGhuYW1lLnJlcGxhY2UoL1xcLz8kLywgJycpKTtcblxuICAgIHJldHVybiBbXG4gICAgICB7XG4gICAgICAgIHVybFBhdHRlcm46IG5ldyBSZWdFeHAoYF4ke2VvfS9tZWRpYS9gKSxcbiAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnIGFzIGNvbnN0LFxuICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgY2FjaGVOYW1lOiAnZGVycC1tZWRpYScsXG4gICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiA1MDAsIG1heEFnZVNlY29uZHM6IDMwICogMjQgKiA2MCAqIDYwIH0sXG4gICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB1cmxQYXR0ZXJuOiBuZXcgUmVnRXhwKGBeJHtlb30ke2VwfS9hdWRpby9jb25maWcoPzpcXFxcPy4qKT8kYCksXG4gICAgICAgIGhhbmRsZXI6ICdTdGFsZVdoaWxlUmV2YWxpZGF0ZScgYXMgY29uc3QsXG4gICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICBjYWNoZU5hbWU6ICdkZXJwLWF1ZGlvLWNvbmZpZycsXG4gICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiA0LCBtYXhBZ2VTZWNvbmRzOiAyNCAqIDYwICogNjAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHVybFBhdHRlcm46IG5ldyBSZWdFeHAoYF4ke2VvfSR7ZXB9L2ApLFxuICAgICAgICBoYW5kbGVyOiAnTmV0d29ya09ubHknIGFzIGNvbnN0LFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgdXJsUGF0dGVybjogL15odHRwczpcXC9cXC9mb250c1xcLmdvb2dsZWFwaXNcXC5jb21cXC8vLFxuICAgICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcgYXMgY29uc3QsXG4gICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICBjYWNoZU5hbWU6ICdkZXJwLWdvb2dsZS1mb250cycsXG4gICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAzMCwgbWF4QWdlU2Vjb25kczogMzY1ICogMjQgKiA2MCAqIDYwIH0sXG4gICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL2ZvbnRzXFwuZ3N0YXRpY1xcLmNvbVxcLy8sXG4gICAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyBhcyBjb25zdCxcbiAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgIGNhY2hlTmFtZTogJ2RlcnAtZ29vZ2xlLWZvbnRzJyxcbiAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDMwLCBtYXhBZ2VTZWNvbmRzOiAzNjUgKiAyNCAqIDYwICogNjAgfSxcbiAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgXTtcbiAgfVxuXG4gIC8vIFNhbWUtb3JpZ2luOiBWSVRFX0FQSV9VUkwgdW5zZXQgb3IgcmVsYXRpdmUgKGUuZy4gL2FwaSwgL3YxKS5cbiAgLy8gUGF0aCBrbm93biBhdCBidWlsZCB0aW1lIFx1MjAxNCBlbWJlZCBhcyBhIFJlZ0V4cCBsaXRlcmFsIHNvIG5vIGNsb3N1cmUgaXMgbmVlZGVkLlxuICBjb25zdCBhcGlQYXRoID0gcmF3QXBpVXJsIHx8ICcvYXBpJztcbiAgY29uc3QgZXAgPSByZUVzY2FwZShhcGlQYXRoKTtcblxuICByZXR1cm4gW1xuICAgIHtcbiAgICAgIHVybFBhdHRlcm46IC9cXC9tZWRpYVxcLy8sXG4gICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcgYXMgY29uc3QsXG4gICAgICBvcHRpb25zOiB7XG4gICAgICAgIGNhY2hlTmFtZTogJ2RlcnAtbWVkaWEnLFxuICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDUwMCwgbWF4QWdlU2Vjb25kczogMzAgKiAyNCAqIDYwICogNjAgfSxcbiAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgdXJsUGF0dGVybjogbmV3IFJlZ0V4cChgJHtlcH0vYXVkaW8vY29uZmlnKD86XFxcXD8uKik/JGApLFxuICAgICAgaGFuZGxlcjogJ1N0YWxlV2hpbGVSZXZhbGlkYXRlJyBhcyBjb25zdCxcbiAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgY2FjaGVOYW1lOiAnZGVycC1hdWRpby1jb25maWcnLFxuICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDQsIG1heEFnZVNlY29uZHM6IDI0ICogNjAgKiA2MCB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHtcbiAgICAgIHVybFBhdHRlcm46IG5ldyBSZWdFeHAoYCR7ZXB9L2ApLFxuICAgICAgaGFuZGxlcjogJ05ldHdvcmtPbmx5JyBhcyBjb25zdCxcbiAgICB9LFxuICAgIHtcbiAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvZm9udHNcXC5nb29nbGVhcGlzXFwuY29tXFwvLyxcbiAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyBhcyBjb25zdCxcbiAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgY2FjaGVOYW1lOiAnZGVycC1nb29nbGUtZm9udHMnLFxuICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDMwLCBtYXhBZ2VTZWNvbmRzOiAzNjUgKiAyNCAqIDYwICogNjAgfSxcbiAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXG4gICAgICB9LFxuICAgIH0sXG4gICAge1xuICAgICAgdXJsUGF0dGVybjogL15odHRwczpcXC9cXC9mb250c1xcLmdzdGF0aWNcXC5jb21cXC8vLFxuICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnIGFzIGNvbnN0LFxuICAgICAgb3B0aW9uczoge1xuICAgICAgICBjYWNoZU5hbWU6ICdkZXJwLWdvb2dsZS1mb250cycsXG4gICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMzAsIG1heEFnZVNlY29uZHM6IDM2NSAqIDI0ICogNjAgKiA2MCB9LFxuICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgXTtcbn1cblxuLy8gbmF2aWdhdGVGYWxsYmFja0RlbnlsaXN0OiBwYXRobmFtZXMgdGhhdCBtdXN0IG5ldmVyIGZhbGwgYmFjayB0byBpbmRleC5odG1sLlxuLy8gRm9yIGNyb3NzLW9yaWdpbiBkZXBsb3ltZW50cyB0aGUgZnJvbnRlbmQgaGFzIG5vIC9hcGkvIHJvdXRlcywgc28gdGhlIHN0YXRpY1xuLy8gZGVmYXVsdHMgc3VmZmljZS4gIEZvciBzYW1lLW9yaWdpbiwgZGVyaXZlIHRoZSBBUEkgcGF0aCBmcm9tIFZJVEVfQVBJX1VSTCBzb1xuLy8gYSBub24tZGVmYXVsdCBwcmVmaXggKGUuZy4gL3YyKSBpcyBhbHNvIGNvdmVyZWQuXG5mdW5jdGlvbiBidWlsZE5hdmlnYXRlRmFsbGJhY2tEZW55bGlzdCgpOiBSZWdFeHBbXSB7XG4gIGNvbnN0IGJhc2UgPSBbL15cXC9tZWRpYVxcLy8sIC9eXFwvdjFcXC8vXTtcbiAgaWYgKGlzQ3Jvc3NPcmlnaW4pIHtcbiAgICAvLyBBUEkgaXMgb24gYSBkaWZmZXJlbnQgb3JpZ2luIFx1MjAxNCB0aGUgU1BBIG9yaWdpbiB3b24ndCByZWNlaXZlIC9hcGkvIG5hdmlnYXRlcy5cbiAgICByZXR1cm4gWy9eXFwvYXBpXFwvLywgLi4uYmFzZV07XG4gIH1cbiAgY29uc3QgYXBpUGF0aCA9IHJhd0FwaVVybCB8fCAnL2FwaSc7XG4gIHJldHVybiBbbmV3IFJlZ0V4cChgXiR7cmVFc2NhcGUoYXBpUGF0aCl9L2ApLCAuLi5iYXNlXTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcbiAgICAgIGluamVjdFJlZ2lzdGVyOiBmYWxzZSxcbiAgICAgIGluY2x1ZGVBc3NldHM6IFtcbiAgICAgICAgJ2RlcnAuc3ZnJyxcbiAgICAgICAgJ2Zhdmljb24tMzIucG5nJyxcbiAgICAgICAgJ2FwcGxlLXRvdWNoLWljb24ucG5nJyxcbiAgICAgIF0sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiAnRGVycCBVbml2ZXJzZScsXG4gICAgICAgIHNob3J0X25hbWU6ICdEZXJwJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdTZWFzb24tYmFzZWQgaWRsZSBzdHJhdGVneSBSUEcuJyxcbiAgICAgICAgc3RhcnRfdXJsOiAnLycsXG4gICAgICAgIHNjb3BlOiAnLycsXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcbiAgICAgICAgb3JpZW50YXRpb246ICdhbnknLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnIzBjMGExYScsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnIzFlMWIzYScsXG4gICAgICAgIGljb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgc3JjOiAnL3B3YS0xOTJ4MTkyLnBuZycsXG4gICAgICAgICAgICBzaXplczogJzE5MngxOTInLFxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXG4gICAgICAgICAgICBwdXJwb3NlOiAnYW55JyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogJy9wd2EtNTEyeDUxMi5wbmcnLFxuICAgICAgICAgICAgc2l6ZXM6ICc1MTJ4NTEyJyxcbiAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxuICAgICAgICAgICAgcHVycG9zZTogJ2FueScsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBzcmM6ICcvcHdhLW1hc2thYmxlLTE5Mi5wbmcnLFxuICAgICAgICAgICAgc2l6ZXM6ICcxOTJ4MTkyJyxcbiAgICAgICAgICAgIHR5cGU6ICdpbWFnZS9wbmcnLFxuICAgICAgICAgICAgcHVycG9zZTogJ21hc2thYmxlJyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNyYzogJy9wd2EtbWFza2FibGUtNTEyLnBuZycsXG4gICAgICAgICAgICBzaXplczogJzUxMng1MTInLFxuICAgICAgICAgICAgdHlwZTogJ2ltYWdlL3BuZycsXG4gICAgICAgICAgICBwdXJwb3NlOiAnbWFza2FibGUnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgd29ya2JveDoge1xuICAgICAgICBnbG9iUGF0dGVybnM6IFsnKiovKi57anMsY3NzLGh0bWwsc3ZnLHdvZmYsd29mZjIsdHRmfSddLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrRGVueWxpc3Q6IGJ1aWxkTmF2aWdhdGVGYWxsYmFja0RlbnlsaXN0KCksXG4gICAgICAgIGNsZWFudXBPdXRkYXRlZENhY2hlczogdHJ1ZSxcbiAgICAgICAgY2xpZW50c0NsYWltOiB0cnVlLFxuICAgICAgICBza2lwV2FpdGluZzogZmFsc2UsXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBidWlsZFJ1bnRpbWVDYWNoaW5nKCksXG4gICAgICB9LFxuICAgICAgZGV2T3B0aW9uczoge1xuICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgfSksXG4gIF0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKSxcbiAgICAgICdAZGVycC9zaGFyZWQnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vcGFja2FnZXMvc2hhcmVkL3NyYycpLFxuICAgICAgJ0BkZXJwL21hdGgnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vcGFja2FnZXMvbWF0aC9zcmMnKSxcbiAgICB9LFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MDAwLFxuICAgIGhvc3Q6ICcwLjAuMC4wJyxcbiAgICBhbGxvd2VkSG9zdHM6IHRydWUsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vMTI3LjAuMC4xOjMwMDEnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHJld3JpdGU6IChwYXRoOiBzdHJpbmcpID0+IHBhdGgucmVwbGFjZSgvXlxcL2FwaS8sICcnKSxcbiAgICAgIH0sXG4gICAgICAnL21lZGlhJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vMTI3LjAuMC4xOjMwMDEnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1EsU0FBUyxvQkFBb0I7QUFDNVMsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUN4QixPQUFPLFVBQVU7QUFIakIsSUFBTSxtQ0FBbUM7QUFNekMsSUFBTSxhQUFhLFFBQVEsSUFBSSxnQkFBZ0IsSUFBSSxRQUFRLE9BQU8sRUFBRTtBQUlwRSxJQUFNLGdCQUNKLFVBQVUsV0FBVyxTQUFTLEtBQUssVUFBVSxXQUFXLFVBQVU7QUFFcEUsU0FBUyxTQUFTLEdBQW1CO0FBQ25DLFNBQU8sRUFBRSxRQUFRLHVCQUF1QixNQUFNO0FBQ2hEO0FBTUEsU0FBUyxzQkFBc0I7QUFDN0IsTUFBSSxlQUFlO0FBQ2pCLFVBQU0sU0FBUyxJQUFJLElBQUksU0FBUztBQUNoQyxVQUFNLEtBQUssU0FBUyxPQUFPLE1BQU07QUFDakMsVUFBTUEsTUFBSyxTQUFTLE9BQU8sU0FBUyxRQUFRLFFBQVEsRUFBRSxDQUFDO0FBRXZELFdBQU87QUFBQSxNQUNMO0FBQUEsUUFDRSxZQUFZLElBQUksT0FBTyxJQUFJLEVBQUUsU0FBUztBQUFBLFFBQ3RDLFNBQVM7QUFBQSxRQUNULFNBQVM7QUFBQSxVQUNQLFdBQVc7QUFBQSxVQUNYLFlBQVksRUFBRSxZQUFZLEtBQUssZUFBZSxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQUEsVUFDaEUsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDMUM7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLFFBQ0UsWUFBWSxJQUFJLE9BQU8sSUFBSSxFQUFFLEdBQUdBLEdBQUUsMEJBQTBCO0FBQUEsUUFDNUQsU0FBUztBQUFB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QUFlO0FBQUEsUUFDYjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsU0FBUztBQUFBLFFBQ1QsYUFBYTtBQUFBLFFBQ2Isa0JBQWtCO0FBQUEsUUFDbEIsYUFBYTtBQUFBLFFBQ2IsT0FBTztBQUFBLFVBQ0w7QUFBQSxZQUNFLEtBQUs7QUFBQSxZQUNMLE9BQU87QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLFNBQVM7QUFBQSxVQUNYO0FBQUEsVUFDQTtBQUFBLFlBQ0UsS0FBSztBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sU0FBUztBQUFBLFVBQ1g7QUFBQSxVQUNBO0FBQUEsWUFDRSxLQUFLO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxNQUFNO0FBQUEsWUFDTixTQUFTO0FBQUEsVUFDWDtBQUFBLFVBQ0E7QUFBQSxZQUNFLEtBQUs7QUFBQSxZQUNMLE9BQU87QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLFNBQVM7QUFBQSxVQUNYO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNQLGNBQWMsQ0FBQyx1Q0FBdUM7QUFBQSxRQUN0RCxrQkFBa0I7QUFBQSxRQUNsQiwwQkFBMEIsOEJBQThCO0FBQUEsUUFDeEQsdUJBQXVCO0FBQUEsUUFDdkIsY0FBYztBQUFBLFFBQ2QsYUFBYTtBQUFBLFFBQ2IsZ0JBQWdCLG9CQUFvQjtBQUFBLE1BQ3RDO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDVixTQUFTO0FBQUEsTUFDWDtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxNQUNwQyxnQkFBZ0IsS0FBSyxRQUFRLGtDQUFXLDJCQUEyQjtBQUFBLE1BQ25FLGNBQWMsS0FBSyxRQUFRLGtDQUFXLHlCQUF5QjtBQUFBLElBQ2pFO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sY0FBYztBQUFBLElBQ2QsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsU0FBUyxDQUFDQyxVQUFpQkEsTUFBSyxRQUFRLFVBQVUsRUFBRTtBQUFBLE1BQ3REO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDUixRQUFRO0FBQUEsUUFDUixjQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImVwIiwgInBhdGgiXQp9Cg==
