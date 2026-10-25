import { useState } from 'react';
import { fmt, parseNum } from '../../i18n/index.js';

// Campo numérico com texto local: confirma no blur ou no Enter, uma ação por edição.
// value null: sem número (mostra vazio, com o placeholder). always: confirma mesmo digitando o valor mostrado (o valor
// calculado vira fixado, e Enter sem editar também). className: o estado do campo (calculado ou fixado).
export function NumField({ label, value, valid, onCommit, bad, always = false, placeholder, className }: {
  label: string; value: number | null; valid: (n: number) => boolean; onCommit: (n: number) => void; bad: string;
  always?: boolean; placeholder?: string; className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === null ? '' : fmt(value));
  const n = parseNum(shown);
  const invalid = text !== null && !valid(n);
  // Enter sem editar, no modo always: o valor mostrado vira fixado.
  const commit = (enter = false) => {
    if (text === null) { if (enter && always && value !== null && valid(value)) onCommit(value); return; }
    if (valid(n)) { if (always || n !== value) onCommit(n); setText(null); }
  };
  return (
    <label className={'pl-field' + (className ? ' ' + className : '')}>
      <span>{label}</span>
      <input type="text" inputMode="decimal" value={shown} aria-invalid={invalid} aria-label={label} placeholder={placeholder}
        onChange={e => setText(e.target.value)} onBlur={() => commit()}
        onKeyDown={e => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') setText(null); }} />
      {invalid && <small className="pl-bad" role="alert">{bad}</small>}
    </label>
  );
}
