import { t } from '../i18n/index.js';
import { S } from './state.js';
import { $, esc } from './common.js';

export const tip = key => `<button type="button" class="tip" data-tip="${key}" aria-label="${esc(t('helpLabel'))}">?</button>`;
// Um balão só para o app inteiro (a página Balancer e o modal da ligação da Fábrica), criado na primeira vez: ele muda de
// lugar (vai para dentro do diálogo aberto), e um diálogo que sai da página pode levá-lo junto.
function tipbox() {
  let box = $('tipbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'tipbox'; box.setAttribute('role', 'tooltip'); box.hidden = true;
    document.body.append(box);
  }
  return box;
}
export function showTip(btn, pin = false) {
  if (S.tipBtn && S.tipBtn !== btn) hideTip();
  const box = tipbox();
  // Dentro do diálogo modal o balão precisa morar no diálogo, senão fica atrás dele.
  const host = btn.closest('dialog') || document.body;
  if (box.parentNode !== host) host.append(box);
  box.textContent = t(btn.dataset.tip);
  box.hidden = false;
  const r = btn.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const below = r.bottom + 8 + h <= innerHeight;
  box.style.left = `${left}px`;
  box.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
  btn.setAttribute('aria-describedby', 'tipbox');
  btn.setAttribute('aria-expanded', 'true');
  S.tipBtn = btn;
  S.tipPinned = pin;
}
export function hideTip() {
  if (S.tipBtn) { S.tipBtn.removeAttribute('aria-describedby'); S.tipBtn.setAttribute('aria-expanded', 'false'); }
  tipbox().hidden = true;
  S.tipBtn = null;
  S.tipPinned = false;
}

