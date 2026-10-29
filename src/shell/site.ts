// Idioma e endereços das duas páginas do app: a Fábrica (/, /pt, /es) e o Balancer (/balancer, /pt/balancer, /es/balancer).
// Ordem do idioma: caminho, ?lang=, escolha salva, inglês.
import { nmPath } from '../seo/routes.js';

export type Lang = 'pt' | 'en' | 'es';
export type Page = 'factory' | 'balancer';

export const LANG_STORE = 'sf-balancer:lang';

export const BUILDER_PATH: Record<Lang, string> = { en: '/', pt: '/pt', es: '/es' };
export const BALANCER_PATH: Record<Lang, string> = { en: '/balancer', pt: '/pt/balancer', es: '/es/balancer' };

const isLang = (l: string | null | undefined): l is Lang => l === 'pt' || l === 'en' || l === 'es';

export function pathLang(pathname: string): Lang | null {
  const l = pathname.match(/^\/(pt|es|en)(?:\/balancer(?:\/\d+-(?:to|para|a)-\d+)?)?\/?$/)?.[1];
  return isLang(l) ? l : null;
}

// A página pelo caminho: /balancer (e /balancer.html, o arquivo que o vite preview serve) com ou sem o idioma na frente, e
// as páginas de cada balancer N→M (/balancer/3-to-4, src/seo/routes.js), que são o Balancer com a biblioteca já nele.
export function pageOf(pathname: string): Page {
  return /^\/(?:(?:pt|es|en)\/)?balancer(?:\.html|\/\d+-(?:to|para|a)-\d+(?:\.html)?)?\/?$/.test(pathname) ? 'balancer' : 'factory';
}
// nm: o balancer N→M aberto (só no Balancer), que tem endereço próprio.
export const pagePath = (page: Page, lang: Lang, nm?: { n: number; m: number } | null) =>
  page === 'balancer' && nm ? nmPath(lang, nm.n, nm.m) : (page === 'balancer' ? BALANCER_PATH : BUILDER_PATH)[lang];

export function builderLang(pathname: string, search: string, saved: string | null): Lang {
  const fromPath = pathLang(pathname);
  if (fromPath) return fromPath;
  const fromUrl = new URLSearchParams(search).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  if (isLang(saved)) return saved;
  return 'en';
}

// Link antigo da ferramenta (/#s=…, /pt#s=…) abre hoje o builder: manda para o Balancer do mesmo idioma (com o ?lang=).
// O script inline no <head> do index.html é o espelho desta função (o teste roda os dois com os mesmos casos).
export function legacyTarget(pathname: string, hash: string, search = ''): string | null {
  if (!/^#s=/.test(hash)) return null;
  const m = pathname.match(/^\/(?:(pt|es|en)\/?|index\.html)?$/);
  if (!m) return null;
  return BALANCER_PATH[(m[1] as Lang | undefined) ?? 'en'] + search + hash;
}
