import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@derp/shared': path.resolve(__dirname, '../../packages/shared/src'),
            '@derp/math': path.resolve(__dirname, '../../packages/math/src'),
        },
    },
    server: {
        port: 5000,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3001',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api/, ''); },
            },
            '/media': {
                target: 'http://127.0.0.1:3001',
                changeOrigin: true,
            },
        },
    },
});
