# Visual da aba 3D e ligações como no jogo: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esteiras da aba 3D ligadas nas portas certas (uma por face, como no jogo) e a cena redesenhada no visual aprovado, com setas no topo, isolar caminho e botões Seguir.

**Architecture:** `layout3d` ganha um roteador por portas que trabalha num referencial com o fluxo em `+x` (Andares gira a cena, Torres não) e devolve, por esteira, a face usada na origem e no destino. `mount3d` é reescrita em cima desse resultado. Tudo no `index.html`, lógica testada em `tests/logic.test.js`.

**Tech Stack:** HTML/JS sem build, Three.js 0.160.0 (jsDelivr, sob demanda), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-19-visual-3d-portas-design.md` (protótipo de referência ao lado: `2026-10-19-visual-3d-portas-prototipo.html`).

## Global Constraints

- Um único `index.html`, sem build; Three.js 0.160.0 por `three` e `three/addons/` do importmap atual (CSP já libera jsDelivr).
- Todo texto novo nos três idiomas no `I18N` (`pt`, `en`, `es`), via `t()`; nomes de peça em inglês (Merger, Splitter, lift…).
- Rótulos: entradas `labels.ins` (E1/O1/S1 conforme tela e idioma), saídas `labels.outs`.
- Portas (referencial do fluxo `+x`): splitter entra `back`, sai `front|left|right`; merger entra `back|left|right`, sai `front`; `in` sai `front`; `out` e `sink` entram `back`. Uma esteira por face. `right` = `+z'`, `left` = `-z'`.
- Andares: referencial `x' = -z`, `y' = y`, `z' = x` (volta: `x = z'`, `z = -x'`). Torres: identidade.
- Esteira na altura do centro da peça (`y` da peça); placas `in`/`out` com centro nessa mesma altura.
- `prefers-reduced-motion`: holograma sem pulso, itens parados.
- READMEs (`README.md`, `README.pt-BR.md`, `README.es.md`) atualizados na frase do 3D.

## Review Focus

- 9→9 matriz (153 esteiras) e 9→2/8→3 com loop: `layout3d` precisa continuar rápido (< 400 ms por montagem) e a suíte inteira abaixo de ~30 s.
- Loop: o retorno entra no merger do loop por uma face livre, nunca numa face já ocupada.
- Sink deslocado não pode cair em cima de outra peça nem fora dos limites usados pelo enquadramento.
- Toque no celular: tocar numa peça isola o caminho; arrastar continua girando a câmera sem isolar.
- Trocar de idioma com a aba 3D aberta remonta os botões Seguir com os rótulos do idioma (S1 em inglês, O1 em pt/es).

---

### Task 1: Portas e roteador no `layout3d`

**Files:**
- Modify: `index.html` (`layout3d`: trecho da colocação do sink e do roteamento das esteiras; constante `L3D`)
- Test: `tests/logic.test.js` (seção "Vista 3D")

**Interfaces:**
- Produces: `layout3d(d, mode)` mantém o retorno de hoje `{ mode, pieces, belts, lifts, steps, bounds }` e acrescenta em cada esteira `fromSide`, `toSide` (`'back'|'front'|'left'|'right'`). `pieces[i].pos` das placas `in`/`out` fica na altura das peças em que ligam (como hoje); o sink passa a ficar encostado na face livre da peça de origem. Também exporta `PORT3D = { s: { in: ['back'], out: ['front','left','right'] }, m: { in: ['back','left','right'], out: ['front'] }, in: { in: [], out: ['front'] }, out: { in: ['back'], out: [] }, sink: { in: ['back'], out: [] } }` e `L3D.half` (as meias medidas por tipo: `s`, `m`, `sink` `[1.8, 1.2, 1.8]`; `in`, `out` `[2.2, 0.4, 1.8]`).
- `belt.pts[0]` = centro da face `fromSide` da peça de origem; `pts[1]` = 1,2 m para fora dessa face; `pts[last]` = centro da face `toSide` do destino; `pts[last-1]` = 1,2 m para fora dela.

- [ ] **Step 1: Testes que falham**

`test('3D: portas como no jogo, uma esteira por face', …)`: para todo N, M de 2 a 9, todo candidato com peças, nas duas montagens:
- cada `fromSide` ∈ `PORT3D[tipo da origem].out`, cada `toSide` ∈ `PORT3D[tipo do destino].in`;
- nenhuma peça tem duas esteiras na mesma face (contando entradas e saídas juntas);
- `pts[0]` está no centro da face (a face é medida no referencial do fluxo e convertida: em Torres a frente é `+x`; em Andares é `-z`) e o trecho `pts[0]→pts[1]` é perpendicular a ela, com 1,2 m; o mesmo para o fim.

`test('3D: sink encostado na peça, sem sobrepor', …)`: em `balancerDesign('matrix-sink', 2, 5, [100], 1e9)` e `butterflyDesign(9, 2, [100], 1e9, 'butterfly-sink')` (o que existir em `BF_KINDS`), nas duas montagens: cada sink fica a menos de 6 m da peça de origem, a esteira dele sai por uma face lateral ou da frente e nenhuma caixa de peça se sobrepõe a outra.

`test('3D: montagem cheia continua rápida', …)`: `layout3d(balancerDesign('matrix', 9, 9, [100], 1e9), m)` em menos de 400 ms para cada modo.

Os testes de hoje ("não atravessa peça e não corre por cima", lifts, enquadramento, todos os formatos) continuam e precisam passar.

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/logic.test.js` → falha em `fromSide` indefinido.

- [ ] **Step 3: Implementar**

No `layout3d`, depois das posições (o código das posições das peças fica como está):
1. Converter posições para o referencial do fluxo.
2. **Lados:** splitters e placas primeiro; mergers depois. Regra numa função só, `pickSides`:
   - Splitter/merger com 1 ligação no conjunto: lado reto (`front` para saída, `back` para entrada).
   - Splitter com 2 saídas: a que vai para a mesma altura fica reta; a outra vai para `left` se o destino está mais alto, `right` se mais baixo; nenhuma na mesma altura: a mais baixa (desempate pela coordenada `z'`) `right`, a outra `left`. Com 3: ordenadas por (altura, `z'`) → `right`, `front`, `left`.
   - Merger: cada entrada vinda de face lateral da origem prefere o mesmo lado, se livre (as mais próximas em altura primeiro); a que vem de uma `front` (ou da mesma altura) fica com `back`; o resto pega o que sobrou na ordem `back`, `left`, `right`.
   - Sink: pega a primeira face livre do splitter de origem, na ordem `left`, `right` em Torres e `front`, `left`, `right` em Andares; a posição do sink é a face + 1,2 m de toco + 1,8 m (meia peça).
3. **Roteador:** reserva o toco (porta → 1,2 m) de toda esteira antes de rotear. Caminho ortogonal: porta → toco → (sai andando em `z` até a faixa `z_l`, ou em `x` até a coluna `x_l` e depois em `z`) → coluna `x_l` → muda de altura → (chega andando em `x` até o toco do destino, ou em `z` na coluna `x_l`) → toco → porta. Quatro combinações × candidatos:
   - `z_l`: `z'` da origem e do destino, e para cada `z'` de peça dentro de ±14 m delas: o próprio valor e ±(3 + 1,2·k), k = 0..9;
   - `x_l`: de cada vão entre colunas de peças em `x'` (de `x_i + 2,4` até `x_{i+1} − 2,4`, passo 0,6) dentro de ±8 m da origem/destino; o `x'` da origem e do destino só quando não muda de altura (lift colado na coluna esbarra nas portas de cima e de baixo).
   - Loop: sobe até `topo + 1,5·n` numa coluna perto da origem, anda por cima até uma coluna perto do destino e desce.
   - Colisão: trechos como caixas alinhadas; peça (menos as das pontas no primeiro e no último trecho) a menos de 0,25 m, ou trecho de outra esteira a menos de 0,9 m, conta 1. Candidatas em ordem de comprimento (+0,6 por ponto); fica a primeira sem colisão, ou a de menos colisões.
   - Hash espacial (célula de 4 m) para as caixas, para 9→9 caber no tempo.
   - Ordem: esteiras mais curtas primeiro. Se sobrar colisão, até 3 novas passadas com as que colidiram no começo da fila; fica a passada com menos colisões.
4. Converter os pontos de volta. `lift`, `step`, `steps`, `bounds` como hoje (bounds com os sinks novos).

- [ ] **Step 4: Rodar** — `node --test tests/logic.test.js` → todos passam; anotar a duração.

- [ ] **Step 5: Commit** — `git commit -m "3D: portas como no jogo, uma esteira por face"`

### Task 2: Cena nova no `mount3d`

**Files:**
- Modify: `index.html` (`mount3d`, CSS da legenda `.plegend i.*`, legenda montada em `mountPonder`)

**Interfaces:**
- Consumes: `layout3d` da Task 1 (`fromSide`, `toSide`, `PORT3D`, `L3D.half`).
- Produces: `mount3d(stage, d, labels, lay)` continua devolvendo `{ setStep, recenter, dispose }` e ganha `focus(id | null)`, que isola o caminho da peça `id` (placa `in`: tudo a jusante; `out`: tudo a montante; outra peça: ela e as esteiras ligadas). A cena chama `opts.onFocus(id | null)` quando o mouse ou toque muda o foco fixado.

- [ ] **Step 1: Implementar a cena** seguindo o protótipo:
  - Fundo `#081626`; piso: textura com a grade de 4 m (fina) e 8 m (grossa) sobre `#0f3150`, sumindo nas bordas (gradiente radial), `MeshBasicMaterial` transparente, sem sombra.
  - Peças: `RoundedBoxGeometry` (raio 0,06) com `MeshLambertMaterial`: splitter `#e8863a`, merger `#3bb3a8`, sink `var(--sink)`, entradas na cor da faixa, saídas `var(--ok)`; rótulos das placas em pílula como no protótipo.
  - Topo de splitter/merger: canvas com setas nas faces usadas, na cor da esteira, com contorno escuro; saída do centro para fora, entrada de fora para o centro; faces livres não aparecem. Marca `1→N`/`N→1` na face da frente e numa lateral.
  - Esteira: `TubeGeometry` raio 0,2 (cantos arredondados 0,6) `MeshBasicMaterial` na cor da faixa (`inColor(inp)`, `var(--ink)` sem faixa, loop `var(--ink-dim)`), contorno: tubo raio 0,36 `#03080f` com `side: BackSide`. Sem brilho.
  - Portas: gola `#03080f` 0,16 × 1 × 1 no centro da face; cone (r 0,5, h 1) na saída apontando para fora; anel (toro 0,46/0,12) na entrada.
  - Itens: `InstancedMesh` de esferas r 0,24 `MeshBasicMaterial`, cor da esteira clareada 60% para branco, um a cada ~2,2 m, 3,4 m/s; só nas esteiras visíveis; parados com reduced-motion.
  - Passo atual: materiais translúcidos, opacidade `0,3 + 0,45·k` com `k` = pulso de 1,15 s, cor puxada para `var(--holo)`; reduced-motion fixa `k = 0,5`.
  - Câmera: a de hoje (`fitDistance`, direção `(0.75, 0.75, 1.1)`), sem chão opaco embaixo.
- [ ] **Step 2: Legenda** de `mountPonder` no 3D: troca `sp3`/`mg3`/`lifti` por splitter, merger, seta = saída, anel = entrada (chaves novas `lgPortOut`, `lgPortIn`); remove CSS morto.
- [ ] **Step 3: Conferir no navegador** (servidor local + screenshot headless) Torres e Andares, 4→4 matriz e butterfly, 2→5 com sink e com loop; testes continuam passando.
- [ ] **Step 4: Commit** — `git commit -m "3D: cena nova, tubo neon, portas e setas no topo"`

### Task 3: Isolar caminho e botões Seguir

**Files:**
- Modify: `index.html` (`mount3d`, `mountPonder`, `I18N` pt/en/es, CSS)
- Test: `tests/logic.test.js` (idiomas)

**Interfaces:**
- Consumes: `focus(id)` / `opts.onFocus` da Task 2.

- [ ] **Step 1: Teste** em `idiomas: textos do 3D`: `t('follow3d')`, `t('hint3dFocus')`, `t('tip3dTop')`, `t('lgPortOut')`, `t('lgPortIn')`, `t('followAria', 'E1')` existem nos três idiomas (o teste de chaves iguais já cobre o resto).
- [ ] **Step 2: Implementar**: raycast em `pointermove` (sem botão apertado) e `pointerup` sem arrasto (< 5 px) para fixar; clique no vazio solta; fora do foco, opacidade 0,1 e itens escondidos. Linha "Seguir" abaixo da cena com um botão por entrada e saída (`aria-pressed`, `aria-label` = `t('followAria', rótulo)`); dica fixa no canto da cena (`hint3dFocus`); `tip('tip3dTop')` ao lado da legenda explicando as setas do topo.
- [ ] **Step 3: Rodar** `node --test tests/logic.test.js` e conferir no navegador (hover, clique, Seguir, troca de idioma).
- [ ] **Step 4: Commit** — `git commit -m "3D: isolar caminho e seguir entrada ou saída"`

### Task 4: READMEs e fechamento

**Files:**
- Modify: `README.md`, `README.pt-BR.md`, `README.es.md`

- [ ] **Step 1:** Atualizar a frase do 3D nos três: ligações como no jogo (uma esteira por face, setas no topo), passar o mouse ou Seguir para isolar o caminho.
- [ ] **Step 2:** `node --test tests/logic.test.js` verde; screenshot final de Torres e Andares.
- [ ] **Step 3: Commit** — `git commit -m "README: 3D com portas e seguir caminho"`
