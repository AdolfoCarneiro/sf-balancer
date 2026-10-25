export type ItemId = string; export type RecipeId = string; export type BuildingId = string; export type StageId = string;
export interface Item { id: ItemId; name: string; fluid: boolean; raw: boolean }
export interface Flow { item: ItemId; perMin: number }            // por máquina, clock 100%; fluido em m³/min
export interface Recipe { id: RecipeId; name: string; alt: boolean; building: BuildingId; ins: Flow[]; outs: Flow[] }
export interface Building { id: BuildingId; name: string; w: number; l: number }   // metros
export interface GameData { items: Record<ItemId, Item>; recipes: Record<RecipeId, Recipe>; buildings: Record<BuildingId, Building> }
