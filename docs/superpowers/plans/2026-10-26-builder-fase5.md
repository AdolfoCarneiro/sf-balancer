# Builder fase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela da etapa refeita (desenho em tela cheia, painel em dois níveis com "voltar", resumo fixo), saídas espertas (linha que atravessa os pares, "Dividir igual"), posições independentes na Montar e na Planta ("Mover junto"), importar `.sfmd` do Satisfactory Modeler e tutorial com "Pular" + "Como mexer" por área.

**Architecture:** Cada meta é uma fatia quase independente: o arranjo (`model/layout.ts`) ganha a linha atravessando e o `even`; o `Factory` ganha posições da Montar separadas; um módulo puro novo `model/sfmd.ts` traduz o arquivo do Modeler num `Factory`; a tela da etapa é reescrita sobre o `Arrangement`; o tutorial é um componente de passos ancorados em elementos marcados com `data-tour`.

**Tech Stack:** Vite, React 19, TypeScript, canvas 2D, `node --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-builder-fase5-design.md` (inclui "Decisões minhas"). Esboço aprovado: `docs/superpowers/research/2026-10-26-fase5/etapa-v2.png`. Exemplos `.sfmd`: `docs/superpowers/research/2026-10-26-fase5/sfmd/`.

## Global Constraints

- Todo texto visível em pt/en/es (`src/i18n/{pt,en,es}.js`), chave nova nos três na mesma mudança; texto com número é função; números com `fmt()`. Nomes de peças do jogo em inglês.
- Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem push, sem merge, sem `git stash` puro.
- Sem domínio novo na CSP. O Balancer não muda. Mecânicas: Merger/Splitter até 3; esteiras Mk1 60 … Mk6 1200; canos sem Splitter/Merger; convenção k−1.
- Estado salvo antigo (`#p=`, `localStorage`, v1) abre igual: mesmas posições nas duas vistas, mesmos números. O caso do dono continua: Pure Iron 42 em center = 4 fileiras 11/10/11/10, 6 saídas de 455 descendo, 22 Mergers, 38 Splitters.
- Alvos ≥ 44 px, teclado, `aria-label`s, movimento reduzido respeitado. Mapa ≤ ~7 ms por quadro com 2.000 máquinas.
- Ao fim de cada tarefa: `npm test`, `npm run typecheck`, `npm run build` passando (smoke quando mexer em gesto/UI).

## Review Focus

1. Fábrica salva antes da fase 5: abre com as mesmas posições nas duas vistas, e arrastar numa vista (com "Mover junto" desligado) não muda a outra (Task 2).
2. `.sfmd` com nome desconhecido, ligação apontando para índice inexistente, `Inputs` com pontos de curva, `Max` fracionário ("13 1/5"), arquivo vazio ou JSON de outra coisa: resumo honesto, nada quebra (Task 3).
3. "Dividir igual" com 1 saída, com máquinas < saídas, em cano (sem efeito) e junto de "Fecha a cada N" (Task 1).
4. A linha atravessando muda as linhas da ligação e o desenho da Planta de forma consistente (pareamento por tamanho da fase 4 continua certo) (Task 1).
5. Tutorial: "Pular" em todo passo, não volta sozinho depois de pulado/concluído, alvo ausente na tela (ex.: celular) pula o passo sem travar (Task 5).

---

### Task 1: Saídas espertas no arranjo

**Files:** `src/planner/model/types.ts` (`BeltEdit.even?: boolean`), `src/planner/model/layout.ts`, `src/planner/model/layoutedit.ts` (função `setEven`), `cleanLayout`; Test `tests/planner/layout.test.ts`, `tests/planner/layoutedit.test.ts`, `tests/planner/meio.test.ts`.

**Interfaces:** Produces `BeltEdit.even`, `setEven(layout, key, on): Layout | null`; `arrange` passa a juntar as linhas compartilhadas dos dois pares de uma faixa numa só quando isso dá menos saídas.

- [ ] Testes: Copper Ingot (`Recipe_IngotCopper_C`), 40 máquinas, Mk4, `{kind:'center'}` → `arrangementLines(a,'out',CopperIngot)` = [16,16,8], 3 elevadores, sem aviso; com `belts['out:Desc_CopperIngot_C'].even = true` → [14,13,13]; Pure Iron 42 center continua [7,7,7,7,7,7], 22 Mergers, 38 Splitters (pares que fecham certinho não atravessam); `invert` com Copper 40 → linhas de entrada atravessando (mesma regra); `even` com `cut` fixado divide igual entre `ceil(total/cut)` saídas; `even` em cano é ignorado; `even` com 1 saída não muda nada; `cleanLayout` aceita/descarta `even`.
- [ ] Teste de meio: Copper 40 center → grupos `{count 32, per 16}` e `{count 8, per 8}`; com `even` → `{14},{13×2}` agrupados por tamanho; teste de cena (pareamento por tamanho) passa com as linhas novas.
- [ ] Implementar: na faixa com dois pares, a linha do corredor corre da ponta esquerda à direita (o vão entra no caminho), as máquinas contam coluna a coluna do par esquerdo e depois do direito (na ordem da linha), cortes ao longo dela; Mergers/Splitters pela regra k−1 da fase 4; `at`/elevadores no fim de cada trecho; atravessa só se `ceil(total/cut) < soma de ceil(par/cut)`. `even`: com S saídas, trechos de `floor(total/S)` ou `+1`, os maiores primeiro.
- [ ] Commit "Builder: saídas espertas (linha atravessando os pares e Dividir igual)".

### Task 2: Montar e Planta com posições independentes

**Files:** `model/types.ts` (`Factory.montar?: Record<StageId, MapPlace>`, `Factory.montarLigs?: Record<string, LigPlace>`), `model/factorystate.ts` (ações `placeBlock`/`placeLig`/`setPlaces` ganham `view: 'montar' | 'planta'`; decode/encode; migração), `model/factory.ts` (bloco novo nasce nas duas), `model/map/scene.ts`/`cards.ts` (a Montar lê `montar` com fallback para `map`), `ui/MapView.tsx` (arrastar grava na vista atual; "Mover junto"), i18n; Tests `tests/planner/factorystate.test.ts` (ou o arquivo do reducer), `tests/planner/cards.test.ts`.

**Interfaces:** `montarPlace(f, id): MapPlace | undefined` (montar[id] ?? map[id]); "Mover junto" em `localStorage` `sf-balancer:planner-together` (padrão false).

- [ ] Testes: fábrica sem `montar` → as duas vistas com as posições de `map`; `placeBlock` com `view:'planta'` muda só `map` (e a Montar continua no lugar antigo); com `view:'montar'` muda só `montar`; giro (`rot`) é por vista; "mover junto" = o reducer recebe `together: true` e aplica o mesmo deslocamento (não o giro) na outra vista — um só passo de desfazer; bloco novo nasce nas duas; apagar bloco limpa as duas; encode/decode preservam `montar`/`montarLigs`; decode inválido descarta; ligação (chip) idem.
- [ ] Botão "Mover junto" nos controles do mapa (caixa de seleção ou alternador de 44 px), nos três idiomas; "Propor de novo" e "Mostrar tudo" valem para a vista atual.
- [ ] Smoke continua passando (o passo de arrastar na Planta não mexe a Montar: acrescente essa checagem). Commit "Builder: Montar e Planta com posições independentes (Mover junto)".

### Task 3: Importar do Satisfactory Modeler

**Files:** Create `src/planner/model/sfmd.ts`, `tests/planner/sfmd.test.ts`; Modify `ui/MapPanel.tsx` (visão geral) e `ui/Header.tsx` (botão perto de Compartilhar), `model/factorystate.ts` (ação `{type:'import'; factory}` desfazível — ou reusar `load` com histórico), i18n.

**Interfaces:** `parseSfmd(text: string, data: GameData): { factory: Factory; report: SfmdReport } | { error: 'json' | 'format' }`; `SfmdReport = { blocks: number; links: number; skipped: { name: string; reason: 'unknown' | 'badLink' }[]; asExport: string[]; ignored: string[] }`.

- [ ] Ler os 4 exemplos em `docs/superpowers/research/2026-10-26-fase5/sfmd/` e o parser de `ChrisUllery/SatisfactoryFloorPlanner` (`tools/sfmd-parser/`) para confirmar `Max`/`ShowPpm`/`Machine`/`ClockSpeed`/`Capacity`; anote no relatório o que cada campo significa e de onde veio.
- [ ] Testes com as fixtures: `duo.sfmd` → 1 Miner de Iron Ore (180/min), 2 Iron Ingot, 3 Iron Rod com limites de máquinas 8/2/2 (ou o que o campo significar), ligações certas (`Inputs` no consumidor → `Link` produtor → consumidor); `simple pure ingot.sfmd`, `simple coal generator.sfmd` (gerador → bloco Saída, listado em `asExport`), `rocket fuel factory.sfmd` (Outpost/Parent/Title em `ignored`, pontos de curva nas ligações ignorados sem perder a ligação, `Max` "13 1/5" lido como 13,2); nome desconhecido → `skipped` e ligações dele puladas; índice inexistente → `badLink`; texto não-JSON → `{error:'json'}`; JSON sem `Data` → `{error:'format'}`.
- [ ] Mapeamento: receita por `name` em `game.json` (inclusive alternativas, nomes exatos do jogo); recurso minerável → Miner com `rate` = `Max` (sem `Max`: padrão); Water/Crude Oil/gás → extrator (`count` de `Max` se for contagem, senão calculado); Awesome Sink → sink; Dimensional Depot → Container; geradores e o que não é receita → Saída. Posições X/Y do Modeler → `montar` (escala ajustada para o tamanho dos cartões; grade de 8 m); `map` (Planta) pela proposta automática.
- [ ] UI: botão "Importar do Modeler" (input file escondido, `.sfmd,application/json`), confirmação "substitui a fábrica atual (Ctrl+Z desfaz)", resumo depois (quantos blocos/ligações, o que virou Saída, o que não foi reconhecido) num aviso/diálogo; erro de arquivo com mensagem clara.
- [ ] Commit "Builder: importar do Satisfactory Modeler (.sfmd)".

### Task 4: Tela da etapa refeita

**Files:** `ui/StageView.tsx`, `ui/StageDrawing.tsx`, `ui/StageLayout.tsx` (reorganizar à vontade), `src/planner/planner.css`, i18n.

**Interfaces:** Consumes `arrange`, `setLayout`, `layoutedit.ts` (inclui `setEven` da Task 1).

- [ ] Topo fixo: "← Voltar ao mapa" (primário), caminho clicável "Fábrica › Receita [› Fileira N | › Esteira de saída/entrada: Item]", máquinas/clock/receita editáveis ali, "? Como mexer" (abre a ajuda da área — Task 5 liga; até lá, a Legenda da etapa).
- [ ] Desenho em todo o espaço livre (sem rolagem da página), com zoom (−, +, Ctrl+rodinha/pinça), arrastar o fundo, "Enquadrar", abrindo enquadrado; arrastar fileira continua funcionando.
- [ ] Painel ~340 px sem rolagem em dois níveis: visão geral (cartões dos 3 modelos com miniatura, Inverter, dica, Voltar ao modelo) e ajuste (fileira ou esteira, com "← Voltar à visão geral"; esteira: Sai/Entra por, Fecha a cada + "Recomendado" + a conta explicada, **Dividir igual**, tier; fileira: Virar, Espelhar, mover, as esteiras dela com Juntar). Esc volta um nível.
- [ ] Resumo fixo embaixo do painel: saídas com taxas, entradas, Splitters, Mergers, Conveyor Lifts, área, "✓ Tudo dentro do limite" ou avisos com conserto.
- [ ] Barra flutuante sobre o desenho com as ações da seleção.
- [ ] Celular (390 px): painel vira folha de baixo; desenho ocupa o resto.
- [ ] Capturas `builder-etapa` (desktop e 390 px) olhadas; comparar com `etapa-v2.png`. Commit "Builder: tela da etapa refeita".

### Task 5: Tutorial e "Como mexer"

**Files:** Create `ui/Tour.tsx` (+ `model/tour.ts` com os passos, puro e testável); Modify `ui/FirstHint.tsx` (sai ou vira o gatilho), `ui/MapView.tsx`/`MapPanel.tsx`/`StageView.tsx` (atributos `data-tour="..."` nos alvos e botões "? Como mexer"), i18n, CSS.

**Interfaces:** `TourStep = { id: string; target: string /* seletor data-tour */; area: 'map' | 'panel' | 'stage'; title: string; body: string }`; `tourSteps(area?: TourStep['area']): TourStep[]`; lembrado em `localStorage` `sf-balancer:planner-tour` (`done` | `skipped`).

- [ ] Tutorial na primeira visita (no lugar da dica de hoje): balão ancorado no alvo com destaque recortado em volta, "Voltar", "Próximo", "Pular" em todo passo, "Concluir" no último; passos: criar bloco (duplo clique / Novo bloco), ligar arrastando a porta, chip da ligação, Balanço e faltas/sobras, painel e consertos, Montar × Planta (+ Mover junto), Camadas, abrir a etapa e montar fileiras, importar do Modeler, Compartilhar/desfazer.
- [ ] Alvo ausente na tela pula o passo; Esc = pular; foco preso no balão; movimento reduzido sem animação.
- [ ] Botão "Tutorial" perto da Legenda para rever; "? Como mexer" no mapa, no painel e na tela da etapa abre só os passos daquela área.
- [ ] Teste puro de `tourSteps` (áreas, ids únicos, chaves i18n existem nos 3 idiomas). Captura de um passo olhada. Commit "Builder: tutorial com Pular e Como mexer por área".

### Task 6: Smoke e docs

**Files:** `tests/visual/smoke.js`, `tests/visual/scenarios.js`, `AGENTS.md`, READMEs (3), `docs/backlog.md`.

- [ ] Smoke: o tutorial não atrapalha (pular no início); importar `duo.sfmd` (input file) cria os blocos e um Ctrl+Z volta; arrastar na Planta não mexe a Montar; tela da etapa: "← Voltar ao mapa" volta.
- [ ] Cenários visuais atualizados (`builder-etapa`, `builder-etapa-celular`, `builder-tutorial`).
- [ ] AGENTS.md (Builder: etapa nova, saídas espertas, vistas independentes, importar `.sfmd` — tirar de "Fora do escopo" —, tutorial; estrutura com `sfmd.ts`, `tour.ts`, `Tour.tsx`), READMEs nos 3 idiomas, backlog. Commit "Builder: fase 5 no smoke e nas docs".

## Ordem e paralelismo

Tasks 1, 2 e 3 em paralelo (arquivos diferentes; 2 e 3 em worktrees). Task 4 depois da 1. Task 5 depois da 4 (precisa dos alvos da etapa) — pode começar em paralelo à 4 num worktree marcando o mapa e o painel, e ligar a etapa no fim. Task 6 fecha.
