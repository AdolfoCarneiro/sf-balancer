// Importar do Modeler. ImportButton (no topo e no painel) só escolhe o arquivo; o App é o dono do resto: ImportDialog lê o
// .sfmd no navegador e mostra o resumo antes de trocar a fábrica (o que vira bloco, o que virou Saída, o que ficou de
// fora, os números ajustados), e o aviso "Importado" fica no App (sobrevive ao painel fechar).
import { useEffect, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { Factory, GameData } from '../model/types.ts';
import { parseSfmd, type SfmdAdjusted, type SfmdIgnored, type SfmdReport } from '../model/sfmd.ts';

const MAX_BYTES = 5 * 1024 * 1024;
const SHOW = 12;   // nomes por lista; o resto vira "e mais N"
type ErrKey = 'plImportErrJson' | 'plImportErrFormat' | 'plImportErrEmpty' | 'plImportErrSize';
type State = { kind: 'error'; key: ErrKey; report?: SfmdReport } | { kind: 'ready'; factory: Factory; report: SfmdReport };

export function ImportButton({ onFile, className, tour }: { onFile: (f: File) => void; className?: string; tour?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={'pl-btn ' + (className ?? '')} data-tour={tour} onClick={() => input.current?.click()}>{t('plImport')}</button>
      <input ref={input} type="file" accept=".sfmd,application/json" hidden aria-hidden="true" tabIndex={-1}
        onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) onFile(f); }} />
    </>
  );
}

// O texto em volta é da interface; o nome é o do Modeler, cru.
const ignoredText = (x: SfmdIgnored): string => {
  switch (x.kind) {
    case 'field': return t('plImportIgField', x.name);
    case 'setting': return t('plImportIgSetting', x.name);
    case 'outpost': return t('plImportIgOutpost', x.name);
    case 'max': return t('plImportIgMax', x.name);
    case 'noFlow': return t('plImportIgNoFlow', x.name);
    case 'waypoints': return t('plImportIgWaypoints');
  }
};
const num = (n: number) => fmt(n, Number.isInteger(n) ? 0 : 2);
const adjustedText = (x: SfmdAdjusted): string => {
  switch (x.kind) {
    case 'extractorRate': return t('plImportAdjRate', x.name, num(x.rate), fmt(x.count, 0), num(x.total));
    case 'extractorCount': return t('plImportAdjCount', x.name, num(x.asked), fmt(x.count, 0));
    case 'clamp': return t('plImportAdjClamp', x.name, num(x.asked), num(x.max));
  }
};

function Names({ title, names }: { title: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <>
      <h3 className="pl-insp-h">{title}</h3>
      <ul className="pl-imp-list">
        {names.slice(0, SHOW).map((n, i) => <li key={i}>{n}</li>)}
        {names.length > SHOW && <li>{t('plImportMore', fmt(names.length - SHOW, 0))}</li>}
      </ul>
    </>
  );
}

function Report({ report }: { report: SfmdReport }) {
  const by = (r: SfmdReport['skipped'][number]['reason']) => report.skipped.filter(s => s.reason === r).map(s => s.name);
  return (
    <>
      <Names title={t('plImportAsExport')} names={report.asExport} />
      <Names title={t('plImportAdjusted')} names={report.adjusted.map(adjustedText)} />
      <Names title={t('plImportUnknown')} names={by('unknown')} />
      <Names title={t('plImportBadLink')} names={by('badLink')} />
      <Names title={t('plImportLimit')} names={by('limit')} />
      <Names title={t('plImportIgnored')} names={report.ignored.map(ignoredText)} />
    </>
  );
}

interface DialogProps { file: File; data: GameData; onImport: (f: Factory, r: SfmdReport) => void; onClose: () => void }

export function ImportDialog({ file, data, onImport, onClose }: DialogProps) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State | null>(null);
  const name = file.name.slice(0, 120);

  useEffect(() => {
    let live = true;
    (async () => {
      if (file.size > MAX_BYTES) { setState({ kind: 'error', key: 'plImportErrSize' }); return; }
      let text: string;
      try { text = await file.text(); } catch { if (live) setState({ kind: 'error', key: 'plImportErrJson' }); return; }
      if (!live) return;
      const r = parseSfmd(text, data);
      if ('error' in r) setState({ kind: 'error', key: r.error === 'json' ? 'plImportErrJson' : 'plImportErrFormat' });
      else if (!r.factory.blocks.length) setState({ kind: 'error', key: 'plImportErrEmpty', report: r.report });
      else setState({ kind: 'ready', factory: r.factory, report: r.report });
    })();
    return () => { live = false; };
  }, [file, data]);
  useEffect(() => { const d = dlg.current; if (state && d && !d.open) d.showModal(); }, [state]);

  const close = () => dlg.current?.close();
  const confirm = () => {
    if (state?.kind !== 'ready') return;
    onImport(state.factory, state.report);
    close();
  };
  if (!state) return null;
  return (
    <dialog ref={dlg} className="pl-imp" aria-labelledby="pl-imp-title" onClose={onClose}>
      <h2 id="pl-imp-title">{t('plImport')}</h2>
      <p className="pl-insp-sub">{t('plImportFile', name)}</p>
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
            <p className="pl-imp-sum">{t('plImportSummary', fmt(state.report.blocks, 0), fmt(state.report.links, 0))}</p>
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
  );
}

// O aviso depois de importar (5 s); o texto segue o idioma.
export function useImportToast() {
  const [done, setDone] = useState<{ blocks: number; links: number } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (r: SfmdReport) => {
    setDone({ blocks: r.blocks, links: r.links });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(null), 5000);
  };
  const toast = <span className="pl-imp-done" role="status">{done ? t('plImportDone', fmt(done.blocks, 0), fmt(done.links, 0)) : ''}</span>;
  return { show, toast };
}
