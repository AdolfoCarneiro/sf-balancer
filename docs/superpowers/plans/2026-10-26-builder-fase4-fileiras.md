# Builder fase 4 (fileiras como no jogo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada bloco de receita ganha um arranjo de fileiras (modelos prontos + ajustes) que vale para a tela da etapa, a Planta, as peças e as ligações; a Montar fica enxuta como o Modeler; um botão Camadas esconde ícones, nomes, ligações e portas.

**Architecture:** Um módulo puro novo, `src/planner/model/layout.ts`, transforma (etapa resolvida + `Layout` salvo) num `Arrangement`: fileiras posicionadas, linhas (esteiras/canos com cortes e saídas), peças, área, avisos e a `BlockGeo` da Planta. Tudo que hoje lê `stageRows`/`perRowOf` para desenhar, contar ou montar as linhas da ligação passa a ler o `Arrangement`. Sem `layout` salvo, o arranjo é "Fileira simples" e reproduz exatamente os números e a geometria de hoje.

**Tech Stack:** Vite, React 19, TypeScript, canvas 2D, `node --test` com type stripping, Playwright (smoke).

**Spec:** `docs/superpowers/specs/2026-10-26-builder-fase4-fileiras-design.md` (leia também a seção "Decisões minhas"). Desenho aprovado da fábrica do dono: `docs/superpowers/research/2026-10-26-fase4/fabrica-ferro-2x2.png`.

## Global Constraints

- Todo texto visível em pt/en/es (`src/i18n/{pt,en,es}.js`), chave nova nos três na mesma mudança; texto com número é função; números com `fmt()`. Nomes de peças do jogo em inglês nos três (Splitter, Merger, Conveyor Lift).
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem push, sem merge, sem `git stash` puro.
- Sem domínio novo na CSP (`vercel.json`). O Balancer (`/balancer`) não muda.
- Mecânicas: Merger até 3 entradas, Splitter até 3 saídas; esteiras Mk1 60, Mk2 120, Mk3 270, Mk4 480, Mk5 780, Mk6 1200; canos Mk1 300, Mk2 600, sem Splitter/Merger (cano não tem corte nem "juntar"). Convenção de peças k−1 ("a primeira máquina inicia a esteira").
- Estado salvo: o `Layout` vai no `RecipeBlock` do `Factory` v2, validado no decode; inválido ou ausente = `{ kind: 'simple' }`. Estados antigos (`#p=`, `localStorage`, v1) abrem idênticos em números, peças e geometria.
- Desempenho: quadro do mapa ≤ ~7 ms com 2.000 máquinas; a tela da etapa responde ao vivo.
- Ao fim de cada tarefa: `npm test`, `npm run typecheck` e `npm run build` passando.

## Review Focus

1. Fábrica salva antes da fase 4 (sem `layout`): Planta, peças, área e linhas da ligação idênticas às de hoje — o teste de "simples = hoje" (Task 2) e o de meio (Task 4) pinam isso.
2. Bloco livre cujo número de máquinas muda (o solver recalcula): ajustes salvos de fileiras que deixaram de existir são ignorados sem quebrar, e cortes que não cabem mais avisam (Task 2/3).
3. Receita com fluido e com duas saídas (Pure Iron Ingot com água; uma receita com subproduto): os modelos geram esteira/cano por item sem cortar cano (Task 3).
4. Corte de 1 máquina ou maior que a fileira, arranjo com 1 máquina, 0 máquinas (bloco parado) e bloco "sem limite" (`x = null`): sem NaN nem exceção (Task 2/3).
5. "Mergers no meio" com saída pela ponta, e linha juntada que estoura a esteira ou passa de 3 entradas no Merger: aviso com o conserto, nunca silêncio (Task 3).

## Arquivos

- Criar: `src/planner/model/layout.ts` (tipos, `cleanLayout`, `arrange`, `arrangementLines`), `tests/planner/layout.test.ts`, `src/planner/ui/Layers.tsx`, `src/planner/ui/RowsPreview.tsx`.
- Modificar: `model/types.ts`, `model/factorystate.ts`, `model/stage.ts`, `model/map/block.ts`, `model/map/geo.ts` (PieceKind `lift`), `model/meio.ts`, `model/map/cards.ts`, `model/map/scene.ts`, `ui/StageView.tsx`, `ui/draw/*.ts`, `ui/mapDraw.ts`, `ui/MapView.tsx`, `ui/MapPanel.tsx`, `ui/Legend.tsx`, `src/i18n/*.js`, `src/planner/planner.css`, `tests/visual/{smoke,scenarios}.js`, `AGENTS.md`, READMEs.

## Modelo (fixado aqui; as tarefas usam estes nomes)

```ts
// model/types.ts
export type LayoutKind = 'simple' | 'backToBack' | 'center';
export type LayoutExit = 'end' | 'down' | 'up';          // pela ponta da fileira, desce ou sobe por Conveyor Lift
export interface RowEdit { flip?: boolean; mirror?: boolean; dx?: number; dy?: number }   // dx/dy em m, múltiplos de 8
export interface BeltEdit { cut?: number; exit?: LayoutExit }                           // cut: fecha a cada N máquinas
export interface Layout {
  kind: LayoutKind;
  invert?: boolean;                        // backToBack/center: o corredor do meio é das entradas, não das saídas
  rows?: Record<number, RowEdit>;          // índice da fileira gerada pelo modelo
  belts?: Record<string, BeltEdit>;        // chave tierKey(side, item) de model/stage.ts ('in:<item>' / 'out:<item>')
  joins?: string[];                        // `${tierKey}@${r}`: junta a esteira desse item da fileira r com a da r+1
}
// RecipeBlock ganha: layout?: Layout
```

```ts
// model/layout.ts
export interface ArrRow { index: number; machines: number; x: number; y: number; flip: boolean; mirror: boolean }
export interface ArrLine {                  // uma esteira/cano que entra ou sai do bloco
  side: 'in' | 'out'; item: ItemId; machines: number; rate: number;   // rate a 100 % do clock da etapa
  rows: number[];                          // fileiras que alimenta / que a alimentam
  exit: LayoutExit; at: Pt;                // ponto de entrada/saída, coordenadas locais do bloco (m)
  tier: string; cap: number; fluid: boolean;
}
export type LayoutWarning =
  | { kind: 'over'; side: 'in' | 'out'; item: ItemId; rate: number; cap: number; fixTier: string | null; fixCut: number }
  | { kind: 'merger3'; item: ItemId }                    // juntar daria Merger com mais de 3 entradas
  | { kind: 'centerEnd'; item: ItemId }                  // Mergers no meio saindo pela ponta
  | { kind: 'cutPipe'; item: ItemId }                    // corte pedido num cano (ignorado)
  | { kind: 'badJoin'; key: string };                    // junção que não vale mais (fileiras não coladas, fileira sumiu)
export interface Arrangement {
  kind: LayoutKind; rows: ArrRow[]; lines: ArrLine[];
  pieces: { splitters: number; mergers: number; lifts: number };
  area: { w: number; d: number };           // m, arredondado para cima em fundações de 8 m
  warnings: LayoutWarning[]; geo: BlockGeo;  // geo: o desenho da Planta (rot 0), como blockGeo hoje
}
export function cleanLayout(v: unknown): Layout | null;                 // null = inválido (cai em simple)
export function arrange(stage: Stage, data: GameData, layout: Layout | undefined, place?: Pick<MapPlace, 'gapRow' | 'gapMachine'>): Arrangement;
export function arrangementLines(a: Arrangement, side: 'in' | 'out', item: ItemId): number[];   // máquinas por linha
export function recommendedPerRow(stage: Stage, data: GameData, kind: LayoutKind): number;
```

Regras dos modelos (as tarefas implementam exatamente isto):

- **simple:** como hoje (`stageRows`, `perRowOf`, `blockGeo`): fileiras empilhadas, entradas na esquerda (x = 0) em cima da fileira, saídas na direita embaixo; uma linha por fileira por item. `flip` troca em cima/embaixo; `mirror` troca as pontas (entrada na direita). `joins` junta duas esteiras coladas (fileira r virada para a r+1 no mesmo lado/item) numa linha só compartilhada (regra da linha compartilhada abaixo).
- **backToBack:** fileiras em pares (0-1, 2-3, …), a de baixo virada, as saídas das duas lado a lado no corredor do par, **separadas** (com `invert`, as entradas é que ficam no corredor). Saídas pela ponta. `joins` como no simple.
- **center:** pares de fileiras (cima/baixo) com o corredor no meio; os pares lado a lado em x; pares da metade esquerda alimentados pela esquerda, os da direita pela direita (com 1 par, pela esquerda). Número de fileiras R = o menor par ≥ 2 com `ceil(M / R) × (maior entrada sólida por máquina) ≤ cap` da esteira da entrada; máquinas distribuídas o mais igual possível, as de cima com a sobra (42 → 11, 10, 11, 10: par esquerdo 11 em cima e 10 embaixo, par direito idem). A saída principal (`recipe.outs[0]`) de cada par é **uma linha compartilhada** no corredor (com `invert`, a entrada principal); `cut` padrão = `floor(cap / saída por máquina)` (65 → 7); `exit` padrão `down`. As outras entradas/saídas seguem o simple por fileira (a água entra pela mesma ponta da entrada principal, sem corte).
- **Linha compartilhada** (center, ou `joins`): as máquinas contam coluna a coluna, de cima para baixo, a partir da ponta de alimentação; fecha a cada `cut` máquinas (o corte pode cair entre a de cima e a de baixo da mesma coluna); cada trecho é uma `ArrLine` com `machines` = máquinas do trecho e `at` no fim do trecho. Mergers por trecho = colunas que ele toca − 1 se a primeira coluna do trecho dá só uma máquina a ele (ela inicia a esteira, k−1). No caso do dono: 6 trechos de 7, cada um com 3 ou 4 Mergers. Splitters numa linha compartilhada de entrada: mesma conta.
- **Corte numa linha por fileira:** permitido só com `exit` `down`/`up` (o trecho termina no meio da fileira); com `exit: 'end'` o corte é ignorado. Corte num cano: ignorado com aviso `cutPipe`.
- **Elevadores:** cada linha com `exit` `down`/`up` conta 1 em `pieces.lifts` e põe uma `Piece` `{ kind: 'lift', above: exit === 'up' }` de 2×2 m em `at`. Não entra na área.
- **Avisos:** `over` quando a taxa da linha (a 100 % do clock) passa do tier da porta (`portTier`), com `fixTier` (menor tier que cabe) e `fixCut` (`floor(cap / por máquina)`); `merger3` quando juntar exigiria Merger com mais de 3 entradas; `centerEnd` quando center tem a saída compartilhada com `exit: 'end'`; `cutPipe`; `badJoin`.
- **Ajustes órfãos:** `rows`/`joins` de índices que o modelo não gerou são ignorados (`badJoin` para joins). `dx/dy` só deslocam a fileira; mover uma fileira tira as junções dela (o reducer faz isso no `setLayout` vindo da tela).
- **Bloco parado ou sem limite:** `stage.machines` 0 → arranjo vazio (sem linhas, área 0); `machines` vem sempre finito de `solvedStage` (bloco sem limite já é tratado lá — confira).

---

### Task 1: Layout no estado salvo

**Files:** Create `src/planner/model/layout.ts` (só tipos re-exportados e `cleanLayout` por enquanto); Modify `model/types.ts`, `model/factorystate.ts`; Test `tests/planner/layout.test.ts`.

**Interfaces:** Produces os tipos acima em `types.ts`, `cleanLayout`, a ação `{ type: 'setLayout'; id: StageId; layout: Layout | null }` (null apaga = simple), uma entrada no histórico.

- [ ] Teste `cleanLayout`: aceita `{kind:'center', invert:true, rows:{1:{flip:true,dx:8}}, belts:{'out:Desc_IronIngot_C':{cut:7,exit:'down'}}, joins:['out:Desc_IronIngot_C@0']}` igual; rejeita (null) `kind` desconhecido; descarta campos inválidos sem rejeitar o todo: `dx: 3` (não múltiplo de 8), `cut: 0`, `cut: 1.5`, `exit: 'left'`, índice de fileira negativo, join mal formado. Limites: `cut` inteiro 1..1000, `dx/dy` múltiplos de 8 em ±800.
- [ ] Teste do reducer: `setLayout` grava, um undo volta; `setLayout` com `null` remove o campo; encode → decode preserva o layout; decode de `layout` inválido deixa o bloco sem `layout`; estado sem `layout` decodifica igual ao de hoje.
- [ ] Implementar; `npm test`, `npm run typecheck`; commit "Builder: arranjo das fileiras no estado salvo".

### Task 2: `arrange` — simple, backToBack e ajustes

**Files:** Modify `model/layout.ts`, `model/map/geo.ts` (PieceKind `'lift'`); Test `tests/planner/layout.test.ts`.

**Interfaces:** Consumes Task 1. Produces `arrange`, `arrangementLines`, `recommendedPerRow` (simple/backToBack = `suggestedPerRow`), `Arrangement`.

- [ ] Teste "simples = hoje": para cada bloco do exemplo (`exampleFactory`) e para um bloco de 120 fileiras, `arrange(stage, data, undefined, place).geo` é `deepEqual` a `blockGeo(stage, data, place)` (a função de hoje, importada antes da troca — copie-a para o teste como referência se a Task 4 a apagar), e `pieces`/`area` iguais a `stagePieces`/`stageArea`, `arrangementLines(a,'out',item)` = `stageRows`.
- [ ] Teste backToBack: 6 fileiras de 7 (Pure Iron Ingot, 42) → 3 pares, a de baixo de cada par com `flip`, 6 linhas de saída de 7 separadas; com `invert`, as entradas no corredor.
- [ ] Teste de ajustes: `flip` na fileira 0 do simple troca as faixas de lado; `mirror` põe a âncora de entrada em x = w; `dx: 16` desloca as peças da fileira 16 m; ajuste da fileira 99 é ignorado; `cut: 3` com `exit:'down'` na entrada de uma fileira de 7 dá linhas 3, 3, 1 com 3 elevadores (`pieces.lifts`) e peças `lift` nos fins; com `exit:'end'` o corte é ignorado.
- [ ] Teste de avisos: Mk1 forçado (`stage.tiers`) dá `over` com `fixTier` e `fixCut`; bloco de 0 máquinas dá arranjo vazio sem NaN; corte de 1 máquina funciona.
- [ ] Implementar (o simple sem ajustes pode reaproveitar o código de `blockGeo` tal qual, para garantir a igualdade); testes; commit "Builder: arranjo das fileiras (simples, costas com costas, ajustes)".

### Task 3: `arrange` — center, linha compartilhada e junções

**Files:** Modify `model/layout.ts`; Test `tests/planner/layout.test.ts`.

**Interfaces:** Consumes Task 2. Produces os mesmos nomes, agora com `center` e `joins`.

- [ ] Teste do caso do dono: Pure Iron Ingot, 42 máquinas, clock 100, Mk4, `{kind:'center'}` → `rows` 4 com máquinas [11, 10, 11, 10] (par esquerdo e direito), `arrangementLines(a,'out',IronIngot)` = [7,7,7,7,7,7], cada uma `rate` 455 e `exit` 'down'; `pieces.lifts` 6; entradas de minério = [11,10,11,10] com `exit` 'end' (minério pelas pontas de fora: as âncoras do par esquerdo em x = 0, do direito em x = w); água: 4 linhas de cano, sem corte; Mergers = soma pela regra da linha compartilhada (escreva o número esperado calculado à mão no teste com o comentário da conta); nenhum aviso.
- [ ] Teste: center com `belts['out:…'].exit = 'end'` dá `centerEnd`; `cut: 8` dá `over` (520 > 480) com `fixCut` 7; `invert` põe a entrada principal no corredor; receita com subproduto (escolha uma em `game.json`) gera a saída secundária por fileira, sem compartilhar.
- [ ] Teste de `joins` no simple: fileira 0 normal + fileira 1 com `flip` e `joins:['out:<item>@0']` → uma linha compartilhada; junção entre fileiras não coladas → `badJoin` e ignorada; junção que somaria mais que a esteira → `over`; junção cuja coluna exigiria 4 entradas no Merger → `merger3`.
- [ ] Teste de órfãos: center salvo com 42 e a etapa recalculada para 20 máquinas → arranjo válido, cortes mantidos, sem exceção.
- [ ] Implementar; testes; commit "Builder: Mergers no meio e linhas compartilhadas".

### Task 4: O arranjo no resto do modelo (peças, Planta, ligação)

**Files:** Modify `model/stage.ts`, `model/map/block.ts`, `model/map/scene.ts`, `model/meio.ts`, `model/drawing.ts` se usar `stageRows`, `ui/draw/plant.ts` (desenhar `lift`), `ui/MapView.tsx` (textos de fileiras); Test `tests/planner/*.test.ts` existentes + novos.

**Interfaces:** Consumes Tasks 1–3. `solvedStage` passa a carregar o `layout` do bloco (ou quem chama passa `block.layout`); `blockGeo(stage, data, place)` vira `arrange(stage, data, stage.layout, place).geo` (ou é apagada e os chamadores trocam). `stagePieces` ganha `lifts`; `stageArea`/`portWarnings` vêm do `Arrangement`.

- [ ] Teste de meio: no exemplo sem layout, `meioInput` dá exatamente os mesmos grupos de hoje (grave os valores atuais antes de mexer). Com o refinador em `{kind:'center'}`, os grupos de origem viram as linhas do arranjo agrupadas por tamanho (`{count: n·k, per: k}` por tamanho k, mesmo `clock`), e o plano do meio recebe 6 linhas de 455. Destino com arranjo center (invert) recebe as linhas de entrada do arranjo.
- [ ] Teste de Planta: bloco com `center` tem `geo` do arranjo na cena; as âncoras de saída ficam nos fins dos trechos; a porta da Planta continua na borda de saída do bloco, no ponto médio das âncoras do item (regra de `plantPorts`, que não muda), e os leques vão até cada âncora.
- [ ] Desenhar `lift` na Planta (quadrado 2×2 m com seta para baixo/cima; cor do item; legenda na Legenda — chave nova nos 3 idiomas).
- [ ] `npm test`, typecheck, build, smoke; commit "Builder: o arranjo vale na Planta, nas peças e nas ligações".

### Task 5: Tela da etapa monta as fileiras

**Files:** Modify `ui/StageView.tsx` (e extrair componentes se passar de ~350 linhas), `src/planner/planner.css`, i18n.

**Interfaces:** Consumes `arrange`, `setLayout`.

- [ ] O desenho da etapa passa a ser o `Arrangement.geo` (mesma escala de hoje, 1 m = 4 px, grade de 8 m), com as linhas coloridas por item, os cortes, Mergers/Splitters e os elevadores.
- [ ] Modelo: controle segmentado "Fileira simples | Costas com costas | Mergers no meio" + "Inverter" (backToBack/center); trocar de modelo zera `rows`/`belts`/`joins` (um undo). Botão "Voltar ao modelo" zera os ajustes.
- [ ] Fileira: clicar seleciona; "Virar", "Espelhar"; arrastar ou setas movem 8 m (`dx/dy`); mover tira as junções dela.
- [ ] Esteira: clicar seleciona; "Fecha a cada" (número; vazio = padrão), "Sai por" (Ponta / Desce / Sobe; "Entra por" para entradas), "Juntar com a fileira de baixo" quando a esteira encosta noutra do mesmo item e lado.
- [ ] Painel: avisos com o conserto em um clique (`over` → subir o tier ou aplicar `fixCut`; `centerEnd` → "Sair por baixo"); peças (Splitter, Merger, Conveyor Lift), área, linhas ("6 saídas de 455/min"). Tudo nos 3 idiomas.
- [ ] Teclado: tudo alcançável por Tab, alvos ≥ 44 px, `aria-label`s.
- [ ] Visual: cenário novo `builder-etapa` em `tests/visual/scenarios.js` com o refinador em center; capture e olhe a imagem. Commit "Builder: tela da etapa monta as fileiras".

### Task 6: Montar enxuta + miniatura no painel

**Files:** Modify `model/map/cards.ts` (`cardSpec`/`cardSize` sem faixa), `ui/draw/cards.ts`, `model/map/scene.ts` (`proposeMap` reserva o tamanho novo), `ui/MapPanel.tsx`; Create `ui/RowsPreview.tsx`; Tests `tests/planner/cards.test.ts`.

**Interfaces:** Independente das Tasks 1–5 até a miniatura, que usa `arrange` (se a Task 4 ainda não existir, use `blockGeo` e deixe um ponto único para trocar).

- [ ] Cartão de receita: ícone, receita + Alt, número de máquinas ("fixado"), clock ≠ 100 %, portas; sem faixa. Altura = max(cabeçalho + rodapé, portas). Atualizar os testes de `cardSize`/`stripRows` (apagar `stripRows` se ninguém mais usa) e `fitMontar`.
- [ ] Painel com um bloco de receita selecionado: miniatura das fileiras (o desenho da Planta daquele bloco cabendo em ~260 × 160 px, sem grade), nome do modelo, linhas ("6 saídas de 455/min · descem") e o botão "Montar fileiras" (abre a etapa, como o duplo clique).
- [ ] Visual: `builder`, `builder-bloco`, `builder-celular` capturados e olhados. Commit "Builder: Montar enxuta como o Modeler e miniatura das fileiras no painel".

### Task 7: Camadas

**Files:** Create `ui/Layers.tsx`; Modify `ui/MapView.tsx` (controles e acerto do clique), `ui/mapDraw.ts`, `ui/draw/*.ts`, i18n, CSS.

**Interfaces:** `export interface MapLayers { icons: boolean; names: boolean; links: boolean; ports: boolean }`, padrão tudo true, salvo em `localStorage` `sf-balancer:planner-layers` (try/catch). `DrawOpts.layers: MapLayers`.

- [ ] Botão "Camadas" nos controles de baixo à direita (antes de Legenda), abrindo um popover com 4 caixas (44 px) e "Só as máquinas" (desliga as 4). Esc fecha e devolve o foco.
- [ ] `links: false`: sem esteiras do mapa (Montar e Planta), sem chips, sem peças das ligações na Planta; chip não pega clique. `ports: false`: sem portas e rótulos de estado; porta não pega clique nem arrasta. `icons: false`: sem ícones nos cartões, placas e portas. `names: false`: sem nomes de receita nos cartões/placas.
- [ ] Teste puro do que der (ex.: a função que filtra o `ViewGeo` para o acerto do clique). Cenário `builder-camadas` (tudo desligado) capturado e olhado. Commit "Builder: Camadas (só as máquinas)".

### Task 8: Smoke, docs e fechamento

**Files:** `tests/visual/smoke.js`, `AGENTS.md`, `README.md`, `README.pt-BR.md`, `README.es.md`, `docs/backlog.md`.

- [ ] Smoke: passo novo — abrir a etapa do Pure Iron (duplo clique), escolher "Mergers no meio", voltar, conferir que o chip da ligação de saída mudou de linhas (via `window.__sfPlanner` ou o texto do chip); passo Camadas "Só as máquinas" e volta.
- [ ] AGENTS.md: seção Builder (arranjo, Montar enxuta, Camadas, `layout.ts` na estrutura), "Fora do escopo" sem as quatro coisas que o dono tirou; READMEs nos três idiomas; backlog: fase 4 feita.
- [ ] `npm test`, typecheck, build, smoke; commit "Builder: fase 4 no smoke e nas docs".

## Ordem e paralelismo

Tasks 1 → 2 → 3 → 4 → 5 em sequência (mesmo módulo). Tasks 6 e 7 não dependem do arranjo (a 6 só na miniatura) e rodam em paralelo em worktrees desde o começo; a 8 fecha.
