import { useState } from 'react';
import { t } from '../../i18n/index.js';

// Chave nova (hint2): quem fechou a dica antiga vê esta uma vez.
export const HINT_STORE = 'sf-balancer:planner-hint2';

function seen(): boolean {
  try { return localStorage.getItem(HINT_STORE) === '1'; } catch { return false; }
}

// Barra de primeiro uso, no canto de baixo à esquerda do mapa; "Entendi" some para sempre.
export function FirstHint() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;
  const dismiss = () => {
    try { localStorage.setItem(HINT_STORE, '1'); } catch { /* sem storage: some só nesta visita */ }
    setOpen(false);
  };
  return (
    <div className="pl-hint" role="note">
      <p>{t('plHintText')}</p>
      <button type="button" onClick={dismiss}>{t('plHintOk')}</button>
    </div>
  );
}

// Fábrica vazia: o convite tracejado no meio do mapa. Não pega clique (o duplo clique vai para o canvas).
export function EmptyInvite() {
  return (
    <div className="pl-invite" aria-hidden="true">
      <b>{t('plInviteTitle')}</b>
      <span>{t('plInviteSub')}</span>
    </div>
  );
}
