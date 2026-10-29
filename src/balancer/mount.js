import markup from './page.html?raw';
import './balancer.css';
import { S } from './state.js';
import { initEvents } from './events.js';
import { init } from './init.js';
import { hideTip } from './help.js';
import { langChanged as relabel } from './lang.js';

// A página Balancer dentro do app: o shell (BalancerPage.tsx) carrega este módulo na primeira vez que ela
// aparece e chama mount() uma vez; depois a página fica montada (escondida enquanto a Fábrica está na tela).
export function mount(host) {
  if (S.root) return;
  S.root = host;
  host.innerHTML = markup;
  // Mesma ordem do antigo arquivo único: primeiro os eventos, depois estado e primeiro render.
  initEvents(host);
  init();
}

export function setActive(on) {
  S.active = on;
  if (!on && S.tipBtn && S.root?.contains(S.tipBtn)) hideTip();
}

// O shell trocou o idioma (era `prev`); antes de montar não há o que trocar (init() já monta no idioma de agora).
export function langChanged(prev) {
  if (S.root) relabel(prev);
}
