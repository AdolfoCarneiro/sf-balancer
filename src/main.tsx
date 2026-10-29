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

// A entrada do app, a mesma para o index.html (a Fábrica, em /, /pt, /es) e o balancer.html (/balancer…): a página
// vem do caminho e as duas convivem no mesmo documento (src/shell/Shell.tsx).
let saved: string | null = null;
try { saved = localStorage.getItem(LANG_STORE); } catch { /* sem storage */ }
setLang(builderLang(location.pathname, location.search, saved));

// Monta já na primeira tarefa (o script segura a pintura, blocking="render"): a página aparece pronta, sem um quadro
// vazio. Abrindo direto no Balancer, espera o módulo dele (que a Fábrica só baixa quando precisa).
const root = createRoot(document.getElementById('root')!);
const start = pageOf(location.pathname);
const render = (balancer: BalancerModule | null) => flushSync(() => root.render(<Shell start={start} balancer={balancer} />));
if (start === 'balancer') loadBalancer().then(render);
else render(null);
