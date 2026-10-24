import { defineConfig } from 'vite';

// index.html na raiz; os estáticos (favicon, og.png, robots, sitemap) ficam em public/.
export default defineConfig({
  // O chunk do three (~690 kB) é carregado só ao abrir a aba 3D.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
});
