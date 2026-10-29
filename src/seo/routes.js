// Os endereços das páginas de cada balancer N→M (a biblioteca aberta já nele): /balancer/3-to-4, /pt/balancer/3-para-4,
// /es/balancer/3-a-4. Sem DOM nem React: o app, o build (as páginas estáticas e o sitemap) e os testes usam os mesmos.

// Os balancers que ganham página: os que o pessoal procura ("1 to 5 splitter", "3 to 4 balancer", "4 to 4 balancer"…).
// A lista é curta de propósito: página demais e parecida conta como conteúdo raso.
export const BALANCER_PAGES = [
  [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10],
  [2, 3], [2, 4], [2, 5], [2, 6], [2, 7],
  [3, 2], [3, 4], [3, 5],
  [4, 2], [4, 3], [4, 5], [4, 6],
  [5, 4], [5, 6], [6, 4], [6, 5], [6, 8], [8, 6],
  [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [12, 12],
];
const WORD = { en: 'to', pt: 'para', es: 'a' };
const PREFIX = { en: '', pt: '/pt', es: '/es' };
export const LANG_CODES = ['en', 'pt', 'es'];

export const nmSlug = (lang, n, m) => `${n}-${WORD[lang]}-${m}`;
export const nmPath = (lang, n, m) => `${PREFIX[lang]}/balancer/${nmSlug(lang, n, m)}`;
const isPage = (n, m) => BALANCER_PAGES.some(([a, b]) => a === n && b === m);

// O balancer N→M do endereço (só os da lista), ou null.
export function nmOf(pathname) {
  const r = pathname.match(/^\/(?:(pt|es|en)\/)?balancer\/(\d{1,2})-(to|para|a)-(\d{1,2})\/?$/);
  if (!r) return null;
  const n = +r[2], m = +r[4];
  return isPage(n, m) ? { n, m } : null;
}
