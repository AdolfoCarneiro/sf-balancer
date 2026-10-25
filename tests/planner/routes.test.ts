import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BALANCER_PATH, BUILDER_PATH, builderLang, legacyTarget, pathLang } from '../../src/planner/lang.ts';

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
  for (const [path, hash] of [['/', '#s=abc'], ['/pt', '#s=abc'], ['/es/', '#s=x'], ['/en', '#s=y'], ['/index.html', '#s=z'], ['/', '#p=abc'], ['/balancer', '#s=abc'], ['/pt/balancer', '#s=abc']]) {
    let went: string | null = null;
    const location = { pathname: path, hash, replace: (u: string) => { went = u; } };
    new Function('location', m![1])(location);
    assert.equal(went, legacyTarget(path, hash), `${path}${hash}`);
  }
  assert.match(html, /<link rel="canonical" href="https:\/\/sf-balancer\.vercel\.app\/">/);
  assert.match(html, /hreflang="pt-BR" href="https:\/\/sf-balancer\.vercel\.app\/pt"/);
});

test('balancer.html: canonical, og:url e hreflang em /balancer; anti-piscada aceita o caminho novo', () => {
  const html = read('balancer.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/sf-balancer\.vercel\.app\/balancer">/);
  assert.match(html, /og:url" content="https:\/\/sf-balancer\.vercel\.app\/balancer"/);
  assert.match(html, /hreflang="es" href="https:\/\/sf-balancer\.vercel\.app\/es\/balancer"/);
  assert.match(html, /id="plLink" href="\/"/);
  const flicker = html.match(/<script>(try\{var l=[\s\S]*?)<\/script>/);
  assert.ok(flicker, 'script anti-piscada');
  const re = flicker![1].match(/pathname\.match\((\/.*?\/)\)/)![1];
  const rx = new Function(`return ${re}`)() as RegExp;
  for (const p of ['/pt', '/es/', '/pt/balancer', '/es/balancer/', '/en', '/', '/balancer', '/ptx']) assert.equal((p.match(rx) || [])[1] ?? null, pathLang(p), p);
});

test('vercel.json e nginx.conf: /planner* redireciona para o builder e /balancer existe nos três idiomas', () => {
  const v = JSON.parse(read('vercel.json'));
  const redir = v.redirects.map((r: { source: string; destination: string; permanent: boolean }) => [r.source, r.destination, r.permanent]);
  assert.deepEqual(redir, [
    ['/en', '/', true], ['/en/balancer', '/balancer', true], ['/planner', '/', true], ['/en/planner', '/', true], ['/:lang(pt|es)/planner', '/:lang', true],
  ]);
  assert.deepEqual(v.rewrites, [{ source: '/:lang(pt|es)', destination: '/' }, { source: '/:lang(pt|es)/balancer', destination: '/balancer' }]);
  const n = read('nginx.conf');
  for (const s of ['location = /en { return 301 /; }', 'location = /en/balancer { return 301 /balancer; }', 'location = /planner { return 301 /; }',
    'location = /en/planner { return 301 /; }', 'location ~ ^/(pt|es)/planner/?$ { return 301 /$1; }',
    'location ~ ^/(pt|es)/?$ { try_files /index.html =404; }', 'location ~ ^/(pt|es)/balancer/?$ { try_files /balancer.html =404; }']) assert.ok(n.includes(s), s);
  assert.ok(!n.includes('planner.html'));
  assert.match(read('vite.config.js'), /input: \{ main: 'index.html', balancer: 'balancer.html' \}/);
});

test('sitemap: seis páginas, sem /planner', () => {
  const s = read('public/sitemap.xml');
  const locs = [...s.matchAll(/<loc>https:\/\/sf-balancer\.vercel\.app(.*?)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(locs, ['/', '/pt', '/es', '/balancer', '/pt/balancer', '/es/balancer']);
  assert.ok(!s.includes('planner'));
  // hreflang cruzados: cada página do builder aponta para as três do builder, e o Balancer para as três do Balancer.
  for (const block of s.split('<url>').slice(1)) {
    const loc = block.match(/<loc>(.*?)<\/loc>/)![1];
    const hrefs = [...block.matchAll(/hreflang="([^"]+)" href="https:\/\/sf-balancer\.vercel\.app(.*?)"/g)].map(m => `${m[1]}=${m[2]}`);
    const P = loc.endsWith('/balancer') ? BALANCER_PATH : BUILDER_PATH;
    assert.deepEqual(hrefs, [`en=${P.en}`, `pt-BR=${P.pt}`, `es=${P.es}`, `x-default=${P.en}`], loc);
  }
});
