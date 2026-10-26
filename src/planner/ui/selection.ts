export type Selection = { kind: 'stage'; id: string } | { kind: 'meio'; id: string } | null;

/** Vista do builder: montar (cartões) ou planta em escala. */
export type ViewMode = 'montar' | 'planta';
