import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Separate from vite.config.ts on purpose: the PWA plugin is build/dev only
// and brings in workbox + service-worker globals that explode under jsdom.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@derp/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@derp/math': path.resolve(__dirname, '../../packages/math/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
