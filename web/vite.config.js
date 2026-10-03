import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Si el 5173 está ocupado, falla en vez de usar otro puerto: la API solo acepta
    // (CORS) solicitudes desde http://localhost:5173.
    strictPort: true,
  },
});
