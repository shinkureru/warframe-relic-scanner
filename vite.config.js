import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A project Pages site lives at /REPOSITORY/ instead of /.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
