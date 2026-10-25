import { t } from '../../i18n/index.js';
import type { Selection } from './selection.ts';

// Casca: as tarefas seguintes preenchem o conteúdo de cada seleção.
export function Inspector({ selection }: { selection: Selection }) {
  return (
    <aside className="pl-inspector" aria-label={t('plInspector')} id="pl-inspector">
      {!selection && <p className="pl-note">{t('plInspectorEmpty')}</p>}
    </aside>
  );
}
