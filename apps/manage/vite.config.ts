import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In der Entwicklung leitet Vite /auth und /api an das BFF weiter, damit alles unter einem Ursprung läuft.
const bff = `http://127.0.0.1:${process.env.MANAGE_BFF_PORT ?? 5174}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: { '/auth': bff, '/api': bff },
  },
  build: { outDir: 'dist', sourcemap: true },
});
