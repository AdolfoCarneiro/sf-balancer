// Botão "Importar do Modeler": escolhe um .sfmd, lê no navegador e mostra o resumo antes de trocar a fábrica (o que vira
// bloco, o que virou Saída, o que ficou de fora). Confirmar substitui a fábrica num passo só do desfazer.
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import type { Factory, GameData } from '../model/types.ts';
import { parseSfmd, type SfmdReport } from '../model/sfmd.ts';

const MAX_BYTES = 5 * 1024 * 1024;
const SHOW = 12;   // nomes por lista; o resto vira "e mais N"
type ErrKey = 'plImportErrJson' | 'plImportErrFormat' | 'plImportErrEmpty' | 'plImportErrSize';
type State = { kind: 'error'; key: ErrKey; file: string; report?: SfmdReport } | { kind: 'ready'; file: string; factory: Factory; report: SfmdReport };

interface Props { data: GameData; onImport: (f: Factory) => void; className?: string }

function Names({ title, names }: { title: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <>
      <h3 className="pl-insp-h">{title}</h3>
      <ul className="pl-imp-list">
        {names.slice(0, SHOW).map((n, i) => <li key={i}>{n}</li>)}
        {names.length > SHOW && <li>{t('plImportMore', names.length - SHOW)}</li>}
      </ul>
    </>
  );
}

function Report({ report }: { report: SfmdReport }) {
  const by = (r: SfmdReport['skipped'][number]['reason']) => report.skipped.filter(s => s.reason === r).map(s => s.name);
  return (
    <>
      <Names title={t('plImportAsExport')} names={report.asExport} />
      <Names title={t('plImportUnknown')} names={by('unknown')} />
      <Names title={t('plImportBadLink')} names={by('badLink')} />
      <Names title={t('plImportLimit')} names={by('limit')} />
      <Names title={t('plImportIgnored')} names={report.ignored} />
    </>
  );
}

export function ImportModeler({ data, onImport, className }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State | null>(null);
  const [done, setDone] = useState('');
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { const d = dlg.current; if (state && d && !d.open) d.showModal(); }, [state]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const name = file.name.slice(0, 120);
    if (file.size > MAX_BYTES) { setState({ kind: 'error', key: 'plImportErrSize', file: name }); return; }
    let text: string;
    try { text = await file.text(); } catch { setState({ kind: 'error', key: 'plImportErrJson', file: name }); return; }
    const r = parseSfmd(text, data);
    if ('error' in r) setState({ kind: 'error', key: r.error === 'json' ? 'plImportErrJson' : 'plImportErrFormat', file: name });
    else if (!r.factory.blocks.length) setState({ kind: 'error', key: 'plImportErrEmpty', file: name, report: r.report });
    else setState({ kind: 'ready', file: name, factory: r.factory, report: r.report });
  };
  const close = () => dlg.current?.close();
  const confirm = () => {
    if (state?.kind !== 'ready') return;
    onImport(state.factory);
    setDone(t('plImportDone', state.report.blocks, state.report.links));
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(''), 5000);
    close();
  };

  return (
    <>
      <button type="button" className={'pl-btn ' + (className ?? '')} onClick={() => input.current?.click()}>{t('plImport')}</button>
      <input ref={input} type="file" accept=".sfmd,application/json" hidden aria-hidden="true" tabIndex={-1}
        onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void pick(f); }} />
      <span className="pl-imp-done" role="status">{done}</span>
      {state && (
        <dialog ref={dlg} className="pl-imp" aria-labelledby="pl-imp-title" onClose={() => setState(null)}>
          <h2 id="pl-imp-title">{t('plImport')}</h2>
          <p className="pl-insp-sub">{t('plImportFile', state.file)}</p>
          {state.kind === 'error'
            ? (
              <>
                <p className="pl-imp-err" role="alert">{t(state.key)}</p>
                {state.report && <Report report={state.report} />}
                <div className="pl-imp-acts">
                  <button type="button" className="pl-btn pl-primary" onClick={close} autoFocus>{t('plImportClose')}</button>
                </div>
              </>
            )
            : (
              <>
                <p className="pl-imp-sum">{t('plImportSummary', state.report.blocks, state.report.links)}</p>
                <Report report={state.report} />
                <p className="pl-note">{t('plImportPrivate')}</p>
                <p className="pl-imp-warn">{t('plImportReplace')}</p>
                <div className="pl-imp-acts">
                  <button type="button" className="pl-btn" onClick={close}>{t('plImportCancel')}</button>
                  <button type="button" className="pl-btn pl-primary" onClick={confirm} autoFocus>{t('plImportGo')}</button>
                </div>
              </>
            )}
        </dialog>
      )}
    </>
  );
}
