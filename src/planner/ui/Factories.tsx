// "Fábricas": a lista das fábricas salvas neste navegador. Abrir, renomear, duplicar, apagar, criar uma vazia e o
// backup em arquivo (baixar todas e abrir um backup, que junta as de lá na lista).
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt, t } from '../../i18n/index.js';
import type { Factory, GameData } from '../model/types.ts';
import { entryFactory, libraryFile, readLibraryFile, type Library } from '../model/library.ts';

export interface LibOps {
  open: (id: string) => Factory | null;
  create: (name: string, f: Factory) => Factory | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => Factory | null;
  merge: (list: { name: string; factory: Factory }[]) => number;
  snapshot: () => Library;
}

interface Props {
  lib: Library; ops: LibOps; data: GameData;
  onLoad: (f: Factory) => void;   // a fábrica aberta mudou: o App carrega no mapa
  onClose: () => void;
}

const MAX_BYTES = 20 * 1024 * 1024;
const EMPTY: Factory = { v: 2, blocks: [], links: [] };

export function FactoriesDialog({ lib, ops, data, onLoad, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { const d = dlg.current; if (d && !d.open) d.showModal(); }, []);
  // Quantos blocos cada uma tem (a aberta, como está agora).
  const snap = useMemo(() => ops.snapshot(), [ops]);
  const blocks = useMemo(() => new Map(snap.items.map(e => [e.id, entryFactory(e, data).blocks.length])), [snap, data]);
  const date = (ms: number) => (ms ? new Date(ms).toLocaleString(t('locale'), { dateStyle: 'short', timeStyle: 'short' }) : '');

  const load = (f: Factory | null) => { if (f) { onLoad(f); dlg.current?.close(); } };
  const full = () => setMsg(t('plFactoryFull'));
  const create = (name: string, f: Factory) => { const r = ops.create(name, f); if (r) load(r); else full(); };
  const remove = (id: string, name: string) => {
    if (!confirm(t('plFactoryDeleteAsk', name))) return;
    const f = ops.remove(id);
    if (f) onLoad(f);
  };
  const backup = () => {
    const s = ops.snapshot(), url = URL.createObjectURL(new Blob([libraryFile(s)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `sf-balancer-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restore = async (f: File) => {
    if (f.size > MAX_BYTES) { setMsg(t('plFactoryRestoreBad')); return; }
    let text = '';
    try { text = await f.text(); } catch { setMsg(t('plFactoryRestoreBad')); return; }
    const list = readLibraryFile(text, data);
    if (!list) { setMsg(t('plFactoryRestoreBad')); return; }
    const n = ops.merge(list);
    setMsg(n < list.length ? `${t('plFactoryRestored', fmt(n, 0))} ${t('plFactoryFull')}` : t('plFactoryRestored', fmt(n, 0)));
  };

  return (
    <dialog ref={dlg} className="pl-imp pl-libs" aria-labelledby="pl-libs-title" onClose={onClose}>
      <h2 id="pl-libs-title">{t('plFactoriesTitle')}</h2>
      <p className="pl-note">{t('plFactoryLocal')}</p>
      <ul className="pl-libs-list">
        {snap.items.map(e => {
          const cur = e.id === lib.current;
          return (
            <li key={e.id} className={cur ? 'cur' : undefined}>
              {editing === e.id
                ? (
                  <form className="pl-libs-name" onSubmit={ev => { ev.preventDefault(); ops.rename(e.id, new FormData(ev.currentTarget).get('n') as string); setEditing(null); }}>
                    <input name="n" defaultValue={e.name} maxLength={80} autoFocus aria-label={t('plFactoryRenameLabel', e.name)}
                      onKeyDown={ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setEditing(null); } }} />
                    <button type="submit" className="pl-btn">{t('plFactoryRenameOk')}</button>
                  </form>
                )
                : (
                  <button type="button" className="pl-libs-open" aria-current={cur ? 'true' : undefined} onClick={() => (cur ? dlg.current?.close() : load(ops.open(e.id)))}>
                    <b>{e.name}</b>
                    <span>{t('plFactoryBlocks', fmt(blocks.get(e.id) ?? 0, 0))}{e.updated ? ` · ${date(e.updated)}` : ''}{cur ? ` · ${t('plFactoryCurrent')}` : ''}</span>
                  </button>
                )}
              <div className="pl-libs-acts">
                <button type="button" className="pl-btn" onClick={() => setEditing(e.id)}>{t('plFactoryRename')}</button>
                <button type="button" className="pl-btn" onClick={() => create(t('plFactoryCopy', e.name), entryFactory(e, data))}>{t('plFactoryDuplicate')}</button>
                <button type="button" className="pl-btn pl-danger" disabled={snap.items.length < 2} onClick={() => remove(e.id, e.name)}>{t('plFactoryDelete')}</button>
              </div>
            </li>
          );
        })}
      </ul>
      {msg && <p className="pl-note" role="status">{msg}</p>}
      <div className="pl-imp-acts">
        <button type="button" className="pl-btn" onClick={backup}>{t('plFactoryBackup')}</button>
        <button type="button" className="pl-btn" onClick={() => file.current?.click()}>{t('plFactoryRestore')}</button>
        <button type="button" className="pl-btn" onClick={() => dlg.current?.close()}>{t('plFactoryClose')}</button>
        <button type="button" className="pl-btn pl-primary" onClick={() => create(t('plFactoryNewName'), EMPTY)}>{t('plFactoryNew')}</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden aria-hidden="true" tabIndex={-1}
        onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void restore(f); }} />
    </dialog>
  );
}
