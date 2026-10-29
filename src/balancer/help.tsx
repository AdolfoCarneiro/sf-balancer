// A ajuda "?": botões com data-tip abrem um balão com t(chave). Um balão só para o app inteiro (a página Balancer e o
// modal da ligação da Fábrica), criado na primeira vez: ele muda de lugar (vai para dentro do diálogo aberto), e um
// diálogo que sai da página pode levá-lo junto. Quem tem botões "?" espalha tipHandlers no elemento que os contém.
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { t } from '../i18n/index.js';

export const TIP: { btn: HTMLElement | null; pinned: boolean } = { btn: null, pinned: false };

export function Tip({ k }: { k: string }) {
  return <button type="button" className="tip" data-tip={k} aria-label={t('helpLabel')}>?</button>;
}

function tipbox() {
  let box = document.getElementById('tipbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'tipbox'; box.setAttribute('role', 'tooltip'); box.hidden = true;
    document.body.append(box);
  }
  return box;
}
export function showTip(btn: HTMLElement, pin = false) {
  if (TIP.btn && TIP.btn !== btn) hideTip();
  const box = tipbox();
  // Dentro do diálogo modal o balão precisa morar no diálogo, senão fica atrás dele.
  const host = btn.closest('dialog') || document.body;
  if (box.parentNode !== host) host.append(box);
  box.textContent = t(btn.dataset.tip!);
  box.hidden = false;
  const r = btn.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const below = r.bottom + 8 + h <= innerHeight;
  box.style.left = `${left}px`;
  box.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
  btn.setAttribute('aria-describedby', 'tipbox');
  btn.setAttribute('aria-expanded', 'true');
  TIP.btn = btn;
  TIP.pinned = pin;
}
export function hideTip() {
  if (TIP.btn) { TIP.btn.removeAttribute('aria-describedby'); TIP.btn.setAttribute('aria-expanded', 'false'); }
  tipbox().hidden = true;
  TIP.btn = null;
  TIP.pinned = false;
}
// O botão do balão aberto saiu da tela (a parte da página foi redesenhada): o balão vai junto.
export const dropStaleTip = () => { if (TIP.btn && !TIP.btn.isConnected) hideTip(); };

const tipOf = (e: { target: EventTarget }) => (e.target as Element).closest?.('.tip') as HTMLElement | null;
// Passar o mouse ou focar mostra; clicar fixa (ou solta); clicar fora ou Esc fecha.
export const tipHandlers = {
  onMouseOver: (e: MouseEvent) => { const b = tipOf(e); if (b && !TIP.pinned) showTip(b); },
  onMouseOut: (e: MouseEvent) => {
    const b = tipOf(e);
    if (b && b === TIP.btn && !TIP.pinned && !b.contains(e.relatedTarget as Node | null)) hideTip();
  },
  onFocus: (e: FocusEvent) => { if ((e.target as Element).classList?.contains('tip')) showTip(e.target as HTMLElement); },
  onBlur: (e: FocusEvent) => { if (e.target === TIP.btn) hideTip(); },
  onClick: (e: MouseEvent) => {
    const b = tipOf(e);
    if (b) { e.preventDefault(); if (b === TIP.btn && TIP.pinned) hideTip(); else showTip(b, true); }
    else if (TIP.btn) hideTip();
  },
  onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape' && TIP.btn) hideTip(); },
};
