import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:8000';
const httpRelayTarget = process.env.VITE_HTTP_RELAY_TARGET || 'http://localhost:9100';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: devProxyTarget,
        changeOrigin: true,
      },
      '/camera-relay': {
        target: httpRelayTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: devProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
