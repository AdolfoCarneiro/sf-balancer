# Planner 2D — fase 2: o mapa

Data: 2026-10-25. Continua o spec `docs/superpowers/specs/2026-10-25-planner-2d-design.md` (tudo de lá vale aqui). Tela de referência: board `Mapa` do canvas https://claude.ai/artifact/4zd8tDeQc9GFKhL7nK5w99. Branch: `planner-2d-fase2`, a partir do `planner-2d` (fase 1 aprovada, ainda fora da `master`).

## Intenção

Com a cadeia montada (fase 1), quero ver **a fábrica no chão antes de começar a construir**. Calculo a rede como no Modeler ("tantas máquinas, só tenho Mk4"), e o mapa mostra cada etapa com as fileiras e as máquinas no tamanho real, o meio de cada ligação também no tamanho real (balancer, Splitters, Mergers, sink), e eu arrasto os blocos para onde vão ficar no jogo. É o Modeler mostrando espaço real.

Uso: fica aberto do lado do jogo como referência enquanto construo, e antes disso serve para decidir tamanho do terreno e posição de cada etapa.

Sucesso: pego a cadeia de exemplo (ferro puro → aço → vigas e canos), abro o mapa, vejo quanto espaço cada parte ocupa em fundações de 8 m, arrumo os blocos, e consigo construir no jogo seguindo o mapa sem fazer conta por fora.

## Metas

- Cada etapa vira um **bloco em escala**: fileiras de máquinas com o tamanho real do prédio, as esteiras de entrada e saída de cada fileira e os Splitters/Mergers dos manifolds.
- Cada ligação mostra o **meio em escala** entre os blocos que liga: as peças que o meio já calcula (Splitters, Mergers, balancer com loop, sink, linha extra), no tamanho real, ocupando o espaço real. A ferramenta mostra se liga direto, se precisa de balancer e se tem excesso indo pro sink.
- A ferramenta **propõe** a posição dos blocos; eu **arrasto**, giro 90°, e os blocos prendem na grade de fundações de 8 m. Arrastar um bloco leva junto as esteiras e o meio. Botão para propor de novo.
- Medidas visíveis: tamanho de cada bloco e do meio em metros e em fundações, e a área total da fábrica.
- **Otimizado desde o começo** (decisão do dono): ver "Desempenho".

## Não-metas

- Andares. Quem faz andar logístico arrasta os cruzamentos para onde não atrapalham e monta embaixo no jogo (decisão do dono). Andares ficam na fase 4.
- Portas reais dos prédios (fase 4). Até lá vale a convenção da fase 1: entradas de um lado, saída do outro, e o desenho é marcado como estimativa onde depende disso.
- Roteamento automático de esteiras, solver de posição, mineradoras e nós de recurso, mapa do mundo, terreno.
- Resolver sobreposição ou cruzamento sozinho. A ferramenta **avisa**; quem resolve sou eu.

## Anti-metas

- Tamanho inventado. Máquina ou peça desenhada fora da escala real derruba o propósito ("o que importa é o mapa funcionando com as máquinas e os tamanhos serem reais").
- Mapa que trava. Fábrica grande tem que continuar fluida ao arrastar e dar zoom.
- Piorar a fase 1 ou a ferramenta atual.

## Medidas (confirmadas pelo dono)

- Prédios: `scripts/building-sizes.json` da fase 1 (largura × comprimento, em metros).
- Splitter, Merger, Smart Splitter, Programmable Splitter: 4 × 4 m.
- Awesome Sink: 16 × 13 m.
- Esteira: 1 m de largura.
- Vão mínimo entre duas peças ligadas por esteira: 1 a 2 m. Padrão **2 m**, editável (decisão minha).
- Fundação: 8 × 8 m, a grade do mapa.

- Fluido (estimativa combinada com o dono, a conferir no jogo): cano 1 m de largura, como a esteira; Pipeline Junction 2 × 2 m; Valve 2 × 2 m. Todo trecho fluido aparece marcado como estimativa.

Outra medida que não estiver aqui entra como pergunta ao dono antes de ser usada, não como chute.

## Como funciona

### Bloco da etapa

- Molde fixo (decisão minha, editável depois): fileiras paralelas; em cada fileira as máquinas lado a lado ao longo da esteira, pela largura do prédio; atrás das máquinas as faixas de entrada (uma por item, com o Splitter de cada máquina), na frente a faixa de saída (com o Merger de cada máquina). Cada faixa ocupa a largura da peça (4 m) quando tem peça, 1 m quando é só esteira (fluido ou fileira de 1 máquina).
- Vão entre fileiras e entre máquinas: padrão 0 m extra (as faixas já separam), editáveis no bloco (decisão minha; o board `Mapa` desenha 4 m, mas lá as faixas não tinham a largura das peças).
- **Lado das entradas** (do board `Mapa`, "Entradas chegam por"): cada bloco escolhe por qual lado chegam as entradas (esquerda, cima, direita, baixo); a saída fica no lado oposto. Todas as entradas do bloco chegam pelo mesmo lado nesta fase (decisão minha; uma entrada por lado, como o Coal por baixo no board, fica para a fase 4 com as portas reais). Girar o bloco gira o lado junto.
- O tamanho do bloco sai do molde e é recalculado quando a etapa muda (máquinas, por linha, receita). O bloco mantém o canto onde eu o deixei; se passar a sobrepor outro, aparece aviso.
- O bloco mostra nome da receita, prédio, máquinas, fileiras e a medida (m e fundações), como no board `Mapa`.

### Meio em escala

- **Montagem escolhida por meio (decisão do dono).** O painel do meio lista as montagens que o plano oferece (ex.: balancer com loop ou dividir em 6 e mandar 1 parte pro sink) e eu escolho uma; padrão, a primeira. A escolha fica salva com a cadeia (localStorage e `#p=`, validada na leitura), entra na chave do cache do meio e é a que o mapa desenha. "Abrir o meio completo" continua levando ao detalhe.
- Para cada ligação (ou grupo de ligações do mesmo item, como na fase 1), a montagem escolhida vira a rede de peças com `flowNet` e é arrumada com `flowLayout` (colunas e linhas), as mesmas funções que desenham o fluxo na ferramenta atual. O mapa troca a unidade abstrata pelas medidas reais: peça 4 × 4 m, vão de 2 m, esteira 1 m.
- **Onde o meio fica (decisão minha):** colado no lado de saída do bloco de origem, a um vão de 2 m, virado na direção da saída. Ele anda com o bloco de origem e não é arrastável por conta própria nesta fase. Das saídas do meio até as entradas de cada destino, as esteiras andam em ângulo reto (como se constrói no jogo), com no máximo duas curvas. Se o destino estiver atrás da origem, perto demais, ou o meio sobrepuser outro bloco, o desenho continua e aparece o aviso de sobreposição ou cruzamento; quem resolve sou eu, arrastando.
- Divisões e junções (um meio com várias origens ou destinos): o meio fica colado na primeira origem, e as esteiras das outras origens e de cada destino chegam até ele em ângulo reto.
- Meio que liga direto (caso A sem peças) é só esteira.
- **Balancer em tamanho real (decisão do dono).** Sempre as peças de verdade no tamanho real, nunca a caixa do Blueprint Designer. Montagem que a ferramenta atual põe em blueprint (`bp`) é aberta nas peças que a compõem. A borboleta com loop em andares (`designFloors`) ocupa no chão a área do maior andar, com o rótulo "N andares" (decisão minha, já que o mapa não tem andares).
- **Sobra num sink só (decisão do dono).** As esteiras de sobra do meio se juntam por Mergers (cascata de 3 entradas) numa esteira que vai para **um** Awesome Sink. Se a sobra passar da capacidade da esteira da ligação, abre mais um sink para cada esteira cheia (o mínimo de sinks que comporta). A esteira só entra no sink por uma entrada, então o número de entradas do sink não importa aqui.
- Meio marcado como grande demais (mais de 120 linhas por lado, regra da fase 1): aparece como faixa com o aviso, sem peças.
- Meio fluido: canos retos entre os blocos, marcado como estimativa (ver "Medidas").
- Entradas brutas (minério, água, carvão): esteiras que chegam na borda do bloco com o nome do item e a taxa, sem mineradora.

### Posição

- Primeira abertura: blocos em sequência na ordem da cadeia (da esquerda para a direita, como o grafo da fase 1), com o meio entre cada par, ligados por esteiras em ângulo reto. Divisões e junções empilham os blocos irmãos.
- Arrastar prende na grade de 8 m. Girar 90° troca largura e comprimento do bloco (e os lados das esteiras junto).
- Posição e giro de cada bloco ficam salvos com a cadeia (localStorage e link `#p=`), validados na leitura como o resto. Cadeia sem posição de mapa ganha a proposta automática.
- "Propor de novo" refaz as posições. Arrastar, girar, trocar o lado das entradas e propor de novo entram no desfazer.
- Posição no mapa é separada da posição no grafo (`Stage.pos` continua sendo do grafo).
- Avisos: blocos (ou meios) sobrepostos e esteiras que se cruzam, com a contagem e o destaque no mapa.

### Tela

- O mapa é uma vista do planner, ao lado da cadeia (alternar Cadeia / Mapa). Clicar num bloco abre a etapa (tela da fase 1); clicar num meio abre o painel do meio.
- Navegação (decisão minha): o mapa ocupa a área toda, então segue o Figma: rolar move o mapa, Ctrl + rodinha ou pinça dá zoom, arrastar o fundo move. Mostrar tudo e zoom ± em botões.
- Régua de escala e grade de fundações visíveis, como no board `Mapa`.
- Textos em pt/en/es, nomes de peças em inglês, itens em inglês (regras de sempre).

## Desempenho (decisão do dono: otimizar desde já)

- O cálculo continua no navegador. Servidor não deixaria a conta mais rápida, adicionaria espera de rede e custo por chamada; o computador de quem usa faz a conta de graça.
- O mapa é desenhado em **canvas** (não um elemento de página por máquina), com só o que está visível sendo desenhado e nível de detalhe por zoom (de longe, o bloco vira retângulo com o rótulo; de perto, máquinas e peças).
- O cálculo dos meios (`computePlan`, `flowNet`, `flowLayout`) roda numa **thread separada (Web Worker)**, com cache por meio (`meioHash`): mudar uma etapa só recalcula os meios que ela toca. A tela nunca espera esse cálculo; enquanto ele não volta, o meio aparece como faixa "calculando".
- Arrastar um bloco não recalcula meio nenhum: só move o desenho.
- Meta: a cadeia de exemplo e uma fábrica de umas 2.000 máquinas arrastam e dão zoom sem engasgar num notebook comum.

## Fica para quem constrói

- Biblioteca de desenho (canvas 2D puro ou uma lib pequena), desde que cumpra "Desempenho" e passe pela CSP do `vercel.json`.
- Formato dos campos novos no estado salvo, desde que versione e valide como o `decodeChain`.
- Algoritmo do molde de posição inicial e de detecção de cruzamento.
- Detalhe visual do bloco e do meio (cores por item como na tela `Etapa`, rótulos).
- Testes: lógica pura do mapa (tamanho do bloco, geometria do meio em metros, proposta de posição, grade, giro, sobreposição, cruzamento, leitura do estado salvo) com `node --test`; telas com o harness visual (cenário `planner-mapa`).
- Atualizar `AGENTS.md`, os READMEs e o `docs/backlog.md` quando a fase entrar.
