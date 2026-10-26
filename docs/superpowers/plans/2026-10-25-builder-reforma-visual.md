# Builder — reforma visual e de UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O builder fica legível e intuitivo como o Modeler sem perder as fileiras: vista "Montar" com cartões em tamanho de tela (faixa de fileiras dentro), "Planta em escala" como botão, portas de 44 px com estado por cor, esteiras animadas, a ligação como chip firme na esteira (mini painel: Ver montagem / Trocar montagem / Desligar), faixa "Balanço" com faltas e sobras navegáveis, painel do bloco com frase e consertos de um clique, abas Fábrica | Balancer nas duas páginas.

**Architecture:** Tudo que decide (estado da porta, balanço, consertos, rótulo do chip, geometria dos cartões e da transição) vira função pura em `src/planner/model/` com teste `node --test`. O mapa continua **um canvas** (`MapView.tsx` + desenho em `ui/draw/*.ts`, o `mapDraw.ts` atual dividido): na Montar cada bloco é um cartão desenhado em px de tela ancorado na posição salva do bloco (`Factory.map`, a mesma da Planta); na Planta o desenho em escala da fase 2 continua, com nomes, portas e chips em px de tela por cima. A transição interpola retângulos e portas entre as duas geometrias (`t` de 0 a 1). Painéis, mini painel do chip, faixa Balanço, seletor e legenda são DOM (React). Cálculo continua no worker; nada de solver novo.

**Tech Stack:** React 19 + TypeScript (só tipos), Vite 8, canvas 2D, `node --test` (type stripping), Playwright (smoke e captura).

**Spec:** `docs/superpowers/specs/2026-10-25-builder-reforma-visual-design.md` (vinculante). Referência visual: `docs/superpowers/research/2026-10-25-reforma/prototipo.html` (abre no navegador; ler `geo()`, `stripSVG()`, `chipsHTML()`, `popHTML()`, `renderPanel()`, `problemSentence()`, `fixesFor()`) e `…/shots/*.png`. O protótipo é referência de visual e gesto, **não** de código nem de conta.

## Global Constraints

- Tudo do `AGENTS.md`: todo texto visível (inclusive `aria-label`, `title`, texto desenhado no canvas) em pt/en/es; chave nova nos três `src/i18n/{pt,en,es}.js` na mesma tarefa; texto com número vira função e recebe número já formatado por `fmt()`; nomes de peças em inglês (Merger, Splitter, Awesome Sink, balancer, manifold).
- Usar a skill `frontend-design` em toda tarefa de UI (pedido do dono) e comparar com o protótipo lado a lado (`npm run dev` + o `prototipo.html` aberto).
- Paleta (do spec, nomes de token novos em `src/styles/tokens.css`, sem mudar os tokens existentes, para não mexer no Balancer): `--deficit: #ff7a6b`, `--deficit-bg: #3a1f24`, `--surplus: #45d4c8`, `--surplus-bg: #123a3c`, `--ink-mid: #c3d3e3`, `--ink-soft: #9fb6cc`, `--plate-2: #13314f`; reusa `--paper #0d2136`, `--bench #0a1b2d`, `--line`, `--ink`, `--ficsit`, `--lock #ffd84a`. Fontes já carregadas: Chakra Petch (títulos, números) e IBM Plex Sans (texto). Sem caixa-alta em rótulos, sem sombra em tudo; ousadia só nas esteiras e fileiras.
- Alvos de clique ≥ 44 px (portas, chips, botões da barra). Cartão na Montar nunca abaixo de 70 % (desktop) / 60 % (celular, `matchMedia('(max-width: 720px)')`).
- Desempenho (fase 2): canvas só desenha o visível; animação das esteiras no máximo 30 quadros/s, parada com `prefers-reduced-motion: reduce`, com a aba escondida (`document.hidden`) e se um quadro passar de 12 ms (aí fica estático até o próximo redesenho pedido); arrastar não recalcula fluxo nem ligação; meta ~2.000 máquinas sem engasgar.
- Não muda: solver (`model/solve.ts`), `Factory` v2 (nenhum campo novo salvo), rotas, `#p=`, `localStorage` da fábrica. Ação nova no reducer é permitida (não é estado salvo).
- Identificadores continuam `meio`/`Meio`/`stage`; texto visível é Ligação/Connection/Conexión.
- `npm test` e `npm run typecheck` verdes ao fim de cada tarefa (hoje 274 testes). Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; sem push, sem merge.
- A página Balancer não piora: só ganha as abas (Task 1).

## Review Focus

1. Bloco sem fluxo, sem limite (`unbounded`) ou travado: cartão mostra "sem limite"/"travado" no lugar do número, faixa de fileiras com 1 fileira, porta amarela tracejada no subproduto; nenhum `NaN`/`Infinity` no texto — teste em `cards.test.ts` (Task 3) e `portstate.test.ts` (Task 2).
2. Fábrica vazia e fábrica com só blocos de sobra/origem: Balanço mostra "—", botões "0 faltas/0 sobras" desabilitados, transição Montar↔Planta não quebra com `bounds` vazio — testes nas Tasks 2 e 3.
3. Ligação de vários produtores/consumidores (o grupo `Meio`): um chip só, esteiras de cada porta de produtora até o chip e do chip a cada consumidora; "Desligar" desfaz com um único Ctrl+Z — teste do reducer na Task 2.
4. Ligação arrastada (com `ligs`) cuja composição muda (id do grupo muda): chip volta ao meio da esteira sem erro — teste em `cards.test.ts` (Task 3).
5. Bloco com > 6 fileiras e fileira com muitas máquinas (perRow 40, 120 fileiras): faixa limitada a 6 linhas com "+ N fileiras iguais", quadrados com largura mínima, cartão de altura limitada — teste em `cards.test.ts` (Task 3).

---

## Mapa de arquivos

- `src/styles/tokens.css` — tokens novos.
- `src/planner/model/portstate.ts` (novo) — estado de cada porta e o balanço da fábrica.
- `src/planner/model/fixes.ts` (novo) — frase do problema e consertos de um clique (como `Action`s).
- `src/planner/model/chip.ts` (novo) — rótulo do chip da ligação.
- `src/planner/model/map/cards.ts` (novo) — geometria da Montar (cartão, faixa, portas, chips) e da sobreposição de tela da Planta, interpolação, hit test em px de tela.
- `src/planner/model/factorystate.ts` — ação `disconnectMeio`.
- `src/planner/model/map/scene.ts` — `proposeMap` reserva o tamanho do cartão.
- `src/planner/model/picker.ts` — receitas sempre primeiro.
- `src/planner/ui/mapDraw.ts` → `src/planner/ui/draw/{theme,plant,cards,belts,ports,chips,labels}.ts` (divisão; `mapDraw.ts` vira o orquestrador `drawScene`).
- `src/planner/ui/MapView.tsx` — modo de vista, transição, gestos novos, mini painel do chip.
- `src/planner/ui/ChipPopover.tsx`, `BalanceBar.tsx`, `Legend.tsx`, `FirstHint.tsx` (novos); `Header.tsx`, `MapPanel.tsx`, `BlockPanel.tsx`, `Picker.tsx`, `App.tsx`, `planner.css`.
- `balancer.html`, `src/ui/` (abas na página Balancer), `src/styles/parts.css` se o estilo das abas for compartilhado.
- `tests/planner/{portstate,fixes,chip,cards}.test.ts` (novos), `factorystate.test.ts`, `picker.test.ts`, `scene.test.ts`, `routes.test.ts`; `tests/visual/{smoke,scenarios,capture}.js`.
- Docs: `README.md`, `README.pt-BR.md`, `README.es.md`, `AGENTS.md`, `docs/backlog.md`.

---

### Task 1: Tokens, cabeçalho com abas e alternância de vista

**Files:**
- Modify: `src/styles/tokens.css`, `src/planner/ui/Header.tsx`, `src/planner/App.tsx`, `src/planner/planner.css`, `balancer.html`, `src/ui/` (o módulo que monta a `langbar`; achar com `grep -n plLink src/ui/*.js`), `src/i18n/{pt,en,es}.js`
- Test: `tests/planner/routes.test.ts`

**Interfaces:**
- Produces: `type ViewMode = 'montar' | 'planta'` exportado de `src/planner/ui/selection.ts`; `App` guarda `const [view, setView] = useState<ViewMode>('montar')` e passa `view`/`onView` ao `Header` e `view` ao `MapView` (prop nova `view: ViewMode`, ignorada pelo `MapView` até a Task 5).
- Header novo (esquerda → direita, como `shots/01-montar-inicial.png`): marca "SF Balancer", abas `Fábrica | Balancer` (`<nav aria-label>` com dois `<a>`; a atual com `aria-current="page"`, laranja cheia), grupo `Montar | Planta em escala` (`role="group"`, botões com `aria-pressed`), espaço, status do fluxo, Desfazer / Refazer (ícone + texto, 44 px de altura), Compartilhar (laranja), idiomas. Totais (blocos/máquinas) saem do cabeçalho e vão para o painel sem seleção (Task 7).
- Balancer: a `langbar` troca o link "Planner" pelas mesmas abas (`Fábrica` → `BUILDER_PATH[lang]`, `Balancer` atual), com as mesmas chaves i18n e o estilo vindo de `src/styles/parts.css` (`.navtabs`), compartilhado pelas duas páginas.
- Chaves i18n: `navFactory`, `navBalancer`, `navAria`, `plViewMontar`, `plViewPlanta`, `plViewAria`.

- [ ] **Step 1: Teste** — em `routes.test.ts`, `test('as duas páginas têm as abas Fábrica | Balancer')`: lê `balancer.html` e confere `class="navtabs"` com `data-i18n="navFactory"` e `data-i18n="navBalancer"`; confere que `src/planner/ui/Header.tsx` contém `'navFactory'` e `'navBalancer'`.
- [ ] **Step 2:** `node --test tests/planner/routes.test.ts` → FAIL.
- [ ] **Step 3:** Tokens, Header, abas no Balancer (inclusive o script que liga `href` do `Fábrica` ao idioma, como o `plLink` faz hoje), CSS, chaves nos três idiomas.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS; `npm run dev`, abrir `/` e `/balancer.html`, conferir as abas nos dois e ida e volta entre as páginas.
- [ ] **Step 5:** Commit `Builder e Balancer: abas Fábrica | Balancer e alternância Montar | Planta no cabeçalho`.

---

### Task 2: Estado das portas, balanço e "Desligar" a ligação inteira

**Files:**
- Create: `src/planner/model/portstate.ts`, `tests/planner/portstate.test.ts`
- Modify: `src/planner/model/factorystate.ts`, `tests/planner/factorystate.test.ts`

**Interfaces:**
- Consumes: `BlockFlow`, `PortFlow`, `FlowResult`, `EPS` de `model/solve.ts`; `Factory`, `GameData`.
- Produces:
  - `type PortKind = 'ok' | 'deficit' | 'surplus' | 'exit' | 'stalled'`
  - `interface PortState { block: StageId; side: 'in' | 'out'; item: ItemId; kind: PortKind; amount: number | null; rate: number | null }` (`amount`: falta, sobra, o que sai ou o que pararia; `rate`: o que passa).
  - `portStates(bf: BlockFlow): PortState[]` — entradas e saídas na ordem do `BlockFlow`. Regras: entrada com `deficit > EPS` → `deficit`; saída de bloco com `stalled === item` → `stalled` (amount = `held` ou null); saída com `held > EPS` → `surplus` (amount = held); saída com `exits > EPS` (ou `exits === null` sem ligação) → `exit` (amount = exits); senão `ok`. Prioridade: `stalled` > `surplus` > `exit`.
  - `interface Balance { ins: { item: ItemId; rate: number | null }[]; outs: { item: ItemId; rate: number | null }[]; sink: { item: ItemId; rate: number | null }[]; problems: PortState[] }`
  - `factoryBalance(f: Factory, flow: FlowResult, d: GameData): Balance` — `ins`: saída das Miners e extratores + entradas de receita sem ligação, somadas por item; `outs`: soma de `exits` das saídas por item; `sink`: o que chega em blocos `sink`, por item; `problems`: todas as portas `deficit`, `surplus` e `stalled` na ordem de `f.blocks`. `null` (sem limite) contamina a soma do item (vira `null`). Ordem dos itens: primeira aparição.
  - Ação nova `{ type: 'disconnectMeio'; linkIds: string[] }` — tira todos os links numa entrada só do histórico (remove o `ligs`/`alts` do grupo como `disconnect` já faz).

- [ ] **Step 1: Testes** em `portstate.test.ts` (fábricas pequenas montadas com os helpers de `tests/planner/fixtures.ts` e resolvidas com `solveFactory`):
  - `test('caso 1 do AGENTS: refinarias represam 330 de Iron Ingot')` — exemplo de ferro puro 42 × 65 → aço 60 fixadas consumindo 2.400: a saída de Iron Ingot do bloco de refinarias é `{ kind: 'surplus', amount: 330 }` (±1e-6).
  - `test('entrada com falta')` — consumidora fixada pedindo mais que a produtora fixada dá: `kind: 'deficit'`, amount = diferença.
  - `test('produto final sem ligação sai da fábrica')` → `kind: 'exit'`, amount = taxa.
  - `test('subproduto sem destino trava')` → `kind: 'stalled'` só nessa saída.
  - `test('sem fluxo nem limite: tudo ok, sem NaN')` — `amount` e `rate` nunca `NaN`.
  - `test('balanço: entra, sai, sink e problemas')` — Miner 120 de Iron Ore → Iron Ingot (sem consumo): `ins = [{Iron Ore, 120}]`, `outs = [{Iron Ingot, 120}]`; outro caso com bloco `sink` ligado: `sink` com a taxa.
  - `test('balanço da fábrica vazia')` → listas vazias.
  - Em `factorystate.test.ts`: `test('disconnectMeio tira todos os links e um undo volta todos')`.
- [ ] **Step 2:** `node --test tests/planner/portstate.test.ts tests/planner/factorystate.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `portStates`, `factoryBalance` e o caso `disconnectMeio` no reducer.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5:** Commit `Planner: estado de cada porta, balanço da fábrica e desligar a ligação inteira`.

---

### Task 3: Geometria da Montar, da Planta em tela e da transição

**Files:**
- Create: `src/planner/model/chip.ts`, `src/planner/model/map/cards.ts`, `tests/planner/chip.test.ts`, `tests/planner/cards.test.ts`
- Modify: `src/planner/model/map/scene.ts` (`proposeMap`), `tests/planner/scene.test.ts`

**Interfaces:**
- Consumes: `Scene`, `SceneBlock`, `SceneMeio` (scene.ts), `Camera` (camera.ts), `stageRows`/`perRowOf` (stage.ts), `PortState` (Task 2), `MeioResult`/`chosenAlt` (meioresult.ts), `Meio`.
- Produces (`chip.ts`):
  - `type ChipKind = 'calc' | 'unbounded' | 'tooLarge' | 'direct' | 'balancer' | 'sink' | 'pipe'`
  - `interface ChipLabel { kind: ChipKind; item: ItemId; rate: number | null; nS: number; nD: number; short: boolean }`
  - `chipLabel(meio: Meio, result: MeioResult | null | undefined, alts: Factory['alts'], flow: FlowResult, d: GameData): ChipLabel` — `calc` com resultado `null`/`undefined`; `plan.unbounded` → `unbounded`; `plan.tooLarge` → `tooLarge`; fluido → `pipe`; `plan.direct` ou montagem escolhida sem Splitter/Merger/Smart → `direct`; montagem com `sinkRate > 0` → `sink`; senão `balancer`. `rate` = soma de `flow.links` dos links do grupo; `nS`/`nD` = linhas do plano; `short` = alguma consumidora do grupo com `deficit` no item. O texto ("6 → 8", "direto", "3 → 4 + sink", "cano 2 → 6") sai de chaves i18n na Task 4, não daqui.
- Produces (`cards.ts`), tudo em px de tela:
  - Constantes: `CARD_W = 260`, `MARK_W = 220`, `MARK_H = 108`, `STRIP_W = 212`, `MAX_ROWS = 6`, `PORT_D = 44`, `PORT_Y0 = 90`, `PORT_STEP = 52`, `CHIP_W = 120`, `CHIP_H = 52`, `PLANT_PORT_OUT = 30`, `MONTAR_REF = 4` (px por metro em que o cartão tem 100 %).
  - `cardScale(zoom: number, phone: boolean): number` = `clamp(zoom / MONTAR_REF, phone ? 0.6 : 0.7, 1.15)`.
  - `interface StripRow { machines: number; repeat?: number }` e `stripRows(rows: number[]): StripRow[]` — até 6 fileiras como estão; acima disso as 4 primeiras, uma linha `{ machines: 0, repeat: N }` ("+ N fileiras iguais", N = total − 5) e a última.
  - `cardSize(kind: 'recipe' | 'marker', rows: number[], nIns: number, nOuts: number): { w: number; h: number }` — receita: `w = CARD_W`, `rowH = nIns*5 + 14 + nOuts*5 + 5`, faixa = soma das linhas mostradas (+20 na linha de "+ N") + 12, `h = max(62 + faixa + 34, 90 + (max(nIns, nOuts) - 1) * 52 + 34)`; marcador: `MARK_W × MARK_H`.
  - `interface ViewBlock { id: StageId; rect: Rect; scale: number; card: Rect; plant: Rect }`, `interface ViewPort { block: StageId; side: 'in' | 'out'; item: ItemId; x: number; y: number; dir: Pt; lanes: Pt[] }` (`lanes`: na Planta, o ponto de tela de cada fileira daquela porta, para os leques), `interface ViewChip { meio: string; x: number; y: number; w: number; h: number }`.
  - `viewGeo(scene: Scene, cam: Camera, t: number, phone: boolean, f: Factory, data: GameData, flow: FlowResult): { blocks: ViewBlock[]; ports: ViewPort[]; chips: ViewChip[] }` — `t = 0` Montar, `t = 1` Planta, no meio interpola. Montar: canto superior esquerdo do cartão no canto do `rect` do bloco na tela; tamanho `cardSize × cardScale`; portas nas bordas do cartão (entradas à esquerda, saídas à direita, `PORT_Y0 + i*PORT_STEP` vezes a escala), uma por item na ordem da receita (marcador: uma saída ou uma entrada por item que chega). Planta: retângulo real do bloco na tela; porta a `PLANT_PORT_OUT` px por fora da borda de entrada/saída (respeitando o giro), centrada na média das âncoras daquele item, portas do mesmo lado afastadas `PORT_STEP` px. Chip: com `f.ligs[meio]`, o centro do retângulo do meio (`scene.meios`) na tela, nas duas vistas; sem `ligs`, na Montar o ponto médio entre a média das portas de saída das produtoras e a das entradas das consumidoras, na Planta o centro do retângulo do meio. Portas e chips têm tamanho fixo em px (não escalam).
  - `viewHit(v: ReturnType<typeof viewGeo>, sx: number, sy: number): { kind: 'port'; port: ViewPort } | { kind: 'chip'; meio: string } | { kind: 'block'; id: StageId } | null` — porta (raio `PORT_D/2 + 6`) antes de chip antes de bloco; o último desenhado ganha.
  - `chipWorld(cam: Camera, sx: number, sy: number, size: { w: number; h: number }): LigPlace` — o canto do retângulo do meio (preso na grade de 8 m) para que o centro fique em (sx, sy): o que arrastar o chip grava em `placeLig`.
- `proposeMap`: o tamanho usado para empilhar cada bloco passa a ser `max(tamanho real, cardSize / MONTAR_REF)` em cada eixo, para os cartões da Montar não se sobreporem em 100 %. Posições salvas não mudam.

- [ ] **Step 1: Testes** em `chip.test.ts`: caso 1 do AGENTS (6 × 455 → 5 × 480) dá `kind` `balancer` ou `sink` conforme a montagem escolhida em `alts`, `nS = 6`, `nD = 5`; ligação para bloco de sobra → `direct`; fluido → `pipe`; resultado `null` → `calc`; consumidora com falta → `short: true`.
- [ ] **Step 2: Testes** em `cards.test.ts`:
  - `test('escala do cartão: 70 % no desktop, 60 % no celular, 115 % no máximo')` — `cardScale(0.1, false) === 0.7`, `cardScale(0.1, true) === 0.6`, `cardScale(100, false) === 1.15`, `cardScale(4, false) === 1`.
  - `test('faixa: 6 fileiras como estão; 8 de 8 com última 4 vira 4 + "+3" + a última')` — `stripRows([8,8,8,8,8,8,8,4])` → `[8,8,8,8,{0,repeat:3},4]`; `stripRows(Array(120).fill(40))` tem 6 linhas.
  - `test('Montar: portas na borda do cartão, 44 px, uma por item')` — exemplo de fábrica, `t = 0`: cada porta de entrada tem `x === card.x`, de saída `x === card.x + card.w`.
  - `test('Planta: porta 30 px por fora do bloco real')`, com bloco girado (`rot = 1`: entradas por cima).
  - `test('t = 0,5 fica no meio do caminho')` — retângulo e portas são a média dos de `t = 0` e `t = 1`.
  - `test('chip no meio da esteira; com ligs, no lugar salvo; ligs de grupo que mudou é ignorado')`.
  - `test('hit: porta ganha do bloco embaixo dela')`.
  - `test('fábrica vazia: listas vazias, sem NaN')`.
  - Em `scene.test.ts`: `test('proposeMap: marcadores empilhados não se sobrepõem como cartões')` — duas Miners no mesmo posto ficam a ≥ `MARK_H / MONTAR_REF` m uma da outra.
- [ ] **Step 3:** `node --test tests/planner/chip.test.ts tests/planner/cards.test.ts tests/planner/scene.test.ts` → FAIL.
- [ ] **Step 4:** Implementar `chip.ts`, `cards.ts` e a mudança em `proposeMap`; ajustar números de outros testes de cena que mudarem por causa da reserva (só os que mudarem, com o motivo no commit).
- [ ] **Step 5:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 6:** Commit `Planner: geometria da Montar (cartão, faixa de fileiras, portas, chip) e da transição para a Planta`.

---

### Task 4: Desenho — cartões, esteiras, portas e chips

**Files:**
- Create: `src/planner/ui/draw/theme.ts` (`MapTheme`, `readTheme`, tokens novos), `draw/plant.ts` (o desenho em escala atual: grade, blocos, peças, meios, sobreposições, régua), `draw/cards.ts` (cartão da Montar), `draw/belts.ts` (esteiras da Montar e leques da Planta), `draw/ports.ts`, `draw/chips.ts`, `draw/labels.ts` (o posicionador guloso atual).
- Modify: `src/planner/ui/mapDraw.ts` (vira `drawScene(ctx, scene, view, cam, vw, vh, opts)` que chama as partes), `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Consumes: `viewGeo`/`ViewBlock`/`ViewPort`/`ViewChip` (Task 3), `ChipLabel` (Task 3), `PortState` (Task 2).
- `DrawOpts` ganha: `t: number` (transição), `time: number` (ms, para o tracejado andar; fixo quando parado), `portState: (block, side, item) => PortState | undefined`, `chip: (meio) => ChipLabel`, `card: (id) => CardText` com `interface CardText { title: string; building: string; icon: string | null; count: string; fixed: boolean; clock: string | null; alt: boolean; rowsText: string; perRowText: string; rows: number[]; ins: ItemId[]; outs: ItemId[]; marker: boolean; rate: string }` (montado no `MapView`, já no idioma), `lit`/`dim` das portas durante o arraste, `flash: { id: string; until: number } | null`.
- O desenho segue o protótipo: **Montar** — fundo pontilhado (`radial-gradient` do protótipo, feito no canvas), cartão `--plate-2` com borda `--line` (selecionado: borda laranja 2 px; travado: borda `--lock` tracejada), ícone do prédio 42 px, nome (Chakra Petch 600 14 px), prédio + selo `Alt`, número de máquinas (Chakra Petch 700 26 px) com "máquinas"/"fixado" embaixo e o clock quando ≠ 100; faixa: por fileira, uma barra fina por entrada na cor do item, quadrados das máquinas (largura `max(1.5, min(16, (STRIP_W − gaps) / perRow))`), barra por saída; rodapé "6 fileiras de 7" e "455/min cada". Marcador: ícone, nome, taxa grande. **Esteiras** (Montar): curva cúbica porta → chip → porta como `beltPath` do protótipo, três traços (casca escura 12 px, borda 10 px na cor do item, tracejado claro 3 px andando com `lineDashOffset = -time/40`); fluido: tracejado azul `--holo` sem casca; `short`: cor `--deficit`. **Planta**: o `plant.ts` atual, mais leques porta → fileira (`lanes`) e, por cima, placas de nome em px de tela (ícone + receita + número laranja) e a medida "70 × 150 m, 9 × 19 fundações" embaixo do selecionado. **Portas** (as duas vistas): círculo 44 px com o ícone do item 28 px; anel por estado — `ok` neutro (`--line`), `deficit` `--deficit` com fundo `--deficit-bg`, `surplus` `--surplus` com fundo `--surplus-bg`, `exit` preenchida `--ficsit`, `stalled` anel tracejado `--lock`; rótulo ao lado ("faltam 120/min", "+330 sobrando", "sai 450/min", "travado: sem destino"), escondido durante o arraste; arrastando, as compatíveis brilham (anel laranja duplo) e as outras ficam com 30 % de opacidade. **Chip**: retângulo `CHIP_W × CHIP_H` `--bench`, borda `--line` (balancer: `--ficsit`; `short`: `--deficit`; selecionado: laranja 2 px), linha de cima ícone + taxa + "/min", linha de baixo o glifo (`GLYPH` do protótipo: balancer, loop, direto, cano) + o texto do tipo.
- Chaves i18n novas: `plCardMachines`, `plCardFixed`, `plCardRows: (n, per) =>`, `plCardRowsLast: (n, per, last) =>`, `plCardPerRow: r =>`, `plCardMoreRows: n =>`, `plPortDeficit: r =>`, `plPortSurplus: r =>`, `plPortExit: r =>`, `plPortStalled`, `plChipDirect`, `plChipLines: (s, d) =>`, `plChipSink: (s, d) =>`, `plChipPipe: (s, d) =>`, `plChipCalc`, `plChipUnbounded`, `plChipTooLarge`, `plPlantSize: (w, h, fw, fh) =>`, `plPlantScale: m =>`.

- [ ] **Step 1:** Dividir `mapDraw.ts` nos arquivos de `draw/` sem mudar o desenho; `npm test && npm run typecheck`; `npm run build && npm run preview` e `npm run visual:capture -- http://localhost:4173 <scratchpad>/antes --only=builder` **antes** da divisão e `…/depois` depois; `npm run visual:compare -- <antes> <depois>` sem diferença. Commit `Planner: desenho do mapa dividido por parte (sem mudança visual)`.
- [ ] **Step 2:** Implementar cartões, esteiras, portas e chips com `t` vindo do `DrawOpts` (o `MapView` ainda passa `t = 1` até a Task 5, então a tela segue na Planta, agora com portas e chips novos). Chaves nos três idiomas.
- [ ] **Step 3:** `npm test && npm run typecheck` → PASS; no `npm run dev`, com `?debug=1`, forçar `t = 0` pelo console (`window.__sfPlannerT = 0`, lido só com DEBUG) e comparar com `shots/01-montar-inicial.png` e `05-planta-em-escala.png`.
- [ ] **Step 4:** Commit `Planner: cartões com faixa de fileiras, esteiras animadas, portas de 44 px por estado e chip da ligação`.

---

### Task 5: Montar como vista principal — gestos, transição e o mini painel do chip

**Files:**
- Create: `src/planner/ui/ChipPopover.tsx`
- Modify: `src/planner/ui/MapView.tsx`, `src/planner/App.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Consumes: `viewGeo`, `viewHit`, `chipWorld` (Task 3); `drawScene` (Task 4); ação `disconnectMeio` (Task 2); `setMeioAlt`, `placeLig`; `onOpenLig(id)` já existente (abre o `LigacaoModal`).
- `MapView` recebe `view: ViewMode`; anima `t` até 0 ou 1 em 250 ms (`easeInOut`; instantâneo com movimento reduzido). Câmera: na Montar o zoom fica entre `MONTAR_REF * 0.35` e `MONTAR_REF * 3`; na Planta, os limites atuais; "Mostrar tudo" enquadra os retângulos da vista atual (cartões ou blocos reais). Ao trocar de vista a câmera mantém o centro e ajusta o zoom para dentro dos limites da nova vista.
- Gestos (as duas vistas): clique no cartão/bloco seleciona; arrastar move (preso na grade de 8 m, como hoje); duplo clique no vazio ou botão direito abre o seletor; arrastar de porta (via `viewHit`) liga ou abre o seletor filtrado; clique no chip seleciona a ligação e abre o `ChipPopover`; arrastar o chip grava `placeLig` com `chipWorld`; Delete com chip selecionado despacha `disconnectMeio`; Esc fecha o popover e devolve o foco ao canvas.
- `ChipPopover` (DOM, `role="dialog"`, posicionado abaixo do chip ou acima se não couber, dentro da área do mapa, como `popHTML`): título com ícone ("Balancer 6 → 8", "Direto", "Cano de Water"), frase "2.400 de 2.730/min de Pure Iron Ingot para Solid Steel Ingot." (+ "A ponta de lá ainda pede mais." quando `short`), botões **Ver montagem** (`onOpenLig`), **Trocar montagem** (abre a lista das `plan.alternatives`: título e uma linha de descrição; clique despacha `setMeioAlt`; desabilitado em fluido com `title` explicando), **Desligar** (`disconnectMeio` com `meio.links`). Foco vai para "Ver montagem" ao abrir.
- O gancho de teste `window.__sfPlanner` passa a expor também `view: { ports, chips, blocks }` em px de tela (o smoke usa na Task 9) e `mode`.
- Chaves: `plChipTitleBal: (s, d) =>`, `plChipTitleDirect`, `plChipTitlePipe: item =>`, `plChipSentence: (rate, of, item, from, to) =>`, `plChipShort`, `plChipSee`, `plChipSwap`, `plChipUnlink`, `plChipSwapFluid`, `plChipAria: (item, rate, kind) =>`.

- [ ] **Step 1:** Implementar modo, transição, limites de câmera, gestos e o `ChipPopover`.
- [ ] **Step 2:** `npm test && npm run typecheck` → PASS.
- [ ] **Step 3:** No `npm run dev`: criar Pure Iron no vazio, puxar a saída até o vazio → Solid Steel Ingot; clicar no chip → popover; Trocar montagem muda o rótulo do chip; Desligar some com a ligação e Ctrl+Z volta tudo; arrastar o chip e alternar para a Planta: o chip fica no mesmo lugar do mundo; a transição anima (e não anima com movimento reduzido emulado no DevTools).
- [ ] **Step 4:** Commit `Planner: Montar como vista principal, transição para a Planta e o chip da ligação com Ver/Trocar montagem e Desligar`.

---

### Task 6: Faixa "Balanço" e ir até o problema

**Files:**
- Create: `src/planner/ui/BalanceBar.tsx`
- Modify: `src/planner/App.tsx`, `src/planner/ui/MapView.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Consumes: `factoryBalance` (Task 2); `flash` do `DrawOpts` (Task 4).
- `BalanceBar({ balance, data, onGo })` abaixo do cabeçalho (`shots/01`): "Entra" + ícone e taxa de cada item, "Sai" idem, "Sink" idem (só se houver); à direita botões "N faltas" (fundo `--deficit-bg`) e "N sobras" (fundo `--surplus-bg`), desabilitados com 0; "travado" conta junto das faltas. Cada clique chama `onGo(kind)`, que passa pelo próximo problema daquele tipo (índice circular guardado no `App`).
- `MapView` expõe `focusPort(block, side, item)` via `ref` (`useImperativeHandle`): seleciona o bloco, centraliza a câmera no bloco animando (como `animatePan` do protótipo, 300 ms; zoom sobe para `MONTAR_REF * 0.9` na Montar se estiver abaixo de 0,7) e pisca a porta e o cartão por 1,2 s (`flash`).
- `aria-live="polite"` anuncia o problema escolhido ("Falta de Coal em Solid Steel Ingot: 120/min").
- Fábrica vazia: "—" em cada grupo.
- Chaves: `plBalIn`, `plBalOut`, `plBalSink`, `plBalDeficits: n =>`, `plBalSurpluses: n =>`, `plBalAria`, `plBalGo: (kind, item, block, rate) =>`.

- [ ] **Step 1:** Implementar barra, navegação e piscar.
- [ ] **Step 2:** `npm test && npm run typecheck` → PASS; no exemplo, "1 sobra" leva às refinarias e pisca a saída; clicar de novo passa ao próximo (ou repete se só há um).
- [ ] **Step 3:** Commit `Planner: faixa Balanço (entra, sai, sink) com botões que levam a cada falta e sobra`.

---

### Task 7: Painel lateral — abre com seleção, frase do problema e consertos de um clique

**Files:**
- Create: `src/planner/model/fixes.ts`, `tests/planner/fixes.test.ts`
- Modify: `src/planner/ui/MapPanel.tsx`, `src/planner/ui/BlockPanel.tsx`, `src/planner/ui/MapView.tsx`, `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- Consumes: `PortState`, `portStates` (Task 2); `Action`; `addLinkedBlock`, `setLimits`, `setMinerRate`, `setExtractor` (factorystate/factory).
- Produces (`fixes.ts`):
  - `type Sentence = { key: 'plWhyDeficit' | 'plWhySurplus' | 'plWhyStalled' | 'plWhyExit'; args: (string | number)[] }` — números crus; a UI formata (`fmt`) e aplica `t(key, ...)`. Ex.: sobra → "O Solid Steel Ingot só consome 2.400. Sobram 330 por minuto aqui." (args: consumidoras, consumo, sobra).
  - `problemSentence(p: PortState, f: Factory, flow: FlowResult, d: GameData): Sentence | null`.
  - `type Fix = { key: 'plFixSink' | 'plFixReduce' | 'plFixRaise' | 'plFixCreate'; n?: number; action: Action | null }` (`action: null` em `plFixCreate`: a UI abre o seletor filtrado pela porta, como arrastar da entrada para o vazio).
  - `fixesFor(p: PortState, f: Factory, flow: FlowResult, d: GameData, at: Pt): Fix[]` — `surplus`: "Mandar sobra pro sink" (`addLinkedBlock` de um `sink` na saída, em `at`; não oferecer para fluido) e, em receita, "Reduzir para N" com `N = ceil(machines × rate / (rate + held))` (`setLimits` mantendo os `inputs`), só se `N < machines`; `stalled`: o mesmo sink (sólido) ou só "Criar destino" via `plFixCreate`; `deficit`: "Aumentar a fonte" quando há exatamente uma produtora ligada nesse item e ela é Miner (`setMinerRate` + falta), extrator (`count` null → fica null e não oferece; fixado → `ceil` das unidades a mais) ou receita com máquinas fixadas (`+ ceil(falta / saída por máquina no clock)`); "Reduzir para N" na própria consumidora (`N = floor(machines × (rate) / (rate + deficit))`, ≥ 1); "Criar fonte" (`plFixCreate`) sempre. `at` = ponto do mundo à direita (saída) ou à esquerda (entrada) do bloco, calculado pelo `MapView`.
- Painel: some sem seleção no desktop (botão "Abrir painel"/"Fechar painel" no canto de cima à direita do mapa, `aria-expanded`, lembra a escolha em `localStorage` `sf-balancer:planner-panel`; com o painel aberto e sem seleção mostra a visão geral). Com seleção, abre. Celular (≤ 720 px): folha de baixo com alça (`role="button"`, `aria-expanded`), meia altura, arrastável/clicável para abrir inteira.
- `BlockPanel` novo topo (como `renderPanel` do protótipo): ícone + nome + prédio; lista "Entra" e "Sai" com ícone, taxa e o estado da porta (mesma cor das portas); para cada porta com problema, a frase e os consertos como botões (o primeiro em destaque); depois os campos atuais (receita, limites, clock, coleta, mapa, apagar), com o botão "Ver em escala" (troca para a Planta e centraliza o bloco) ou "Voltar a montar".
- Seleção de ligação no painel: "Ligação de Iron Ingot" com Passa / Linhas / Montagem e os botões do chip (`shots/03`).
- Visão geral (sem seleção): área da fábrica, totais (blocos, máquinas — saídos do cabeçalho na Task 1), avisos clicáveis (sobreposição, cruzamento, e os problemas do Balanço), lista de blocos **e de ligações** (botões; Enter seleciona e foca no mapa — é o caminho do teclado até o chip).
- Chaves: `plWhyDeficit`, `plWhySurplus`, `plWhyStalled`, `plWhyExit`, `plFixSink`, `plFixReduce: n =>`, `plFixRaise: r =>`, `plFixCreate`, `plPanelOpen`, `plPanelClose`, `plPanelIn`, `plPanelOut`, `plSeeScale`, `plBackMontar`, `plLigTitle: item =>`, `plLigPasses`, `plLigLines`, `plLigMontagem`, `plMapLigs`.

- [ ] **Step 1: Testes** em `fixes.test.ts`:
  - `test('sobra das refinarias do caso 1: frase e consertos')` — sentença `plWhySurplus` com args `[nome das consumidoras, 2400, 330]`; consertos `plFixSink` (ação `addLinkedBlock` com `spec.kind === 'sink'` e `port.side === 'out'`) e `plFixReduce` com `n = 37` (`ceil(42 × 2400 / 2730)`).
  - `test('falta com Miner a montante: aumentar a fonte pela falta')` — `setMinerRate` com `rate = antiga + falta`.
  - `test('falta com duas produtoras: sem aumentar a fonte, com criar fonte')`.
  - `test('sobra de fluido: sem sink')`.
  - `test('reduzir nunca abaixo de 1 nem igual ao atual')`.
- [ ] **Step 2:** `node --test tests/planner/fixes.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `fixes.ts`; depois painel, folha de baixo e visão geral.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS; no exemplo, "Mandar sobra pro sink" cria o sink ligado e a sobra some do Balanço; Ctrl+Z volta; viewport 390 × 844 no DevTools mostra a folha de baixo.
- [ ] **Step 5:** Commit `Planner: painel abre com a seleção, explica o problema numa frase e oferece consertos de um clique`.

---

### Task 8: Seletor maior, dica de primeiro uso e Legenda

**Files:**
- Create: `src/planner/ui/Legend.tsx`, `src/planner/ui/FirstHint.tsx`
- Modify: `src/planner/model/picker.ts`, `tests/planner/picker.test.ts`, `src/planner/ui/Picker.tsx`, `src/planner/ui/MapView.tsx` (sai o `MapLegend` e a dica atual), `src/planner/planner.css`, `src/i18n/{pt,en,es}.js`

**Interfaces:**
- `pickerGroups(r, filter?)`: receitas **sempre** primeiro, "Fontes e sobras" depois (o rótulo do grupo `special` muda para `plPickSources`).
- Seletor: até 440 × 560 px (menos no celular, com 8 px de margem); cartões ≥ 56 px de altura, ícone 42 px, nome + `Alt`, e a receita com ícones de 18 px ("60 [ícone] Steel Ingot → 15 [ícone] Steel Beam", taxas por minuto a 100 % com `fmt`); setas + Enter, Esc, foco preso como hoje.
- `FirstHint`: barra no canto de baixo à esquerda (`shots/01`) "Duplo clique no vazio cria um bloco. Arraste de uma porta… Roda do mouse move; Ctrl + roda dá zoom." + botão "Entendi"; some para sempre (`localStorage` `sf-balancer:planner-hint2`, novo, para quem já tinha fechado a dica antiga ver esta uma vez). Na fábrica vazia, o convite tracejado no meio do mapa ("Duplo clique para criar um bloco / ou arraste de uma porta para cá").
- `Legend`: botão "Legenda" no grupo de baixo à direita (com Novo bloco, −, +, Mostrar tudo, todos 44 px); abre um diálogo (`role="dialog"`, Esc fecha, foco volta ao botão) com três seções desenhadas em SVG inline com os mesmos tokens: estados das portas (5), tipos de chip (balancer, + sink, direto, cano, falta), como ler a faixa de fileiras (um cartão pequeno anotado: barra de entrada, quadrado = máquina, barra de saída, "+ N fileiras iguais").
- Chaves: `plPickSources`, `plPickRecipes`, `plHintText`, `plHintOk`, `plInviteTitle`, `plInviteSub`, `plLegendTitle`, `plLegPortOk`, `plLegPortDeficit`, `plLegPortSurplus`, `plLegPortExit`, `plLegPortStalled`, `plLegChipBal`, `plLegChipSink`, `plLegChipDirect`, `plLegChipPipe`, `plLegChipShort`, `plLegStripIn`, `plLegStripMachine`, `plLegStripOut`, `plLegStripMore`, `plNewBlock`. Chaves que ficarem sem uso (`plLeg*` antigas, `plMapHint`, etc.) saem dos três idiomas.

- [ ] **Step 1: Teste** — em `picker.test.ts`, trocar a expectativa "sem filtro, especiais primeiro" por `test('receitas sempre primeiro, fontes e sobras depois')` (com e sem filtro).
- [ ] **Step 2:** `node --test tests/planner/picker.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `pickerGroups`, seletor, dica, convite e legenda; remover `MapLegend` e chaves mortas.
- [ ] **Step 4:** `npm test && npm run typecheck` → PASS; comparar com `shots/02-seletor.png`.
- [ ] **Step 5:** Commit `Planner: seletor com cartões maiores e receitas primeiro, dica de primeiro uso e Legenda`.

---

### Task 9: Smoke, capturas, docs e verificação final

**Files:**
- Modify: `tests/visual/smoke.js`, `tests/visual/scenarios.js`, `tests/visual/capture.js` (se preciso), `README.md`, `README.pt-BR.md`, `README.es.md`, `AGENTS.md`, `docs/backlog.md`

**Interfaces:**
- Consumes: `window.__sfPlanner.view` e `mode` (Task 5).
- Smoke (mesmos passos de hoje, agora na Montar, com as portas e chips em px de tela de `__sfPlanner.view`): canvas vazio → duplo clique → "Pure Iron" → Enter; arrastar a saída para o vazio → "Solid Steel Ingot"; segunda perna "Steel Pipe"; Ctrl+Z; **clique no chip abre o popover, "Ver montagem" abre o modal e Esc devolve o foco ao canvas**; **Desligar some com a ligação e Ctrl+Z volta**; **botão Planta em escala troca `mode` e as portas continuam clicáveis**; `/#s=` cai no Balancer.
- Cenários de captura: `builder` (Montar), `builder-planta`, `builder-bloco` (painel com frase e consertos), `builder-chip` (popover aberto), `builder-seletor`, `builder-seletor-teclado`, `builder-ligacao` (modal), `builder-legenda`, `builder-celular` (390 × 844, folha de baixo).
- Docs: AGENTS.md (seção Builder: Montar/Planta, chip, Balanço, painel, abas; lista de arquivos com `model/portstate.ts`, `fixes.ts`, `chip.ts`, `map/cards.ts`, `ui/draw/`; cenários novos do `visual:capture` e o smoke novo), READMEs nos três idiomas (o que o builder mostra agora), backlog (tirar o que esta reforma resolveu; anotar o que ficou de fora).

- [ ] **Step 1:** Atualizar smoke e cenários.
- [ ] **Step 2:** `npm run build && npm run preview` (outra aba) e `npm run smoke -- http://localhost:4173` → todos `ok`, código 0.
- [ ] **Step 3:** `npm run visual:capture -- http://localhost:4173 <scratchpad>/reforma --only=builder` e olhar cada PNG ao lado do `shots/` correspondente; corrigir o que destoar (cada correção com commit próprio).
- [ ] **Step 4:** Capturar também o Balancer (`--only=` sem builder) antes (no commit `e379afe`, num worktree) e depois; `npm run visual:compare` só pode diferir no topo (as abas).
- [ ] **Step 5:** Desempenho: no `npm run dev`, fábrica com ~2.000 máquinas (o exemplo com o bloco de aço fixado em 2.000), Planta e Montar, arrastar e dar zoom com o Performance do DevTools: quadros ≤ 16 ms no arraste; anotar o número no commit.
- [ ] **Step 6:** Docs; `npm test && npm run typecheck && npm run build` → PASS.
- [ ] **Step 7:** Commit `Builder: smoke e capturas da reforma, READMEs, AGENTS e backlog`.
