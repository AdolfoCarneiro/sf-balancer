# Planner 2D — fase 3 (montar como no Modeler) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O builder vira a página principal: monta-se a fábrica com os gestos do Modeler direto nos blocos em escala do mapa, os números seguem o fluxo físico (limites, falta, represado, subproduto travado, loops), a ligação (ex-"meio") é peça arrastável que abre um modal com o desenho do balancer, e a ferramenta atual passa a ser a seção Balancer em `/balancer`.

**Architecture:** Estado novo `Factory` (v2: blocos de vários tipos, limites, coleta de excesso, posição da ligação), lido de v1 por migração. Um solver de fluxo puro (`model/solve.ts`, ponto fixo a partir dos limites, por componente) roda no worker com cache; os blocos de receita viram `Stage` derivados (`solvedStage`) e tudo o que a fase 2 desenha (bloco, meio, cena) continua consumindo `Stage`. A vista do mapa (`MapView`) é a superfície de edição; o grafo React Flow e a busca lateral saem. Rotas: builder em `/`, Balancer em `/balancer`.

**Tech Stack:** React 19 + TypeScript 7 (só tipos), Vite 8 (duas entradas HTML, worker de módulo), canvas 2D, `node --test` com type stripping, Playwright (já é devDependency) para o smoke, ImageMagick (`magick`, só no script de ícones, fora do build).

**Spec:** `docs/superpowers/specs/2026-10-25-planner-2d-fase3-design.md` (vinculante), com os specs das fases 1 e 2 na mesma pasta.

## Global Constraints

- Tudo do `AGENTS.md`: todo texto visível em pt/en/es (inclusive `aria-label`, `title`, texto de canvas), chaves novas nos três `src/i18n/{pt,en,es}.js` na mesma mudança; nomes de peças em inglês (Merger, Splitter, Awesome Sink, Container, Miner, Water Extractor…); itens e receitas em inglês por enquanto; números com `fmt()`.
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; sem push; nunca `git stash` puro.
- CSP do `vercel.json` não muda: nada de outro domínio (ícones servidos de `/icons/`, coberto por `img-src 'self'`). Sem dependência nova de runtime; `@xyflow/react` e `@dagrejs/dagre` saem (Task 4).
- Nenhuma mecânica do jogo inventada. Fatos usados (do Docs / do dono): Water Extractor 120 m³/min sem pureza; Oil Extractor (`Build_OilPump_C`) 120 m³/min; Resource Well Extractor (`Build_FrackingExtractor_C`) 60 m³/min (petróleo, nitrogênio, água); pureza impura 0,5 / normal 1 / pura 2 só no Oil e no Resource Well; Awesome Sink não aceita fluido; máquina com saída cheia para. O que faltar (ex.: medida da Miner) é pergunta ao dono, não chute.
- Desempenho (da fase 2, valendo também para o solver): cálculo nunca no render (worker, ou síncrono só sem `Worker`); arrastar não recalcula fluxo nem ligação; canvas só com o visível e nível de detalhe por zoom; editar um bloco só recalcula o componente dele; meta ~2.000 máquinas sem engasgar.
- `npm test` e `npm run typecheck` verdes ao fim de cada tarefa (hoje: 223 testes). A ferramenta atual não muda de comportamento (só de endereço, Task 9).
- **Ruling de nomes:** identificadores de código continuam `meio`/`Meio`/`stage` (só o texto visível vira Ligação/Connection/Conexión). O tipo do estado v2 chama-se `Factory` (convive com o `Chain` v1 até a Task 4, que apaga o v1 e deixa só o leitor de migração).

## Review Focus

1. Estado salvo hostil ou velho (v2 com limite NaN/negativo, `inputs` de item que não entra na receita, `collect` em fluido, ligação fluido → Awesome Sink, `kind` desconhecido, extrator com item que ele não extrai, `ligs` de ligação que não existe): descartado ou limitado, sem quebrar — teste na Task 2.
2. Apagar o bloco que ancorava a cadeia (o fixado): os blocos livres abaixo ficam "sem limite" (sem número), e nenhum `Infinity`/`NaN` chega à geometria nem ao `computePlan` — testes nas Tasks 3 e 4.
3. Loop que se sustenta sozinho sem limite (tudo livre, combustível bruto à vontade): o solver para no limite de iterações, marca `unbounded`, não trava a página — teste na Task 3.
4. Ligação posicionada cuja composição muda (nova ligação entra no grupo, o id muda): volta para a posição colada na origem, sem erro — teste na Task 5.
5. Links antigos: `/#s=…` e `/pt#s=…` abrem o Balancer com o cenário; `/planner#p=…` e `/pt/planner#p=…` abrem o builder com a cadeia — testes na Task 9.

---

## File Structure

- `docs/superpowers/research/2026-10-25-modeler/` — criar (cópia da pesquisa e das capturas).
- `scripts/icons.mjs`, `public/icons/*.webp`, `src/planner/data/icons.json`, `src/planner/ui/icons.ts` — criar (Task 1).
- `scripts/gamedata.mjs`, `src/planner/data/game.json`, `src/planner/model/types.ts` — modificar (extratores; tipos v2).
- `src/planner/model/factory.ts` (operações v2 e grupos de ligação), `src/planner/model/factorystate.ts` (ações, reducer, encode/decode/migração, histórico inicial) — criar (Task 2).
- `src/planner/model/solve.ts` — criar: solver puro (Task 3).
- `src/planner/model/solved.ts` — criar: `solvedStage`, totais (Task 4).
- `src/planner/model/meio.ts`, `meioresult.ts`, `map/{block,scene,meiogeo}.ts`, `worker/meio.worker.ts`, `meios.ts`, `store.ts`, `App.tsx` — modificar (Tasks 4–8).
- `src/planner/solver.ts` — criar: hook `useFlow` (Task 4).
- `src/planner/model/picker.ts`, `src/planner/model/map/ports.ts`, `src/planner/ui/Picker.tsx` — criar (Task 6).
- `src/planner/model/badges.ts`, `src/planner/ui/BlockPanel.tsx`, `src/planner/ui/NumField.tsx` — criar (Task 7).
- `src/planner/model/ligacao.ts`, `src/planner/ui/LigacaoModal.tsx`, `src/styles/parts.css` — criar (Task 8).
- Apagar na Task 4: `model/chain.ts`, `model/persist.ts`, `model/autolayout.ts`, `ui/Graph.tsx`, `ui/StageNode.tsx`, `ui/RawNode.tsx`, `ui/MeioEdge.tsx` e os testes `chain`, `persist`, `autolayout`, `mapstate`. Na Task 6: `ui/Sidebar.tsx`, `ui/RecipeSearch.tsx`. Na Task 8: `ui/Inspector.tsx` (o `NumField` já mudou de arquivo na Task 7).
- Rotas (Task 9): `index.html` (vira o builder), `balancer.html` (o antigo `index.html`), `planner.html` (apagar), `vite.config.js`, `vercel.json`, `nginx.conf`, `public/sitemap.xml`, `src/planner/lang.ts`, `src/ui/lang.js`.
- Testes novos: `tests/planner/{icons,factory,factorystate,solve,solved,i18nligacao,picker,ports,badges,ligacao,routes}.test.ts`, `tests/planner/fixtures.ts`; `tests/visual/smoke.js`.

---

### Task 1: Pesquisa, ícones do jogo, extratores nos dados e aviso da Coffee Stain

**Files:**
- Create: `docs/superpowers/research/2026-10-25-modeler/` (copiar `modeler-research.md` e `modeler-shots/` de `/tmp/claude-1000/-home-adolfocarneiro-source-repos-sf-balancer/ef2933cf-ad5c-4066-8f5d-21dcadd838ed/scratchpad/`), `scripts/icons.mjs`, `public/icons/*.webp`, `src/planner/data/icons.json`, `src/planner/ui/icons.ts`
- Modify: `scripts/gamedata.mjs`, `src/planner/data/game.json`, `src/planner/model/types.ts`, `src/planner/App.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`, fixtures sintéticas de `GameData` em `tests/planner/{chain,scene,meio}.test.ts` (ganham `extractors: {}`)
- Test: `tests/planner/icons.test.ts`, `tests/planner/gamedata.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `interface Extractor { id: BuildingId; name: string; perMin: number; items: ItemId[]; purity: boolean }`; `GameData` ganha `extractors: Record<BuildingId, Extractor>` (obrigatório).
  - `icons.ts`: `iconUrl(id: string): string | null` (`'/icons/' + id + '.webp'` se `id` está em `icons.json`, senão `null`); `iconImage(id: string): HTMLImageElement | null` (cache por id, para o canvas; `null` sem ícone ou fora do navegador).
  - Ids especiais (prédios sem receita) que o script também baixa, exportados de `icons.ts` como `SPECIAL_ICON = { miner: 'Build_MinerMk1_C', sink: 'Build_ResourceSink_C', container: 'Build_StorageContainerMk1_C', fluidContainer: 'Build_PipeStorageTank_C', export: 'Build_TrainDockingStation_C', splitter: 'Build_ConveyorAttachmentSplitter_C', merger: 'Build_ConveyorAttachmentMerger_C' }` (ruling: Freight Platform representa a Saída).
  - Chave i18n `plCredit` (rodapé): en "Satisfactory icons and game data © Coffee Stain Studios. SF Balancer is an unofficial fan tool.", pt "Ícones e dados do Satisfactory © Coffee Stain Studios. O SF Balancer é uma ferramenta de fã, não oficial.", es "Iconos y datos de Satisfactory © Coffee Stain Studios. SF Balancer es una herramienta no oficial hecha por fans."

**Script de ícones (decisões):** fonte fixada no commit `bbd951f26507432d3e50923fb02d0348829b0752` de `rockfactory/satisfactory-logistics` (raw.githubusercontent.com). O mapa id → arquivo vem de `src/recipes/FactoryItems.json` e `src/recipes/FactoryBuildings.json` desse commit (campo `imagePath`, ex. `/images/game/iron-ingot_256.png`); baixa a versão `_64.png` de `public/images/game/`. Ids pedidos: todos os itens de `game.json`, os prédios de `game.json` (`buildings` e `extractors`) e `SPECIAL_ICON`. Baixa numa pasta temporária fora do repo e converte com `magick <png> -resize 64x64 -quality 80 public/icons/<id>.webp` (o nome do arquivo é o id do jogo, não o slug). Id sem `imagePath` ou download que falha: aviso no console e fica fora de `icons.json` (a UI desenha um marcador sem ícone). `icons.json` = array ordenado dos ids gravados. Uso documentado no cabeçalho: `node scripts/icons.mjs` (precisa de Node 22 e ImageMagick no PATH; não roda no build).

**Extratores no `gamedata.mjs`:** ler `FGBuildableWaterPump`, `FGBuildableFrackingExtractor` e, de `FGBuildableResourceExtractor`, só os de `mOnlyAllowCertainResources == True` com forma líquida/gás (fica de fora a Miner). `perMin = mItemsPerCycle / mExtractCycleTime × 60 / 1000` (líquido); `items` = ids de `mAllowedResources`, ordenados; `purity` de uma tabela no script `{ Build_OilPump_C: true, Build_FrackingExtractor_C: true }` (comentário: decisão do dono, Water Extractor sem pureza). Regenerar com `node scripts/gamedata.mjs /tmp/claude-1000/-home-adolfocarneiro-source-repos-sf-balancer/ef2933cf-ad5c-4066-8f5d-21dcadd838ed/scratchpad/dl-docs/docs-en.json`; o diff do `game.json` só acrescenta `extractors`.

- [ ] **Step 1: Copiar a pesquisa** para `docs/superpowers/research/2026-10-25-modeler/` (o `.md` e a pasta de capturas, como estão).
- [ ] **Step 2: Write the failing tests**

```ts
// gamedata.test.ts
test('extratores: vazão do Docs, itens e pureza', () => {
  assert.deepEqual(data.extractors.Build_WaterPump_C, { id: 'Build_WaterPump_C', name: 'Water Extractor', perMin: 120, items: ['Desc_Water_C'], purity: false });
  assert.equal(data.extractors.Build_OilPump_C.perMin, 120);
  assert.deepEqual(data.extractors.Build_OilPump_C.items, ['Desc_LiquidOil_C']);
  assert.equal(data.extractors.Build_OilPump_C.purity, true);
  assert.equal(data.extractors.Build_FrackingExtractor_C.perMin, 60);
  assert.deepEqual(data.extractors.Build_FrackingExtractor_C.items, ['Desc_LiquidOil_C', 'Desc_NitrogenGas_C', 'Desc_Water_C']);
  assert.ok(!Object.keys(data.extractors).some(id => id.startsWith('Build_Miner')));
});
// icons.test.ts
test('ícones: todo id listado tem arquivo webp pequeno em public/icons', () => {
  for (const id of icons) { const s = statSync(`public/icons/${id}.webp`); assert.ok(s.size > 0 && s.size < 12_000, id); }
});
test('ícones: produto principal de toda receita e os prédios especiais têm ícone', () => {
  for (const r of Object.values(data.recipes)) assert.ok(icons.includes(r.outs[0].item), r.id);
  for (const id of Object.values(SPECIAL_ICON)) assert.ok(icons.includes(id), id);
});
test('iconUrl: caminho local ou null', () => {
  assert.equal(iconUrl('Desc_IronIngot_C'), '/icons/Desc_IronIngot_C.webp');
  assert.equal(iconUrl('Nope'), null);
});
```

- [ ] **Step 3: Run** `node --test tests/planner/gamedata.test.ts tests/planner/icons.test.ts` — Expected: FAIL (`extractors` e `icons.json` não existem).
- [ ] **Step 4: Implement** os dois scripts, rodar ambos, `icons.ts`, o tipo `Extractor`, `extractors: {}` nas fixtures sintéticas, e o rodapé `<footer className="pl-foot">{t('plCredit')}</footer>` no `App` do planner (uma linha, discreta, sempre visível). Se o teste "produto principal tem ícone" falhar por id sem arte na fonte, listar a exceção no teste com o motivo.
- [ ] **Step 5: Run** `npm test && npm run typecheck` — Expected: `fail 0`.
- [ ] **Step 6: Commit** `Planner: pesquisa do Modeler, ícones do jogo locais, extratores nos dados e aviso da Coffee Stain`

---

### Task 2: Estado v2 da fábrica (blocos, limites, coleta, ligação livre, loops) e migração da v1

**Files:**
- Modify: `src/planner/model/types.ts`
- Create: `src/planner/model/factory.ts`, `src/planner/model/factorystate.ts`
- Test: `tests/planner/factory.test.ts`, `tests/planner/factorystate.test.ts`

**Interfaces:**
- Consumes: `suggestedPerRow`, `tierKey` (`stage.ts`), `exampleChain` (`example.ts`), `cleanPlace`/`validPieceGap` (mesmas regras da fase 2), `historyNew/Push/Undo/Redo`, `encodeShare`.
- Produces (`types.ts`):
  ```ts
  export type BlockKind = 'recipe' | 'miner' | 'extractor' | 'sink' | 'container' | 'export';
  export type Purity = 'impure' | 'normal' | 'pure';
  export interface Limits { machines?: number; inputs?: Record<ItemId, number> }   // ausente = livre; os dois podem coexistir
  export interface RecipeBlock { id: StageId; kind: 'recipe'; recipe: RecipeId; clock: number; perRow: number | null; tiers: Record<string, string>; limits?: Limits; collect?: ItemId[] }
  export interface MinerBlock { id: StageId; kind: 'miner'; item: ItemId; rate: number }
  export interface ExtractorBlock { id: StageId; kind: 'extractor'; building: BuildingId; item: ItemId; purity: Purity; count: number | null }   // null = a ferramenta calcula
  export interface OutletBlock { id: StageId; kind: 'sink' | 'container' | 'export' }
  export type Block = RecipeBlock | MinerBlock | ExtractorBlock | OutletBlock;
  export interface LigPlace { x: number; y: number; rot: Rot }
  export interface Factory { v: 2; blocks: Block[]; links: Link[]; map?: Record<StageId, MapPlace>; alts?: Record<string, string>; mapGap?: number; ligs?: Record<string, LigPlace> }
  ```
- Produces (`factory.ts`):
  ```ts
  export const PURITY: Record<Purity, number> = { impure: 0.5, normal: 1, pure: 2 };
  export const MINER_DEFAULT = 60;   // Miner Mk.1 em nó normal (Docs) = padrão do Modeler
  export function portsOf(b: Block, d: GameData): { ins: ItemId[] | 'any' | 'solid'; outs: ItemId[] }   // sink: 'solid'; container/export: 'any'
  export type BlockSpec = { kind: 'recipe'; recipe: RecipeId } | { kind: 'miner'; item: ItemId } | { kind: 'extractor'; building: BuildingId; item: ItemId } | { kind: 'sink' | 'container' | 'export' };
  export function addBlock(f: Factory, d: GameData, spec: BlockSpec, at: Pt): Factory
  export function addLinkedBlock(f: Factory, d: GameData, spec: BlockSpec, port: { block: StageId; item: ItemId; side: 'out' | 'in' }, at: Pt): Factory
  export function removeBlock(f: Factory, id: StageId): Factory          // leva links, map[id] e ligs dos grupos que somem
  export function canConnect(f: Factory, d: GameData, from: StageId, to: StageId, item: ItemId): { ok: true } | { ok: false; reason: 'self' | 'item' | 'dup' | 'fluidSink' }
  export function connect(f: Factory, d: GameData, from: StageId, to: StageId, item: ItemId): Factory
  export const disconnect: (f: Factory, linkId: string) => Factory
  export function setRecipe(f: Factory, d: GameData, id: StageId, recipe: RecipeId): Factory   // poda links, tiers, limits.inputs e collect que não cabem
  export function setLimits(f: Factory, id: StageId, limits: Limits | null): Factory               // null ou {} = livre
  export const setClock, setPerRow, setTier                                                          // como na fase 1, sem recálculo
  export function setCollect(f: Factory, d: GameData, id: StageId, item: ItemId, on: boolean): Factory   // fluido: não muda
  export function setMinerRate(f: Factory, id: StageId, rate: number): Factory
  export function setExtractor(f: Factory, d: GameData, id: StageId, v: { count?: number | null; purity?: Purity }): Factory   // purity só se o extrator tem pureza
  export function placeLig(f: Factory, meio: string, place: LigPlace | null): Factory
  export function meiosOf(f: Factory): Meio[]   // mesmo agrupamento e mesmo formato de id de `meios` (fase 1); o tipo `Meio` continua em meio.ts
  ```
- Produces (`factorystate.ts`): `Action` (uma por operação acima, mais `placeBlock`, `setPlaces`, `setMeioAlt`, `setMapGap`, `undo`, `redo`, `load`), `reduce(h, a, d)`, `encodeFactory(f): string`, `decodeFactory(str, d): Factory | null` (lê v1 e v2), `migrateV1(raw: unknown, d): Factory | null`, `exampleFactory(d): Factory`, `initialHistory(hash, saved, d)`, `shouldPersist` (como na fase 2), `PLANNER_STORE` (mesma chave `sf-balancer:planner`).

**Regras (do spec e rulings):**
- `addBlock` de receita: `limits = { machines: suggestedPerRow }` (uma fileira cheia, fixada) — **ruling:** vale para todo bloco criado no vazio, não só o primeiro (bloco solto sem limite não teria número). Miner nasce com `rate: MINER_DEFAULT`; extrator com `purity: 'normal'`, `count: null`. `at` vira `map[id]` preso na grade de 8 m (`rot: 0`).
- `addLinkedBlock`: bloco livre (sem `limits`), já ligado à porta; o tamanho sai do solver (Task 3). Spec incompatível com a porta (receita que não consome/produz o item, sink para fluido): `f` sem mudança.
- `canConnect`: **loops liberados** (sai o motivo `cycle`); `self` continua proibido; `fluidSink` = item fluido indo para `sink`; outlet aceita qualquer item (`sink` só sólido) e não tem saída; miner/extrator só saem com o próprio item.
- **Migração v1 → v2:** cada etapa vira `RecipeBlock` com `limits: { machines }` (as quantidades viram valores fixados), `clock`, `perRow`, `tiers`; `locked` e `pos` somem; `map`, `alts`, `mapGap` passam; `policy` `'sink'` ou `'extra'` vira `collect` em toda saída sólida ligada das produtoras (**ruling:** a política global sai; a sobra agora é por porta). `exampleFactory = migrateV1(exampleChain)`.
- Leitura v2: mesmos limites da fase 2 (200 blocos, 2000 links, ids seguros, `MAP_LIMIT`), mais: `machines` inteiro 1..`MAX_MACHINES` (10000); `inputs`/`rate` finitos em (0, 1e6], só itens de entrada da receita (`inputs`) ou o item minerável (`rate`); `count` inteiro 1..1000 ou `null`; `purity` do enum (vira `'normal'` se o extrator não tem pureza); miner só com item `raw && !fluid`; extrator só com building de `data.extractors` e item de `items`; `collect` só itens de saída sólidos; links refeitos por `canConnect`; `ligs` só com id de `meiosOf` e posição saneada como `MapPlace`. `kind` desconhecido: bloco descartado.

- [ ] **Step 1: Write the failing tests**

```ts
// factory.test.ts
test('bloco de receita no vazio nasce com uma fileira cheia fixada e posição na grade', () => {
  const f = addBlock(empty, data, { kind: 'recipe', recipe: 'Recipe_Alternate_PureIronIngot_C' }, [13, -5]);
  const b = f.blocks[0] as RecipeBlock;
  assert.deepEqual(b.limits, { machines: 7 }); assert.deepEqual(f.map![b.id], { x: 16, y: -8, rot: 0 });
});
test('bloco puxado de uma saída nasce livre e ligado', () => { /* addLinkedBlock(..., steel Beam, {block:'s2', item:'Desc_SteelIngot_C', side:'out'}) → sem limits; link s2→novo */ });
test('loop liberado: B alimenta A que está antes; self continua proibido', () => {
  // Recycled Rubber e Recycled Plastic ligados nos dois sentidos → dois links; connect(x, x) → reason 'self'
});
test('fluido não vai para o Awesome Sink; vai para Container e Saída', () => {
  assert.deepEqual(canConnect(f, data, 'scrap', 'sink1', 'Desc_Water_C'), { ok: false, reason: 'fluidSink' });
  assert.equal(canConnect(f, data, 'scrap', 'box1', 'Desc_Water_C').ok, true);
});
test('setRecipe poda limites de entrada e coleta que não cabem na receita nova', () => {});
test('setCollect ignora saída fluida; setExtractor ignora pureza no Water Extractor', () => {});
test('removeBlock leva links, posição e a ligação salva do grupo que sumiu', () => {});
// factorystate.test.ts
test('migração v1: máquinas viram fixadas, mapa e montagens passam, política sink vira coleta', () => {
  // encodeShare direto (o encodeChain da v1 some na Task 4)
  const f = decodeFactory(encodeShare({ ...exampleChain(data), policy: 'sink', map: { s1: { x: 0, y: 0, rot: 0 } }, alts: {} }), data)!;
  assert.equal(f.v, 2);
  assert.deepEqual((f.blocks.find(b => b.id === 's2') as RecipeBlock).limits, { machines: 60 });
  assert.deepEqual((f.blocks.find(b => b.id === 's1') as RecipeBlock).collect, ['Desc_IronIngot_C']);
  assert.deepEqual(f.map, { s1: { x: 0, y: 0, rot: 0 } });
});
test('link #p= antigo (v1) abre pelo initialHistory', () => { /* initialHistory('#p=' + encodeShare(exampleChain(data)), null, data).present.v === 2 */ });
test('v2: ida e volta igual (todos os tipos de bloco, limites, coleta, ligs)', () => {});
test('v2 hostil é descartado ou limitado', () => {
  // machines NaN → sem limits.machines; inputs { Desc_Coal_C: -1, Desc_Nope_C: 5 } → removidos; rate 1e9 → descartado o bloco;
  // collect ['Desc_Water_C'] → removido; link fluido → sink → descartado; kind 'boss' → bloco descartado;
  // extrator Build_WaterPump_C com item Desc_LiquidOil_C → descartado; ligs { 'x:y>z': ... } → descartado; __proto__ ignorado
});
test('ações entram no desfazer (placeLig, setLimits, setCollect)', () => {});
```

- [ ] **Step 2: Run** `node --test tests/planner/factory.test.ts tests/planner/factorystate.test.ts` — Expected: FAIL (módulos não existem).
- [ ] **Step 3: Implement** os tipos, `factory.ts` e `factorystate.ts`. O app ainda usa a v1 (troca na Task 4).
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: `fail 0`.
- [ ] **Step 5: Commit** `Planner: estado v2 da fábrica (blocos de origem e de sobra, limites, coleta, ligação livre, loops) com migração da v1`

---

### Task 3: Solver do fluxo físico

**Files:**
- Create: `src/planner/model/solve.ts`, `tests/planner/fixtures.ts` (`vf()`, `semFramework()`, `close()`; usados também nas Tasks 4 e 7)
- Test: `tests/planner/solve.test.ts`

**Interfaces:**
- Consumes: `Factory`, `Block`, `PURITY`, `portsOf`, `meiosOf` (Task 2); `data.extractors` (Task 1).
- Produces:
  ```ts
  export interface PortFlow { item: ItemId; rate: number; deficit: number; held: number; exits: number }
  // rate: o que passa na porta; deficit (entrada, só bloco com limite): o que falta para o limite; held (saída): represado
  // nesta origem; exits: o que sai da fábrica pela porta (produto final sem ligação ou coleta de excesso).
  export interface BlockFlow {
    id: StageId; x: number | null;            // receita: máquinas-equivalentes a 100%; miner/extrator: item/min; null = sem limite
    machines: number | null; runClock: number | null;   // receita: inteiro e clock de funcionamento (%); null fora de receita ou sem limite
    extractors: number | null;                // extrator: quantos (calculado = ceil(x / vazão); fixado = count)
    unbounded: boolean; stalled: ItemId | null; ins: PortFlow[]; outs: PortFlow[];
  }
  export interface FlowResult { blocks: Record<StageId, BlockFlow>; links: Record<string, number>; deadlock: StageId[][]; converged: boolean; iterations: number }
  export function solveFactory(f: Factory, d: GameData): FlowResult
  export function components(f: Factory): StageId[][]                       // fracamente conexas pelas ligações, ids ordenados
  export function componentKey(f: Factory, ids: StageId[]): string          // blocos + links do componente; sem map, ligs, alts, mapGap
  export function solveCached(f: Factory, d: GameData, cache: Map<string, FlowResult>): { result: FlowResult; solved: number }  // solved = componentes recalculados
  export const MAX_ITER = 1000, EPS = 1e-9;
  ```

**Algoritmo (ruling; os testes fixam o resultado, não a ordem interna):** ponto fixo a partir dos limites — começa com tudo no máximo e só reduz pelo que falta na entrada ou pelo que não escoa na saída, como o "Full" do Modeler (maior fluxo que respeita os limites).
- Unidades: receita `x` em máquinas a 100%; entrada `i` consome `a_i·x`, saída `j` produz `b_j·x` (`perMin` da receita). Miner e extrator: `x` em item/min, uma saída com `b = 1`. Outlet: uma entrada por item ligado, `a = 1`, sem saída.
- Teto `U0`: receita `min(limits.machines·clock/100, limits.inputs[i]/a_i)` ou `∞`; miner `rate`; extrator fixado `count·perMin·PURITY[purity]` (pureza só se `purity: true`), calculado `∞`; outlet `∞`.
- Entrada sem ligação: elástica (`∞`) ou `limits.inputs[i]` (o "só tenho X aqui"). Saída **escoa livre** (`∞`) se: é `outs[0]` sem ligação (produto final), ou está em `collect`, ou liga a um outlet. Saída sem ligação que não é `outs[0]` e não está em `collect` = **subproduto parado**: escoa 0 (a máquina para — mecânica do jogo). **Ruling a confirmar com o dono:** produto principal sem ligação sai livre.
- Iteração (até estabilizar com `|Δx| ≤ EPS·max(1, x)` ou `MAX_ITER`; `converged` diz qual):
  1. Por grupo de ligações do mesmo item (`meiosOf`): oferta da produtora `O_p = b·x_p`; capacidade da consumidora `A_c = a·min(U0_c, supEx_c, acc_c)` (`supEx`: suprimento das **outras** entradas; outlet `∞`). Fluxo dos links em duas fases, cada uma por **alocação max-min justa** (enchimento progressivo: os links sobem juntos até uma produtora ou consumidora encher, congela, continua): fase 1 só os links para consumidoras com `A_c` finito; fase 2 o que sobrou das ofertas, nos links para consumidoras com `A_c = ∞`. Isso dá o spec: perna com limite pega o dela, as sem limite dividem o resto por igual; Merger puxa por igual de cada origem.
  2. `intake` = soma que chega na entrada; `delivered` = soma que sai na saída. Escoamento da saída `accOut_j = delivered_j + Σ sobra de capacidade (A_c − intake_c)` das consumidoras ligadas, ou `∞` se escoa livre (evita a "catraca": quem foi reduzido pela entrada volta a crescer se a perna abrir).
  3. `sup_b = min_i intake_i/a_i` (elástica `∞`, limitada `limits.inputs[i]/a_i`), `acc_b = min_j accOut_j/b_j`, `x_b = min(U0_b, sup_b, acc_b)`; valores `< EPS` viram 0.
- Resultado: `held_j = b_j·(min(U0, sup) − x)` quando finito e `> EPS` (assim o represado aparece na origem onde o fluxo parou: miner, extrator fixado, bloco fixado com entrada elástica); `exits_j = b_j·x − delivered_j` nas saídas que escoam livre; `deficit_i = max(0, a_i·min(U0, acc) − disponível_i)` só em bloco com limite (`disponível` = `intake` ligada, `limits.inputs[i]` ou `∞`); `stalled = j` quando a saída que limita `x` é subproduto parado; `unbounded` quando `x = ∞` (aí `x`, `machines` e `runClock` são `null`). Receita: `machines = limits.machines ?? ceil(x·100/clock − EPS)`, `runClock = 100·x/machines` (0 máquinas quando `x = 0`). Extrator: `extractors = count ?? ceil(x/(perMin·mult) − EPS)`.
- **Trava (deadlock):** componente fortemente conexo com 2+ blocos e todos com `x = 0` → entra em `deadlock` (ids ordenados).
- Por componente (`components`), com cache por `componentKey`; o `FlowResult` final junta os pedaços.

- [ ] **Step 1: Write the failing tests** (`solve.test.ts`; fixtures montadas com `factory.ts`; números do `game.json`)

```ts
// Cadeia do spec: m1 Miner Iron Ore 280 → s1 Pure Iron (livre) → s2 Solid Steel (livre) → s3 Steel Beam (livre) e s4 Steel Pipe (livre);
// s3 → s5 Versatile Framework fixado em 1 (Modular Frame bruto). Pipe e Framework sem ligação: produto final.
test('Versatile Framework consome 30 vigas: o aço livre vai para os canos', () => {
  const r = solveFactory(vf(), data);
  assert.equal(r.blocks.s3.machines, 2); close(r.links.lBeam, 120); close(r.links.lPipe, 660);
  assert.equal(r.blocks.s4.machines, 22); close(r.blocks.m1.outs[0].held, 0); assert.equal(r.converged, true);
});
test('canos limitados em 8: o consumo volta até a mineradora e aparece represado lá', () => {
  const r = solveFactory(setLimits(vf(), 's4', { machines: 8 }), data);
  close(r.blocks.s2.x!, 6); close(r.blocks.s1.x!, 240 / 65);
  close(r.blocks.m1.outs[0].held, 280 - 35 * 240 / 65);   // 150,769…
  close(r.blocks.s2.outs[0].held, 0);
});
test('duas pernas sem limite dividem por igual; com limite, uma pega o dela e a outra o resto', () => {
  // sem o Framework (vigas viram produto final): 390 / 390, s3.machines 7 com runClock 6.5/7·100
  // s4 limitado em 5 máquinas: 150 nos canos, 630 nas vigas
});
test('aumentar não puxa os de trás: vigas fixadas acima do aço mostram falta', () => {
  const r = solveFactory(setLimits(semFramework(), 's3', { machines: 15 }), data);
  close(r.blocks.s1.x!, 8);                              // o ferro não cresceu além da mineradora
  close(r.blocks.s3.ins[0].deficit, 900 - 780);          // a perna com limite pega tudo; os canos (livres) ficam com 0
  close(r.links.lPipe, 0);
});
test('limite na entrada bruta: falta só na porta limitada', () => {
  // s2 sozinho, fixado em 8, Iron Ingot sem ligação com limits.inputs 200 → x 5, deficit ferro 120, deficit carvão 0, aço 300
});
test('fixado não muda quando a origem encolhe', () => { /* s2 fixado em 8 com mineradora 100: machines continua 8, runClock < 100 */ });
test('subproduto fluido sem saída trava o bloco; Container resolve; coleta não vale para fluido', () => {
  // Aluminum Scrap fixado em 1 (Alumina Solution e Coal brutos): água sem ligação → x 0, stalled 'Desc_Water_C'
  // água → Container: x 1, Container recebe 120, stalled null
});
test('subproduto sólido parado trava; coleta de excesso libera', () => {
  // Alumina Solution fixado em 1: Silica sem ligação → stalled 'Desc_Silica_C'; setCollect(Silica) → x 1, outs Silica exits 50
});
test('Awesome Sink, Container e Saída recebem tudo que sobra ali', () => {});
test('extrator: quantos precisa pela vazão; pureza só onde vale; fixado vira teto com falta', () => {
  // Water Extractor → Pure Iron fixado em 7 (água 140): extractors 2; extrator fixado em 1 → deficit 20 na água da refinaria
  // Oil Extractor → Plastic fixado em 4 (óleo 120; Heavy Oil Residue → Container): 'pure' (240) → 1; 'impure' (60) → 2
});
test('loop de borracha e plástico reciclados estabiliza', () => {
  // P Recycled Plastic fixado em 1, R Recycled Rubber livre, Fuel bruto; P→R, R→P, R→Sink:
  // R.x 2, link R→P 30, R→Sink 90, converged true, deadlock []
});
test('loop sem saída trava e é apontado', () => {
  // mesmo sem o Sink: P.x 0, R.x 0, deadlock [['P','R']] (ids ordenados)
});
test('loop que se sustenta sem limite fica sem limite e não trava', () => {
  // P e R livres + Sink: unbounded true nos dois, x null, iterations <= MAX_ITER, nenhum NaN no resultado
});
test('apagar a âncora: os livres de baixo ficam sem limite, sem NaN', () => {});
test('cache por componente: mexer num componente não recalcula o outro; mapa e ligs fora da chave', () => {
  // solveCached duas vezes; segunda com s3 alterado → solved 1; só placeBlock → solved 0
});
test('desempenho: 10 blocos encadeados de 200 máquinas + um loop resolvem em menos de 50 ms', () => {});
```

(`close(a, b)` = `assert.ok(Math.abs(a - b) < 1e-6)`.)

- [ ] **Step 2: Run** `node --test tests/planner/solve.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `solve.ts` como acima.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: `fail 0`.
- [ ] **Step 5: Commit** `Planner: solver do fluxo físico (limites, sobra voltando, divisão por igual, subproduto travado, loops e trava)`

---

### Task 4: O app inteiro no estado v2 e no solver

**Files:**
- Create: `src/planner/model/solved.ts`, `src/planner/solver.ts`
- Modify: `src/planner/model/types.ts` (`Stage` sem `locked` e `pos`), `model/meio.ts`, `model/meioresult.ts`, `model/map/block.ts`, `model/map/scene.ts`, `model/example.ts`, `worker/meio.worker.ts`, `meios.ts`, `store.ts`, `App.tsx`, `ui/MapView.tsx`, `ui/MapPanel.tsx`, `ui/StageView.tsx`, `ui/Inspector.tsx`, `ui/Header.tsx`, `src/i18n/{pt,en,es}.js`, `package.json`
- Delete: `model/chain.ts`, `model/persist.ts`, `model/autolayout.ts`, `ui/Graph.tsx`, `ui/StageNode.tsx`, `ui/RawNode.tsx`, `ui/MeioEdge.tsx`, `tests/planner/{chain,persist,autolayout,mapstate}.test.ts` (o que eles cobrem e ainda vale já está nos testes da Task 2)
- Test: `tests/planner/solved.test.ts`; atualizar `meio`, `meioresult`, `meiogeo`, `scene`, `block`, `totals`, `drawing`, `stage` para fixtures v2

**Interfaces:**
- Consumes: `Factory`, ações e `initialHistory` (Task 2); `solveFactory`, `solveCached`, `FlowResult` (Task 3).
- Produces:
  ```ts
  // solved.ts
  export function solvedStage(b: RecipeBlock, bf: BlockFlow | undefined): Stage   // machines = max(1, bf.machines ?? 1); clock = b.clock (fileiras e tiers não pulam com o fluxo)
  export function factoryTotals(f: Factory, flow: FlowResult): { blocks: number; machines: number }
  export function markerGeo(b: MinerBlock | ExtractorBlock | OutletBlock, bf: BlockFlow | undefined, d: GameData): BlockGeo   // 8 × 8 m (Awesome Sink 16 × 13), estimate: true
  // meio.ts (assinaturas novas; `meios` passa a ser `meiosOf`)
  export function meioInput(meio: Meio, f: Factory, flow: FlowResult, d: GameData): MeioInput
  export function meioPlan(meio: Meio, f: Factory, flow: FlowResult, d: GameData): Plan     // Plan ganha `direct?: true` e `unbounded?: true`
  export function meioHash(meio: Meio, f: Factory, flow: FlowResult, d: GameData): string
  export const cacheKey: (meio: Meio, f: Factory, flow: FlowResult, d: GameData, lang: string) => string
  // scene.ts (mesmas regras da fase 2, agora sobre f.blocks)
  export function proposeMap(f: Factory, d: GameData, geos: Geos, flow: FlowResult): Record<StageId, MapPlace>
  export function placesOf(f: Factory, d: GameData, geos: Geos, flow: FlowResult): Record<StageId, MapPlace>
  export function buildScene(f: Factory, d: GameData, places: Record<StageId, MapPlace>, geos: Geos, flow: FlowResult): Scene
  // meios.ts
  export function useMeioResults(f: Factory, flow: FlowResult, d: GameData, lang: string, list: Meio[]): Map<string, MeioResult | null>
  // solver.ts
  export function useFlow(f: Factory, d: GameData): FlowResult   // worker + cache por componente; enquanto calcula, devolve o último resultado
  ```
- `example.ts` passa a devolver o formato bruto v1 (`ChainV1`, tipo que mora em `factorystate.ts` só para a migração); `Chain` e o `Stage` persistido da v1 saem de `types.ts` (`Stage` fica só como etapa derivada: `id, recipe, machines, clock, perRow, tiers`).
- Worker: mensagens `{ type: 'solve'; seq: number; factory: Factory }` → `{ type: 'solved'; seq: number; result: FlowResult }` e `{ type: 'meios'; lang; factory; flow; jobs }` → `{ type: 'meios'; results; failed }` (a de hoje, com `flow` junto para os dois lados usarem os mesmos números). Respostas de `seq` velho são descartadas.

**Regras:**
- `meioInput`: produtora de receita = grupo `{ count: machines, clock: runClock, nominal, per: perRowOf(solvedStage) }` (oferta real); consumidora de receita = `{ count: machines, clock: 100·(intake + deficit)/(nominal·machines), … }` (o que ela quer, sempre finito: a falta aparece como "short" no meio); miner = `ceil(x/cap)` linhas iguais; extrator = `extractors` grupos de `perMin·mult`. Outlets **não** entram nos destinos: com outlet no grupo, a política do meio é `'extra'` e a linha extra vai até o outlet; grupo só com outlets = `direct` (sem `computePlan`; esteiras retas de cada fileira até o outlet). Com `collect` numa produtora do grupo, política `'sink'`; senão `'represar'`. Bloco `unbounded` no grupo: `unbounded: true`, sem `computePlan`, desenhado como a faixa "calculando" com o rótulo `plUnbounded`.
- Cena: blocos de receita via `blockGeo(solvedStage(...))`; os outros via `markerGeo` (marcador fora de escala, tracejado, rótulo `plNotToScale`; medidas reais de Miner, extratores e Container são pergunta ao dono). `proposeMap`/`placesOf` iguais, agora sobre `f.blocks`.
- Saem: `rebalance`, `setLocked`, cadeado na UI, a vista "Cadeia" (grafo React Flow) e o seletor Cadeia/Mapa e "nó a nó / pela meta" do cabeçalho; o mapa é a única vista. `@xyflow/react` e `@dagrejs/dagre` saem do `package.json`. A `Sidebar` fica até a Task 6, despachando `addBlock` (no centro da vista) em vez de `addStage`.
- `StageView` (detalhe do bloco, duplo clique) recebe `solvedStage`; campo de máquinas edita `limits.machines`.
- Chaves novas: `plUnbounded` ("sem limite"), `plNotToScale` ("fora de escala"), `plFlowCalc` ("calculando o fluxo…"), `plNotConverged` ("o cálculo não estabilizou"), `plDeadlock` (função: nomes dos blocos), e os nomes `plMiner` ("Miner" nos três), `plSink` ("Awesome Sink"), `plContainer` ("Container"), `plExport` (pt "Saída", en "Export", es "Salida").

- [ ] **Step 1: Write the failing tests**

```ts
test('exampleFactory: blocos derivados batem com o exemplo da fase 1', () => {
  const f = exampleFactory(data), flow = solveFactory(f, data);
  assert.equal(solvedStage(f.blocks[1] as RecipeBlock, flow.blocks.s2).machines, 60);
  close(flow.blocks.s1.outs[0].held, 2730 - 2400);           // ferro represado na refinaria fixada
});
test('meioInput usa a oferta real e o que a consumidora quer', () => { /* supply 2400 e demand 2400 no l1 do exemplo */ });
test('ligação para Awesome Sink vira linha extra; grupo só com outlet é direto', () => {});
test('bloco sem limite no grupo: meio unbounded, nenhum Infinity no MeioInput nem na geometria', () => {
  // JSON.stringify(meioInput(...)) não contém 'null' vindo de Infinity; buildScene não lança
});
test('marcador de origem e de sobra: 8 × 8, Awesome Sink 16 × 13, estimate', () => {});
test('cacheKey muda com o fluxo do bloco e não com a posição no mapa', () => {});
test('factoryTotals soma as máquinas resolvidas', () => {});
```

- [ ] **Step 2: Run** `node --test tests/planner/solved.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `solved.ts`, as assinaturas novas de `meio.ts`/`meioresult.ts`, o worker com `solve`, `useFlow`, o `store.ts` sobre `factorystate.ts`, e o `App` só com o mapa. Apagar os arquivos v1 e os testes listados; portar as fixtures dos outros testes para `exampleFactory` + `solveFactory`.
- [ ] **Step 4: Run** `npm install && npm test && npm run typecheck && npm run build` — Expected: `fail 0`, build sem erro, chunk do worker gerado.
- [ ] **Step 5: Verificar** com `npm run preview` em `/planner.html`: o exemplo abre no mapa com as mesmas fileiras; mudar máquinas de s3 no detalhe não mexe em s2 (fixado); arrastar um bloco não manda mensagem `solve` ao worker (DevTools).
- [ ] **Step 6: Commit** `Planner: fábrica v2 e solver em tudo (blocos, fileiras, ligações, totais, mapa); sai o recálculo antigo e o grafo`

---

### Task 5: "Ligação" na interface e ligação arrastável no mapa

**Files:**
- Modify: `src/i18n/{pt,en,es}.js`, `src/planner/model/map/scene.ts`, `src/planner/model/map/edit.ts`, `src/planner/ui/MapView.tsx`, `src/planner/ui/MapPanel.tsx`
- Test: `tests/planner/scene.test.ts`, `tests/planner/i18nligacao.test.ts`

**Interfaces:**
- Consumes: `placeLig`, `Factory.ligs` (Task 2); `link()` de `scene.ts` (re-roteia esteiras).
- Produces: `buildScene` usa `f.ligs[meio.id]` como canto e giro da ligação quando existe; senão a posição colada na primeira produtora (fase 2). `hitTest` igual. `edit.ts`: `ligDragged(p: LigPlace, dx, dy): LigPlace` (grade de 8 m), `ligRotated`.

**Regras:**
- **Ruling de texto:** todo texto visível do builder com "meio" passa a Ligação (pt) / Connection (en) / Conexión (es) — rótulos, dicas, `aria-label`, avisos, o painel. A página Balancer **mantém** "Meio" como nome do trecho 2 (Coleta / Meio / Distribuição) e o "balancer" continua nome de peça.
- Arrastar uma ligação: segue o ponteiro preso na grade; ao soltar, `placeLig`. Setas movem 8 m e `R` gira com a ligação selecionada. Botão no painel "Colar na origem" (`placeLig(id, null)`). As esteiras dos blocos até ela são refeitas pelo `link()` de sempre; o arraste não recalcula meio nem fluxo.
- Chaves novas: `plLigReset`, `plLigMoveHint`.

- [ ] **Step 1: Write the failing tests**

```ts
test('ligação posicionada fica onde foi posta e não anda com a produtora', () => {
  const f = placeLig(exampleFactory(data), meioId, { x: 400, y: 80, rot: 0 });
  const s = buildScene(f, data, places, geos, flow);
  assert.deepEqual([s.meios[0].rect.x, s.meios[0].rect.y], [400, 80]);
  // mover s1 em +80: rect da ligação igual; as esteiras de s1 terminam nas entradas da ligação
});
test('ligação cujo id mudou (nova ligação no grupo) volta a colar na origem sem erro', () => {});
test('placeLig null volta para a posição colada', () => {});
test('nenhum texto do builder fala em meio', () => {
  // para toda chave pl*: valor (função chamada com '1', '2', '3') não casa /\bmeios?\b/i em pt, /\bmiddles?\b/i em en, /\bmedios?\b/i em es
});
```

- [ ] **Step 2: Run** `node --test tests/planner/scene.test.ts tests/planner/i18nligacao.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** a cena, o arraste, o teclado e a troca de textos.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: `fail 0`.
- [ ] **Step 5: Commit** `Planner: o meio vira Ligação na interface e passa a ser arrastável no mapa`

---

### Task 6: O mapa vira o lugar de montar (gestos do Modeler)

**Files:**
- Create: `src/planner/model/picker.ts`, `src/planner/model/map/ports.ts`, `src/planner/ui/Picker.tsx`
- Modify: `src/planner/ui/MapView.tsx`, `src/planner/ui/mapDraw.ts`, `src/planner/App.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`
- Delete: `src/planner/ui/Sidebar.tsx`, `src/planner/ui/RecipeSearch.tsx`
- Test: `tests/planner/picker.test.ts`, `tests/planner/ports.test.ts`

**Interfaces:**
- Consumes: `searchRecipes` (`search.ts`), `addBlock`, `addLinkedBlock`, `connect`, `canConnect`, `removeBlock`, `BlockSpec` (Task 2); `iconUrl` (Task 1); `Scene` (Task 4/5).
- Produces:
  ```ts
  // picker.ts
  export interface PickerEntry { spec: BlockSpec; title: string; sub: string; icon: string | null; alt: boolean; ins: ItemId[]; outs: ItemId[] }
  export function pickerEntries(d: GameData, query: string, filter?: { consumes?: ItemId; produces?: ItemId }): { special: PickerEntry[]; recipes: PickerEntry[] }
  // ports.ts
  export interface ScenePort { block: StageId; item: ItemId; side: 'in' | 'out'; x: number; y: number; fluid: boolean }
  export function scenePorts(scene: Scene, f: Factory, d: GameData): ScenePort[]     // uma por (bloco, lado, item), no meio das âncoras daquele item
  export function portAt(ports: ScenePort[], x: number, y: number, tol: number): ScenePort | null   // tol em metros (8 px / zoom)
  export function dropTarget(f: Factory, d: GameData, from: ScenePort, to: ScenePort | null): { kind: 'connect'; from: StageId; to: StageId; item: ItemId } | { kind: 'picker'; filter: { consumes?: ItemId; produces?: ItemId } } | { kind: 'none' }
  ```

**Regras:**
- `pickerEntries`: `special` primeiro (como a lista da esquerda do Modeler): sem filtro, Miner (um por item `raw && !fluid`), um por extrator × item, Awesome Sink, Container, Saída; com `consumes` sólido: Awesome Sink, Container, Saída; com `consumes` fluido: Container, Saída (sem Sink); com `produces`: Miner se o item é bruto sólido, os extratores que extraem o item. `recipes` pela ordem do `searchRecipes` (produto exato, normais antes das alternativas); `alt` marca a alternativa. Busca casa com nome da receita, produto e também com o nome da especial.
- **Gestos:** duplo clique ou botão direito no vazio abre o `Picker` ali (popover, `role="dialog"`, campo de busca com foco, cartões com ícone do produto, prédio e ingredientes, alternativas destacadas, setas + Enter, Esc fecha e devolve o foco ao canvas); escolher cria o bloco no ponto (`addBlock`). Arrastar de uma porta desenha a esteira provisória; soltar no vazio abre o `Picker` filtrado (`dropTarget`) e o escolhido nasce ligado (`addLinkedBlock`) onde soltou; soltar numa porta compatível só liga (`connect`); incompatível não faz nada e mostra o motivo (`plLinkWhy…`). Arrastar o corpo do bloco continua movendo; arrastar o fundo, a câmera.
- Trocar receita fica no painel do bloco (Task 7). Delete/Backspace apaga o bloco selecionado (`removeBlock`, entra no desfazer).
- **Ruling:** o grafo da fase 1 já saiu na Task 4; aqui saem a `Sidebar` e a `RecipeSearch` (a lógica de teclado do combobox vai para o `Picker`).
- Canvas: portas desenhadas como tocos com o ícone do item (de perto) e realçadas sob o ponteiro; durante o arraste, as portas compatíveis acendem.
- Chaves novas: `plPickTitle`, `plPickSearch`, `plPickSpecial`, `plPickRecipes`, `plPickNone`, `plPickFor` (função: item), `plPickAlt`, `plLinkWhySelf`, `plLinkWhyItem`, `plLinkWhyDup`, `plLinkWhyFluidSink`, `plCanvasHint` (duplo clique ou botão direito cria; arrastar da porta liga).

- [ ] **Step 1: Write the failing tests**

```ts
test('seletor de uma saída sólida: quem consome + Sink, Container e Saída', () => {
  const r = pickerEntries(data, '', { consumes: 'Desc_SteelIngot_C' });
  assert.deepEqual(r.special.map(e => e.spec.kind), ['sink', 'container', 'export']);
  assert.ok(r.recipes.some(e => e.title === 'Steel Beam') && r.recipes.every(e => e.ins.includes('Desc_SteelIngot_C')));
});
test('seletor de uma saída fluida não oferece o Awesome Sink', () => { /* consumes Desc_Water_C → ['container', 'export'] */ });
test('seletor de uma entrada de minério: Miner; de água: Water Extractor e Resource Well Extractor', () => {
  assert.deepEqual(pickerEntries(data, '', { produces: 'Desc_OreIron_C' }).special.map(e => e.spec), [{ kind: 'miner', item: 'Desc_OreIron_C' }]);
  // produces Desc_Water_C → extractor Build_WaterPump_C e Build_FrackingExtractor_C (item água); recipes incluem Aluminum Scrap
});
test('alternativas marcadas e depois das normais', () => {});
test('portAt acha a porta de saída do aço no exemplo e nada no vazio', () => {});
test('dropTarget: porta compatível liga, vazio abre o seletor filtrado, incompatível não faz nada', () => {});
```

- [ ] **Step 2: Run** `node --test tests/planner/picker.test.ts tests/planner/ports.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `picker.ts`, `ports.ts`, `Picker.tsx`, os gestos no `MapView` e as portas no `mapDraw`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: `fail 0`.
- [ ] **Step 5: Verificar** no preview: montar ferro puro → aço → vigas e canos → Versatile Framework só com duplo clique e arrastar de porta, sem painel lateral de busca.
- [ ] **Step 6: Commit** `Planner: montar no mapa como no Modeler (seletor no ponto, arrastar da porta para criar ou ligar)`

---

### Task 7: O bloco no canvas (limites, falta, represado, travado, origens)

**Files:**
- Create: `src/planner/model/badges.ts`, `src/planner/ui/BlockPanel.tsx`, `src/planner/ui/NumField.tsx` (o `NumField` sai do `Inspector.tsx`)
- Modify: `src/planner/ui/mapDraw.ts`, `src/planner/ui/MapView.tsx`, `src/planner/ui/MapPanel.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`
- Test: `tests/planner/badges.test.ts`

**Interfaces:**
- Consumes: `BlockFlow`, `FlowResult` (Task 3); `setLimits`, `setRecipe`, `setCollect`, `setMinerRate`, `setExtractor`, `setClock` (Task 2); `recipesFor` (`search.ts`); `iconImage` (Task 1).
- Produces:
  ```ts
  export type BadgeKind = 'deficit' | 'held' | 'exit' | 'stalled' | 'unbounded' | 'deadlock';
  export interface Badge { kind: BadgeKind; side: 'in' | 'out' | 'block'; item: ItemId | null; amount: number | null }
  export function blockBadges(bf: BlockFlow, flow: FlowResult): Badge[]   // só acima de EPS; ordem: block, in, out
  export interface LimitView { machines: { value: number | null; fixed: boolean }; inputs: { item: ItemId; value: number; fixed: boolean; raw: boolean }[] }
  export function limitView(b: RecipeBlock, bf: BlockFlow | undefined): LimitView   // value = fixado ou calculado
  ```

**Regras:**
- No canvas (de perto): falta em vermelho na porta de entrada ("−120"), represado em verde na saída ("120 represado"), saída que sai da fábrica em verde ("produto 160" ou "Awesome Sink 50" com coleta), bloco travado com contorno de aviso e o motivo (`plStalled`: item), "sem limite" e "trava em loop" no título. De longe: só um ponto colorido por tipo de aviso no canto do bloco. Ícone do produto principal (ou do prédio especial) no título do bloco e o ícone do item no rótulo de cada ligação.
- `BlockPanel` (lateral; substitui o painel de etapa do `Inspector` e o bloco do `MapPanel`): receita com troca no lugar (lista `recipesFor(outs[0])`, alternativas marcadas), máquinas e entrada por porta (`NumField`; valor calculado em texto normal com rótulo "calculado", fixado em destaque com botão "voltar ao padrão" que tira só aquele limite), clock, coleta de excesso por saída sólida (checkbox), lado das entradas/giro/vãos (o que já existia no `MapPanel`), apagar. Miner: taxa (item/min). Extrator: pureza (só com `purity`), quantidade calculada mostrada, campo para fixar e "voltar ao calculado". Outlet: o que recebe, por item.
- Chaves novas: `plCalc`, `plFixed`, `plResetDefault`, `plLimitMachines`, `plLimitInput` (função: item), `plCollect`, `plCollectHint`, `plStalled` (função: item), `plDeficit` (função: n), `plHeld` (função: n), `plExit` (função: n), `plMinerRate`, `plPurity`, `plPurityImpure`, `plPurityNormal`, `plPurityPure`, `plExtractorCount`, `plExtractorNeed` (função: n), `plOutletGets`, `plChangeRecipe`, `plDeleteBlock`.

- [ ] **Step 1: Write the failing tests**

```ts
test('badges da cadeia do Framework com canos limitados: represado só na mineradora', () => {
  const flow = solveFactory(setLimits(vf(), 's4', { machines: 8 }), data);
  assert.deepEqual(blockBadges(flow.blocks.m1, flow).map(b => b.kind), ['held']);
  assert.deepEqual(blockBadges(flow.blocks.s2, flow), []);
});
test('badges: falta na entrada limitada, travado com o item, sem limite', () => {});
test('limitView: fixado marcado; voltar ao padrão tira só aquele limite', () => {
  const b = { ...bloco, limits: { machines: 8, inputs: { Desc_IronIngot_C: 200 } } };
  assert.equal(limitView(b, bf).machines.fixed, true);
  const v = limitView({ ...b, limits: { inputs: b.limits.inputs } }, bf);
  assert.equal(v.machines.fixed, false); assert.equal(v.inputs[0].fixed, true);
});
```

- [ ] **Step 2: Run** `node --test tests/planner/badges.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `badges.ts`, `BlockPanel`, `NumField.tsx` e o desenho no `mapDraw`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: `fail 0`.
- [ ] **Step 5: Verificar** no preview: fixar Steel Pipe em 8 no exemplo do Framework → verde na Miner, vermelho some; voltar ao padrão → canos crescem.
- [ ] **Step 6: Commit** `Planner: bloco no canvas com limites, falta, represado, travado, mineradora e extrator`

---

### Task 8: Modal da ligação (desenho do fluxo, montagens, passo a passo, abrir no Balancer)

**Files:**
- Create: `src/planner/model/ligacao.ts`, `src/planner/ui/LigacaoModal.tsx`, `src/styles/parts.css`
- Modify: `src/styles/main.css` (as regras do desenho do fluxo, legenda, `.items`, `.wb*`, `.ponder`, `.cands` e afins saem para `parts.css`, importado por `@import './parts.css';` no topo), `src/planner/main.tsx` (importa `parts.css`), `src/planner/worker/meio.worker.ts`, `src/planner/meios.ts`, `src/planner/ui/MapView.tsx`, `src/planner/App.tsx`, `src/i18n/{pt,en,es}.js`
- Delete: `src/planner/ui/Inspector.tsx`
- Test: `tests/planner/ligacao.test.ts`

**Interfaces:**
- Consumes: `flowSvg`, `flowHasLoop` (`src/ui/flow.js`, só string, sem DOM), `workbench`, `stopStage` (`src/ui/workbench.js`), `designKey` (`balancerSvg.js`), `meioPlan` (Task 4), `chosenAlt`, `setMeioAlt`, `disconnect`.
- Produces:
  ```ts
  export interface Bench { label: string; ctx: { N: number; M: number; rates: number[]; cap: number; belt: string; labels: { ins: string[]; outs: string[] }; inUse: string; view: string; style: 'normal' | 'butterfly' } }
  export interface FlowView { title: string; svg: string; loop: boolean; fluid: boolean; benches: Bench[]; warnings: string[] }
  export function flowView(meio: Meio, f: Factory, flow: FlowResult, d: GameData, altKey: string): FlowView   // roda no worker
  export function balancerUrl(meio: Meio, f: Factory, flow: FlowResult, d: GameData, lang: Lang): string        // BALANCER_PATH[lang] + meioHash (o caminho chega na Task 9; até lá, SITE_PATH)
  ```
- Worker: mensagem `{ type: 'flow'; lang; factory; flow; meio: string; alt: string; key: string }` → `{ type: 'flow'; key; view: FlowView }`; cache por `cacheKey + '|' + alt`.

**Regras:**
- `title` = `t('plLigTitle', rótulo)`, rótulo = "balancer N→M" quando a montagem tem `view.bal`, senão o `caseLabel`. `benches` = o balancer N→M da montagem (como o `openFromPlan('plan')`) e uma árvore por doadora (`'g<i>'`), com os rótulos `O1…`/`D1…` de sempre; fluido: `benches = []`.
- Clicar numa ligação (clique sem arraste) abre o modal (`<dialog>` com `showModal()`): título, a lista de montagens (rádio, a escolha da fase 2, `setMeioAlt`), o desenho `svg` com a legenda da ferramenta (esteiras animadas como lá), avisos, oferta/demanda/falta, as ligações do grupo com "desligar" (`disconnect`), e os botões "Montar passo a passo" (troca o desenho pelo `workbench(el, { ...bench.ctx, blueprints: [] , … })` montado num `div` por `useEffect`, com `stopStage(el)` ao sair; mais de um bench vira uma escolha) e "Abrir no Balancer" (link em nova aba, `balancerUrl`). Esc fecha e devolve o foco ao canvas (ou a quem abriu). Enquanto o worker calcula, "calculando…".
- **Ruling:** o painel lateral da ligação (`Inspector`) sai; tudo dele vai para o modal.
- A página Balancer não pode mudar com a separação do CSS: conferir com `visual:compare`.
- Chaves novas: `plLigTitle` (função), `plLigClose`, `plLigBuild`, `plLigBuildPick`, `plLigOpenBalancer`, `plLigLinks`, `plLigUnlink`, `plLigBack` (volta do passo a passo para o desenho).

- [ ] **Step 1: Write the failing tests**

```ts
test('flowView da ligação de ferro do exemplo: SVG, título e balancer para o passo a passo', () => {
  const v = flowView(meioDoExemplo('l1'), f, flow, data, altComBalancer);
  assert.ok(v.svg.startsWith('<svg')); assert.equal(v.fluid, false);
  assert.match(v.title, /balancer \d+→\d+/); assert.ok(v.benches.length >= 1);
  assert.doesNotThrow(() => structuredClone(v));
});
test('ligação fluida: desenho de canos e nenhum passo a passo', () => {});
test('montagem sem balancer: título com o caso', () => {});
test('idioma: título e legenda no idioma pedido', () => { /* inLang('es', ...) usa "Conexión" */ });
```

- [ ] **Step 2: Run** `node --test tests/planner/ligacao.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `ligacao.ts`, a mensagem do worker, `LigacaoModal`, a separação do CSS.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: `fail 0`.
- [ ] **Step 5: Verificar:** capturas do Balancer antes e depois da separação do CSS (`npm run visual:capture -- http://localhost:4173 <antes|depois> --only=padrao` em cada versão, depois `npm run visual:compare -- <antes> <depois>`) — Expected: sem diferença. No builder: clicar na ligação de ferro abre o modal com as esteiras animadas; "Montar passo a passo" mostra o balancer; Esc volta ao mapa com o foco no canvas.
- [ ] **Step 6: Commit** `Planner: modal da ligação com o desenho do fluxo, as montagens, o passo a passo e o link para o Balancer`

---

### Task 9: Rotas — builder em `/`, ferramenta atual em `/balancer`

**Files:**
- Modify/Move: `git mv index.html balancer.html`; `git mv planner.html index.html` e completar o `index.html` do builder (título, descrição, `canonical`, `hreflang` de `/`, `/pt`, `/es`, `og:*` do builder com a mesma `og.png`, script de redirecionamento dos links antigos); `vite.config.js` (`input: { main: 'index.html', balancer: 'balancer.html' }`), `vercel.json`, `nginx.conf`, `public/sitemap.xml`, `src/planner/lang.ts`, `src/planner/App.tsx`, `src/planner/ui/Header.tsx`, `src/ui/lang.js`, `balancer.html` (link do cabeçalho, `canonical`/`hreflang`/`og:url` em `/balancer`, script anti-piscada com o caminho novo), `src/i18n/{pt,en,es}.js`
- Test: `tests/planner/routes.test.ts` (substitui `lang.test.ts`)

**Interfaces:**
- Produces (`src/planner/lang.ts`):
  ```ts
  export const BUILDER_PATH: Record<Lang, string> = { en: '/', pt: '/pt', es: '/es' };
  export const BALANCER_PATH: Record<Lang, string> = { en: '/balancer', pt: '/pt/balancer', es: '/es/balancer' };
  export function pathLang(pathname: string): Lang | null                // /pt, /pt/, /es/balancer, /en → idioma; resto null
  export function builderLang(pathname: string, search: string, saved: string | null): Lang   // caminho, ?lang=, salvo, inglês
  export function legacyTarget(pathname: string, hash: string): string | null   // '#s=' no builder → Balancer do mesmo idioma
  ```
  `PLANNER_PATH` e `SITE_PATH` saem (quem usava passa para `BUILDER_PATH`/`BALANCER_PATH`); `pickLang` do `src/ui/lang.js` usa `pathLang`.

**Regras:**
- Script inline no `<head>` do `index.html`, antes de tudo: espelho de `legacyTarget` (`/^#s=/` no hash e caminho `/`, `/pt`, `/es` → `location.replace(<balancer do idioma> + hash)`); comentário diz que espelha `legacyTarget` e o teste confere.
- `vercel.json` — redirects (permanentes): `/en` → `/`, `/en/balancer` → `/balancer`, `/planner` → `/`, `/en/planner` → `/`, `/:lang(pt|es)/planner` → `/:lang` (o navegador mantém o `#p=`); rewrites: `/:lang(pt|es)` → `/`, `/:lang(pt|es)/balancer` → `/balancer`. CSP sem mudança. `nginx.conf` espelha (mesmos redirects e `try_files` para `/index.html` e `/balancer.html`).
- `sitemap.xml`: `/`, `/pt`, `/es`, `/balancer`, `/pt/balancer`, `/es/balancer` com `hreflang` cruzados por página; nada de `/planner`.
- Cabeçalhos: builder ganha o link "Balancer" (`BALANCER_PATH[lang]`) no lugar do "← Balancer"; Balancer troca "Planner (beta)" por "Planner" (`BUILDER_PATH`). Título, descrição e `canonical` de cada página pelo idioma (`plPageTitle`, `plMetaDesc` reescritos para o builder; `pageTitle` do Balancer sem mudança). No site, a URL acompanha o idioma nas duas páginas.
- Chaves: `plOpen` vira "Planner" (en) / "Planejador" (pt) / "Planificador" (es); `plBalancerLink` = "Balancer" nos três.

- [ ] **Step 1: Write the failing tests**

```ts
test('idioma pelo caminho do builder e do Balancer', () => {
  assert.equal(pathLang('/pt'), 'pt'); assert.equal(pathLang('/es/balancer/'), 'es'); assert.equal(pathLang('/'), null);
  assert.equal(builderLang('/', '?lang=es', 'pt'), 'es'); assert.equal(builderLang('/', '', 'xx'), 'en');
});
test('link antigo #s= vai para o Balancer do mesmo idioma; #p= fica no builder', () => {
  assert.equal(legacyTarget('/', '#s=abc'), '/balancer#s=abc');
  assert.equal(legacyTarget('/pt', '#s=abc'), '/pt/balancer#s=abc');
  assert.equal(legacyTarget('/es/', '#s=abc'), '/es/balancer#s=abc');
  assert.equal(legacyTarget('/', '#p=abc'), null); assert.equal(legacyTarget('/balancer', '#s=abc'), null);
});
test('index.html tem o redirecionamento inline espelhando legacyTarget', () => { /* readFileSync: contém '#s=' e '/balancer' e location.replace */ });
test('vercel.json e nginx.conf: /planner* redireciona para o builder e /balancer existe nos três idiomas', () => {
  // redirects contêm { source: '/:lang(pt|es)/planner', destination: '/:lang' }; rewrites contêm '/:lang(pt|es)/balancer';
  // nginx.conf contém 'location = /planner { return 301 /; }' e '/balancer.html'
});
test('sitemap: seis páginas, sem /planner', () => {});
```

- [ ] **Step 2: Run** `node --test tests/planner/routes.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** a mudança de arquivos, rotas, links e o script.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: `fail 0`; `dist/index.html` é o builder e `dist/balancer.html` a ferramenta.
- [ ] **Step 5: Verificar** com `docker compose up --build` em http://localhost:8080: `/`, `/pt`, `/es` abrem o builder; `/balancer`, `/pt/balancer` a ferramenta; `/#s=<link antigo>` e `/pt#s=…` abrem o Balancer com o cenário; `/planner#p=<link antigo>` e `/pt/planner#p=…` abrem o builder com a cadeia; `/en` → `/`. `docker compose down --rmi local`.
- [ ] **Step 6: Commit** `Rotas: o builder vira a página inicial e a ferramenta atual vai para /balancer, com os links antigos valendo`

---

### Task 10: Passe visual de jogo e de fábrica

**Files:**
- Modify: `src/planner/planner.css`, `src/planner/ui/mapDraw.ts`, `src/planner/ui/{Picker,BlockPanel,LigacaoModal,Header,MapView}.tsx`, `src/styles/tokens.css` (só tokens novos; os existentes não mudam)

**Interfaces:**
- Consumes: tudo das Tasks 6–8. Produces: nenhuma função nova.

**Regras:**
- **Obrigatório:** quem implementa invoca a skill `frontend-design` (`/frontend-design`) antes de mexer e segue o que ela pedir.
- Direção (do dono): tema de jogo e de fábrica, escuro, laranja FICSIT, Chakra Petch + IBM Plex Sans, a identidade atual do site (placas, chanfro, grade de fundação). Escopo: canvas do builder (bloco, portas, avisos, ligação), seletor, painel do bloco, modal da ligação, cabeçalho e rodapé. A página Balancer não muda.
- Texto novo que aparecer entra nos três idiomas; contraste AA nos textos; foco visível em todo controle.

- [ ] **Step 1: Capturar antes** (`npm run build && npm run preview`, `npm run visual:capture -- http://localhost:4173 <scratch>/antes --only=planner`).
- [ ] **Step 2: Invocar `frontend-design`** e aplicar o passe.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run build` — Expected: `fail 0`.
- [ ] **Step 4: Capturar depois** e conferir as telas lado a lado (pt/en/es, 1400 px e 390 px); `visual:compare` das capturas do Balancer antes/depois sem diferença.
- [ ] **Step 5: Commit** `Planner: visual de jogo e de fábrica no builder, no seletor, no bloco e no modal da ligação`

---

### Task 11: Capturas, smoke dos gestos, desempenho e documentação

**Files:**
- Create: `tests/visual/smoke.js`
- Modify: `tests/visual/scenarios.js`, `tests/visual/capture.js` (se precisar), `package.json` (script `smoke`), `src/planner/ui/MapView.tsx` (gancho de teste), `AGENTS.md`, `README.md`, `README.pt-BR.md`, `README.es.md`, `docs/backlog.md`

**Interfaces:**
- Produces: `npm run smoke -- <url-base>` (sai com código ≠ 0 se um passo falhar); gancho `window.__sfPlanner = { scene, cam, ports }` só com `?debug=1` ou em `import.meta.env.DEV`.

**Regras:**
- Cenários: os do Balancer passam a `/balancer.html` (o `vite preview` não serve sem extensão); os do planner passam a `/` (`builder`, `builder-bloco` com um bloco selecionado, `builder-seletor` com o seletor aberto, `builder-ligacao` com o modal aberto); `routeScenarios` com `/pt`, `/es`, `/pt/balancer`, `/es/balancer`. `clearStore` igual.
- `smoke.js` (Playwright, contra o preview com `?debug=1`): canvas vazio → duplo clique → digitar "Pure Iron" → Enter → bloco existe; arrastar da porta de saída para o vazio → escolher "Solid Steel Ingot" → ligado; segunda perna "Steel Pipe"; Ctrl+Z desfaz a última; clicar na ligação abre o modal e Esc fecha com o foco no canvas; `/#s=<cenário>` cai em `/balancer`. Coordenadas das portas vêm de `window.__sfPlanner`.
- Desempenho: no preview, uma fábrica de ~2.000 máquinas (10 blocos de 200 + uma ligação em loop): arrastar um bloco e dar zoom com quadros de ~16 ms na maior parte (DevTools, Performance) e o `solve` do worker abaixo de 50 ms; anotar os números no relatório da tarefa.
- Docs: `AGENTS.md` (o builder é a página inicial, `/balancer` é a ferramenta, rotas e redirects, estado v2 e solver, ícones e `scripts/icons.mjs` com o aviso de direitos, arquivos novos, fora do escopo atualizado, cenários e `npm run smoke`, dependências sem `@xyflow/react`/`dagre`), os três READMEs (o que mudou para quem usa, o aviso da Coffee Stain), `docs/backlog.md` (fase 3 feita; ficam: medidas reais de Miner/extratores/Container, copiar e colar, seleção múltipla, gerar a cadeia pela meta no mesmo canvas, `.sfmd`).

- [ ] **Step 1: Implement** os cenários, o gancho e o `smoke.js`.
- [ ] **Step 2: Run** `npm run build && npm run preview` (outro terminal), `npm run visual:capture -- http://localhost:4173 <pasta>` e `npm run smoke -- http://localhost:4173` — Expected: todas as capturas sem erro de console; smoke sai com 0.
- [ ] **Step 3: Desempenho** como acima; registrar.
- [ ] **Step 4: Documentação.**
- [ ] **Step 5: Run** `npm test && npm run typecheck` — Expected: `fail 0`.
- [ ] **Step 6: Commit** `Builder: capturas e smoke dos gestos, desempenho conferido e documentação da fase 3`
