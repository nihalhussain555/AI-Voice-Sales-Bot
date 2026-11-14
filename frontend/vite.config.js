import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxies /api to the backend so the browser stays same-origin and no CORS
// setup is needed locally. Recordings used to be proxied separately as a public
// folder; they are now served from /api/recordings and covered by this rule.
// Point VITE_PROXY_TARGET at another backend (or set VITE_API_BASE_URL and drop
// the proxy) as required.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:3001';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true }
      }
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 900
    }
  };
});
