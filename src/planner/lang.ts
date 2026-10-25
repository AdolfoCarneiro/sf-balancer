// Idioma do planner: mesma ordem do pickLang de src/ui/lang.js (caminho, ?lang=, escolha salva, inglês).
export type Lang = 'pt' | 'en' | 'es';

export const PLANNER_PATH: Record<Lang, string> = { en: '/planner', pt: '/pt/planner', es: '/es/planner' };
export const SITE_PATH: Record<Lang, string> = { en: '/', pt: '/pt', es: '/es' };

const isLang = (l: string | null | undefined): l is Lang => l === 'pt' || l === 'en' || l === 'es';

export function plannerLang(pathname: string, search: string, saved: string | null): Lang {
  const fromPath = pathname.match(/^\/(pt|es|en)\/planner\/?$/)?.[1];
  if (isLang(fromPath)) return fromPath;
  const fromUrl = new URLSearchParams(search).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  if (isLang(saved)) return saved;
  return 'en';
}
