export type ItemId = string; export type RecipeId = string; export type BuildingId = string; export type StageId = string;
export interface Item { id: ItemId; name: string; fluid: boolean; raw: boolean }
export interface Flow { item: ItemId; perMin: number }            // por máquina, clock 100%; fluido em m³/min
export interface Recipe { id: RecipeId; name: string; alt: boolean; building: BuildingId; ins: Flow[]; outs: Flow[] }
export interface Building { id: BuildingId; name: string; w: number; l: number }   // metros
export interface Extractor { id: BuildingId; name: string; perMin: number; items: ItemId[]; purity: boolean }   // perMin em m³/min, pureza normal
export interface GameData { items: Record<ItemId, Item>; recipes: Record<RecipeId, Recipe>; buildings: Record<BuildingId, Building>; extractors: Record<BuildingId, Extractor> }
export type Side = 'ins' | 'outs';
// Etapa derivada de um bloco de receita resolvido (solvedStage): o que as contas de fileira e o desenho leem.
// tiers: chave `in:<item>` ou `out:<item>` (o mesmo item pode entrar e sair da receita).
export interface Stage { id: StageId; recipe: RecipeId; machines: number; clock: number; perRow: number | null; tiers: Record<string, string> }
export interface Link { id: string; item: ItemId; from: StageId; to: StageId }
// Quartos de volta no sentido horário: 0 entradas pela esquerda (saída à direita), 1 por cima, 2 pela direita, 3 por baixo.
export type Rot = 0 | 1 | 2 | 3;
// Metros, canto superior esquerdo do bloco já girado, no mundo; x/y múltiplos de 8.
export interface MapPlace { x: number; y: number; rot: Rot; gapRow?: number; gapMachine?: number }
export interface PortWarning { item: ItemId; side: Side; rowRate: number; tier: string; cap: number; fixTier: string | null; fixPerRow: number }

// Estado v2 (fase 3): a fábrica em blocos.
export type BlockKind = 'recipe' | 'miner' | 'extractor' | 'sink' | 'container' | 'export';
export type Purity = 'impure' | 'normal' | 'pure';
// Valores fixados pelo usuário; ausente = livre (o solver calcula). Os dois podem coexistir.
export interface Limits { machines?: number; inputs?: Record<ItemId, number> }
// collect: saídas sólidas que coletam o excesso.
export interface RecipeBlock { id: StageId; kind: 'recipe'; recipe: RecipeId; clock: number; perRow: number | null; tiers: Record<string, string>; limits?: Limits; collect?: ItemId[] }
export interface MinerBlock { id: StageId; kind: 'miner'; item: ItemId; rate: number }
// count null = a ferramenta calcula quantos extratores.
export interface ExtractorBlock { id: StageId; kind: 'extractor'; building: BuildingId; item: ItemId; purity: Purity; count: number | null }
export interface OutletBlock { id: StageId; kind: 'sink' | 'container' | 'export' }
export type Block = RecipeBlock | MinerBlock | ExtractorBlock | OutletBlock;
// Posição livre da ligação (meio) no mapa, presa na grade de 8 m.
export interface LigPlace { x: number; y: number; rot: Rot }
// map: posição de cada bloco no mapa; alts: id do meio -> `key` da montagem escolhida; mapGap: vão entre peças ligadas
// dos meios no mapa (m, inteiro de 1 a 8; sem ele, 2); ligs: id do meio -> posição da ligação.
export interface Factory {
  v: 2; blocks: Block[]; links: Link[];
  map?: Record<StageId, MapPlace>; alts?: Record<string, string>; mapGap?: number; ligs?: Record<string, LigPlace>;
}
