# Fluxo em peças, igual no jogo

## Por quê

O fluxo do planejador (o desenho principal, à direita das alternativas) mostra a ligação entre as linhas de forma
abstrata: um losango só de merger recebendo quantas esteiras forem (5, 6…), um bloco `÷6` soltando 6 esteiras de uma
vez, um bloco `6→5` no lugar do balancer. No jogo nada disso existe: merger tem até 3 entradas, splitter até 3 saídas.
O Adolfo quer olhar o fluxo e montar no jogo do jeito que está desenhado, peça por peça.

Isto vem antes da "Planta 2D definitiva" do backlog (o planner próprio): é o mesmo desenho, só que fiel às peças.

## O que muda

O fluxo (`flowSvg` em `src/ui/flow.js`) passa a desenhar **cada peça real** da alternativa escolhida, ligada pelas
esteiras de verdade, com a taxa de cada esteira:

- **Splitter:** 1 entrada, até 3 saídas, com em quantas divide (2 ou 3). Uma divisão `÷6` vira a árvore 2 × 3
  (1 splitter em 2, 2 splitters em 3), e a parte que vai pro sink sai da folha certa da árvore.
- **Merger:** até 3 entradas e 1 saída. Juntar mais de 3 esteiras aparece como a cascata que a lógica já monta
  (`connectMany`: o primeiro pega 3, cada um seguinte pega o anterior + 2).
- **Divisão com loop** (`÷5 ↺`): o merger do retorno na entrada, a árvore (÷6) e a esteira de volta da folha extra
  para esse merger, desenhada (tracejada, como na planta da biblioteca).
- **Balancer N→M:** todas as peças no próprio fluxo, nos designs que já existem (matriz, funil, com loop, com sink,
  matriz com loop dividido, borboleta e borboleta com loop). Mesma montagem que `designFloors` já descreve.
- **Smart Splitter (Overflow):** como peça, onde a lógica já usa (saída de linha drenada pro sink, overflow de um
  destino para o sink ou para outro destino).
- **Blueprint do jogador:** continua uma caixa `N→M blueprint`: a ferramenta não conhece o que tem dentro; no jogo é
  colar o blueprint, então a caixa é fiel.
- **Sink e linha extra:** cada esteira que vai pro sink termina num Awesome Sink próprio (o Awesome Sink tem uma
  entrada), com a taxa; o mesmo para "linha extra". *(Decisão minha: no lugar da caixa única "Awesome Sink" com a
  soma; a soma continua no quadro de balanço.)*

## O que não muda

- **A lógica.** Nenhuma peça nova, nenhum design novo, nenhuma mudança de contagem, de ranking ou de simulação.
  Priority Merger fica de fora (o Adolfo decidiu: "só desenha certinho o que já tem").
- **A contagem bate com o desenho:** o número de splitters, mergers e Smart Splitters desenhados é igual ao de
  `alt.pieces` (e ao da tabela de peças). Isso vira teste.
- **Modo fluido:** o cano coletor (Pipeline Junction) continua como está hoje. *(Decisão minha: a junction não divide
  igual e o desenho atual já diz "N × Junction"; fica para quando o modo fluido pedir.)*
- As cores e o jeito de desenhar esteira: principal, doadora, redistribuída (overflow), sink, represado; esteira
  animada na velocidade do tier; as caixas de origem (com a barra do que sai/represa) e de destino (com "x de y").
- Os três idiomas em tudo que for texto novo (legenda, rótulos, `aria-label`, `<title>`).

## Como deve ficar

- **Fluxo da esquerda para a direita:** origens à esquerda, destinos à direita, peças em colunas no meio pela ordem em
  que o item passa (profundidade no grafo). Cada destino continua alinhado, o mais possível, com o que o alimenta.
- **Portas como no jogo:** splitter entra por trás e sai pela frente e pelos lados; merger entra por trás e pelos
  lados e sai pela frente; nunca duas esteiras no mesmo lado de uma peça. É a mesma regra da planta da biblioteca
  (`PORT3D`, `flatSvg`), na tela com a esquerda da peça para cima.
- **Ícones das peças:** os da planta da biblioteca (splitter laranja com o número, merger verde-água), para o jogador
  reconhecer a mesma peça nos dois lugares; Smart Splitter com o `»`. A legenda do fluxo ganha splitter e troca o
  losango pelo merger novo. *(Decisão minha.)*
- **Taxas:** toda esteira tem a taxa visível ou num `<title>` (passando o mouse). Sempre visíveis: saída das origens
  (com o "represa x" de hoje), entrada de cada destino, cada parte da doadora, cada esteira pro sink.
- **Tamanho:** o desenho cresce o quanto precisar; quando passar da largura da área, rola de lado (o Adolfo
  confirmou). Plano simples (caso A, 4 ligações diretas) continua pequeno e sem rolagem.
- **Detalhe do balancer:** o diálogo que hoje abre clicando no bloco continua existindo. As peças de um balancer
  ou de uma divisão ficam dentro de um contorno discreto com o nome (`÷6`, `6→5 matriz`…), e clicar no contorno
  abre o mesmo diálogo (`data-open-bal`). *(Decisão minha: mantém o caminho para o passo a passo.)*
- Celular: a rolagem lateral resolve; nada de espremer.

## Fluxos das esteiras

As taxas vêm da simulação que já existe (`a.sim.flow`, uma por aresta do grafo `a.g`). Onde o grafo resume várias
peças num nó só, as taxas internas saem da própria montagem:

- Loop de doadora (`gr.mode === 'loop'`, nó `balancer` com `maxIn`): entra `s` da doadora; a árvore recebe
  `s · n / p`; cada folha leva `s / p`; o retorno leva `s · (n − p) / p`. Com a esteira do loop no limite, a doadora
  entra menos — usar o que a simulação deu na aresta de entrada como `s`.
- Balancer com loop (matriz/funil com loop, matriz com loop dividido, borboleta com loop): o grafo usa um nó ideal;
  as esteiras internas saem das regras do design (os `segments` de `balancerDesign` já trazem as taxas por trecho;
  a borboleta divide igual por faixa a cada rodada).
- Fora isso, uma aresta do grafo = uma esteira do desenho.

## Arquitetura sugerida (o construtor pode ajustar)

1. **Lógica pura nova** (sem DOM, testável): a partir da alternativa avaliada (`plan`, `g`, `view`, `sim`), montar a
   **rede de peças**: nós `src`, `dst`, `s` (com `ways`), `m`, `ov` (Smart Splitter), `bp` (blueprint), `sink`,
   `extra`; esteiras com origem, destino, taxa e papel (principal, doadora, overflow, sink, loop). Os nós do grafo
   que já são peças passam direto; os nós ideais (`balancer`) são expandidos na montagem real. Cada balancer ou
   divisão guarda a lista das suas peças (para o contorno e o clique).
2. **Layout puro:** colunas por profundidade, ordem dentro da coluna para cruzar pouco e alinhar com os destinos,
   lado de cada porta pela regra do jogo. Pode reaproveitar a lógica de lados de `layout3d` (modo `flat`) se couber;
   se não couber sem distorcer, uma versão própria.
3. **Desenho** em `flow.js`, com as funções de esteira/rótulo que já existem.

## Testes

- Para os três casos do `AGENTS.md`, para um caso C (5+ linhas num destino), um plano com balancer de cada tipo e
  um com loop de doadora:
  - todo merger tem 1–3 entradas e 1 saída; todo splitter 1 entrada e 2–3 saídas; Smart Splitter 1 entrada e até
    3 saídas;
  - contagem de splitters, mergers e Smart Splitters da rede = `alt.pieces`; se algum design não bater, o desenho
    segue a montagem real e a diferença é anotada para o Adolfo decidir (a lógica não muda sem ele);
  - em cada peça, entra = sai (com loop, contando o retorno); o que chega em cada destino = `a.dests`.
- Linha de base visual: as capturas do fluxo mudam de propósito; as da biblioteca e das outras seções ficam iguais.
  Atualizar a linha de base só das que mudaram, depois de olhar.

## Fora do escopo

Priority Merger e qualquer peça ou design novo; modo fluido; posição física em metros (isso é a Planta 2D
definitiva); mudar o 3D.
