import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxies /api and /recordings to the backend so the browser stays
// same-origin and no CORS setup is needed locally. Point VITE_PROXY_TARGET at
// another backend (or set VITE_API_BASE_URL and drop the proxy) as required.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:3001';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/recordings': { target, changeOrigin: true }
      }
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 900
    }
  };
});
