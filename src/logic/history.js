// Histórico de desfazer/refazer.
// Pilha imutável: past (mais antigo primeiro), present, future (o próximo a refazer primeiro).
export function historyNew(present, limit = 100) { return { past: [], present, future: [], limit }; }

const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Passo novo: igual ao atual não conta; descarta o que dava para refazer; guarda no máximo `limit` passos para trás.
export function historyPush(h, state) {
  if (sameState(h.present, state)) return h;
  return { ...h, past: [...h.past, h.present].slice(-h.limit), present: state, future: [] };
}

export function historyUndo(h) {
  if (!h.past.length) return h;
  return { ...h, past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function historyRedo(h) {
  if (!h.future.length) return h;
  return { ...h, past: [...h.past, h.present].slice(-h.limit), present: h.future[0], future: h.future.slice(1) };
}

// Troca o estado atual sem criar passo (ex.: os mesmos números escritos no formato de outro idioma).
export function historyReplace(h, state) { return { ...h, present: state }; }
