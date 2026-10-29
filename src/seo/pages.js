// As páginas estáticas do site, geradas no build (vite.config.js) a partir do index.html e do balancer.html já montados:
// uma por rota e idioma, com o <head> no idioma (título, descrição, canonical, hreflang, Open Graph e dados estruturados)
// e o texto que os buscadores leem sem rodar JavaScript (no Balancer e em cada balancer N→M, dentro do #root, que o React
// troca ao montar; na Fábrica, a seção Sobre/FAQ). E o sitemap com todas. Sem DOM: só texto.
import { getLang, setLang, t, fmt } from '../i18n/index.js';
import { designPieces, layout3d } from '../logic/index.js';
import { flatSvg, segName, stepTexts, tags } from '../balancer/balancerSvg.js';
import { BALANCER_PAGES, LANG_CODES, nmPath } from './routes.js';
import { NM_BELT, nmFacts, nmInfo, nmMeta, nmName } from './nm.js';

export const SITE = 'https://sf-balancer.vercel.app';
const HTML_LANG = { en: 'en', pt: 'pt-BR', es: 'es' };
const OG_LOCALE = { en: 'en_US', pt: 'pt_BR', es: 'es_ES' };
const FACTORY = { en: '/', pt: '/pt', es: '/es' };
const BALANCER = { en: '/balancer', pt: '/pt/balancer', es: '/es/balancer' };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// O arquivo de cada endereço (cleanUrls na Vercel, try_files no nginx): /pt → pt.html, /balancer/3-to-4 → balancer/3-to-4.html.
export const fileOf = path => (path === '/' ? 'index.html' : path.slice(1) + '.html');
const inLang = (l, f) => { const was = getLang(); setLang(l); try { return f(); } finally { setLang(was); } };
function rep(html, re, to) {
  if (!re.test(html)) throw new Error(`seo: não achei ${re} no HTML base`);
  return html.replace(re, to);
}

// O <head> no idioma da página. alts: o endereço da mesma página em cada idioma.
function head(html, { lang, path, alts, title, desc, ld }) {
  const url = SITE + path;
  html = rep(html, /<html lang="[^"]*">/, `<html lang="${HTML_LANG[lang]}">`);
  html = rep(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = rep(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">\n<link rel="canonical" href="${url}">`);
  html = html.replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n?/g, '');
  const hreflang = [...LANG_CODES.map(l => [HTML_LANG[l], alts[l]]), ['x-default', alts.en]]
    .map(([h, p]) => `<link rel="alternate" hreflang="${h}" href="${SITE + p}">`).join('\n');
  html = rep(html, /<meta property="og:type"/, `${hreflang}\n<meta property="og:type"`);
  html = rep(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title.replace(/ \| SF Balancer$/, ''))}">`);
  html = rep(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  html = rep(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  html = html.replace(/<meta property="og:locale(?::alternate)?" content="[^"]*">\n?/g, '');
  const locales = [`<meta property="og:locale" content="${OG_LOCALE[lang]}">`, ...LANG_CODES.filter(l => l !== lang).map(l => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`)].join('\n');
  html = rep(html, /<meta name="twitter:card"/, `${locales}\n<meta name="twitter:card"`);
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
  const json = ld.map(o => `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', ...o }, null, 2)}\n</script>`).join('\n');
  html = rep(html, /<script defer src="\/_vercel\/insights\/script\.js"><\/script>/, `${json}\n$&`);
  html = rep(html, /(<noscript><p[^>]*>)[^<]*(<\/p><\/noscript>)/, `$1${esc(t('noJs'))}$2`);
  return html;
}

const app = (path, title, desc) => ({
  '@type': 'WebApplication', name: 'SF Balancer', alternateName: title.replace(/ \| SF Balancer$/, ''), url: SITE + path, description: desc,
  applicationCategory: 'GameApplication', operatingSystem: 'Any', browserRequirements: 'Requires JavaScript',
  inLanguage: HTML_LANG[getLang()], isAccessibleForFree: true, license: 'https://opensource.org/licenses/MIT',
  codeRepository: 'https://github.com/AdolfoCarneiro/sf-balancer', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  about: { '@type': 'VideoGame', name: 'Satisfactory' },
});
const faq = keys => ({
  '@type': 'FAQPage',
  mainEntity: keys.map(([q, a]) => ({ '@type': 'Question', name: t(q), acceptedAnswer: { '@type': 'Answer', text: t(a) } })),
});
const range = n => Array.from({ length: n }, (_, i) => i + 1);

// Os links para as páginas de cada balancer (a biblioteca do app mostra a mesma lista).
const nmLinks = (lang, skip) => `<ul class="seo-nm">${BALANCER_PAGES.filter(([n, m]) => !(skip && n === skip[0] && m === skip[1]))
  .map(([n, m]) => `<li><a href="${nmPath(lang, n, m)}">${n} → ${m}</a></li>`).join('')}</ul>`;

// O texto do /balancer: o que é, como funciona, os casos, a biblioteca e as perguntas.
function balancerBody(lang) {
  const p = k => `<p>${esc(t(k))}</p>`;
  const learn = ['What', 'How', 'Why', 'Not', 'Bf'].map(k => `<h3>${esc(t(`lb${k}Title`))}</h3>${p(`lb${k}`)}`).join('');
  return `<main class="seo-static">
<h1>${esc(t('kicker'))}</h1>${p('intro')}
<h2>${esc(t('guideTitle'))}</h2>${p('guideLead')}
${['Collect', 'Mid', 'Dist'].map(k => `<h3>${esc(t(`g${k}Title`))}</h3>${p(`g${k}`)}`).join('')}
<h3>${esc(t('casesTitle'))}</h3><ul>${['A', 'B', 'C', 'D'].map(c => `<li><b>${esc(t(`case${c}Name`))}</b> ${esc(t(`case${c}Text`))}</li>`).join('')}</ul>
<h3>${esc(t('mechTitle'))}</h3><ul>${[['Splitter', 'mechSplitter'], ['Merger', 'mechMerger'], ['Smart Splitter', 'mechSmart'], ['Awesome Sink', 'mechSink']].map(([n, k]) => `<li><b>${n}</b> ${esc(t(k))}</li>`).join('')}</ul>
<h2>${esc(t('libTitle'))}</h2>${p('libLead')}${learn}
<h3>${esc(t('lbBuildTitle'))}</h3><ol>${range(5).map(i => `<li>${esc(t('lbBuild' + i))}</li>`).join('')}</ol>
<h3>${esc(t('libReady'))}</h3>${nmLinks(lang)}
<h2>${esc(t('faqTitle'))}</h2>${range(6).map(i => `<h3>${esc(t(`faq${i}Q`))}</h3>${p(`faq${i}A`)}`).join('')}
</main>`;
}

// O texto de um balancer N→M: a melhor montagem (desenho, passo a passo, conferência das esteiras), as outras e os links.
function nmBody(lang, n, m) {
  const info = nmInfo(n, m), d = info.best, f = nmFacts(info), meta = nmMeta(n, m);
  const labels = { ins: tags(t('inTag'), n), outs: tags(t('outTag'), m) };
  const { steps } = stepTexts(d, layout3d(d, 'flat'), labels, 'flat');
  return `<main class="seo-static">
<h1>${esc(meta.h1)}</h1>
<p>${esc(t('nmLead', { ...f, name: nmName(d) }))}</p>${f.loop ? `<p>${esc(t('nmLoop'))}</p>` : ''}
<figure>${flatSvg(d, layout3d(d, 'flat'), labels, 'level', false)}</figure>
<h2>${esc(t('nmStepsTitle'))}</h2><ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
<h2>${esc(t('checksTitle'))}</h2><table><tr><th>${esc(t('thSegment'))}</th><th>${esc(t('thLoad'))}</th><th>${esc(t('thFits', NM_BELT.id))}</th></tr>${d.segments.map(s => `<tr><td>${esc(segName(s))}</td><td>${fmt(s.rate)}</td><td>${s.ok ? '✓' : '✗'}</td></tr>`).join('')}</table>
${info.others.length ? `<h2>${esc(t('nmOthersTitle'))}</h2><ul>${info.others.map(o => `<li>${esc(t('nmOther', { name: nmName(o), pieces: designPieces(o), per: fmt(o.perOut) }))}</li>`).join('')}</ul>` : ''}
<p><a href="${nmPath(lang, n, m)}">${esc(t('nmOpen'))}</a> · <a href="${BALANCER[lang]}">${esc(t('nmBack'))}</a></p>
<h2>${esc(t('lbWhatTitle'))}</h2><p>${esc(t('lbWhat'))}</p>
<h2>${esc(t('nmMoreTitle'))}</h2>${nmLinks(lang, [n, m])}
</main>`;
}

// A seção Sobre/FAQ do index.html no idioma (cada elemento com data-i18n é um texto só).
const about = html => html.replace(/<(h1|h2|p|li|summary)([^>]*) data-i18n="(\w+)"([^>]*)>[\s\S]*?<\/\1>/g,
  (_, tag, a, key, b) => `<${tag}${a} data-i18n="${key}"${b}>${esc(t(key))}</${tag}>`);
const root = (html, body) => rep(html, /<div id="root"><\/div>/, `<div id="root">${body}</div>`);

// tpl: o index.html e o balancer.html do build. Devolve [{ file, html }] e o sitemap.
export function seoPages(raw, date = new Date().toISOString().slice(0, 10)) {
  // O HTML do repositório pode vir com CRLF (Windows); as linhas que entram aqui são LF.
  const tpl = { index: raw.index.replace(/\r\n/g, '\n'), balancer: raw.balancer.replace(/\r\n/g, '\n') };
  const pages = [];
  for (const lang of LANG_CODES) inLang(lang, () => {
    const fTitle = t('plPageTitle'), fDesc = t('plMetaDesc');
    pages.push({ path: FACTORY[lang], alts: FACTORY, html: about(head(tpl.index, {
      lang, path: FACTORY[lang], alts: FACTORY, title: fTitle, desc: fDesc,
      ld: [app(FACTORY[lang], fTitle, fDesc), faq(range(6).map(i => [`plFaq${i}Q`, `plFaq${i}A`]))],
    })) });
    const bTitle = t('pageTitle'), bDesc = t('metaDesc');
    pages.push({ path: BALANCER[lang], alts: BALANCER, html: root(head(tpl.balancer, {
      lang, path: BALANCER[lang], alts: BALANCER, title: bTitle, desc: bDesc,
      ld: [app(BALANCER[lang], bTitle, bDesc), faq(range(6).map(i => [`faq${i}Q`, `faq${i}A`]))],
    }), balancerBody(lang)) });
    for (const [n, m] of BALANCER_PAGES) {
      const path = nmPath(lang, n, m), alts = Object.fromEntries(LANG_CODES.map(l => [l, nmPath(l, n, m)]));
      const meta = nmMeta(n, m);
      pages.push({ path, alts, html: root(head(tpl.balancer, {
        lang, path, alts, title: meta.title, desc: meta.desc,
        ld: [app(path, meta.title, meta.desc), {
          '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'SF Balancer', item: SITE + FACTORY[lang] },
            { '@type': 'ListItem', position: 2, name: t('libTitle'), item: SITE + BALANCER[lang] },
            { '@type': 'ListItem', position: 3, name: `${n} → ${m}`, item: SITE + path },
          ],
        }],
      }), nmBody(lang, n, m)) });
    }
  });
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map(pg => `  <url>
    <loc>${SITE + pg.path}</loc>
    <lastmod>${date}</lastmod>
${[...LANG_CODES.map(l => [HTML_LANG[l], pg.alts[l]]), ['x-default', pg.alts.en]].map(([h, p]) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${SITE + p}"/>`).join('\n')}
  </url>`).join('\n')}
</urlset>
`;
  return { files: pages.map(pg => ({ file: fileOf(pg.path), html: pg.html })), sitemap };
}
