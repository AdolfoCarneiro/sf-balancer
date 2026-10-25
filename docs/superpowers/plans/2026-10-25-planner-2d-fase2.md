# Planner 2D — fase 2 (mapa) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma vista "Mapa" no planner que desenha cada etapa e cada meio em escala real (metros, grade de fundações de 8 m), propõe a posição dos blocos e deixa arrastar, girar e reposicionar, com avisos de sobreposição e cruzamento.

**Architecture:** Geometria pura em `src/planner/model/map/` (bloco da etapa, meio em metros a partir de `flowNet`/`flowLayout`, cena do mundo, checagens, câmera), testada com `node --test`. O cálculo dos meios sai do render e vai para um Web Worker com cache por `meioHash` + idioma; o grafo, o inspetor e o mapa leem desse cache. O mapa é um `<canvas>` com culling e nível de detalhe por zoom; o estado novo (posição, giro, vãos, montagem escolhida) entra na `Chain` como campos opcionais.

**Tech Stack:** React 19 + TypeScript 7 (só tipos), Vite 8 (worker com `new Worker(new URL(...), { type: 'module' })`), canvas 2D, `node --test` com type stripping (imports com `.ts`).

**Spec:** `docs/superpowers/specs/2026-10-25-planner-2d-fase2-design.md` (e o spec da fase 1, `docs/superpowers/specs/2026-10-25-planner-2d-design.md`).

## Global Constraints

- Tudo do `AGENTS.md`: todo texto visível em pt/en/es (chaves `pl…` em `src/i18n/{pt,en,es}.js`, mesmas chaves nos três), nomes de peças em inglês, itens em inglês, commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, sem push, nunca `git stash` puro.
- Medidas (metros): prédios de `data.buildings` (`w` ao longo da fileira, `l` em profundidade); Splitter/Merger/Smart Splitter 4 × 4; Awesome Sink 16 × 13; esteira 1 de largura; vão entre peças ligadas 2 (padrão, editável); fundação/grade 8; cano 1, Pipeline Junction 2 × 2, Valve 2 × 2 (estimativa, todo trecho fluido marcado `estimate`).
- Meio grande demais: mais de `MEIO_MAX_LINES` (120) linhas num lado → sem peças, faixa com aviso.
- Desempenho: cálculo de meio nunca no render (só no worker, ou no fallback síncrono quando `Worker` não existe); arrastar não recalcula meio; canvas desenha só o visível; meta: cadeia de ~2.000 máquinas arrasta e dá zoom sem engasgar.
- Sem dependência nova e nada externo (CSP do `vercel.json`: worker do mesmo domínio já está coberto por `script-src 'self'`).
- `npm test` e `npm run typecheck` verdes ao fim de cada tarefa; os 161 testes atuais continuam passando.

## Review Focus

1. Etapa editada depois de posicionada (mais máquinas, outro "por linha", outra receita): o bloco cresce mantendo o canto, e a sobreposição nova vira aviso — teste na Task 4.
2. Estado salvo hostil ou velho (`map` com etapa que não existe, `rot` 7, `x` NaN ou 1e12, `alts` com meio inexistente): descartado ou limitado na leitura, sem quebrar — teste na Task 1.
3. Montagem escolhida que deixa de existir depois de uma edição (a chave some do plano): volta para a primeira sem erro — teste na Task 5.
4. Cadeia com etapa solta, meio fluido e meio grande demais ao mesmo tempo: a cena monta sem lançar — teste na Task 4.
5. Trocar o idioma com resultados em cache: os rótulos dos meios vêm no idioma novo (o idioma faz parte da chave) — teste na Task 5.

---

## File Structure

- `src/planner/model/types.ts` — modificar: `Rot`, `MapPlace`, campos opcionais `map` e `alts` na `Chain`.
- `src/planner/model/persist.ts` — modificar: ações novas, leitura validada de `map`/`alts`.
- `src/planner/model/map/sizes.ts` — criar: constantes de medida.
- `src/planner/model/map/geo.ts` — criar: tipos de geometria (`Rect`, `Piece`, `BeltPath`, `Anchor`, `BlockGeo`, `MeioGeo`) e `route`.
- `src/planner/model/map/block.ts` — criar: `blockGeo`.
- `src/planner/model/map/meiogeo.ts` — criar: `meioGeo`.
- `src/planner/model/map/scene.ts` — criar: `proposeMap`, `placesOf`, `buildScene`, `toWorld`, `hitTest`.
- `src/planner/model/map/checks.ts` — criar: `overlaps`, `crossings`.
- `src/planner/model/map/camera.ts` — criar: câmera pura.
- `src/planner/model/meioresult.ts` — criar: `meioResult`, `litePlan`, `cacheKey`, `splitCached`.
- `src/planner/model/meio.ts` — modificar: `meioSummary(plan, key?)`.
- `src/planner/worker/meio.worker.ts` — criar: casca do worker.
- `src/planner/meios.ts` — criar: hook `useMeioResults`.
- `src/planner/ui/Graph.tsx`, `src/planner/ui/Inspector.tsx`, `src/planner/App.tsx`, `src/planner/ui/Header.tsx` — modificar.
- `src/planner/ui/MapView.tsx`, `src/planner/ui/mapDraw.ts`, `src/planner/ui/MapPanel.tsx` — criar.
- `src/planner/planner.css`, `src/i18n/{pt,en,es}.js` — modificar.
- Testes: `tests/planner/{mapstate,block,meiogeo,scene,camera,meioresult}.test.ts`.
- `tests/visual/scenarios.js`, `AGENTS.md`, `README.md`, `README.pt-BR.md`, `README.es.md`, `docs/backlog.md` — modificar (Task 8).

---

### Task 1: Estado do mapa na cadeia

**Files:**
- Modify: `src/planner/model/types.ts`, `src/planner/model/persist.ts`
- Test: `tests/planner/mapstate.test.ts`

**Interfaces:**
- Produces:
  - `type Rot = 0 | 1 | 2 | 3` — quartos de volta no sentido horário; `0` = entradas pela esquerda, saída pela direita; `1` entradas por cima; `2` pela direita; `3` por baixo. **Ruling:** "girar 90°" e "Entradas chegam por" são o mesmo grau de liberdade (a saída é sempre o lado oposto), então os dois mexem em `rot`.
  - `interface MapPlace { x: number; y: number; rot: Rot; gapRow?: number; gapMachine?: number }` — metros, canto superior esquerdo do bloco já girado, no mundo; `x`/`y` múltiplos de 8.
  - `Chain` ganha `map?: Record<StageId, MapPlace>` e `alts?: Record<string, string>` (id do meio → `key` da montagem). `v` continua `1`.
  - Ações novas em `Action`: `{ type: 'placeBlock'; id: StageId; place: MapPlace }`, `{ type: 'setPlaces'; places: Record<StageId, MapPlace> }` (propor de novo: substitui `map` inteiro), `{ type: 'setMeioAlt'; meio: string; key: string | null }` (`null` remove).
  - `removeStage` também remove `map[id]`.

- [ ] **Step 1: Write the failing tests** (`tests/planner/mapstate.test.ts`)

```ts
test('placeBlock grava a posição presa na grade de 8 m', () => {
  const h = reduce(newHistory(exampleChain(data)), { type: 'placeBlock', id: 's2', place: { x: 13, y: -5, rot: 1 } }, data);
  assert.deepEqual(h.present.map!.s2, { x: 16, y: -8, rot: 1 });
});
test('setPlaces substitui o mapa inteiro e entra no desfazer', () => { /* setPlaces {s1:{x:0,y:0,rot:0}} → map só com s1; undo → map anterior */ });
test('setMeioAlt grava e null remove', () => { /* alts['x'] = 'k' e depois sem a chave */ });
test('removeStage leva junto a posição no mapa', () => { /* map.s4 some */ });
test('decodeChain: mapa e montagens válidos voltam iguais', () => { /* encode → decode, deepEqual map/alts */ });
test('decodeChain: mapa hostil é descartado ou limitado', () => {
  // map: { s1: {x: NaN, y: 0, rot: 0}, s2: {x: 1e12, y: 8, rot: 7}, zz: {x: 0, y: 0, rot: 0}, __proto__: {...} }
  // → s1 descartado; s2 com x limitado a ±100000 (ruling) e preso na grade, rot 7 → descartado (rot fora de 0..3 invalida a entrada); zz descartado (etapa inexistente)
  // gapRow/gapMachine fora de [0, 64] → campo removido
});
test('decodeChain: alts só com id de meio existente e key string até 40 chars', () => { /* alts com meio inexistente some */ });
test('cadeia salva antes da fase 2 (sem map/alts) continua lendo', () => { /* decode de encode(exampleChain) sem os campos */ });
```

- [ ] **Step 2: Run** `node --test tests/planner/mapstate.test.ts` — Expected: FAIL (ações e campos não existem).
- [ ] **Step 3: Implement** os tipos e as ações em `persist.ts` (`apply`), e a leitura em `decodeChain`: limites `MAP_LIMIT = 100000` (metros, por eixo) e vãos em `[0, 64]`; snap = `Math.round(v / 8) * 8`; ids de etapa pelo mesmo `safeId` e só os que existem; ids de meio aceitos só se baterem com `meios(chain, data).map(m => m.id)` da cadeia já lida.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: tudo PASS.
- [ ] **Step 5: Commit** `Planner: posição no mapa e montagem escolhida salvas na cadeia`

---

### Task 2: Medidas e bloco da etapa

**Files:**
- Create: `src/planner/model/map/sizes.ts`, `src/planner/model/map/geo.ts`, `src/planner/model/map/block.ts`
- Test: `tests/planner/block.test.ts`

**Interfaces:**
- Consumes: `stageRows`, `perRowOf` (`stage.ts`); `MapPlace` (Task 1).
- Produces:
  - `sizes.ts`: `FOUNDATION = 8, PIECE = 4, BELT = 1, PIECE_GAP = 2, MEIO_GAP = 2, SINK = { w: 16, l: 13 }, JUNCTION = 2, VALVE = 2, RAW_STUB = 8`.
  - `geo.ts`:
    ```ts
    export type Pt = [number, number];
    export interface Rect { x: number; y: number; w: number; h: number }
    export type PieceKind = 'machine' | 'splitter' | 'merger' | 'smart' | 'sink' | 'junction' | 'bp';
    export interface Piece extends Rect { kind: PieceKind; label?: string }
    export type BeltRole = 'main' | 'donor' | 'loop' | 'sink' | 'extra' | 'over' | 'in' | 'out' | 'raw';
    export interface BeltPath { pts: Pt[]; item: ItemId; rate: number; role: BeltRole; fluid: boolean }
    export interface Anchor { x: number; y: number; item: ItemId; row: number; stage?: StageId; extra?: boolean }  // extra: saída de linha extra do meio
    export interface BlockGeo { w: number; h: number; pieces: Piece[]; belts: BeltPath[]; ins: Anchor[]; outs: Anchor[]; estimate: boolean }
    export interface MeioGeo extends BlockGeo { floors: number; tooLarge: boolean }
    export function route(a: Pt, b: Pt, dirA: 'x' | 'y'): Pt[]  // ângulo reto, no máximo 2 curvas; sai de `a` no eixo dirA
    ```
  - `block.ts`: `blockGeo(stage: Stage, data: GameData, place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>): BlockGeo` — em coordenadas locais (rot 0: entradas em x = 0, saídas em x = w).

**Molde (do spec):** cada fileira, de cima para baixo: uma faixa por item de entrada, a fileira de máquinas, uma faixa por item de saída. Faixa sólida com `perRowOf > 1` mede `PIECE` (4) e leva um Splitter (entrada) ou Merger (saída) por máquina, centrado sobre a máquina; faixa fluida ou fileira de 1 máquina mede `BELT` (1), sem peça. Máquinas lado a lado ao longo da fileira, cada uma `b.w` de largura e `b.l` de profundidade, separadas por `gapMachine` (padrão 0). Fileiras separadas por `gapRow` (padrão 0). `w` = máquinas da fileira mais cheia × `b.w` + vãos; `h` = soma das fileiras + vãos. Cada faixa vira um `BeltPath` de x = 0 a x = w (ou até a última máquina da fileira) com `role` `'in'`/`'out'`. `ins`/`outs`: um `Anchor` por fileira × item, na borda (x = 0 ou x = w), no y do meio da faixa, com `row` = índice da fileira. `estimate: true` se algum item da receita é fluido.

- [ ] **Step 1: Write the failing tests**

```ts
test('Foundry de Solid Steel, 60 máquinas, 12 por linha: 5 fileiras de 120 × 22', () => {
  const g = blockGeo(st('Recipe_Alternate_IngotSteel_1_C', 60, 12), data);
  assert.equal(g.w, 120); assert.equal(g.h, 110);                       // 4 + 4 + 10 + 4 = 22 por fileira
  assert.equal(g.pieces.filter(p => p.kind === 'machine').length, 60);
  assert.equal(g.pieces.filter(p => p.kind === 'splitter').length, 120); // 2 entradas × 60
  assert.equal(g.pieces.filter(p => p.kind === 'merger').length, 60);
  assert.equal(g.ins.length, 10); assert.equal(g.outs.length, 5);
  assert.ok(g.ins.every(a => a.x === 0) && g.outs.every(a => a.x === 120));
});
test('Refinery de Pure Iron (água fluida): faixa de 1 m e estimativa', () => {
  const g = blockGeo(st('Recipe_Alternate_PureIronIngot_C', 42), data);   // 7 por linha, 6 fileiras
  assert.equal(g.w, 70); assert.equal(g.h, 6 * (4 + 1 + 22 + 4)); assert.equal(g.estimate, true);
});
test('fileira incompleta: 61 fundições → 6ª fileira com 1 máquina e faixas de 1 m', () => { /* h = 110 + (1+1+10+1) */ });
test('vãos editáveis somam na medida', () => { /* gapRow 4, gapMachine 2 → w = 12·10 + 11·2, h = 5·22 + 4·4 */ });
test('route: ângulo reto, no máximo 2 curvas, começa e termina nos pontos', () => { /* todos os segmentos horizontais ou verticais; pts.length <= 4 */ });
```

- [ ] **Step 2: Run** `node --test tests/planner/block.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `sizes.ts`, `geo.ts`, `block.ts` como nas interfaces.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `Planner: bloco da etapa em metros (molde de fileiras, faixas e peças)`

---

### Task 3: Meio em metros

**Files:**
- Create: `src/planner/model/map/meiogeo.ts`
- Test: `tests/planner/meiogeo.test.ts`

**Interfaces:**
- Consumes: `flowNet` (`src/logic/flownet.js`), `flowLayout` (`src/logic/flowlayout.js`), `designFloors` (`src/logic/layout3d.js`), `computePlan` via `meioPlan` (`meio.ts`), `lineOwner`, `Meio`; tipos e `route` da Task 2.
- Produces: `meioGeo(meio: Meio, plan: Plan, altKey: string, item: Item): MeioGeo` — `plan` é o objeto completo do `computePlan` (com `g`, `view`, `sim` nas alternativas); local com entradas em x = 0 e saídas em x = w.

**Regras (do spec e rulings):**
- Peças: nó `s` → `'splitter'` 4 × 4; `m` → `'merger'`; `ov` → `'smart'`; `bp` → `'bp'` 4 × 4 com rótulo (o planner não passa blueprints ao `computePlan`, então não deve aparecer; existe só para não quebrar). Coluna `c` do `flowLayout` → `x = c · (PIECE + PIECE_GAP)`; linha `r` → `y = r · (PIECE + PIECE_GAP)`, com a menor linha em y = 0.
- `src`/`dst` não são peças: viram `ins`/`outs` (`Anchor` com `row` = índice da linha no plano e `stage` = `lineOwner`), em x = 0 e x = w.
- **Sobra num sink só:** os nós `sink` do `flowNet` são trocados por uma cascata de Mergers (3 entradas cada) que junta as esteiras de sobra, e `ceil(sobraTotal / plan.cap)` Awesome Sinks de 16 × 13 depois dela, numa faixa abaixo da grade de peças (y = altura da grade + `PIECE_GAP`). `extra` vira um `Anchor` de saída a mais com `role` `'extra'` na esteira.
- **Andares:** alternativa com `view.bal.design.kind === 'butterfly-loop'` → `floors = designFloors(design).floors.length` (ou o número de andares que a função devolve), peças desenhadas planas como o `flowNet` entrega (ruling: o footprint fica maior que o real; o rótulo "N andares" avisa). Sem andares: `floors = 1`.
- **Fluido** (`flowNet` devolve `null`, alternativa com `headers`): uma Pipeline Junction 2 × 2 por cano coletor (`headers`), canos de 1 m de cada origem à junção e da junção a cada destino; sem coletor, cano reto de cada origem ao destino da linha. `estimate: true`.
- **Grande demais** (`plan.tooLarge`): `tooLarge: true`, sem peças nem esteiras, `w = 16`, `h = 8`.
- Esteiras: `BeltPath` com `pts` por `route` entre as bordas das peças; `role` do `flowNet`; `loop` passa por cima da grade (y negativo permitido; ajustar `h` e deslocar tudo para y ≥ 0 no fim).

- [ ] **Step 1: Write the failing tests**

```ts
test('exemplo l1 (6×455 → 5×480, caso B): peças 4×4, entradas e saídas nas bordas', () => {
  const { meio, plan } = meioDoExemplo('l1');
  const g = meioGeo(meio, plan, plan.alternatives[0].key, data.items[meio.item]);
  assert.equal(g.ins.length, 6); assert.equal(g.outs.filter(o => !o.extra).length, 5);
  assert.ok(g.pieces.every(p => p.kind === 'sink' ? p.w === 16 && p.h === 13 : p.w === 4 && p.h === 4));
  assert.ok(g.pieces.every(p => p.x >= 0 && p.y >= 0 && p.x + p.w <= g.w && p.y + p.h <= g.h));
  // número de Splitters e Mergers bate com pieces da alternativa (exceto os Mergers da cascata do sink)
});
test('cada montagem do plano gera geometria diferente quando as peças diferem', () => { /* alternatives[0] vs [1] */ });
test('sobra de várias esteiras vira 1 Merger em cascata + 1 sink (política sink)', () => { /* policy 'sink', 1 sink */ });
test('sobra acima da esteira abre mais um sink por esteira cheia', () => { /* sobra 1000 com cap 480 → 3 sinks */ });
test('meio fluido: canos de 1 m e estimativa', () => { /* cadeia com água ligada; estimate true */ });
test('meio grande demais: faixa 16 × 8 sem peças', () => { /* 3000 refinarias */ });
test('peças não se sobrepõem', () => { /* nenhum par de pieces com interseção de área > 0 */ });
```

(`meioDoExemplo` é um helper do teste: `exampleChain`, `meioFor`, `computePlan(meioInput(...))` — o objeto completo, não o `meioPlan` sem `g`.)

- [ ] **Step 2: Run** `node --test tests/planner/meiogeo.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `meioGeo`. Se `flowLayout` devolver linhas fracionárias, arredondar para a grade de 6 m sem sobrepor (o teste de sobreposição manda).
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `Planner: meio em metros (peças reais, sobra num sink só, fluido estimado)`

---

### Task 4: Cena do mapa

**Files:**
- Create: `src/planner/model/map/scene.ts`, `src/planner/model/map/checks.ts`
- Test: `tests/planner/scene.test.ts`

**Interfaces:**
- Consumes: `blockGeo`, `MeioGeo`, `route`, `sizes`, `meios`, `lineOwner`, `MapPlace`.
- Produces:
  ```ts
  export interface SceneBlock { stage: StageId; rect: Rect; place: MapPlace; geo: BlockGeo }
  export interface SceneMeio { meio: string; rect: Rect; rot: Rot; geo: MeioGeo | null }   // null = calculando (faixa 16 × 8)
  export interface Scene { blocks: SceneBlock[]; meios: SceneMeio[]; belts: BeltPath[]; bounds: Rect;
    overlaps: [string, string][]; crossings: Pt[] }
  export function toWorld(p: Pt, size: { w: number; h: number }, place: { x: number; y: number; rot: Rot }): Pt
  export function rotSize(geo: { w: number; h: number }, rot: Rot): { w: number; h: number }
  export function proposeMap(chain: Chain, data: GameData, geos: Record<string, MeioGeo | null>): Record<StageId, MapPlace>
  export function placesOf(chain: Chain, data: GameData, geos: Record<string, MeioGeo | null>): Record<StageId, MapPlace>
  export function buildScene(chain: Chain, data: GameData, places: Record<StageId, MapPlace>, geos: Record<string, MeioGeo | null>): Scene
  export function hitTest(scene: Scene, x: number, y: number): { kind: 'block' | 'meio'; id: string } | null
  // checks.ts
  export function overlaps(rects: { id: string; rect: Rect }[]): [string, string][]
  export function crossings(belts: BeltPath[]): Pt[]
  ```
  `geos` é indexado pelo id do meio, já com a montagem escolhida.

**Regras:**
- `proposeMap`: colunas pela ordem da cadeia (posto de cada etapa = maior distância desde uma etapa sem produtor), da esquerda para a direita, `rot` 0. A coluna seguinte começa depois do bloco mais largo da coluna anterior + `MEIO_GAP` + largura do maior meio que sai dela + `MEIO_GAP`, arredondado para cima na grade de 8. Etapas da mesma coluna empilhadas com 8 m entre elas. Tudo múltiplo de 8.
- `placesOf`: `chain.map` onde existe; etapa sem posição recebe a da `proposeMap` se não sobrepuser nenhum bloco posicionado, senão vai para baixo de tudo (y = fundo do `bounds` + 8, x = 0). Não grava nada (é derivado).
- Meio: colado no lado de saída da **primeira** produtora (`meio.producers[0]`), a `MEIO_GAP`, centrado no meio dessa borda, com o mesmo `rot` dela.
- Esteiras do mundo (`scene.belts`): saída de cada fileira das produtoras → entrada do meio da linha correspondente (a k-ésima linha de origem do plano que pertence à etapa X liga à k-ésima `out` da etapa X para o item); saídas do meio → entradas dos consumidores pelo mesmo critério; entradas sem ligação (brutas ou não ligadas) → toco de `RAW_STUB` saindo da borda de entrada, `role: 'raw'`. Todas por `route` (ângulo reto, ≤ 2 curvas).
- `overlaps`: pares de retângulos (blocos e meios) com interseção de área > 0. `crossings`: pontos onde um segmento horizontal de uma esteira cruza um vertical de outra (esteiras do mesmo meio que se tocam numa ponta não contam). Ordem de custo: indexar segmentos numa grade de 64 m para não comparar todos com todos.
- `bounds`: retângulo que cobre blocos, meios e esteiras.

- [ ] **Step 1: Write the failing tests**

```ts
test('proposta do exemplo: colunas da esquerda para a direita, tudo na grade, nada sobreposto', () => {
  const p = proposeMap(ex, data, geosDoExemplo());
  assert.ok(p.s1.x < p.s2.x && p.s2.x < p.s3.x && p.s3.x === p.s4.x);
  assert.ok(Object.values(p).every(q => q.x % 8 === 0 && q.y % 8 === 0 && q.rot === 0));
  assert.deepEqual(buildScene(ex, data, p, geosDoExemplo()).overlaps, []);
});
test('giro: rot 1 troca largura e comprimento, e as entradas passam para cima', () => { /* rotSize; toWorld de (0, h/2) cai na borda de cima */ });
test('meio anda com a primeira produtora', () => { /* mover s2 em +80 x → rect do meio de l2/l3 também +80 */ });
test('etapa editada depois de posicionada: bloco cresce mantendo o canto e a sobreposição vira aviso', () => {
  // places da proposta; setMachines(s3, 300) → mesmo x/y em placesOf; overlaps contém o par com o vizinho
});
test('etapa nova sem posição vai para a proposta ou para baixo de tudo, sem sobrepor', () => {});
test('cena monta com etapa solta, meio fluido, meio grande demais e meio calculando', () => {
  // geos com null para um meio; nenhum throw; meio null vira faixa 16 × 8
});
test('cruzamento: duas esteiras em cruz contam 1; as do mesmo meio que se tocam na ponta não contam', () => {});
test('hitTest acha o bloco e o meio pelo ponto do mundo', () => {});
test('desempenho: cadeia de ~2.000 máquinas monta a cena em menos de 200 ms', () => {
  // 10 etapas encadeadas de 200 máquinas, geos sintéticos; medir buildScene com performance.now()
});
```

- [ ] **Step 2: Run** `node --test tests/planner/scene.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `scene.ts` e `checks.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `Planner: cena do mapa (proposta, giro, meio colado na origem, esteiras, sobreposição e cruzamentos)`

---

### Task 5: Meios no worker, cache e montagem escolhida

**Files:**
- Create: `src/planner/model/meioresult.ts`, `src/planner/worker/meio.worker.ts`, `src/planner/meios.ts`
- Modify: `src/planner/model/meio.ts`, `src/planner/ui/Graph.tsx`, `src/planner/ui/Inspector.tsx`, `src/planner/ui/MeioEdge.tsx`, `src/planner/App.tsx`, `src/i18n/{pt,en,es}.js`
- Test: `tests/planner/meioresult.test.ts`

**Interfaces:**
- Consumes: `meioPlan`, `meioHash`, `meioInput`, `computePlan`, `meioGeo` (Task 3), `setLang` (`src/i18n/index.js`), `setMeioAlt` (Task 1).
- Produces:
  ```ts
  export interface MeioResult { id: string; key: string; plan: Plan; geos: Record<string, MeioGeo> }  // plan sem g/view/sim; geos por key da montagem
  export const cacheKey = (meio: Meio, chain: Chain, data: GameData, lang: string): string  // lang + '|' + meioHash
  export function litePlan(plan: Plan): Plan       // só os campos declarados em Plan (clonável pelo postMessage)
  export function meioResult(meio: Meio, chain: Chain, data: GameData): MeioResult   // tudo de um meio, no idioma atual
  export function splitCached(keys: Map<string, string>, cache: Map<string, MeioResult>): { ready: Map<string, MeioResult>; missing: string[] } // por id do meio
  export function chosenAlt(plan: Plan, chosen: string | undefined): string | null  // a escolhida se existe, senão a primeira; null sem alternativas
  // meio.ts
  export function meioSummary(plan: Plan, key?: string): MeioSummary   // usa chosenAlt
  // meios.ts
  export function useMeioResults(chain: Chain, data: GameData, lang: string, list: Meio[]): Map<string, MeioResult | null>  // null = calculando
  ```
- Mensagens do worker: entrada `{ lang: string; chain: Chain; jobs: { id: string; key: string }[] }`; saída `{ results: MeioResult[] }`. O worker chama `setLang(lang)` e `meioResult` para cada job (os `meios` são recalculados lá a partir da `chain`). Pedidos velhos são descartados pela `key` (só entra no cache o que ainda é pedido ou que serve depois: o cache guarda até 256 resultados, o mais antigo sai).
- Sem `Worker` (teste, navegador antigo): `useMeioResults` calcula síncrono com `meioResult`.

**UI:**
- `Graph` e `Inspector` param de chamar `meioPlan` no render e leem `useMeioResults` (chamado uma vez no `App`, passado por props). Meio `null` mostra o rótulo `plMeioCalc` ("calculando…").
- `Inspector`, no painel do meio: lista as montagens (`plan.alternatives`) como botões de rádio com `caseLabel` e as peças de cada uma; escolher despacha `setMeioAlt`. Resumo, peças e avisos do painel e do rótulo do grafo usam a montagem escolhida (`meioSummary(plan, chain.alts?.[id])`).
- Chaves novas (pt/en/es): `plMeioCalc`, `plMeioAlts` (título da lista), `plMeioAltPieces` (função: Splitters, Mergers, sinks já formatados).

- [ ] **Step 1: Write the failing tests**

```ts
test('meioResult: plano leve clonável e uma geometria por montagem', () => {
  const r = meioResult(meioDoExemplo('l1'), ex, data);
  assert.doesNotThrow(() => structuredClone(r));
  assert.deepEqual(Object.keys(r.geos).sort(), r.plan.alternatives.map(a => a.key).sort());
});
test('cacheKey muda com o idioma e com a etapa, não com a posição no mapa', () => {});
test('splitCached: só o que mudou vai para o cálculo', () => { /* mudar s3 → só o meio de aço falta */ });
test('montagem escolhida que sumiu volta para a primeira', () => {
  assert.equal(chosenAlt(plan, 'nao-existe'), plan.alternatives[0].key);
});
test('meioSummary usa a montagem escolhida', () => { /* peças da alternativa 1 */ });
test('idioma novo: rótulo do caso vem traduzido', () => {
  // inLang('en', () => meioResult(...).plan.alternatives[0].caseLabel) !== versão pt
});
```

- [ ] **Step 2: Run** `node --test tests/planner/meioresult.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `meioresult.ts`, o worker (`new Worker(new URL('./worker/meio.worker.ts', import.meta.url), { type: 'module' })` dentro de `meios.ts`), o hook, `meioSummary(plan, key?)` e a troca no `Graph`/`Inspector`/`MeioEdge`/`App`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: PASS, e o build gera o chunk do worker.
- [ ] **Step 5: Verificar** com `npm run preview`: abrir `/planner.html`, os rótulos dos meios aparecem; trocar a montagem no inspetor muda o rótulo; trocar o idioma traduz os rótulos.
- [ ] **Step 6: Commit** `Planner: meios calculados num worker com cache, e escolha da montagem por meio`

---

### Task 6: Vista do mapa (câmera e desenho)

**Files:**
- Create: `src/planner/model/map/camera.ts`, `src/planner/ui/mapDraw.ts`, `src/planner/ui/MapView.tsx`
- Modify: `src/planner/App.tsx`, `src/planner/ui/Header.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`
- Test: `tests/planner/camera.test.ts`

**Interfaces:**
- Consumes: `buildScene`, `placesOf`, `Scene` (Task 4); `useMeioResults` (Task 5) para os `geos` (montagem escolhida por `chosenAlt`).
- Produces:
  ```ts
  export interface Camera { x: number; y: number; zoom: number }   // x/y = ponto do mundo no canto superior esquerdo; zoom = px por metro
  export const ZOOM_MIN = 0.05, ZOOM_MAX = 40, DETAIL_ZOOM = 1.5;
  export function screenToWorld(c: Camera, sx: number, sy: number): Pt
  export function zoomAt(c: Camera, factor: number, sx: number, sy: number): Camera   // o ponto sob o cursor fica parado; zoom limitado
  export function pan(c: Camera, dx: number, dy: number): Camera                      // dx/dy em px de tela
  export function fit(bounds: Rect, vw: number, vh: number, pad?: number): Camera
  export function visible(r: Rect, c: Camera, vw: number, vh: number): boolean
  // mapDraw.ts
  export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera, vw: number, vh: number,
    o: { selected: string | null; hover: string | null; colors: Record<string, string>; names: (item: ItemId) => string }): void
  ```
- `App` ganha a vista `'graph' | 'map'` (estado local, lembrado em `localStorage` `sf-balancer:planner-view` com try/catch). `Header` ganha o seletor Cadeia / Mapa (`role="tablist"`).

**Desenho:**
- Fundo com a grade de fundações (linha a cada 8 m; some abaixo de `zoom 0.4`), régua de escala no canto (10/50/100 m conforme o zoom, rótulo `plMapScale`).
- `zoom < DETAIL_ZOOM`: bloco = retângulo + nome da receita, máquinas e medida (`plMapSize`: "120 × 110 m · 15 × 14 fundações"); meio = retângulo + rótulo do caso. `zoom ≥ DETAIL_ZOOM`: máquinas, faixas, Splitters/Mergers, peças do meio, sinks, esteiras com a cor do item (as mesmas cores da `StageView`), fluido tracejado, "estimativa" e "N andares" quando houver.
- Só desenha o que `visible` aprova. Redesenha num `requestAnimationFrame` quando câmera, cena, seleção ou hover mudam; tela de alta densidade com `devicePixelRatio`.
- **Navegação (spec):** rolar move o mapa (`wheel` sem Ctrl → `pan` com `deltaX/deltaY`), Ctrl/⌘ + rodinha ou pinça → `zoomAt` com `Math.exp(-deltaY · 0.0015)` (mesmo fator do `workbench.js`), arrastar o fundo move. Botões zoom +, zoom −, mostrar tudo (`plMapFit`), com `aria-label`.
- Ao abrir o mapa pela primeira vez na sessão: `fit` no `bounds`.
- Acessibilidade: `<canvas role="img" aria-label={plMapAria(etapas, área)}>`; a lista de blocos acessível vem na Task 7.

- [ ] **Step 1: Write the failing tests** (`camera.test.ts`)

```ts
test('zoomAt mantém o ponto sob o cursor', () => {
  const c = zoomAt({ x: 10, y: 20, zoom: 2 }, 1.5, 300, 200);
  assert.deepEqual(screenToWorld(c, 300, 200), screenToWorld({ x: 10, y: 20, zoom: 2 }, 300, 200));
});
test('zoom limitado a [ZOOM_MIN, ZOOM_MAX]', () => {});
test('fit mostra o retângulo inteiro com margem', () => {});
test('visible descarta o que está fora da tela', () => {});
test('pan move em px de tela, convertido pelo zoom', () => {});
```

- [ ] **Step 2: Run** `node --test tests/planner/camera.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `camera.ts`, `mapDraw.ts`, `MapView.tsx`, o seletor e as chaves `plViewGraph`, `plViewMap`, `plMapScale`, `plMapSize`, `plMapFit`, `plMapZoomIn`, `plMapZoomOut`, `plMapAria`, `plMapEstimate`, `plMapFloors`, `plMapCalc` nos três idiomas.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build` — Expected: PASS.
- [ ] **Step 5: Verificar** no `npm run preview`: `/planner.html` → Mapa mostra o exemplo inteiro; rolar move, Ctrl + rodinha dá zoom no cursor; de perto aparecem máquinas e peças.
- [ ] **Step 6: Commit** `Planner: vista do mapa em canvas (grade de fundações, escala, zoom como no Figma)`

---

### Task 7: Mexer no mapa

**Files:**
- Create: `src/planner/ui/MapPanel.tsx`
- Modify: `src/planner/ui/MapView.tsx`, `src/planner/App.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Consumes: `hitTest`, `placesOf`, `proposeMap`, `Scene.overlaps`, `Scene.crossings` (Task 4); ações `placeBlock`, `setPlaces` (Task 1); `onOpenStage`, `onSelect` do `App`.
- Produces: comportamento; nenhuma função nova para outras tarefas.

**Comportamento:**
- Clique num bloco seleciona; duplo clique (ou Enter na lista) abre a etapa (`StageView`). Clique num meio seleciona o meio e abre o `Inspector` (o mesmo painel da cadeia, com a escolha de montagem).
- Arrastar um bloco: o bloco segue o ponteiro preso na grade de 8 m (a cena é refeita com a posição provisória, sem recalcular meio); ao soltar, `placeBlock`. Arrastar o fundo continua movendo o mapa.
- `MapPanel` (lateral, como o `Inspector`), com o bloco selecionado: "Entradas chegam por" (esquerda/cima/direita/baixo → `rot` 0/1/2/3), girar 90° (`rot + 1`), vão entre fileiras e entre máquinas (0–64 m, `placeBlock` com `gapRow`/`gapMachine`), medida do bloco. Sem seleção: área total (`bounds`, m e fundações), botão "Propor de novo" (`setPlaces(proposeMap(...))`), e a lista de avisos: sobreposições (os dois nomes) e cruzamentos (contagem); clicar num aviso centraliza a câmera nele.
- Lista de blocos acessível no painel (botões com o nome da etapa): seleciona; setas movem o bloco selecionado 8 m (`placeBlock`), `R` gira.
- Sobreposição desenhada com contorno de aviso; cruzamentos com um marcador.
- Tudo entra no desfazer (Ctrl+Z já está no `App`).
- Chaves novas pt/en/es: `plMapInSide`, `plMapSideLeft`, `plMapSideTop`, `plMapSideRight`, `plMapSideBottom`, `plMapRotate`, `plMapGapRow`, `plMapGapMachine`, `plMapArea`, `plMapPropose`, `plMapOverlap` (função: dois nomes), `plMapCrossings` (função: n), `plMapBlocks`, `plMapNoWarnings`.

- [ ] **Step 1: Implement** `MapPanel` e as interações no `MapView`.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run build` — Expected: PASS.
- [ ] **Step 3: Verificar** no `npm run preview`: arrastar s3 para cima de s4 → aviso de sobreposição com os dois nomes; Ctrl+Z volta; girar s2 move o meio de aço junto; "Propor de novo" refaz; recarregar mantém as posições; o link `#p=` leva as posições.
- [ ] **Step 4: Commit** `Planner: arrastar, girar, lado das entradas, vãos, propor de novo e avisos no mapa`

---

### Task 8: Captura visual, desempenho e documentação

**Files:**
- Modify: `tests/visual/scenarios.js`, `AGENTS.md`, `README.md`, `README.pt-BR.md`, `README.es.md`, `docs/backlog.md`

- [ ] **Step 1:** Cenário `planner-mapa` em `tests/visual/scenarios.js` (`/planner.html`, `clearStore: 'sf-balancer:planner'`, clicar na aba Mapa, esperar o canvas e um quadro desenhado).
- [ ] **Step 2: Run** `npm run build && npm run preview` (em outro terminal) e `npm run visual:capture -- http://localhost:4173 <pasta> --only=planner` — Expected: as três capturas do planner saem sem erro.
- [ ] **Step 3: Desempenho:** no preview, montar uma cadeia de ~2.000 máquinas (ex.: 10 etapas de 200) e conferir no DevTools (Performance) que arrastar um bloco e dar zoom não passa de ~16 ms por quadro na maior parte; registrar o resultado no relatório da tarefa.
- [ ] **Step 4:** `AGENTS.md` (seção do Planner 2D: fase 2 feita; arquivos novos em `model/map/`, `worker/`), os três READMEs (o mapa em uma frase cada) e `docs/backlog.md` (o que ficou para a fase 4: andares, portas reais, entradas por lados diferentes; e o footprint plano da borboleta com loop).
- [ ] **Step 5: Run** `npm test && npm run typecheck` — Expected: PASS.
- [ ] **Step 6: Commit** `Planner: captura do mapa e documentação da fase 2`
