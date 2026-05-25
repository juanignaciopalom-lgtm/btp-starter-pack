import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Output to parent package's dist-ui/ so Express can serve it
  build: {
    outDir: path.resolve(__dirname, '../dist-ui'),
    emptyOutDir: true,
  },
  // Proxy API calls to the Express server in development
  server: {
    port: 3078,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3077',
        changeOrigin: true,
      },
    },
  },
});
