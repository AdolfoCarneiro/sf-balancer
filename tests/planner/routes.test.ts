import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALANCER_PATH, BUILDER_PATH, builderLang, legacyTarget, pageOf, pagePath, pathLang } from '../../src/shell/site.ts';
import { BALANCER_PAGES, nmOf, nmPath } from '../../src/seo/routes.js';
import { seoPages } from '../../src/seo/pages.js';

const read = (f: string) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('idioma pelo caminho do builder e do Balancer', () => {
  assert.equal(pathLang('/pt'), 'pt'); assert.equal(pathLang('/pt/'), 'pt'); assert.equal(pathLang('/en'), 'en');
  assert.equal(pathLang('/es/balancer/'), 'es'); assert.equal(pathLang('/pt/balancer'), 'pt');
  assert.equal(pathLang('/'), null); assert.equal(pathLang('/balancer'), null); assert.equal(pathLang('/balancer.html'), null);
  assert.equal(pathLang('/pt/planner'), null); assert.equal(pathLang('/ptx'), null);
  assert.equal(builderLang('/', '?lang=es', 'pt'), 'es'); assert.equal(builderLang('/', '', 'xx'), 'en');
  assert.equal(builderLang('/es', '?lang=pt', 'pt'), 'es'); assert.equal(builderLang('/', '', 'pt'), 'pt');
  assert.deepEqual(BUILDER_PATH, { en: '/', pt: '/pt', es: '/es' });
  assert.deepEqual(BALANCER_PATH, { en: '/balancer', pt: '/pt/balancer', es: '/es/balancer' });
});

test('link antigo #s= vai para o Balancer do mesmo idioma; #p= fica no builder', () => {
  assert.equal(legacyTarget('/', '#s=abc'), '/balancer#s=abc');
  assert.equal(legacyTarget('/pt', '#s=abc'), '/pt/balancer#s=abc');
  assert.equal(legacyTarget('/es/', '#s=abc'), '/es/balancer#s=abc');
  assert.equal(legacyTarget('/en', '#s=abc'), '/balancer#s=abc');
  assert.equal(legacyTarget('/index.html', '#s=abc'), '/balancer#s=abc');
  assert.equal(legacyTarget('/pt', '#s=abc', '?lang=es'), '/pt/balancer?lang=es#s=abc');
  assert.equal(legacyTarget('/', '#s=abc', '?lang=pt'), '/balancer?lang=pt#s=abc');
  assert.equal(legacyTarget('/', '#p=abc', '?lang=pt'), null);
  assert.equal(legacyTarget('/', '#p=abc'), null); assert.equal(legacyTarget('/', ''), null);
  assert.equal(legacyTarget('/balancer', '#s=abc'), null); assert.equal(legacyTarget('/pt/balancer', '#s=abc'), null);
});

// O script inline do index.html é o espelho de legacyTarget: roda o trecho dele com o mesmo conjunto de casos.
test('index.html tem o redirecionamento inline espelhando legacyTarget', () => {
  const html = read('index.html');
  const m = html.match(/<script>(\/\* legacyTarget[\s\S]*?)<\/script>/);
  assert.ok(m, 'script inline com o comentário legacyTarget');
  assert.ok(html.indexOf(m![0]) < html.indexOf('<script type="module"'), 'antes do app');
  assert.match(m![1], /location\.replace/);
  for (const [path, hash, search] of [['/', '#s=abc', ''], ['/pt', '#s=abc', ''], ['/es/', '#s=x', ''], ['/en', '#s=y', ''], ['/index.html', '#s=z', ''],
    ['/', '#s=abc', '?lang=pt'], ['/es', '#s=abc', '?lang=en'], ['/', '#p=abc', ''], ['/balancer', '#s=abc', ''], ['/pt/balancer', '#s=abc', '']]) {
    let went: string | null = null;
    const location = { pathname: path, hash, search, replace: (u: string) => { went = u; } };
    new Function('location', m![1])(location);
    assert.equal(went, legacyTarget(path, hash, search), `${path}${search}${hash}`);
  }
  // O canonical de cada idioma entra no build (src/seo/pages.js), um arquivo por página.
  assert.match(html, /hreflang="pt-BR" href="https:\/\/sf-balancer\.vercel\.app\/pt"/);
});

test('balancer.html: og:url e hreflang em /balancer; o mesmo app do index.html', () => {
  const html = read('balancer.html');
  assert.match(html, /og:url" content="https:\/\/sf-balancer\.vercel\.app\/balancer"/);
  assert.match(html, /hreflang="es" href="https:\/\/sf-balancer\.vercel\.app\/es\/balancer"/);
  // O mesmo app (src/boot.tsx): o index.html pelo src/main.tsx e o balancer.html pelo src/main-balancer.tsx, que já traz o Balancer.
  assert.match(read('index.html'), /<script type="module" src="\/src\/main\.tsx" blocking="render"><\/script>/);
  assert.match(html, /<script type="module" src="\/src\/main-balancer\.tsx" blocking="render"><\/script>/);
  assert.ok(!html.includes('lang-pending'), 'sem o anti-piscada: nada aparece antes do app montar');
});

test('página pelo caminho: /balancer nos três idiomas (e o .html do preview); o resto é a Fábrica', () => {
  for (const p of ['/balancer', '/balancer/', '/balancer.html', '/pt/balancer', '/es/balancer/', '/en/balancer']) assert.equal(pageOf(p), 'balancer', p);
  for (const p of ['/', '/pt', '/es/', '/index.html', '/balancerx', '/pt/planner']) assert.equal(pageOf(p), 'factory', p);
  assert.equal(pagePath('balancer', 'pt'), '/pt/balancer'); assert.equal(pagePath('factory', 'en'), '/');
  // As páginas de cada balancer N→M são o Balancer.
  for (const p of ['/balancer/3-to-4', '/pt/balancer/3-para-4', '/es/balancer/3-a-4/', '/balancer/3-to-4.html']) assert.equal(pageOf(p), 'balancer', p);
  assert.equal(pathLang('/pt/balancer/3-para-4'), 'pt'); assert.equal(pathLang('/balancer/3-to-4'), null);
  assert.equal(pagePath('balancer', 'es', { n: 3, m: 4 }), '/es/balancer/3-a-4'); assert.equal(pagePath('factory', 'es', { n: 3, m: 4 }), '/es');
});

test('balancer N→M pelo endereço: só os da lista, em qualquer idioma', () => {
  assert.deepEqual(nmOf('/balancer/3-to-4'), { n: 3, m: 4 }); assert.deepEqual(nmOf('/pt/balancer/1-para-5'), { n: 1, m: 5 });
  assert.deepEqual(nmOf('/es/balancer/12-a-12/'), { n: 12, m: 12 });
  assert.equal(nmOf('/balancer/11-to-3'), null); assert.equal(nmOf('/balancer'), null); assert.equal(nmOf('/balancer/3-to-4/x'), null);
  for (const [n, m] of BALANCER_PAGES) for (const l of ['en', 'pt', 'es']) assert.deepEqual(nmOf(nmPath(l, n, m)), { n, m });
});

test('vercel.json e nginx.conf: /planner* redireciona para o builder e /balancer existe nos três idiomas', () => {
  const v = JSON.parse(read('vercel.json'));
  const redir = v.redirects.map((r: { source: string; destination: string; permanent: boolean }) => [r.source, r.destination, r.permanent]);
  assert.deepEqual(redir, [
    ['/en', '/', true], ['/en/balancer', '/balancer', true], ['/planner', '/', true], ['/en/planner', '/', true], ['/:lang(pt|es)/planner', '/:lang', true],
  ]);
  // Cada página é um arquivo gerado no build (cleanUrls): sem rewrites.
  assert.equal(v.rewrites, undefined); assert.equal(v.cleanUrls, true);
  const n = read('nginx.conf');
  // Redirects com a query, como a Vercel ($is_args$args).
  for (const s of ['location = /en { return 301 /$is_args$args; }', 'location = /en/balancer { return 301 /balancer$is_args$args; }',
    'location = /planner { return 301 /$is_args$args; }', 'location = /planner.html { return 301 /$is_args$args; }',
    'location = /en/planner { return 301 /$is_args$args; }', 'location ~ ^/(pt|es)/planner/?$ { return 301 /$1$is_args$args; }',
    'try_files $uri $uri.html $uri/ =404;']) assert.ok(n.includes(s), s);
  assert.ok(!n.includes('try_files /planner.html'));
  assert.ok(!/return 301 [^;$]*;/.test(n), 'redirect sem a query');
  assert.match(read('vite.config.js'), /input: \{ main: 'index.html', balancer: 'balancer.html' \}/);
});

// As páginas do build (src/seo/pages.js) a partir do index.html e do balancer.html do repositório.
const built = seoPages({ index: read('index.html'), balancer: read('balancer.html') }, '2026-10-29');
const file = (f: string) => built.files.find(x => x.file === f)!.html;

test('build: uma página por rota e idioma, com lang, título, canonical e hreflang dela', () => {
  const nm = BALANCER_PAGES.length;
  assert.equal(built.files.length, 3 * (2 + nm));
  for (const f of ['index.html', 'pt.html', 'es.html', 'balancer.html', 'pt/balancer.html', 'es/balancer.html', 'balancer/3-to-4.html', 'pt/balancer/3-para-4.html', 'es/balancer/3-a-4.html']) assert.ok(file(f), f);
  const pt = file('pt.html');
  assert.match(pt, /<html lang="pt-BR">/); assert.match(pt, /<title>Planejador de Fábrica/);
  assert.match(pt, /<link rel="canonical" href="https:\/\/sf-balancer\.vercel\.app\/pt">/);
  assert.match(pt, /og:locale" content="pt_BR"/);
  assert.match(pt, /data-i18n="plAboutTitle">Planejador de fábrica/, 'a seção Sobre no idioma');
  assert.match(pt, /"@type": "FAQPage"/);
  for (const { file: f, html } of built.files) {
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, f);
    assert.equal((html.match(/hreflang=/g) || []).length, 4, f);
    assert.match(html, /<script type="module" src="\/src\/main(-balancer)?\.tsx" blocking="render"><\/script>/, f);
  }
});

test('build: o Balancer e cada N→M levam o texto no HTML (dentro do #root, que o React troca)', () => {
  const b = file('es/balancer.html');
  assert.match(b, /<div id="root"><main class="seo-static">\n<h1>Calculadora de balanceadores/);
  assert.match(b, /href="\/es\/balancer\/1-a-5"/, 'links para os N→M');
  const nm = file('balancer/1-to-5.html');
  assert.match(nm, /<title>Satisfactory 1 to 5 Load Balancer/);
  assert.match(nm, /<link rel="canonical" href="https:\/\/sf-balancer\.vercel\.app\/balancer\/1-to-5">/);
  assert.match(nm, /hreflang="pt-BR" href="https:\/\/sf-balancer\.vercel\.app\/pt\/balancer\/1-para-5"/);
  assert.match(nm, /<svg class="bsvg flat"/); assert.match(nm, /<ol><li>/); assert.match(nm, /BreadcrumbList/);
  assert.ok(!nm.includes('href="/balancer/1-to-5"><'), 'sem link para ela mesma na lista');
});

test('sitemap: todas as páginas, sem /planner, com os hreflang de cada uma', () => {
  const s = built.sitemap;
  const locs = [...s.matchAll(/<loc>https:\/\/sf-balancer\.vercel\.app(.*?)<\/loc>/g)].map(m => m[1]);
  assert.equal(locs.length, built.files.length);
  for (const p of ['/', '/pt', '/es', '/balancer', '/pt/balancer', '/es/balancer', '/balancer/3-to-4', '/pt/balancer/3-para-4']) assert.ok(locs.includes(p), p);
  assert.ok(!s.includes('planner'));
  assert.ok(s.includes('<lastmod>2026-10-29</lastmod>'));
  for (const block of s.split('<url>').slice(1)) {
    const loc = block.match(/<loc>https:\/\/sf-balancer\.vercel\.app(.*?)<\/loc>/)![1];
    const hrefs = [...block.matchAll(/hreflang="([^"]+)" href="https:\/\/sf-balancer\.vercel\.app(.*?)"/g)].map(m => m[2]);
    assert.equal(hrefs.length, 4, loc);
    assert.ok(hrefs.includes(loc), loc);
  }
});


test('as duas páginas têm as abas Fábrica | Balancer (a barra comum do shell)', () => {
  const bar = read('src/shell/SiteBar.tsx');
  assert.ok(bar.includes("'navFactory'") && bar.includes("'navBalancer'"));
  assert.match(read('src/planner/ui/Header.tsx'), /<SiteBar nav=\{nav\}>/);
  assert.match(read('src/balancer/Balancer.tsx'), /<SiteBar nav=\{nav\}>/);
});
