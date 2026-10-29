// Cores e fontes do mapa, lidas dos tokens CSS (o canvas não entende var()).
export interface MapTheme {
  floor: string; sub: string; edge: string; paper: string; bench: string; plate: string; line: string;
  ink: string; inkDim: string; ficsit: string; flow: string; held: string; holo: string; sink: string; donor: string; ok: string; lock: string;
  machine: string; display: string; body: string;
  // Reforma visual (Montar): estado das portas, tons de texto, chapa do cartão e as cores fixas do protótipo (máquina da
  // faixa, pontos do fundo, casca da esteira e os textos claros dos rótulos de estado).
  deficit: string; deficitBg: string; deficitInk: string; surplus: string; surplusBg: string; surplusInk: string; exitBg: string;
  ficsitSoft: string; inkMid: string; inkSoft: string; plate2: string; lineHi: string;
  stallBg: string; cardMachine: string; cardMachineHi: string; dot: string; beltCase: string;
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
    deficit: v('--deficit', '#ff7a6b'), deficitBg: v('--deficit-bg', '#3a1f24'), deficitInk: '#ffb3a8',
    surplus: v('--surplus', '#45d4c8'), surplusBg: v('--surplus-bg', '#123a3c'), surplusInk: '#8ff0e6', exitBg: '#14301f',
    ficsitSoft: '#ffc58f', inkMid: v('--ink-mid', '#c3d3e3'), inkSoft: v('--ink-soft', '#9fb6cc'), plate2: v('--plate-2', '#13314f'),
    lineHi: '#4a77a3', stallBg: '#2b2a10', cardMachine: '#2f6496', cardMachineHi: '#5b90c4', dot: '#24476b', beltCase: '#06121e',
  };
}
