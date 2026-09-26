import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  plugins: [
    {
      name: 'spa-routes-fallback',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url || '').split('?')[0];
          const spaRoutes = ['/mikrotik', '/dashboard', '/clientes', '/cobros', '/morosos', '/ajustes', '/notificaciones'];
          if (spaRoutes.some(r => url === r || url.startsWith(r + '/'))) {
            req.url = '/dashboard.html';
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        login: resolve(__dirname, 'login.html'),
      },
    },
  },
});
