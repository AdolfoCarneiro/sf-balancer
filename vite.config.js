import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// index.html (balancer) e planner.html (planner 2D) na raiz; os estáticos (favicon, og.png, robots, sitemap) ficam em public/.
export default defineConfig({
  plugins: [react()],
  // O chunk do three (~690 kB) é carregado só ao abrir a aba 3D.
  build: {
    outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700,
    rolldownOptions: { input: { main: 'index.html', planner: 'planner.html' } },
  },
});
