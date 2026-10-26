import { t } from '../../i18n/index.js';

// Fábrica vazia: o convite tracejado no meio do mapa. Não pega clique (o duplo clique vai para o canvas).
// (A dica de primeiro uso que morava aqui virou o tutorial: ui/Tour.tsx.)
export function EmptyInvite() {
  return (
    <div className="pl-invite" aria-hidden="true">
      <b>{t('plInviteTitle')}</b>
      <span>{t('plInviteSub')}</span>
    </div>
  );
}
