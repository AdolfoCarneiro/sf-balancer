# Fluxo em peças Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O fluxo do planejador desenha cada peça real (splitter ≤ 3 saídas, merger ≤ 3 entradas, Smart Splitter, loop, sink por esteira) da alternativa escolhida, com a taxa de cada esteira, sem mudar a lógica.

**Architecture:** Uma função pura nova (`flowNet`) transforma a alternativa avaliada (`alt.g`, `alt.view`, `alt.sim`) numa rede de peças, expandindo os nós ideais (loop de doadora, balancer N→M) com `splitTree`/`designFloors`. Outra função pura (`flowLayout`) põe a rede em colunas e escolhe o lado de cada porta. `flowSvg` desenha a partir do layout; o modo fluido continua com o desenho atual.

**Tech Stack:** JS ES modules, Vite, `node --test`, Playwright (linha de base visual).

**Spec:** `docs/superpowers/specs/2026-10-24-fluxo-em-pecas-design.md`

## Global Constraints

- A lógica de plano não muda: `computePlan`, `evaluatePlan`, `buildGraph`, `simulate`, designs, contagens e ranking ficam como estão. Os 84 testes atuais passam sem alterar asserções.
- Texto visível novo nos três idiomas (`src/i18n/pt.js`, `en.js`, `es.js`), via `t()`; o teste de chaves iguais nos três continua passando.
- Nomes de peças em inglês nos três idiomas (Splitter, Merger, Smart Splitter, Awesome Sink).
- Modo fluido (`p.fluid`): o desenho atual, sem mudança (byte a byte igual na linha de base visual).
- Código no estilo do repositório: comentários curtos em português, funções compactas, sem dependência nova.
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem push.

## Review Focus

1. **Loop de doadora limitado pela esteira** (`d.loop.beltOk` falso): a taxa interna precisa partir do que a simulação deixou entrar na árvore, não da taxa da doadora; o retorno não pode passar da esteira. Teste em Task 1.
2. **Destino alimentado por linha principal + parte da doadora + overflow de outro destino** (3 entradas num merger, ou cascata com 4+): a ordem e a contagem de mergers precisam bater com `connectMany`. Teste em Task 1.
3. **Balancer de blueprint do jogador**: vira caixa `bp`, não é expandido, e não quebra o layout. Teste em Task 1.
4. **Plano caso A sem peça nenhuma** (4 ligações diretas, 2 linhas sobrando): o desenho continua pequeno (sem rolagem na largura atual de 960). Teste em Task 3.
5. **Origem represada** (principal entrega menos que produz): o rótulo "represa x" e a barra da caixa de origem continuam. Teste em Task 3.

---

### Task 1: Rede de peças (`flowNet`)

**Files:**
- Create: `src/logic/flownet.js`
- Modify: `src/logic/index.js` (exportar `flowNet`)
- Test: `tests/logic.test.js` (testes novos no fim)

**Interfaces:**
- Consumes: alternativa avaliada de `computePlan(...).alternatives[i]` (`g`, `view`, `sim`, `bal`, `groups`, `pieces`, `dests`, `sources`); `splitTree` (`splitters.js`), `designFloors` (`layout3d.js`).
- Produces: `flowNet(alt) -> { nodes, belts, blocks }`
  - `nodes[i] = { id, t, ways?, line?, block? }`, `t ∈ 'src' | 'dst' | 's' | 'm' | 'ov' | 'bp' | 'sink' | 'extra'`; `ways` (2 ou 3) só em `'s'`; `line` em `src`/`dst` é a linha (`l.id` = id da linha); `block` = índice em `blocks` quando a peça é de uma divisão ou balancer.
  - `belts[i] = { id, a, b, rate, role }`, `a`/`b` ids de nó, `rate` itens/min, `role ∈ 'main' | 'donor' | 'over' | 'sink' | 'extra' | 'loop'`.
  - `blocks[i] = { key, kind, nodes }`: `key` é o valor de `data-open-bal` (`'g0'`, `'g1'`… por `view.groups`, `'plan'` para o balancer); `kind = 'group' | 'bal'`; `nodes` = ids das peças dele.
  - Uma origem por linha de origem, um `dst` por linha de destino (inclui `unfed`), um nó `sink` por esteira que vai pro sink, um `extra` por esteira que vai para linha extra. Origem parada (leftover com `edge === null`) entra como `src` sem esteira.

Regras de montagem (o resto é escolha do implementador):
- Nó do grafo `source` → `src`; `consumer` → `dst`; `splitter` → `s` com `ways` = nº de saídas; `merger` → `m`; `overflow` → `ov`. Aresta do grafo entre esses nós → uma esteira com `rate = alt.sim.flow[e]`.
- Grupo de doadora em modo loop (nó `balancer` com `maxIn` de `view.groups[gi].root`): vira `m` (retorno) → árvore `splitTree(gr.n)` → `p` folhas para os destinos e `n − p` folhas de volta ao `m` (`role 'loop'`). Taxas: `x = sim.flow[donorEdge]`; entrada da árvore `x·n/p`; cada folha `x/p`; cada retorno `x/p`.
- Balancer do plano (`view.bal`): os nós do grafo entre `view.bal.inEdges` e `outEdges`/`sinkEdges` são trocados pela montagem de `designFloors(view.bal.design)` (`s` com `ways`, `m`; `sink` vira nó `sink` próprio; `loop` vira esteira `role 'loop'`). Entradas e saídas ligam nas origens e destinos na ordem de `alt.bal.inputs` e `alt.feeds`. Taxas das esteiras de borda: as da simulação; internas: propagação ideal (splitter divide igual entre as saídas, merger soma) partindo das entradas, iterada até estabilizar (com loop converge). Se `designFloors` devolver `null` (blueprint), um nó `bp` com todas as entradas e saídas.
- Papéis: esteira que sai de uma doadora (e as da árvore dela até o merger do destino) `donor`; saída de `ov` que não é a principal `over` (ou `sink` se vai pro sink); para o sink `sink`; para linha extra `extra`; o resto `main`.

- [ ] **Step 1: Testes que falham** — no fim de `tests/logic.test.js`, um helper `checkNet(p, a)` e testes:

```js
// Rede de peças do fluxo: cada peça do jeito do jogo e as contas batem com a alternativa.
const checkNet = (p, a) => {
  const n = L.flowNet(a);
  const ins = id => n.belts.filter(b => b.b === id), outs = id => n.belts.filter(b => b.a === id);
  for (const q of n.nodes) {
    if (q.t === 'm') { assert.ok(ins(q.id).length >= 2 && ins(q.id).length <= 3, `merger ${q.id} entradas`); assert.equal(outs(q.id).length, 1); }
    if (q.t === 's') { assert.equal(ins(q.id).length, 1, `splitter ${q.id} entrada`); assert.equal(outs(q.id).length, q.ways); assert.ok(q.ways === 2 || q.ways === 3); }
    if (q.t === 'ov') { assert.equal(ins(q.id).length, 1); assert.ok(outs(q.id).length >= 1 && outs(q.id).length <= 3); }
    if (q.t === 'sink' || q.t === 'extra') assert.equal(ins(q.id).length, 1);
    if (['s', 'm', 'ov'].includes(q.t)) close(ins(q.id).reduce((s, b) => s + b.rate, 0), outs(q.id).reduce((s, b) => s + b.rate, 0), `conserva em ${q.t}${q.id}`);
  }
  const count = t => n.nodes.filter(q => q.t === t).length;
  assert.equal(count('s'), a.pieces.splitters, `splitters em ${a.key}`);
  assert.equal(count('m'), a.pieces.mergers, `mergers em ${a.key}`);
  assert.equal(count('ov'), a.pieces.smart, `smart em ${a.key}`);
  for (const q of n.nodes.filter(q => q.t === 'dst')) close(ins(q.id).reduce((s, b) => s + b.rate, 0), a.dests.get(q.line.id).got, `destino ${q.line.id}`);
  close(n.nodes.filter(q => q.t === 'sink').reduce((s, q) => s + ins(q.id)[0].rate, 0), a.sinkRate, 'sink');
  return n;
};
```

Testes que usam `checkNet` (cada um em `test(...)` próprio):
  - `rede de peças: caso 1, todas as alternativas` — `computePlan` do caso 1 do arquivo; `checkNet` em cada `p.alternatives`; e na alternativa com grupo `÷6` em modo sink, a rede tem 3 splitters no bloco `'g0'` e exatamente 1 nó `sink` ligado a uma folha desse bloco.
  - `rede de peças: caso 2 e caso 3` — os mesmos `computePlan` dos testes de caso 2 e 3 já existentes; `checkNet` em todas as alternativas.
  - `rede de peças: loop de doadora` — um plano cuja alternativa tem `groups[k].gr.mode === 'loop'` (caso 1 com `policy` que gere a alternativa de loop; o implementador acha a entrada nos testes existentes que já olham loop); o bloco tem 1 merger + `tree.splitters` splitters e `n − p` esteiras `role 'loop'`, cada uma com `x/p`.
  - `rede de peças: balancers` — para cada design existente que aparece em `designAlts` de algum plano de balancer dos testes (matriz, funil, loop, sink, borboleta), `checkNet` passa; e um plano com `blueprints` (como no teste de blueprint existente) tem 1 nó `bp` e 0 splitters/mergers no bloco `'plan'`.
  - `rede de peças: caso C com 5 linhas num destino` — origens de 120 alimentando 480 (Mk4) para gerar `merge` com 4+ entradas; o destino recebe de uma cascata em que nenhum merger tem mais de 3 entradas.

Se alguma contagem não bater por um design cuja montagem real (`designFloors`) tem peças diferentes de `alt.pieces`, **não mude a lógica**: deixe o teste daquele design marcado com `{ todo: 'contagem difere de alt.pieces' }` e descreva no relatório.

- [ ] **Step 2: Rodar e ver falhar** — `npm test`. Esperado: os testes novos falham com `L.flowNet is not a function`; os 84 antigos passam.
- [ ] **Step 3: Implementar `flowNet(alt)`** em `src/logic/flownet.js` e exportar em `src/logic/index.js`.
- [ ] **Step 4: Rodar e ver passar** — `npm test`. Esperado: todos passam (ou `todo` justificado).
- [ ] **Step 5: Commit** — `git add src/logic/flownet.js src/logic/index.js tests/logic.test.js && git commit -m "Fluxo: rede de peças da alternativa, igual no jogo"`

### Task 2: Layout do fluxo (`flowLayout`)

**Files:**
- Create: `src/logic/flowlayout.js`
- Modify: `src/logic/index.js`
- Test: `tests/logic.test.js`

**Interfaces:**
- Consumes: `flowNet(alt)` da Task 1.
- Produces: `flowLayout(net) -> { cols, nodes, belts }`
  - `nodes` = `Map(id -> { col, row })`: `col` inteiro (0 = origens; o maior = destinos), `row` número (pode ser fracionário) na ordem de cima para baixo.
  - `belts` = `Map(id -> { from, to })` com o lado de cada ponta: `from ∈ 'front' | 'left' | 'right'`, `to ∈ 'back' | 'left' | 'right'` (`left` = para cima na tela, `right` = para baixo).
  - `cols` = número de colunas.

Regras:
- Coluna = maior distância desde uma origem, sem contar esteiras `loop`; todos os `dst` na última coluna; `sink`/`extra` na coluna seguinte à da peça de onde saem; `src` na coluna 0.
- Destinos na ordem do id da linha; origens na ordem do primeiro destino que alimentam (como o `srcOrder` atual de `flow.js`); peças do meio por baricentro dos vizinhos (algumas passadas para frente e para trás), sem empilhar duas na mesma linha da mesma coluna.
- Portas pela regra do jogo (`PORT3D`): splitter entra por trás e sai pela frente e pelos lados; merger entra por trás e pelos lados e sai pela frente; Smart Splitter como splitter; nunca duas esteiras no mesmo lado de uma peça. Quem vai para cima sai/entra pela esquerda, para baixo pela direita, reto pela frente/trás. Retorno do loop: sai e entra por um lado livre.

- [ ] **Step 1: Testes que falham** — `layout do fluxo: colunas e portas` para todas as alternativas do caso 1 e do plano de balancer usado na Task 1:
  - para cada esteira não-`loop`, `col(b) > col(a)`;
  - todos os `dst` com a mesma `col`, a maior; destinos em ordem crescente de `row` pelo id da linha;
  - em cada peça, os lados usados pelas suas esteiras de saída são distintos, e os de entrada também; splitter entra só por `back`; merger sai só por `front`;
  - nenhuma dupla de nós com a mesma `col` e `row`.
- [ ] **Step 2: Rodar e ver falhar** — `npm test`; esperado `L.flowLayout is not a function`.
- [ ] **Step 3: Implementar** `flowLayout(net)` em `src/logic/flowlayout.js` e exportar.
- [ ] **Step 4: Rodar e ver passar** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -m "Fluxo: colunas e portas das peças"`

### Task 3: Desenho do fluxo em peças

**Files:**
- Modify: `src/ui/flow.js` (`flowSvg`: modo item desenha de `flowNet` + `flowLayout`; modo fluido mantém o código atual intacto, movido para uma função interna)
- Modify: `src/ui/render.js` (legenda: splitter e o merger novo; a área do fluxo rola de lado)
- Modify: `src/ui/balancerSvg.js` só se precisar exportar algo (ícones/cores já exportados: `SP_COLOR`, `MG_COLOR`, `PIECE_ICON`)
- Modify: `src/styles/main.css` (rolagem lateral do fluxo; contorno dos blocos)
- Modify: `src/i18n/pt.js`, `en.js`, `es.js` (chaves novas)
- Modify: `src/ui/events.js` só se o clique em `[data-open-bal]` precisar de ajuste
- Test: `tests/logic.test.js` (teste de string do SVG) e linha de base visual

**Interfaces:**
- Consumes: `flowNet`, `flowLayout`; as funções `belt`, `label`, `plateBox`, `curve` de `flowSvg` (reaproveitar).
- Produces: `flowSvg(p, alt)` com a mesma assinatura e o mesmo uso em `render.js`.

Requisitos do desenho:
- Caixas de origem e destino como hoje (a origem com a barra do que sai e "represa x"; o destino com "x de y" e a barra). Colunas de peças entre elas; largura = o necessário (mínimo 960, a de hoje); altura pelas linhas.
- Peças: splitter e merger com o desenho de `flatSvg` (quadrado arredondado, splitter `SP_COLOR` com `ways`, merger `MG_COLOR` com a seta); Smart Splitter com o `smart` de hoje; blueprint como caixa `N→M` com "blueprint"; sink e linha extra como toco com rótulo (`sink` / chave i18n da linha extra) e a taxa. Cada peça leva `data-piece="<t>"`.
- Esteiras com `belt()` de hoje (cor pelo `role`: `main` → `--flow`, `donor` → `--donor`, `over` → `--ficsit`, `sink` → `--sink`, `extra` → `--ink-dim`, `loop` tracejada `--ink-dim`), saindo e entrando pelos lados de `flowLayout` (curva como em `flatSvg`). Toda esteira tem `<title>` com a taxa; visíveis: saída das origens, entrada dos destinos, partes da doadora, esteiras de sink.
- Blocos: contorno tracejado discreto em volta das peças de cada `block`, com o nome (`÷N`, `÷N ↺`, ou `designName(d)` com `N→M`) e `class="balblock" data-open-bal="<key>" tabindex="0" role="button"` + `aria-label` (chave `blkAria` existente). O clique abre o diálogo como hoje.
- `render.js`: o `<svg>` fica num contêiner com `overflow-x: auto`; legenda com `PIECE_ICON.splitter('2/3')` ou equivalente e `PIECE_ICON.merger`, textos i18n novos (`lgSplitter`, e `lgMerger` passa a usar o ícone novo). Modo fluido: legenda e desenho como hoje.

- [ ] **Step 1: Teste de string que falha** — `fluxo desenhado em peças` em `tests/logic.test.js`: importa `flowSvg` de `../src/ui/flow.js`; para cada alternativa do caso 1 e do plano de balancer, `svg = flowSvg(p, a)`:
  - `svg` não contém `NaN` nem `undefined`;
  - nº de `data-piece="s"` = `a.pieces.splitters`, de `data-piece="m"` = `a.pieces.mergers`, de `data-piece="ov"` = `a.pieces.smart`;
  - cada `block` tem um `data-open-bal="<key>"`;
  - caso 2 (alternativa direta): `viewBox` com largura 960.
  - modo fluido: `flowSvg(pf, af)` igual ao que a função antiga devolvia (comparar com uma cópia da saída gravada antes da mudança, ou checar que contém `Junction` e nenhum `data-piece`).
- [ ] **Step 2: Rodar e ver falhar** — `npm test`.
- [ ] **Step 3: Implementar** o desenho, a legenda, o CSS e as chaves i18n.
- [ ] **Step 4: Rodar** — `npm test` (todos passam) e `npm run build`.
- [ ] **Step 5: Linha de base visual** — no checkout do `master` (`/home/adolfocarneiro/source/repos/sf-balancer`), `npm run build && npx vite preview --port 4174` e `npm run visual:capture -- http://localhost:4174 <scratch>/antes`; aqui, o mesmo na porta 4175 para `<scratch>/depois`; `npm run visual:compare -- <scratch>/antes <scratch>/depois`. Esperado: só mudam os cenários com o fluxo do modo item (`padrao`, `caso2-destino-440`, `caso3-6-por-linha` e os de celular/rotas que mostram o fluxo); `modo-fluido` e todos os `lib-*` iguais. Abrir as PNGs que mudaram e conferir: nenhum merger com mais de 3 entradas, nenhum splitter com mais de 3 saídas, rótulos legíveis, nada cortado. Registrar no relatório os caminhos das PNGs.
- [ ] **Step 6: Commit** — `git commit -m "Fluxo: desenha cada peça como no jogo"`

### Task 4: Docs

**Files:**
- Modify: `README.md`, `README.pt-BR.md`, `README.es.md` (a parte que descreve o fluxo/diagrama, se houver), `AGENTS.md` (estrutura: `flownet.js`, `flowlayout.js`)

- [ ] **Step 1:** Atualizar a menção ao diagrama do fluxo nos três READMEs (peça por peça, como no jogo) e a lista de módulos de `src/logic` no `AGENTS.md`.
- [ ] **Step 2:** `npm test` passa.
- [ ] **Step 3: Commit** — `git commit -m "Docs: fluxo em peças"`
