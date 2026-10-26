// Cores e fontes do mapa, lidas dos tokens CSS (o canvas não entende var()).
export interface MapTheme {
  floor: string; sub: string; edge: string; paper: string; bench: string; plate: string; line: string;
  ink: string; inkDim: string; ficsit: string; flow: string; held: string; holo: string; sink: string; donor: string; ok: string; lock: string;
  machine: string; display: string; body: string;
}

export function readTheme(el: Element): MapTheme {
  const cs = getComputedStyle(el), v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    floor: v('--bp-floor', '#1b3550'), sub: v('--bp-sub', 'rgba(226,240,252,.11)'), edge: v('--bp-edge', '#eaf3fb'),
    paper: v('--paper', '#0d2136'), bench: v('--bench', '#0a1b2d'), plate: v('--plate', '#15324f'), line: v('--line', '#2d5176'),
    ink: v('--ink', '#e4eef8'), inkDim: v('--ink-dim', '#8eabc6'), ficsit: v('--ficsit', '#ff9b3d'), flow: v('--flow', '#e4eef8'),
    held: v('--held', '#7f9bb8'), holo: v('--holo', '#6fe3ff'), sink: v('--sink', '#ff6d7c'), donor: v('--donor', '#c6a6ff'), ok: v('--ok', '#8fe3a4'),
    lock: v('--lock', '#ffd84a'),
    machine: '#1f4a72', display: v('--display', 'sans-serif'), body: v('--body', 'sans-serif'),
  };
}
