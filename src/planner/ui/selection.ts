// O que está selecionado no mapa: um bloco, vários blocos (2+; ligações não entram) ou uma ligação.
export type Selection =
  | { kind: 'stage'; id: string }
  | { kind: 'stages'; ids: string[] }
  | { kind: 'meio'; id: string }
  | null;

/** Vista do builder: montar (cartões) ou planta em escala. */
export type ViewMode = 'montar' | 'planta';

// Seleção de blocos pela lista de ids (sem repetidos): nenhum vira null, um vira o bloco de sempre, 2+ vira 'stages'.
export function stagesSel(ids: readonly string[]): Selection {
  const u = [...new Set(ids)];
  return u.length === 0 ? null : u.length === 1 ? { kind: 'stage', id: u[0] } : { kind: 'stages', ids: u };
}

// Os blocos selecionados (vazio com uma ligação ou sem seleção).
export const selStages = (s: Selection): string[] => (!s ? [] : s.kind === 'stage' ? [s.id] : s.kind === 'stages' ? s.ids : []);

// Tudo que o desenho destaca: os blocos ou a ligação.
export const selIds = (s: Selection): ReadonlySet<string> => new Set(!s ? [] : s.kind === 'stages' ? s.ids : [s.id]);

// Chave estável da seleção (abrir o painel numa seleção nova, voltar o painel ao topo).
export const selKey = (s: Selection): string | null =>
  (!s ? null : s.kind === 'stages' ? 'stages:' + s.ids.join(',') : `${s.kind}:${s.id}`);

// Shift+clique num bloco: põe ou tira ele da seleção (uma ligação selecionada sai).
export function toggleStage(s: Selection, id: string): Selection {
  const cur = selStages(s);
  return stagesSel(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
}
