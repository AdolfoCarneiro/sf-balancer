export type Selection = { kind: 'stage'; id: string } | { kind: 'meio'; id: string } | null;

// Arrastar uma porta para o vazio: busca de receita que consome (saída) ou produz (entrada) o item.
export interface SearchRequest { item: string; side: 'consumes' | 'produces'; stage: string }
