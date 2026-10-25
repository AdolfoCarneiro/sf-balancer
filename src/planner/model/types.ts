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
export interface Chain { v: 1; stages: Stage[]; links: Link[]; policy: 'represar' | 'sink' | 'extra' }
export interface PortWarning { item: ItemId; side: Side; rowRate: number; tier: string; cap: number; fixTier: string | null; fixPerRow: number }
