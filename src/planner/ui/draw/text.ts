// Texto no canvas: cabe numa largura (diminuindo a fonte até um mínimo, depois com reticências) e quebra em até n linhas.

// Ajusta s à largura max: tenta a fonte em px de size até min; não cabendo, corta com "…". font: (px) => fonte do canvas.
export function fitText(ctx: CanvasRenderingContext2D, s: string, max: number, font: (px: number) => string, size: number, min = size): { s: string; font: string } {
  for (let px = size; px >= min; px--) {
    ctx.font = font(px);
    if (ctx.measureText(s).width <= max) return { s, font: ctx.font };
  }
  let cut = s;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > max) cut = cut.slice(0, -1);
  return { s: cut.trimEnd() + '…', font: ctx.font };
}

// Quebra por palavras em até n linhas de largura max (a última com reticências se sobrar texto). Usa a fonte atual.
export function wrapText(ctx: CanvasRenderingContext2D, s: string, max: number, n: number): string[] {
  const words = s.split(/\s+/).filter(Boolean), out: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= max || !cur) { cur = next; continue; }
    if (out.length === n - 1) { cur = `${cur} ${words.slice(i).join(' ')}`; break; }
    out.push(cur); cur = words[i];
  }
  if (cur) out.push(cur);
  const last = out.length - 1;
  if (last >= 0 && ctx.measureText(out[last]).width > max) {
    let c = out[last];
    while (c.length > 1 && ctx.measureText(c + '…').width > max) c = c.slice(0, -1);
    out[last] = c.trimEnd() + '…';
  }
  return out;
}
