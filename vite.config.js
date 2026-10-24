import { defineConfig } from 'vite';

// index.html na raiz; os estáticos (favicon, og.png, robots, sitemap) ficam em public/.
export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true },
});
