import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        home: resolve(__dirname, 'home.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        login: resolve(__dirname, 'login.html'),
        cobertura: resolve(__dirname, 'cobertura.html'),
        soporte: resolve(__dirname, 'soporte.html'),
        admin_redirect: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
