import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // SSE flash streams — needs timeout:0 to prevent proxy killing them
      '/api/flash': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/api/serial-auto': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      // All other API calls
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
