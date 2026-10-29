import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Um app só (src/main.tsx) com duas portas de entrada na raiz: index.html (a Fábrica, página inicial) e balancer.html (o
// mesmo app aberto no Balancer, com o <head> dele para os buscadores); os estáticos (favicon, og.png, robots, sitemap)
// ficam em public/. Os scripts de entrada seguram a primeira pintura (blocking="render"), para a página aparecer já
// montada; o build reescreve as tags (e pode dividir a entrada em mais de um arquivo) e perde o atributo, que volta aqui.
const renderBlocking = {
  name: 'render-blocking-entry',
  transformIndexHtml: { order: 'post', handler: html => html.replace(/<script type="module" crossorigin src="(\/assets\/[^"]+\.js)">/g, '<script type="module" crossorigin src="$1" blocking="render">') },
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
