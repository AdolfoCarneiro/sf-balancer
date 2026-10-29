import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { setLang } from './i18n/index.js';
import { LANG_STORE, builderLang, pageOf } from './shell/site.ts';
import { Shell } from './shell/Shell.tsx';
import { loadBalancer, type BalancerModule } from './balancer/BalancerPage.tsx';
import './styles/tokens.css';
import './styles/parts.css';
import './planner/planner.css';
import './shell/shell.css';

// Liga o app, o mesmo nas duas entradas (src/main.tsx da Fábrica e src/main-balancer.tsx do Balancer): a página vem do
// caminho e as duas convivem no mesmo documento (src/shell/Shell.tsx). balancer: o módulo do Balancer, quando a entrada
// já o traz.
export async function boot(balancer: BalancerModule | null) {
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANG_STORE); } catch { /* sem storage */ }
  setLang(builderLang(location.pathname, location.search, saved));
  // Monta já na primeira tarefa (o script segura a pintura, blocking="render"): a página aparece pronta, sem um quadro
  // vazio, e o texto para os buscadores que vem no #root (src/seo/pages.js) nunca aparece.
  const start = pageOf(location.pathname);
  const mod = start === 'balancer' && !balancer ? await loadBalancer() : balancer;
  const root = createRoot(document.getElementById('root')!);
  flushSync(() => root.render(<Shell start={start} balancer={mod} />));
}
