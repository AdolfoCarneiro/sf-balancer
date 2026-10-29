// Estado de UI reatribuído por mais de um módulo. Um `let` importado é só leitura para quem importa,
// então fica num objeto único mutável.
export const S = {
  root: null,      // o elemento onde a página foi montada (mount.js)
  active: false,   // a página está na tela (o shell avisa); escondida, os atalhos de teclado são da Fábrica
  selectedKey: null,
  histQuiet: false,
  tipBtn: null,
  tipPinned: false,
  HIST: null,
  histTimer: null,
  lastRender: null,
  msgTimer: null,
};
