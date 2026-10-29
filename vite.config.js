import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Um app só (src/main.tsx) com duas portas de entrada na raiz: index.html (a Fábrica, página inicial) e balancer.html (o
// mesmo app aberto no Balancer, com o <head> dele para os buscadores); os estáticos (favicon, og.png, robots, sitemap)
// ficam em public/ (o sitemap é gerado, ver seo abaixo). Os scripts de entrada seguram a primeira pintura (blocking="render"), para a página aparecer já
// montada; o build reescreve as tags (e pode dividir a entrada em mais de um arquivo) e perde o atributo, que volta aqui.
const renderBlocking = {
  name: 'render-blocking-entry',
  transformIndexHtml: { order: 'post', handler: html => html.replace(/<script type="module" crossorigin src="(\/assets\/[^"]+\.js)">/g, '<script type="module" crossorigin src="$1" blocking="render">') },
};

// Uma página estática por rota e idioma (src/seo/pages.js): /pt, /es, /pt/balancer… e cada balancer N→M
// (/balancer/3-to-4, /pt/balancer/3-para-4…), com o <head> e o texto no idioma, e o sitemap. Saem do index.html e do
// balancer.html já montados; a Vercel serve cada uma pelo nome (cleanUrls), o nginx pelo try_files.
let outDir = 'dist';
const seo = {
  name: 'seo-pages',
  apply: 'build',
  configResolved: c => { outDir = path.resolve(c.root, c.build.outDir); },
  closeBundle: async () => {
    const { seoPages } = await import('./src/seo/pages.js');
    const read = f => fs.readFileSync(path.join(outDir, f), 'utf8');
    const { files, sitemap } = seoPages({ index: read('index.html'), balancer: read('balancer.html') });
    for (const { file, html } of files) {
      fs.mkdirSync(path.dirname(path.join(outDir, file)), { recursive: true });
      fs.writeFileSync(path.join(outDir, file), html);
    }
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap);
  },
};

// As rotas também no `npm run dev` e no `npm run preview`. No dev não há páginas geradas: as da Fábrica abrem o index.html
// e as do Balancer o balancer.html. No preview, cada endereço abre o arquivo dele, como na Vercel (cleanUrls).
const DEV_ROUTES = [[/^\/(?:pt|es)\/?$/, '/index.html'], [/^\/(?:(?:pt|es)\/)?balancer(?:\/\d+-(?:to|para|a)-\d+)?\/?$/, '/balancer.html']];
const devRewrite = (req, _res, next) => {
  const [p, query] = req.url.split('?');
  const hit = DEV_ROUTES.find(([re]) => re.test(p));
  if (hit) req.url = hit[1] + (query ? '?' + query : '');
  next();
};
const previewRewrite = (req, _res, next) => {
  const [p, query] = req.url.split('?');
  const clean = p.replace(/\/$/, '');
  if (clean && !/\.\w+$/.test(clean) && fs.existsSync(path.join(outDir, clean.slice(1) + '.html'))) req.url = clean + '.html' + (query ? '?' + query : '');
  next();
};
const vercelRoutes = {
  name: 'vercel-routes',
  configureServer: s => { s.middlewares.use(devRewrite); },
  configurePreviewServer: s => { outDir = path.resolve(s.config.root, s.config.build.outDir); s.middlewares.use(previewRewrite); },
};

export default defineConfig({
  plugins: [react(), renderBlocking, vercelRoutes, seo],
  // O chunk do three (~690 kB) é carregado só ao abrir a aba 3D.
  build: {
    outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700,
    rolldownOptions: { input: { main: 'index.html', balancer: 'balancer.html' } },
  },
});
