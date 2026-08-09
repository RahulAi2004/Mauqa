import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.API_PORT || 4200;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5183,
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
  build: {
    outDir: 'dist',
  },
});
