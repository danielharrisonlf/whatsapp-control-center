import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The monorepo root .env is shared with the API.
  const env = { ...loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), ''), ...process.env };
  const apiTarget = env.VITE_API_PROXY_TARGET || `http://localhost:${env.API_PORT || 3000}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      watch: env.CHOKIDAR_USEPOLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
      // Same-origin API: cookies stay first-party and SameSite=Lax just works.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false, rewrite: (path) => path.replace(/^\/api/, '') },
      },
    },
    preview: {
      port: 4173,
      proxy: { '/api': { target: apiTarget, rewrite: (path) => path.replace(/^\/api/, '') } },
    },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // React and its CommonJS internals must stay in one chunk; splitting them breaks interop.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id))
              return 'react';
            if (/[\\/](recharts|d3-|victory-vendor)/.test(id)) return 'charts';
            if (/[\\/](@codemirror|@uiw|@lezer|codemirror)/.test(id)) return 'editor';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
