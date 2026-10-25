export type ItemId = string; export type RecipeId = string; export type BuildingId = string; export type StageId = string;
export interface Item { id: ItemId; name: string; fluid: boolean; raw: boolean }
export interface Flow { item: ItemId; perMin: number }            // por máquina, clock 100%; fluido em m³/min
export interface Recipe { id: RecipeId; name: string; alt: boolean; building: BuildingId; ins: Flow[]; outs: Flow[] }
export interface Building { id: BuildingId; name: string; w: number; l: number }   // metros
export interface GameData { items: Record<ItemId, Item>; recipes: Record<RecipeId, Recipe>; buildings: Record<BuildingId, Building> }
export type Side = 'ins' | 'outs';
// tiers: chave `in:<item>` ou `out:<item>` (o mesmo item pode entrar e sair da receita).
export interface Stage { id: StageId; recipe: RecipeId; machines: number; clock: number; perRow: number | null; locked: boolean; tiers: Record<string, string>; pos: { x: number; y: number } }
export interface Link { id: string; item: ItemId; from: StageId; to: StageId }
// Quartos de volta no sentido horário: 0 entradas pela esquerda (saída à direita), 1 por cima, 2 pela direita, 3 por baixo.
export type Rot = 0 | 1 | 2 | 3;
// Metros, canto superior esquerdo do bloco já girado, no mundo; x/y múltiplos de 8.
export interface MapPlace { x: number; y: number; rot: Rot; gapRow?: number; gapMachine?: number }
// map: posição de cada etapa no mapa; alts: id do meio -> `key` da montagem escolhida;
// mapGap: vão entre peças ligadas dos meios no mapa (m, inteiro de 1 a 8; sem ele, 2).
export interface Chain {
  v: 1; stages: Stage[]; links: Link[]; policy: 'represar' | 'sink' | 'extra';
  map?: Record<StageId, MapPlace>; alts?: Record<string, string>; mapGap?: number;
}
export interface PortWarning { item: ItemId; side: Side; rowRate: number; tier: string; cap: number; fixTier: string | null; fixPerRow: number }
