# Planner 2D — Fase 1 (cadeia nó a nó com receitas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma página nova `/planner` onde monto a cadeia com as receitas do jogo, nó a nó. Cada etapa aparece desenhada em fileiras em escala, a cadeia se recalcula ao editar uma etapa, e cada ligação (inclusive divisão e junção) mostra o meio calculado pela lógica atual, com link para abri-lo completo no site de hoje.

**Architecture:** A página do balancer de hoje fica intocada. O planner é uma segunda entrada do Vite (`planner.html` → `src/planner/main.tsx`), em React + TypeScript.

- **Modelo (puro, sem DOM):** a cadeia fica em `src/planner/model/*.ts` e é testada com `node --test`. O Node 22.18+ roda `.ts` direto, removendo os tipos.
- **O meio de cada ligação:** é o `computePlan` de `src/logic` com uma origem por etapa produtora e um destino por etapa consumidora. Assim a divisão e a junção saem dos grupos que ele já aceita.
- **Dados do jogo:** um script gera `src/planner/data/game.json` a partir do `en-US.json` do jogo (1.1).

**Tech Stack:**
- Vite 8, React 19, TypeScript 7.
- `@xyflow/react` 12 (grafo) e `@dagrejs/dagre` 3 (arrumação).
- Testes com `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-25-planner-2d-design.md`. Telas de referência: canvas https://claude.ai/artifact/4zd8tDeQc9GFKhL7nK5w99 (`Main` = cadeia, `Etapa` = etapa aberta; `Mapa` é a fase 2 e fica fora deste plano).

## Global Constraints

- Tudo que aparece na tela existe em pt, en e es: chaves novas com prefixo `pl` em `src/i18n/pt.js`, `en.js` e `es.js`, na mesma mudança (o teste `idiomas: as mesmas chaves, do mesmo tipo, nos três` confere). Nada de texto solto: `t('chave')`.
- Nomes de itens, receitas e prédios em **inglês** nos três idiomas (vêm do `game.json`). Nomes de peças também em inglês (Merger, Splitter, Awesome Sink…).
- Números na tela com `fmt()` do `src/i18n/index.js`. Na entrada de números, `parseNum()`.
- Mecânicas: esteiras Mk1 60, Mk2 120, Mk3 270, Mk4 480, Mk5 780, Mk6 1200; canos Mk1 300, Mk2 600 (`BELTS`/`PIPES` de `src/logic/belts.js`). Tier padrão: esteira Mk4, cano Mk2. Awesome Sink não aceita fluido. Convenção de peças do manifold: k−1.
- Visual igual ao do site: tokens de cor e fontes do `:root` de `src/styles/main.css` (Chakra Petch + IBM Plex Sans, `--ficsit` #ff9b3d, fundo `--paper`). Tema escuro. Funciona com 16 px de margem na largura do celular, sem rolagem horizontal da página.
- A página atual (`index.html`, `src/ui`, `src/logic`) não muda de comportamento. `src/logic` só ganha código novo, nunca troca o que já existe. Os 94 testes atuais continuam passando.
- Rotas: `/planner`, `/pt/planner` e `/es/planner`. `/en/planner` redireciona 301 para `/planner`. Toda mudança no `vercel.json` é espelhada no `nginx.conf`. A CSP do `vercel.json` não muda (não há serviço externo novo).
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nada de push sem o dono pedir.
- Comandos: `npm test` (todos os testes), `npm run typecheck` (novo: `tsc --noEmit`) e `npm run build`. Os três passam ao fim de cada tarefa.

## Review Focus

1. **Ligação que fecharia um ciclo** (ex.: loop de borracha e plástico): é recusada com um aviso claro, e a cadeia fica como estava. Ciclos são da fase 3. → Task 4.
2. **Porta de fluido:** não conta Splitter nem Merger, usa os tiers de cano, e o meio sai em modo fluido, sem sink. → Tasks 3 e 5.
3. **Link "Abrir o meio completo" com número quebrado** (clock 212,5; taxa 2,125): o site de hoje lê o mesmo valor em pt, en e es, sem virar 2125. → Task 5.
4. **Estado salvo ou link `#p=` velho, corrompido ou com receita que não existe:** o planner abre sem quebrar. Descarta só o que não presta. → Task 6.
5. **Apagar uma etapa ligada:** as ligações dela somem, e a entrada que ela alimentava volta a aparecer como recurso bruto. → Task 4.

---

### Task 1: Esqueleto do planner (TypeScript, React, rota, idioma)

**Files:**
- Modify: `package.json`, `vite.config.js`, `vercel.json`, `nginx.conf`, `src/ui/lang.js`, `src/i18n/{pt,en,es}.js`
- Create: `tsconfig.json`, `planner.html`, `src/planner/main.tsx`, `src/planner/App.tsx`, `src/planner/lang.ts`, `src/planner/planner.css`, `src/styles/tokens.css`, `src/ui/flags.js`, `tests/planner/lang.test.ts`

**Interfaces:**
- Produces:
  - `plannerLang(pathname: string, search: string, saved: string | null): 'pt' | 'en' | 'es'`
  - `PLANNER_PATH: Record<Lang, string>` = `{ en: '/planner', pt: '/pt/planner', es: '/es/planner' }`
  - `SITE_PATH: Record<Lang, string>` = `{ en: '/', pt: '/pt', es: '/es' }`
  - `FLAGS` exportado de `src/ui/flags.js`, com o mesmo conteúdo de hoje; `src/ui/lang.js` passa a importar de lá.

- [ ] **Step 1: Dependências.** Instale estas com `npm i`:
  - `react@^19.3.1`, `react-dom@^19.3.1`, `@xyflow/react@^12.12.0`, `@dagrejs/dagre@^3.1.3`
  - e com `-D`: `typescript@^7.0.2`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react@^6.1.2`.

  No `package.json`:
  - `engines.node`: `">=22.18.0"`
  - `test`: `node --test "tests/**/*.test.js" "tests/**/*.test.ts"`
  - novo script `typecheck`: `tsc --noEmit`
- [ ] **Step 2: `tsconfig.json`.** `strict`, `jsx: "react-jsx"`, `module: "esnext"`, `moduleResolution: "bundler"`, `allowImportingTsExtensions`, `noEmit`, `allowJs` (sem `checkJs`), `resolveJsonModule`. `include`: `src/planner`, `tests/planner`.

  Os imports entre `.ts` levam a extensão (`./stage.ts`), senão o Node não acha o arquivo.
- [ ] **Step 3: Teste que falha** em `tests/planner/lang.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerLang } from '../../src/planner/lang.ts';

test('planner: idioma pelo caminho, depois ?lang, depois o salvo, senão inglês', () => {
  assert.equal(plannerLang('/pt/planner', '', null), 'pt');
  assert.equal(plannerLang('/es/planner/', '', 'pt'), 'es');
  assert.equal(plannerLang('/planner', '?lang=es', 'pt'), 'es');
  assert.equal(plannerLang('/planner', '', 'pt'), 'pt');
  assert.equal(plannerLang('/planner', '', 'xx'), 'en');
  assert.equal(plannerLang('/planner.html', '', null), 'en');
});
```

- [ ] **Step 4:** Rode `npm test`. Esperado: FAIL, porque `src/planner/lang.ts` ainda não existe.
- [ ] **Step 5: Implementação.**
  - **`lang.ts`:** a mesma ordem do `pickLang` de `src/ui/lang.js` (caminho, depois `?lang=`, depois a chave salva `sf-balancer:lang`, senão inglês). Caminhos: `^/(pt|es|en)/planner/?$`.
  - **`tokens.css`:** recebe as variáveis do `:root` de `main.css`. O `main.css` importa os tokens, então a página atual fica igual.
  - **`planner.html`:** o `<head>` do `index.html` adaptado (fontes, favicon, Vercel Analytics), sem o script anti-piscada e com `<div id="root">`.
  - **`main.tsx`:** chama `setLang(plannerLang(...))` e monta `<App/>`.
  - **`App.tsx`:**
    - Cabeçalho do canvas `Main`: marca "SF BALANCER / PLANNER", um link de volta para o balancer (`SITE_PATH`) e o seletor de idioma com `FLAGS` + sigla.
    - Trocar o idioma faz `setLang`, salva em `sf-balancer:lang` e troca a URL para `PLANNER_PATH` quando estiver em `*.vercel.app`, como faz `applyStatic`. Depois re-renderiza.
    - `document.title` e `<html lang>` vêm de `t('plPageTitle')` e `t('htmlLang')`.
  - **`vite.config.js`:** plugin react e duas entradas, `index.html` e `planner.html`. No Vite 8, a chave é `build.rolldownOptions.input`; confira na documentação da versão instalada.
  - **`vercel.json`:**
    - redirect `/en/planner` → `/planner` (301);
    - rewrite `/:lang(pt|es)/planner` → `/planner`.
  - **`nginx.conf`:** o espelho do `vercel.json`:
    - `location = /en/planner { return 301 /planner; }`
    - `location ~ ^/(pt|es)/planner/?$ { try_files /planner.html =404; }`
    - `location = /planner { try_files /planner.html =404; }`
  - **Chaves i18n:** `plPageTitle`, `plBack` e `plBrand`.
- [ ] **Step 6:** Rode `npm test && npm run typecheck && npm run build`. Esperado: tudo PASS, e `dist/planner.html` existe.
- [ ] **Step 7:** `docker compose up --build -d`. Depois, `curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/pt/planner` deve dar `200`. `curl -sI localhost:8080/en/planner | grep -i location` deve mostrar `/planner`. Por fim, `docker compose down --rmi local`.
- [ ] **Step 8: Commit** com a mensagem `Planner: esqueleto em React e TypeScript na rota /planner`.

---

### Task 2: Dados do jogo (receitas, itens, prédios)

**Files:**
- Create: `scripts/gamedata.mjs`, `scripts/building-sizes.json`, `src/planner/data/game.json` (gerado), `src/planner/model/types.ts`, `tests/planner/gamedata.test.ts`

**Interfaces:**
- Produces, em `src/planner/model/types.ts`:

```ts
export type ItemId = string; export type RecipeId = string; export type BuildingId = string; export type StageId = string;
export interface Item { id: ItemId; name: string; fluid: boolean; raw: boolean }
export interface Flow { item: ItemId; perMin: number }            // por máquina, clock 100%; fluido em m³/min
export interface Recipe { id: RecipeId; name: string; alt: boolean; building: BuildingId; ins: Flow[]; outs: Flow[] }
export interface Building { id: BuildingId; name: string; w: number; l: number }   // metros
export interface GameData { items: Record<ItemId, Item>; recipes: Record<RecipeId, Recipe>; buildings: Record<BuildingId, Building> }
```

- `game.json` tem a forma de `GameData`. Ele é importado com `import game from '../data/game.json' with { type: 'json' }`, que funciona no Node e no Vite.

- [ ] **Step 1: Teste que falha** (`tests/planner/gamedata.test.ts`):

```ts
const R = data.recipes;
test('dados: Pure Iron Ingot (alt) na Refinery, 35 ore + 20 water → 65', () => {
  const r = R['Recipe_Alternate_PureIronIngot_C'];
  assert.equal(r.name, 'Pure Iron Ingot'); assert.equal(r.alt, true); assert.equal(r.building, 'Build_OilRefinery_C');
  assert.deepEqual(r.ins, [{ item: 'Desc_OreIron_C', perMin: 35 }, { item: 'Desc_Water_C', perMin: 20 }]);
  assert.deepEqual(r.outs, [{ item: 'Desc_IronIngot_C', perMin: 65 }]);
});
test('dados: Solid Steel Ingot 40 + 40 → 60, Steel Beam 60 → 15, Steel Pipe 30 → 20', () => { /* Recipe_Alternate_IngotSteel_1_C, Recipe_SteelBeam_C, Recipe_SteelPipe_C */ });
test('dados: Water é fluido e bruto; Iron Ingot é sólido e não bruto', () => { /* items */ });
test('dados: só receitas das 11 máquinas de produção, e todo prédio tem tamanho', () => {
  assert.equal(Object.keys(data.buildings).length, 11);
  for (const r of Object.values(R)) assert.ok(data.buildings[r.building], r.id);
  assert.equal(data.buildings['Build_FoundryMk1_C'].w, 10); assert.equal(data.buildings['Build_OilRefinery_C'].l, 22);
});
```

- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL, porque `game.json` ainda não existe.
- [ ] **Step 3: `scripts/gamedata.mjs <en-US.json> [saida]`**, por padrão `src/planner/data/game.json`.
  - **Leitura:** UTF-16LE com BOM (o arquivo original do jogo) ou UTF-8.
  - **Grupos:** cada grupo do array traz `NativeClass` (o nome da classe fica no fim, ex.: `FGRecipe`) e `Classes`.
  - **Itens:** toda classe com `mForm`. `fluid` quando é `RF_LIQUID` ou `RF_GAS`. `raw` quando vem de `FGResourceDescriptor`.
  - **Prédios:** os 11 de `FGBuildableManufacturer` e `FGBuildableManufacturerVariablePower`, com `mDisplayName`.
  - **Receitas:**
    - Entra a de `FGRecipe` cujo `mProducedIn` cita um desses prédios; o prédio é o primeiro que aparece.
    - `perMin = Amount × 60 ÷ mManufactoringDuration`, dividido por 1000 se o item for fluido.
    - Arredondar para 4 casas decimais.
    - O nome perde o prefixo `Alternate: ` e, nesse caso, `alt: true`.
    - Os campos `mIngredients` e `mProduct` são texto no formato `((ItemClass="…Desc_X.Desc_X_C'",Amount=7),…)`: extraia `Desc_X_C` e `Amount` por regex.
  - **Tamanhos:** vêm de `scripts/building-sizes.json`, em metros:

    | Prédio | Classe | w × l |
    |---|---|---|
    | Smelter | `Build_SmelterMk1_C` | 5 × 10 |
    | Foundry | `Build_FoundryMk1_C` | 10 × 10 |
    | Constructor | `Build_ConstructorMk1_C` | 8 × 10 |
    | Assembler | `Build_AssemblerMk1_C` | 9 × 16 |
    | Manufacturer | `Build_ManufacturerMk1_C` | 18 × 20 |
    | Refinery | `Build_OilRefinery_C` | 10 × 22 |
    | Blender | `Build_Blender_C` | 18 × 16 |
    | Packager | `Build_Packager_C` | 8 × 8 |
    | Particle Accelerator | `Build_HadronCollider_C` | 24 × 38 |
    | Converter | `Build_Converter_C` | 16 × 16 |
    | Quantum Encoder | `Build_QuantumEncoder_C` | 22 × 50 |

    Um prédio sem tamanho faz o script falhar.
  - **Saída:** JSON com as chaves ordenadas, para o diff ficar estável. Só entram os itens usados em alguma receita.
- [ ] **Step 4: Gerar.**
  - Baixe a cópia 1.1 para fora do repo: `curl -L -o "$SCRATCH/docs-en.json" https://raw.githubusercontent.com/rockfactory/satisfactory-logistics/main/data/docs-en.json`.
  - Rode `node scripts/gamedata.mjs "$SCRATCH/docs-en.json"`.
  - O arquivo bruto nunca entra no repo. No topo do script, um comentário diz de onde ele vem e que, quando o dono tiver os arquivos do jogo, é só apontar para `CommunityResources/Docs/en-US.json`.
- [ ] **Step 5:** Rode `npm test && npm run typecheck`. Esperado: PASS.
- [ ] **Step 6: Commit** com a mensagem `Planner: receitas e prédios do jogo (1.1) gerados do Docs`.

---

### Task 3: Etapa (taxas, fileiras, tiers, peças, área)

**Files:**
- Create: `src/planner/model/stage.ts`, `src/planner/model/example.ts`, `tests/planner/stage.test.ts`

**Interfaces:**
- Consumes: `types.ts` e `game.json` (Task 2); `BELTS` e `PIPES` de `src/logic/belts.js`.
- Produces, em `types.ts`:

```ts
export interface Stage { id: StageId; recipe: RecipeId; machines: number; clock: number; perRow: number | null; locked: boolean; tiers: Record<ItemId, string>; pos: { x: number; y: number } }
export interface Link { id: string; item: ItemId; from: StageId; to: StageId }
export interface Chain { v: 1; stages: Stage[]; links: Link[]; policy: 'represar' | 'sink' | 'extra' }
export interface PortWarning { item: ItemId; rowRate: number; tier: string; cap: number; fixTier: string | null; fixPerRow: number }
```

- E em `stage.ts`:
  - `perMachine(stage, data, item): number`: a taxa do item numa máquina, já com o clock (`perMin × clock ÷ 100`).
  - `stageTotals(stage, data): { ins: {item, total}[]; outs: {item, total}[] }`
  - `defaultTier(item: Item): string`: `'Mk4'` para sólido, `'Mk2'` para fluido.
  - `capOf(item: Item, tier: string): number`
  - `suggestedPerRow(stage, data): number`: o mínimo, entre todas as portas (entradas e saídas), de `floor(capOf(defaultTier) / perMachine)`, nunca menos que 1.
  - `perRowOf(stage, data): number`: `stage.perRow ?? suggestedPerRow`.
  - `stageRows(stage, data): number[]`: fileiras cheias de `perRowOf` e o resto numa última fileira.
  - `portTier(stage, data, item): string`: `stage.tiers[item]`, ou o menor tier, a partir do padrão, que comporta a fileira mais cheia, ou o maior que existe se nenhum comportar.
  - `portWarnings(stage, data): PortWarning[]`: só as portas cuja fileira mais cheia passa da capacidade do `portTier`. `fixTier` é o menor tier que comporta, ou `null`. `fixPerRow` é o maior "por linha" que cabe no tier atual.
  - `stagePieces(stage, data): { splitters: number; mergers: number }`: Splitters somam (k−1) por fileira para cada entrada sólida; Mergers, o mesmo para cada saída sólida. Fluidos não contam.
  - `stageArea(stage, data): { w: number; d: number }`, em metros, arredondados para cima em múltiplos de 8:
    - `w = perRowOf × building.w`
    - `d = fileiras × (building.l + 2 × número de portas) + (fileiras − 1) × 4`
    - É uma estimativa até a fase 4.
  - `exampleChain(data): Chain`: a cadeia das telas, que também é o exemplo carregado na primeira visita.
    - `s1` = `Recipe_Alternate_PureIronIngot_C` × 42
    - `s2` = `Recipe_Alternate_IngotSteel_1_C` × 60, `perRow: 12`
    - `s3` = `Recipe_SteelBeam_C` × 30
    - `s4` = `Recipe_SteelPipe_C` × 60
    - links: Iron Ingot de s1 → s2; Steel Ingot de s2 → s3 e de s2 → s4
    - `policy: 'represar'`, clock 100, `tiers: {}`, `locked: false`, `pos` qualquer (a Task 8 arruma).

- [ ] **Step 1: Teste que falha** (`tests/planner/stage.test.ts`):

```ts
const ch = exampleChain(data); const [s1, s2, s3, s4] = ch.stages;
test('etapa: Pure Iron 42 → 1.470 ore, 840 water, 2.730 ingot; sugere 7 por linha', () => {
  assert.deepEqual(stageTotals(s1, data).outs, [{ item: 'Desc_IronIngot_C', total: 2730 }]);
  assert.equal(suggestedPerRow(s1, data), 7);
  assert.deepEqual(stageRows(s1, data), [7, 7, 7, 7, 7, 7]);
});
test('etapa: Foundry sugere 8; com 12 por linha a saída vira Mk5 sozinha', () => {
  assert.equal(suggestedPerRow(s2, data), 8);
  assert.deepEqual(stageRows(s2, data), [12, 12, 12, 12, 12]);
  assert.equal(portTier(s2, data, 'Desc_SteelIngot_C'), 'Mk5');
  assert.deepEqual(portWarnings(s2, data), []);
});
test('etapa: tier escolhido que estoura vira aviso com as duas saídas', () => {
  const w = portWarnings({ ...s2, tiers: { Desc_SteelIngot_C: 'Mk4' } }, data);
  assert.deepEqual(w, [{ item: 'Desc_SteelIngot_C', rowRate: 720, tier: 'Mk4', cap: 480, fixTier: 'Mk5', fixPerRow: 8 }]);
});
test('etapa: fileira acima de Mk6 não tem tier que resolva', () => { /* s2 com perRow 25 → saída 1.500: fixTier null, fixPerRow 20 */ });
test('etapa: peças da Foundry 110 Splitters e 55 Mergers; a água da Refinery não conta', () => {
  assert.deepEqual(stagePieces(s2, data), { splitters: 110, mergers: 55 });
  assert.deepEqual(stagePieces(s1, data), { splitters: 36, mergers: 36 });
});
test('etapa: fileiras incompletas e clock', () => {
  assert.deepEqual(stageRows(s3, data), [8, 8, 8, 6]);
  assert.deepEqual(stageRows(s4, data), [16, 16, 16, 12]);
  assert.equal(perMachine({ ...s1, clock: 212.5 }, data, 'Desc_IronIngot_C'), 138.125);
});
test('etapa: área da Foundry 120 × 96 m', () => assert.deepEqual(stageArea(s2, data), { w: 120, d: 96 }));
```

- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implemente `stage.ts`, `example.ts` e os tipos acima.
- [ ] **Step 4:** Rode `npm test && npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** com a mensagem `Planner: etapa com fileiras, tiers por porta, peças e área`.

---

### Task 4: Cadeia (ligar, desligar, recalcular)

**Files:**
- Create: `src/planner/model/chain.ts`, `tests/planner/chain.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces (todas puras: devolvem uma `Chain` nova e nunca mexem na recebida):
  - `nextStageId(chain): StageId` (`s1`, `s2`…) e `nextLinkId(chain): string` (`l1`…).
  - `addStage(chain, data, recipe: RecipeId, machines: number, pos?): Chain`
  - `removeStage(chain, data, id): Chain`: apaga também as ligações da etapa.
  - `canLink(chain, data, from, to, item): { ok: true } | { ok: false; reason: 'self' | 'item' | 'dup' | 'cycle' }`
    - `item`: `from` não produz o item, ou `to` não consome.
    - `dup`: essa ligação já existe.
    - `cycle`: a ligação fecharia um ciclo de etapas.
  - `link(chain, data, from, to, item): Chain`: se `canLink` falhar, devolve a mesma `chain`.
  - `unlink(chain, linkId): Chain`
  - `setMachines(chain, data, id, n): Chain`: grava `n` (inteiro ≥ 1) e chama `rebalance`.
  - `rebalance(chain, data, changed: StageId, factor: number): Chain`
  - `setRecipe(chain, data, id, recipe): Chain`: mantém as máquinas, apaga as ligações cujo item a receita nova não tem do lado certo e depois chama `rebalance(…, id, 1)`.
  - `setClock`, `setPerRow` (`null` volta para o sugerido), `setTier`, `setLocked`, `moveStage` e `setPolicy`.
  - `demandOf(chain, data, stage, item): number` e `supplyOf(chain, data, stage, item): number`, que são os totais da etapa.
  - `rawInputs(chain, data): { stage: StageId; item: ItemId; total: number }[]`: as entradas sem ligação.
  - `products(chain, data): { stage: StageId; item: ItemId; total: number }[]`: as saídas sem ligação.
  - `linkFlow(chain, data, linkId): number`: quanto passa na ligação. No conjunto de ligações do mesmo item, é `min(oferta total, demanda total) × (oferta do produtor ÷ oferta total) × (demanda do consumidor ÷ demanda total)`. Na ligação de 1 para 1, fica `min(oferta, demanda)`.

- **Algoritmo de `rebalance`** (decisão do dono 1.b; os detalhes são do spec):
  1. **Descendentes:** os descendentes de `changed`, seguindo as ligações para baixo de forma transitiva, recebem `machines = ceil(machines × factor − 1e-9)`. A exceção são os travados, que param a propagação naquele ramo. O `factor` é `novo ÷ antigo` da etapa mudada.
  2. **Ancestrais:** os ancestrais de `changed` e dos descendentes alterados são recalculados pela demanda, em ordem topológica reversa. Ficam de fora os travados, o próprio `changed` e os descendentes já escalados.
     - Para cada item que a etapa entrega por ligação, a demanda é a soma, sobre os consumidores ligados, de `demandOf(consumidor, item) × parte`.
     - A `parte` dessa etapa num consumidor com vários produtores do mesmo item é proporcional ao que cada produtor fornecia antes do recálculo. Se todos davam 0, é dividido igual.
     - `machines = max(1, ceil(maior demanda entre os itens ÷ perMachine − 1e-9))`.
  3. **O resto:** etapas sem relação com `changed` não mudam.

- [ ] **Step 1: Teste que falha** (`tests/planner/chain.test.ts`):

```ts
const ch = exampleChain(data); const m = (c, id) => c.stages.find(s => s.id === id).machines;
test('cadeia: fundições 60 → 70 sobe vigas e canos na proporção e as refinarias para alimentar', () => {
  const c = setMachines(ch, data, 's2', 70);
  assert.deepEqual(['s1', 's2', 's3', 's4'].map(id => m(c, id)), [44, 70, 35, 70]);
});
test('cadeia: etapa travada não muda; a ligação mostra a falta', () => {
  const c = setMachines(setLocked(ch, 's1', true), data, 's2', 70);
  assert.equal(m(c, 's1'), 42);
  assert.equal(linkFlow(c, data, c.links[0].id), 2730);   // oferta 2.730 < demanda 2.800
});
test('cadeia: mexer numa folha recalcula só para cima', () => {
  const c = setMachines(ch, data, 's3', 40);
  assert.deepEqual(['s1', 's2', 's3', 's4'].map(id => m(c, id)), [44, 70, 40, 60]);
});
test('cadeia: junção divide a demanda pelo que cada produtor dava', () => { /* duas Refinery (42 e 21) → s2; s2 → 90: 37 e 19 */ });
test('cadeia: ligação que fecha ciclo é recusada e a cadeia fica igual', () => {
  // GameData de mentira: itens A e B, receita rAB (A → B) e rBA (B → A), etapas x (rAB) e y (rBA), ligação x→y em B
  assert.deepEqual(canLink(c, fake, 'y', 'x', 'A'), { ok: false, reason: 'cycle' });
  assert.equal(link(c, fake, 'y', 'x', 'A'), c);
});
test('cadeia: item errado, repetida e para si mesma são recusadas', () => { /* reasons 'item', 'dup', 'self' */ });
test('cadeia: apagar etapa ligada tira as ligações e a entrada vira recurso bruto', () => {
  const c = removeStage(ch, data, 's1');
  assert.equal(c.links.some(l => l.from === 's1' || l.to === 's1'), false);
  assert.ok(rawInputs(c, data).some(r => r.stage === 's2' && r.item === 'Desc_IronIngot_C'));
});
test('cadeia: trocar a receita apaga as ligações que não servem mais', () => { /* s3 → Recipe_Alternate_SteelBeam_Aluminum_C (consome Aluminum Ingot): some a ligação s2→s3, fica s2→s4, s3 continua com 30 máquinas e Aluminum Ingot aparece em rawInputs */ });
```

- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implemente `chain.ts`.
- [ ] **Step 4:** Rode `npm test && npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** com a mensagem `Planner: cadeia que se recalcula ao mexer numa etapa`.

---

### Task 5: O meio de cada ligação (divisão e junção pelo computePlan)

**Files:**
- Create: `src/planner/model/meio.ts`, `tests/planner/meio.test.ts`

**Interfaces:**
- Consumes: Tasks 3 e 4; `computePlan` e `encodeShare` de `src/logic/index.js`; `SITE_PATH` (Task 1).
- Produces:
  - `interface Meio { id: string; item: ItemId; producers: StageId[]; consumers: StageId[]; links: string[] }`: um meio por componente conexa das ligações de um mesmo item. `id` = `item + ':' + produtores e consumidores ordenados`.
  - `meios(chain, data): Meio[]`
  - `meioFor(chain, data, linkId): Meio`
  - `meioInput(meio, chain, data)`: a entrada do `computePlan`.
    - `srcGroups` = um por produtor: `{ driver: 'clock', count: machines, clock, nominal: perMin a 100%, per: perRowOf }`.
    - `dstGroups` = o mesmo, um por consumidor.
    - `cap` = a maior capacidade entre o `portTier` das saídas dos produtores e das entradas dos consumidores, para o item.
    - `medium` = `'fluid'` se o item é fluido, senão `'item'`.
    - `policy` = `chain.policy`, `excess: 'represar'`, `conv: 'k-1'`.
  - `meioPlan(meio, chain, data)`: o `computePlan(meioInput(...))`. Tipe o retorno com uma interface mínima, só com os campos que o planner lê.
  - `meioSummary(plan): { caseLabel: string; supply: number; demand: number; leftover: number; short: number; pieces: { splitters: number; mergers: number; sinks: number } }`, a partir de `plan.alternatives[0]` (`caseLabel`, `pieces`, `sinkRate > 0` → 1 sink).
  - `lineOwner(meio, side: 'src' | 'dst', line): StageId`: a etapa dona da linha, por `line.comp[0].gi`.
  - `meioHash(meio, chain, data): string`: `'#s=' + encodeShare({...})` no formato que `decodeShare` aceita.
    - `src` e `dst` são linhas `{ driver: 'clock', count, clock, nominal, total: '', per }` com números em `String(n)`.
    - `lang: 'en'`. Em inglês, o `parseNum` lê `2.125` como 2,125, e a página converte para o idioma dela.
    - `item` = nome do item; `belt` ou `pipe` = o tier do `cap`; `medium`, `policy`, `excess`, `conv`.
  - `meioUrl(meio, chain, data, lang): string` = `SITE_PATH[lang] + meioHash(...)`.

- [ ] **Step 1: Teste que falha** (`tests/planner/meio.test.ts`):

```ts
test('meio: refinarias → fundições é o caso 1 do AGENTS.md, igual ao computePlan direto', () => {
  const ch = exampleChain(data); const me = meioFor(ch, data, ch.links[0].id); const p = meioPlan(me, ch, data);
  const direct = computePlan({ cap: 480, policy: 'represar', excess: 'represar', conv: 'k-1', medium: 'item',
    srcGroups: [{ driver: 'clock', count: 42, clock: 100, nominal: 65, per: 7 }],
    dstGroups: [{ driver: 'clock', count: 60, clock: 100, nominal: 40, per: 12 }] });
  assert.equal(p.supply, 2730); assert.equal(p.demand, 2400);
  assert.equal(p.alternatives[0].key, direct.alternatives[0].key);
});
test('meio: aço dividido entre vigas e canos é um meio só, em Mk5, com 4 linhas para cada lado', () => {
  const ch = exampleChain(data); const me = meios(ch, data).find(x => x.item === 'Desc_SteelIngot_C');
  assert.deepEqual([me.producers, me.consumers], [['s2'], ['s3', 's4']]);
  const p = meioPlan(me, ch, data);
  assert.equal(p.cap, 780); assert.equal(p.supply, 3600); assert.equal(p.demand, 3600);
  const owners = p.dst.lines.map(l => lineOwner(me, 'dst', l));
  assert.equal(owners.filter(o => o === 's3').length, 4); assert.equal(owners.filter(o => o === 's4').length, 4);
});
test('meio: link do meio completo abre com os mesmos números em pt, en e es', () => {
  const ch = setClock(exampleChain(data), 's1', 212.5);
  const st = decodeShare(meioHash(meioFor(ch, data, ch.links[0].id), ch, data).slice(3));
  assert.equal(st.lang, 'en'); assert.equal(st.src[0].clock, '212.5'); assert.equal(st.src[0].per, '7'); assert.equal(st.belt, 'Mk4');
  // A página lê os números no idioma do link ('en') e converte para o dela: em 'en', '2.125' é 2,125 (em 'pt' seria 2125).
  const prev = getLang(); setLang('en'); assert.equal(parseNum('2.125'), 2.125); setLang(prev);
});
test('meio: item fluido sai em modo fluido, cano, sem sink', () => {
  // GameData de mentira com fluido F: produtor → consumidor, chain.policy 'sink'
  assert.equal(meioInput(me, c, fake).medium, 'fluid'); assert.equal(meioPlan(me, c, fake).policy, 'represar');
});
```

  `getLang`, `setLang` e `parseNum` vêm de `src/i18n/index.js`.
- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implemente `meio.ts`. Não altere `src/logic`. Se `computePlan` não fizer algo que o teste pede, pare e relate (é uma decisão do controlador).
- [ ] **Step 4:** Rode `npm test && npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** com a mensagem `Planner: meio de cada ligação, com divisão e junção`.

---

### Task 6: Salvar, link do planner e desfazer

**Files:**
- Create: `src/planner/model/persist.ts`, `src/planner/store.ts`, `tests/planner/persist.test.ts`

**Interfaces:**
- Consumes: `encodeShare` (é genérico: JSON → base64url) e `historyNew`/`historyPush`/`historyUndo`/`historyRedo` de `src/logic/index.js`.
- Produces:
  - `PLANNER_STORE = 'sf-balancer:planner'`.
  - `encodeChain(chain): string`.
  - `decodeChain(str, data): Chain | null`. Devolve `null` se o texto não decodifica ou se `v !== 1`. No resto, limpa:
    - no máximo 200 etapas;
    - descarta etapas com receita desconhecida;
    - `machines`: inteiro de 1 a 10000;
    - `clock`: entre 1 e 250;
    - `perRow`: `null` ou inteiro de 1 a 500;
    - descarta tiers fora de `BELTS`/`PIPES`;
    - `pos` finita, senão `{x:0, y:0}`;
    - ids com até 40 caracteres;
    - ligações só se `canLink` aceitar, na ordem;
    - `policy` válida, senão `'represar'`.
  - `type Action`: união de `{ type: 'addStage' | 'removeStage' | 'link' | 'unlink' | 'setMachines' | 'setRecipe' | 'setClock' | 'setPerRow' | 'setTier' | 'setLocked' | 'moveStage' | 'setPolicy', … }`, `{ type: 'undo' }`, `{ type: 'redo' }` e `{ type: 'load', chain }`.
  - `interface History<T> { past: T[]; present: T; future: T[]; limit: number }`, o formato de `src/logic/history.js`.
  - `reduce(hist: History<Chain>, action, data): History<Chain>`: puro; cada ação de edição passa pelo `historyPush`.
  - `initialChain(hash: string, saved: string | null, data): { chain: Chain; fromLink: boolean }`. A ordem é `#p=` válido, depois o salvo válido, depois `exampleChain`.
  - `usePlanner(data)`: o hook React com `useReducer(reduce)`.
    - Salva em `localStorage` a cada mudança, com try/catch.
    - Ao abrir por `#p=`, limpa o hash com `history.replaceState`.
    - Expõe `shareUrl()` = `PLANNER_PATH[lang] + '#p=' + encodeChain`.

- [ ] **Step 1: Teste que falha** (`tests/planner/persist.test.ts`):

```ts
test('salvar: ida e volta do exemplo', () => assert.deepEqual(decodeChain(encodeChain(ex), data), ex));
test('salvar: lixo, JSON sem v e base64 quebrado viram null', () => { /* 'xx', encodeShare({}), '%%%' */ });
test('salvar: receita que não existe some com as ligações; clock 999 vira 250', () => { /* … */ });
test('desfazer: setMachines e undo voltam ao exemplo; redo refaz', () => { /* reduce */ });
test('abrir: #p= válido ganha do salvo; salvo quebrado cai no exemplo', () => { /* initialChain */ });
```

- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL.
- [ ] **Step 3:** Implemente `persist.ts` e `store.ts`. O hook fica num arquivo separado das funções puras se a importação do React atrapalhar o `node --test`: as funções puras ficam em `persist.ts`, e `store.ts` só tem o hook.
- [ ] **Step 4:** Rode `npm test && npm run typecheck`. Esperado: PASS.
- [ ] **Step 5: Commit** com a mensagem `Planner: salvar, link compartilhável e desfazer`.

---

### Task 7: Tela da cadeia — moldura (cabeçalho, laterais, totais)

**Files:**
- Modify: `src/planner/App.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`
- Create: `src/planner/ui/Header.tsx`, `src/planner/ui/Sidebar.tsx`, `src/planner/ui/Inspector.tsx` (casca), `src/planner/model/totals.ts`, `tests/planner/totals.test.ts`

**Interfaces:**
- Consumes: `usePlanner` (Task 6), `stagePieces` (Task 3).
- Produces: `chainTotals(chain, data): { stages: number; machines: number }`. O `App` passa a ter as três colunas da tela `Main`: lateral esquerda, área do grafo e inspetor à direita.

- [ ] **Step 1: Teste que falha:** `chainTotals(exampleChain(data), data)` deve dar `{ stages: 4, machines: 192 }`.
- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementação**, seguindo a tela `Main` do canvas.
  - **Cabeçalho:**
    - abas "Cadeia" (ativa) e "Mapa" (desativada, com a etiqueta `plPhase` "fase 2");
    - "Nó a nó" (ativo) e "Pelo objetivo" (desativado, "fase 3");
    - totais `plTotals(stages, machines)`;
    - Desfazer e Refazer (`aria-label`; Ctrl+Z e Ctrl+Shift+Z quando o foco não está num campo);
    - "Compartilhar", que copia o `shareUrl()` e mostra "copiado";
    - idioma e voltar ao balancer.
  - **Lateral esquerda:** as seções "Adicionar etapa" (só a casca; quem preenche é a Task 9), "Etapas" (lista com nome da receita e máquinas; clicar seleciona) e "Legenda".
  - **Layout:** em tela estreita as colunas empilham (`flex-wrap`), e a página não rola de lado.
  - **Chaves i18n:** todas novas com prefixo `pl`, nos três idiomas.
- [ ] **Step 4:** Rode `npm test && npm run typecheck && npm run build`. Esperado: PASS.
- [ ] **Step 5: Commit** com a mensagem `Planner: moldura da tela da cadeia`.

---

### Task 8: O grafo (etapas desenhadas, ligações com o meio)

**Files:**
- Create: `src/planner/ui/Graph.tsx`, `src/planner/ui/StageNode.tsx`, `src/planner/ui/RawNode.tsx`, `src/planner/ui/MeioEdge.tsx`, `src/planner/model/autolayout.ts`, `tests/planner/autolayout.test.ts`
- Modify: `src/planner/App.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Consumes: Tasks 3 a 6. O CSS da React Flow é importado de `@xyflow/react/dist/style.css` e sobrescrito com os tokens.
- Produces:
  - `autoLayout(chain, data): Record<StageId, { x: number; y: number }>`: dagre da esquerda para a direita (`rankdir: 'LR'`), com o tamanho de cada nó estimado pelas fileiras.
  - `placeNew(chain, data, id): { x; y }`: a posição de uma etapa nova sem mexer nas outras. Fica à direita do produtor ligado, ou à esquerda do consumidor ligado, ou abaixo de tudo.
  - Seleção, no estado da `App`: `{ kind: 'meio'; id: string } | { kind: 'stage'; id: StageId } | null`.

- [ ] **Step 1: Teste que falha:**
  - `autoLayout(exampleChain)` põe `x(s1) < x(s2) < x(s3)` e `x(s3) === x(s4)`, com `y(s3) !== y(s4)`.
  - `placeNew` de uma etapa ligada como consumidora de s4 dá `x > x(s4)`.
- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementação.**
  - **`StageNode`:** um nó por etapa (canvas `Main`).
    - Cabeçalho com nome da receita, etiqueta ALT, `{building} × {machines} · {perMachine}/min cada`.
    - Corpo com as fileiras em escala 1 px = 1 m (`building.w × building.l`, com no mínimo 4 px de lado) e uma linha de esteira sob cada fileira.
    - Rodapé com as saídas (`plRowsOut(n, rate, tier)` e o total por item).
    - Os avisos do `portWarnings` aparecem em laranja.
    - Um `Handle` por porta, com `id` = item: entradas à esquerda, saídas à direita, cor de cano para fluido.
  - **`RawNode`:** um nó por `rawInputs`, à esquerda da etapa, com o item e o total (m³/min para fluido).
  - **`MeioEdge`:**
    - Uma aresta por ligação. A primeira aresta de cada meio leva o botão com o `caseLabel`, mais `plLeft(x)` quando há sobra e `plShort(x)` quando falta.
    - Clicar seleciona o meio. As arestas do meio selecionado ficam em `--ficsit`.
  - **Interações:**
    - Arrastar o nó chama `moveStage` (no fim do arraste, um passo de desfazer).
    - Ligar portas: `onConnect` → `link`. Se recusar, mostra `plNo_<reason>` por 4 s, em `aria-live`.
    - Arrastar uma saída ou entrada para o vazio (`onConnectEnd` sem alvo): abre a busca filtrada pelo item. A Task 9 trata isso; aqui só emita `onOpenSearch({ item, side: 'consumes' | 'produces', stage })`.
    - Na primeira visita (exemplo), as posições vêm do `autoLayout`.
    - Zoom com Ctrl + roda ou pinça, igual à planta de hoje: a roda sozinha rola a página (`zoomOnScroll: false`, `zoomActivationKeyCode` Ctrl e Meta, `preventScrolling: false`).
- [ ] **Step 4:** Rode `npm test && npm run typecheck && npm run build`. Depois `npm run dev`, abra `/planner` e confira se o exemplo aparece como no canvas `Main` (4 etapas, 3 recursos, 2 meios).
- [ ] **Step 5: Commit** com a mensagem `Planner: grafo com as etapas desenhadas e o meio nas ligações`.

---

### Task 9: Buscar receita e adicionar etapa

**Files:**
- Create: `src/planner/model/search.ts`, `src/planner/ui/RecipeSearch.tsx`, `tests/planner/search.test.ts`
- Modify: `src/planner/model/chain.ts`, `src/planner/ui/Sidebar.tsx`, `src/planner/App.tsx`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Produces:
  - `searchRecipes(data, query: string, filter?: { produces?: ItemId; consumes?: ItemId }): Recipe[]`
    - Casa com o nome da receita ou de um item de saída, sem diferença de maiúsculas.
    - Ordem: saída cujo nome é exatamente o buscado primeiro, depois as normais antes das alternativas, depois por nome.
  - `recipesFor(data, item): Recipe[]`: as receitas que produzem o item, na mesma ordem.
  - `recipeLine(recipe, data): string`, que gera, por exemplo, `"35 Iron Ore + 20 Water → 65 Iron Ingot"`, com `fmt`.
  - Em `chain.ts`: `addLinkedStage(chain, data, recipe, at: { item; side: 'consumes' | 'produces'; stage: StageId }): Chain`.
    - Como consumidora, recebe `max(1, ceil(sobra do item na etapa ÷ perMachine))`.
    - Como produtora, `max(1, ceil(falta do item na etapa ÷ perMachine))`.
    - Liga as duas e dá `pos` pelo `placeNew`.

- [ ] **Step 1: Teste que falha:**
  - `searchRecipes(data, 'iron ingot')` traz `Recipe_IngotIron_C` antes de `Recipe_Alternate_PureIronIngot_C` e inclui `Recipe_Alternate_IronIngot_Basic_C`.
  - `searchRecipes(data, '', { consumes: 'Desc_SteelIngot_C' })` inclui `Recipe_SteelBeam_C`.
  - Com o exemplo sem `s4` (`removeStage`), `addLinkedStage(…, 'Recipe_SteelPipe_C', { item: 'Desc_SteelIngot_C', side: 'consumes', stage: 's2' })` cria a etapa com 60 máquinas e a ligação.
  - Numa cadeia só com a Foundry × 60, adicionar `Recipe_Alternate_PureIronIngot_C` como produtora de Iron Ingot dá 37 máquinas.
- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL.
- [ ] **Step 3: UI.**
  - **`RecipeSearch`** fica na lateral "Adicionar etapa".
    - Campo com `<label>`, e a lista de resultados como botões: nome, ALT, prédio e `recipeLine`.
    - Clicar adiciona a etapa com 1 máquina (`placeNew`), ou com `addLinkedStage` quando a busca veio de uma porta. Nesse caso aparece o filtro "Para: {item}", com um × para limpar.
    - Esc limpa, setas navegam a lista e Enter adiciona.
  - **Texto de ajuda** (`plSearchHint`): "Puxe uma saída de uma etapa até o vazio para abrir esta busca já filtrada pelo item."
- [ ] **Step 4:** Rode `npm test && npm run typecheck && npm run build`. Esperado: PASS.
- [ ] **Step 5: Commit** com a mensagem `Planner: buscar receita e adicionar etapa ligada`.

---

### Task 10: Inspetor (o meio selecionado e a etapa selecionada)

**Files:**
- Modify: `src/planner/ui/Inspector.tsx`, `src/planner/App.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Consumes: `meioPlan`, `meioSummary`, `meioUrl` (Task 5); `setMachines`, `setClock`, `setLocked`, `removeStage`, `setPolicy` (Task 4).

- [ ] **Step 1: Meio selecionado** (canvas `Main`, coluna da direita).
  - Item e "produtoras → consumidoras".
  - Três números: Oferta, Demanda e Sobra (ou Falta, em `--sink`).
  - O `caseLabel` e os avisos do plano (`plan.warnings`, `alternatives[0].warnings`).
  - Peças: Splitter, Merger, Awesome Sink.
  - Select da política da sobra (`setPolicy`, a mesma para a cadeia toda; reaproveite as chaves de texto da política que o site já usa, procurando `represar` em `src/i18n/pt.js`).
  - Botão-link "Abrir o meio completo" (`meioUrl`, mesma aba) e a frase `plMeioHint`.
- [ ] **Step 2: Etapa selecionada.**
  - Receita, prédio e campos de máquinas (com `parseNum`, inteiro ≥ 1) e clock (1–250).
  - "Travar" (checkbox), "Abrir etapa" (Task 11) e "Apagar etapa".
  - Cada edição é uma ação do store (um passo de desfazer).
- [ ] **Step 3: Sem seleção:** um texto curto (`plInspectorEmpty`).
- [ ] **Step 4: Verificação.** Rode `npm test && npm run typecheck && npm run build`. No `npm run dev`:
  - mude as fundições para 70 e confira 44 / 35 / 70 no grafo;
  - desfaça;
  - abra o meio completo e confira se o site atual mostra 6 × 455 → 5 × 480.
- [ ] **Step 5: Commit** com a mensagem `Planner: inspetor do meio e da etapa`.

---

### Task 11: Etapa aberta (fileiras sobre as fundações)

**Files:**
- Create: `src/planner/ui/StageView.tsx`, `src/planner/model/drawing.ts`, `tests/planner/drawing.test.ts`
- Modify: `src/planner/App.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Consumes: Task 3 (`stageRows`, `portTier`, `portWarnings`, `stagePieces`, `stageArea`, `perRowOf`, `suggestedPerRow`); `recipesFor` (Task 9).
- Produces: `stageDrawing(stage, data): { rows: { machines: number; lanes: { item: ItemId; side: 'in' | 'out'; fluid: boolean; marks: number }[] }[] }`, em que `marks` é o número de Splitters (entrada sólida) ou Mergers (saída sólida) da fileira (k−1) e 0 para fluido.

- [ ] **Step 1: Teste que falha:** `stageDrawing(s2)` tem 5 fileiras de 12, cada uma com as faixas Iron Ingot (entrada, marks 11), Coal (entrada, 11) e Steel Ingot (saída, 11). Em `stageDrawing(s1)`, a faixa Water tem `fluid: true` e `marks: 0`.
- [ ] **Step 2:** Rode `npm test`. Esperado: FAIL.
- [ ] **Step 3: UI** (canvas `Etapa`).
  - Abre por "Abrir etapa" ou por duplo clique no nó, e volta por "Voltar à cadeia" ou Esc. Por enquanto é uma vista dentro da `App`, sem rota própria.
  - **Desenho:**
    - fundo com a grade de fundações de 8 m em escala 4 px = 1 m;
    - cada fileira com etiqueta `L{n}`, as faixas das portas (cor por item: entrada principal `--flow`, demais `--held`, saída `--ficsit`, fluido `--holo`) e o quadradinho de cada Splitter ou Merger;
    - as máquinas na escala;
    - a área rola em caixa própria.
  - **Lateral:**
    - select de receita com `recipesFor(saída principal)`, que chama `setRecipe`;
    - linha da receita e campos de máquinas, clock e "Por linha" (vazio = sugerido, mostrando `plSuggested(n)`; aceita apagar);
    - quantidade de linhas;
    - para cada porta, um select de tier com a opção "automático", e os avisos de `portWarnings` (`plWarnPort(rowRate, cap, fixTier, fixPerRow)`, que diz "use {fixTier}" ou "não cabe em nenhuma esteira" quando `fixTier` é null);
    - peças da etapa e área (`plAreaEst(w, d)`, marcada como estimativa).
- [ ] **Step 4:** Rode `npm test && npm run typecheck && npm run build`. Esperado: PASS.
- [ ] **Step 5: Commit** com a mensagem `Planner: etapa aberta com fileiras em escala`.

---

### Task 12: Ligar ao site, documentação e captura visual

**Files:**
- Modify: `index.html`, `src/i18n/{pt,en,es}.js`, `src/ui/lang.js` (se o link precisar acompanhar o idioma), `tests/visual/scenarios.js`, `tests/visual/capture.js` (se preciso), `AGENTS.md`, `README.md`, `README.pt-BR.md`, `README.es.md`, `docs/backlog.md`, `public/sitemap.xml`

- [ ] **Step 1: Link para o planner.** No cabeçalho da página atual, ao lado do idioma, entra o link "Planner (beta)" (`data-i18n="plOpen"`), que aponta para `PLANNER_PATH` do idioma atual e é atualizado em `applyStatic`. O planner já tem o link de volta (Task 1).
- [ ] **Step 2: Captura visual.**
  - Em `tests/visual/scenarios.js`, entra o cenário `planner` (caminho `/planner`, nos três idiomas) com o exemplo carregado e um `planner-etapa` com a Foundry aberta. Use `localStorage` limpo.
  - `npm run build && npm run preview` e `npm run visual:capture -- http://localhost:4173 "$SCRATCH/cap" --only=planner`: as capturas saem sem erro de console.
  - A comparação das capturas da página atual antes e depois (`visual:compare`) não muda, exceto pelo link novo no cabeçalho.
- [ ] **Step 3: Documentação.**
  - **`AGENTS.md`:**
    - "O que é" ganha um parágrafo sobre o planner.
    - A estrutura ganha `planner.html`, `src/planner/` (`model/` puro e `ui/`), `scripts/gamedata.mjs` e `tests/planner/`.
    - Comandos: `npm run typecheck`, regerar os dados.
    - "Fora do escopo (v1)": troque pela referência ao spec do planner. As fases 2–4 ainda estão fora.
    - Rotas do planner no trecho de deploy.
  - **READMEs (três):** uma seção curta sobre o planner.
  - **`docs/backlog.md`:** a prioridade 2 vira "Planner 2D — fase 1 feita; fase 2 (mapa) a seguir", com link para o spec.
  - **`public/sitemap.xml`:** entra `/planner`, `/pt/planner` e `/es/planner`.
- [ ] **Step 4: Verificação final.**
  - `npm test && npm run typecheck && npm run build`: todos PASS, com os 94 testes antigos inclusos.
  - `docker compose up --build -d` e conferir `/planner`, `/pt/planner`, `/es/planner` e o redirect `/en/planner`. Depois, `docker compose down --rmi local`.
- [ ] **Step 5: Commit** com a mensagem `Planner: link no site, documentação e captura visual`.
