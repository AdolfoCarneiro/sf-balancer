import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// index.html (o builder, página inicial) e balancer.html (a ferramenta de meio) na raiz; os estáticos (favicon, og.png, robots, sitemap) ficam em public/.
// O script de entrada segura a primeira pintura (blocking="render"), para trocar entre a Fábrica e o Balancer não mostrar
// um quadro vazio; o build reescreve a tag e perde o atributo, então ele volta aqui.
const renderBlocking = {
  name: 'render-blocking-entry',
  transformIndexHtml: { order: 'post', handler: html => html.replace(/<script type="module" crossorigin src="(\/assets\/[^"]+\.js)">/, '<script type="module" crossorigin src="$1" blocking="render">') },
};

// As rotas do vercel.json (e do nginx.conf) também no `npm run dev` e no `npm run preview`: sem elas, /pt/balancer caía no
// builder e a troca Fábrica ↔ Balancer não dava para testar aqui.
const ROUTES = [[/^\/(?:pt|es)\/?$/, '/index.html'], [/^\/(?:(?:pt|es)\/)?balancer\/?$/, '/balancer.html']];
const rewrite = (req, _res, next) => {
  const [path, query] = req.url.split('?');
  const hit = ROUTES.find(([re]) => re.test(path));
  if (hit) req.url = hit[1] + (query ? '?' + query : '');
  next();
};
const vercelRoutes = {
  name: 'vercel-routes',
  configureServer: s => { s.middlewares.use(rewrite); },
  configurePreviewServer: s => { s.middlewares.use(rewrite); },
};

export default defineConfig({
  plugins: [react(), renderBlocking, vercelRoutes],
  // O chunk do three (~690 kB) é carregado só ao abrir a aba 3D.
  build: {
    outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700,
    rolldownOptions: { input: { main: 'index.html', balancer: 'balancer.html' } },
  },
});
