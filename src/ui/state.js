// Estado de UI reatribuído por mais de um módulo. Um `let` importado é só leitura para quem importa,
// então fica num objeto único mutável.
export const S = {
  selectedKey: null,
  histQuiet: false,
  tipBtn: null,
  tipPinned: false,
  HIST: null,
  histTimer: null,
  lastRender: null,
  msgTimer: null,
};
