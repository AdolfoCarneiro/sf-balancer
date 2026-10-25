// Idioma e endereços das duas páginas: o builder (/, /pt, /es) e o Balancer (/balancer, /pt/balancer, /es/balancer).
// Ordem do idioma: caminho, ?lang=, escolha salva, inglês (o pickLang de src/ui/lang.js usa o mesmo pathLang).
export type Lang = 'pt' | 'en' | 'es';

export const BUILDER_PATH: Record<Lang, string> = { en: '/', pt: '/pt', es: '/es' };
export const BALANCER_PATH: Record<Lang, string> = { en: '/balancer', pt: '/pt/balancer', es: '/es/balancer' };

const isLang = (l: string | null | undefined): l is Lang => l === 'pt' || l === 'en' || l === 'es';

// O regex também está no script anti-piscada do balancer.html (o teste confere que os dois concordam).
export function pathLang(pathname: string): Lang | null {
  const l = pathname.match(/^\/(pt|es|en)(?:\/balancer)?\/?$/)?.[1];
  return isLang(l) ? l : null;
}

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
