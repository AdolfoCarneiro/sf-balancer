// Pegada da planta, marcas e gestos de vista.
// Espaço da planta: só splitters, mergers e as esteiras entre eles (entradas e saídas chegam pela borda).
// Em fundações de 8 m, e o menor Blueprint Designer que comporta (Mk1 4×4, Mk2 5×5, Mk3 6×6; 0 = nenhum).
const BP_DESIGNERS = [[1, 4], [2, 5], [3, 6]];

export function planFootprint(lay) {
  const part = new Set(lay.pieces.filter(p => p.t === 's' || p.t === 'm').map(p => p.id));
  const pts = lay.pieces.filter(p => part.has(p.id)).flatMap(p => [[p.pos[0] - 2, p.pos[2] - 2], [p.pos[0] + 2, p.pos[2] + 2]])
    .concat(...lay.belts.filter(b => part.has(b.a) && part.has(b.b)).map(b => b.pts.map(q => [q[0], q[2]])));
  const min = [0, 1].map(k => Math.min(...pts.map(q => q[k]))), max = [0, 1].map(k => Math.max(...pts.map(q => q[k])));
  const w = Math.ceil(max[0] - min[0] - 1e-6), d = Math.ceil(max[1] - min[1] - 1e-6);
  const fw = Math.ceil(w / 8 - 1e-9), fd = Math.ceil(d / 8 - 1e-9);
  const mk = (BP_DESIGNERS.find(([, f]) => Math.max(fw, fd) <= f) || [0])[0];
  return { min, max, w, d, fw, fd, mk };
}

// Marcações do Blueprint Designer na planta: quadrados de 4×4, 5×5 ou 6×6 fundações, presos na grade da planta
// (linhas em x = 4 + 8k e z = 8k metros, com cada peça no meio de uma fundação). Posição = canto de menor x e z.
export const PLAN_GRID = [4, 0];

export const designerSize = mk => (BP_DESIGNERS.find(([m]) => m === mk) || [0, 0])[1] * 8;

// step 8 prende na grade de fundações; arrastando, step 1 deixa posicionar de metro em metro.
export const snapGrid = (v, axis, step = 8) => Math.round((v - PLAN_GRID[axis]) / step) * step + PLAN_GRID[axis];

// Faixa da grade (em fundações inteiras) que o espaço da planta toca, por eixo: [início, fim] em metros.
export function planCells(fp) {
  return [0, 1].map(k => {
    const o = PLAN_GRID[k];
    return [Math.floor((fp.min[k] - o) / 8 + 1e-9) * 8 + o, Math.ceil((fp.max[k] - o) / 8 - 1e-9) * 8 + o];
  });
}

// Prende na grade (ou de step em step) e perto do balancer: a marcação sempre encosta na faixa que ele ocupa.
export function placeMark(fp, mk, x, z, step = 8) {
  const s = designerSize(mk), cells = planCells(fp);
  const [px, pz] = [x, z].map((v, k) => Math.max(cells[k][0] - s, Math.min(cells[k][1], snapGrid(v, k, step))));
  return { mk, x: px, z: pz };
}

// Padrão: centrada no balancer e, quando ele cabe na grade dela, cobrindo tudo.
export function defaultMark(fp, mk) {
  const s = designerSize(mk), cells = planCells(fp);
  const [x, z] = [0, 1].map(k => {
    const c = snapGrid((fp.min[k] + fp.max[k]) / 2 - s / 2, k), lo = cells[k][1] - s, hi = cells[k][0];
    return lo <= hi ? Math.max(lo, Math.min(hi, c)) : c;
  });
  return { mk, x, z };
}

// De início: o menor designer que comporta (#1); se não cabe em nenhum, nenhuma.
export const defaultMarks = fp => (fp.mk ? [{ id: 1, ...defaultMark(fp, fp.mk) }] : []);

// Nova marcação centrada em at = [x, z] (o meio da vista), sem cair exatamente em cima de outra.
export function addMark(fp, marks, mk, at) {
  const s = designerSize(mk);
  let m = placeMark(fp, mk, at[0] - s / 2, at[1] - s / 2);
  for (let i = 0; i < 12 && marks.some(o => o.x === m.x && o.z === m.z); i++) m = placeMark(fp, mk, m.x + 8, m.z + 8);
  return [...marks, { id: Math.max(0, ...marks.map(o => o.id)) + 1, ...m }];
}

// Toque ou clique na cena: só conta com um ponteiro durante todo o gesto e sem andar mais de 5 px.
// Uma pinça (dois dedos) nunca vira toque, nem quando o último dedo sai parado.
export function tapGesture() {
  const live = new Map();
  let multi = false;
  return {
    down(id, x, y) { live.set(id, [x, y]); if (live.size > 1) multi = true; },
    up(id, x, y) {
      const p = live.get(id);
      live.delete(id);
      const tap = !!p && !multi && Math.hypot(x - p[0], y - p[1]) <= 5;
      if (!live.size) multi = false;
      return tap;
    },
    cancel(id) { live.delete(id); if (!live.size) multi = false; },
  };
}

// Zoom do desenho 2D pelo viewBox: k > 1 aproxima no ponto (cx, cy), sem passar de 8× nem afastar além do
// desenho inteiro, e sem sair dele; panView move e prende dentro do desenho.
export function panView(vb, full, dx, dy) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return { ...vb, x: clamp(vb.x + dx, full.x, full.x + full.w - vb.w), y: clamp(vb.y + dy, full.y, full.y + full.h - vb.h) };
}

export function zoomView(vb, full, k, cx, cy) {
  const w = Math.max(full.w / 8, Math.min(full.w, vb.w / k)), h = w * full.h / full.w, r = w / vb.w;
  return panView({ x: cx - (cx - vb.x) * r, y: cy - (cy - vb.y) * r, w, h }, full, 0, 0);
}

// Distância da câmera para a esfera que envolve os limites caber inteira, no menor dos dois ângulos de visão.
export function fitDistance(bounds, fovDeg, aspect) {
  const r = Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i])) / 2;
  const v = fovDeg * Math.PI / 180, h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return Math.max(r, 4) / Math.sin(Math.min(v, h) / 2) * 1.05;
}
