export type ItemId = string; export type RecipeId = string; export type BuildingId = string; export type StageId = string;
export interface Item { id: ItemId; name: string; fluid: boolean; raw: boolean }
export interface Flow { item: ItemId; perMin: number }            // por máquina, clock 100%; fluido em m³/min
// power: MW gastos a 100 % (do Docs). Na receita, só nos prédios de energia variável (a média da faixa da receita).
export interface Recipe { id: RecipeId; name: string; alt: boolean; building: BuildingId; ins: Flow[]; outs: Flow[]; power?: number }
export interface Building { id: BuildingId; name: string; w: number; l: number; power?: number }   // metros
export interface Extractor { id: BuildingId; name: string; perMin: number; items: ItemId[]; purity: boolean; power?: number }   // perMin em m³/min, pureza normal
export interface GameData { items: Record<ItemId, Item>; recipes: Record<RecipeId, Recipe>; buildings: Record<BuildingId, Building>; extractors: Record<BuildingId, Extractor>; generators?: Record<BuildingId, Generator> }
// Gerador (do Docs): potência a 100 % (MW) e, por combustível, o consumo por minuto de um gerador (sólido: itens;
// fluido: m³), a água (m³/min, carvão e nuclear) e o resíduo (nuclear).
export interface GenFuel { item: ItemId; perMin: number; water: number | null; waste: { item: ItemId; perMin: number } | null }
// w × l: o prédio em metros (de building-sizes.json), como nos de produção.
export interface Generator { id: BuildingId; name: string; power: number; fuels: GenFuel[]; w: number; l: number }
export type Side = 'ins' | 'outs';
// Etapa derivada de um bloco de receita resolvido (solvedStage): o que as contas de fileira e o desenho leem.
// tiers: chave `in:<item>` ou `out:<item>` (o mesmo item pode entrar e sair da receita).
// layout: o arranjo das fileiras do bloco (ausente = fileira simples).
export interface Stage { id: StageId; recipe: RecipeId; machines: number; clock: number; perRow: number | null; tiers: Record<string, string>; layout?: Layout }
export interface Link { id: string; item: ItemId; from: StageId; to: StageId }
// Quartos de volta no sentido horário: 0 entradas pela esquerda (saída à direita), 1 por cima, 2 pela direita, 3 por baixo.
export type Rot = 0 | 1 | 2 | 3;
// Metros, canto superior esquerdo do bloco já girado, no mundo; x/y múltiplos de 8.
export interface MapPlace { x: number; y: number; rot: Rot; gapRow?: number; gapMachine?: number }

// Estado v2 (fase 3): a fábrica em blocos.
export type BlockKind = 'recipe' | 'miner' | 'extractor' | 'input' | 'generator' | 'sink' | 'container' | 'export';
export type Purity = 'impure' | 'normal' | 'pure';
// Valores fixados pelo usuário; ausente = livre (o solver calcula). Os dois podem coexistir.
export interface Limits { machines?: number; inputs?: Record<ItemId, number> }
// collect: saídas sólidas que coletam o excesso.
// Arranjo das fileiras do bloco (fase 4). Ausente ou inválido = { kind: 'simple' }.
export type LayoutKind = 'simple' | 'backToBack' | 'center';
export type LayoutExit = 'end' | 'down' | 'up';          // pela ponta da fileira, desce ou sobe por Conveyor Lift
export interface RowEdit { flip?: boolean; mirror?: boolean; dx?: number; dy?: number }   // dx/dy em m, múltiplos de 8
// cut: fecha a cada N máquinas; even: as máquinas divididas o mais igual possível entre o mesmo número de saídas
export interface BeltEdit { cut?: number; exit?: LayoutExit; even?: boolean }
export interface Layout {
  kind: LayoutKind;
  invert?: boolean;                        // backToBack/center: o corredor do meio é das entradas, não das saídas
  rows?: Record<number, RowEdit>;          // índice da fileira gerada pelo modelo
  belts?: Record<string, BeltEdit>;        // chave tierKey(side, item) de model/stage.ts ('in:<item>' / 'out:<item>')
  joins?: string[];                        // `${tierKey}@${r}`: junta a esteira desse item da fileira r com a da r+1
}
export interface RecipeBlock { id: StageId; kind: 'recipe'; recipe: RecipeId; clock: number; perRow: number | null; tiers: Record<string, string>; limits?: Limits; collect?: ItemId[]; layout?: Layout }
export interface MinerBlock { id: StageId; kind: 'miner'; item: ItemId; rate: number }
// count null = a ferramenta calcula quantos extratores; clock: o de cada um (1 a 250 %, ausente = 100).
export interface ExtractorBlock { id: StageId; kind: 'extractor'; building: BuildingId; item: ItemId; purity: Purity; count: number | null; clock?: number }
// Entrada (Container ou trem): qualquer item vindo de fora da fábrica; rate null = sem limite (dá o que pedirem).
export interface InputBlock { id: StageId; kind: 'input'; item: ItemId; rate: number | null }
// Gerador queimando um combustível: count null = queima o que chegar (a ferramenta diz quantos); clock ausente = 100.
// A potência segue o clock em linha reta (como o consumo).
export interface GeneratorBlock { id: StageId; kind: 'generator'; building: BuildingId; fuel: ItemId; count: number | null; clock?: number }
export interface OutletBlock { id: StageId; kind: 'sink' | 'container' | 'export' }
export type Block = RecipeBlock | MinerBlock | ExtractorBlock | InputBlock | GeneratorBlock | OutletBlock;
// Origem: um bloco sem entradas que entrega um item (Miner, extrator, Entrada).
export const isSource = (b: Block): b is MinerBlock | ExtractorBlock | InputBlock =>
  b.kind === 'miner' || b.kind === 'extractor' || b.kind === 'input';
// Posição livre da ligação (meio) no mapa, presa na grade de 8 m.
export interface LigPlace { x: number; y: number; rot: Rot }
// map: posição de cada bloco no mapa; alts: id do meio -> `key` da montagem escolhida; mapGap: vão entre peças ligadas
// dos meios no mapa (m, inteiro de 1 a 8; sem ele, 2); ligs: id do meio -> posição da ligação.
// map e ligs são da Planta em escala; montar e montarLigs, da Montar (só o lugar: sem vãos e sem giro, que são da
// Planta; montar tem sempre rot 0 e o rot de montarLigs só orienta o retângulo que centra o chip). Bloco sem `montar`
// usa o `map`; sem o objeto `montarLigs` inteiro, a Montar usa as `ligs` (com ele, ligação fora dele fica no automático).
export interface Factory {
  v: 2; blocks: Block[]; links: Link[];
  map?: Record<StageId, MapPlace>; alts?: Record<string, string>; mapGap?: number; ligs?: Record<string, LigPlace>;
  montar?: Record<StageId, MapPlace>; montarLigs?: Record<string, LigPlace>;
}
