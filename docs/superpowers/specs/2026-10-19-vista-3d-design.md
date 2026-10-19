# Vista 3D da montagem do balancer

## Intenção

Quem monta balancer compacto no Satisfactory empilha as peças: splitters e mergers um em cima do outro, ligados por lifts, com esteiras cruzando em alturas diferentes (referências: vídeos "4 to 3 load balance" do Random Gamer, balancer alto e estreito em torres). O dono da ferramenta monta tudo num andar só embaixo das fábricas, então Normal e Borboleta atendem ele. Mas a aba **Vertical** de hoje, que deveria atender o jogador do compacto, é um corte 2D que "não serve pra nada" na prática.

A ideia é **substituir a aba Vertical por uma aba 3D**: uma cena que a pessoa gira 360°, aproxima e afasta, acompanhando a montagem passo a passo como se estivesse construindo dentro do jogo. É a feature de destaque da ferramenta.

## Objetivos

- Aba **3D** no seletor de montagem (Normal · Borboleta · 3D), no lugar de Vertical. Vale na biblioteca e na janela que abre o balancer a partir do plano.
- Dentro da aba 3D, duas montagens, que a pessoa alterna:
  - **Andares:** uma camada de peças por andar, os andares ligados por lifts. É o que `designFloors` já calcula hoje.
  - **Torres:** as peças de uma mesma entrada (ou faixa) empilhadas numa coluna. Os mergers de cada saída ficam empilhados noutra coluna, e as esteiras cruzam entre as colunas em alturas diferentes, como nos vídeos.
- Serve para todo design que tem peças (matriz, funil, borboleta, cada um com ou sem loop/sink). Blueprint do jogador continua sem montagem, como hoje.
- **Passo a passo igual ao 2D:** mesmos controles (anterior, próximo, reproduzir, ver pronto, setas do teclado), mesma legenda de passo.
  - Passos anteriores: peças **sólidas**.
  - Passo atual: peças **meio transparentes**, como o holograma da build gun, com as esteiras do passo mostrando o sentido do fluxo (setas ou tracejado animado).
  - Passos futuros: escondidos.
- **Câmera livre:** girar 360°, aproximar e afastar, arrastar; com mouse e com toque. Um botão para voltar ao enquadramento inicial.
- **Peças reconhecíveis sem depender só da cor:**
  - Splitter e merger com formas ou marcas diferentes (letra, ícone de uma→três e três→uma, ou similar) e cores próprias.
  - Lift: tubo vertical entre alturas.
  - Esteira: faixa com setas na textura andando no sentido do fluxo, na cor da faixa (as mesmas cores por entrada usadas no 2D).
  - Entradas e saídas com os rótulos de hoje (E1/S1 na biblioteca, O1/D1 no plano).
  - Loop e sink identificáveis, como no 2D.
- **Piso quadriculado** como o do modo blueprint do jogo, com a grade das fundações, para dar noção de espaçamento.
- Contagem de **lifts** continua visível no painel de peças.
- Textos novos nos três idiomas (pt, en, es), como manda o AGENTS.md.

## Não objetivos

- Não é para copiar no jogo bloco a bloco com medida exata. O objetivo é enxergar no espaço o que fica em cima do quê e o que liga em quê. Escala aproximada à do jogo, sem garantia de encaixe.
- Não usar modelos, texturas ou ícones do jogo. Assets próprios e simples.
- Não mudar Normal e Borboleta (continuam 2D).
- Não criar designs novos de balancer: o 3D mostra os designs que a ferramenta já gera.

## Anti-objetivos (o que faria isso falhar mesmo funcionando)

- Pesar a página para quem nunca abre o 3D.
- Cena confusa em que não dá para distinguir merger de splitter ou seguir uma esteira.
- Quebrar o resto da página se o navegador não tiver WebGL.

## Restrições

- Continua **um único `index.html`, sem build** (AGENTS.md). Nada de mudar a stack.
- O 3D usa **Three.js por CDN** (jsDelivr ou cdnjs, versão fixa), carregado **só quando a pessoa abre a aba 3D**. O CDN precisa ser liberado no CSP do `vercel.json` (`script-src`, e o que mais o carregamento pedir).
- Lógica pura separada da interface e testada em `tests/logic.test.js`: o cálculo das posições 3D (andares e torres) é função pura testável sem navegador. Só o desenho fica na interface.
- Dark mode, respeitar `prefers-reduced-motion` (sem animação contínua das setas e do holograma), foco visível nos controles.
- Sem WebGL ou falha ao carregar o CDN: a aba mostra um aviso curto e o passo a passo 2D do design no lugar.
- READMEs nos três idiomas atualizados (Vertical vira 3D).

## Decidido na conversa

- Nome da aba: **3D** (substitui Vertical; o 2D vertical sai).
- Duas montagens dentro do 3D: **Andares** e **Torres**.
- Representação, não réplica: assets próprios, piso de blueprint para espaçamento.
- Holograma no passo atual, sólido no que já foi montado.
- Cores das esteiras seguem as faixas, como no 2D.

## Decisões minhas (o dono pode trocar)

- Three.js por CDN com carregamento sob demanda, em vez de WebGL na mão.
- A montagem padrão ao abrir a aba 3D é **Torres** (é o que o jogador do compacto monta nos vídeos). A escolha fica salva como as outras preferências da biblioteca.
- Quem tinha "vertical" salvo no navegador passa a abrir em 3D.
- Câmera inicial em ângulo de três quartos, de cima, enquadrando a montagem inteira.
- **Passos no 3D seguem a montagem visível**, não os do 2D. Andares: um passo por andar (como o Vertical fazia). Torres: um passo por coluna, na ordem do fluxo (colunas das entradas, depois as do meio, depois as das saídas), com loop e sink no passo da peça de onde saem. A função pura que calcula as posições também devolve os passos (quais peças e esteiras entram em cada um), e os textos de cada passo entram no `I18N` nos três idiomas.
- **A aba 3D lista todos os designs com peças**, como a Vertical listava (matriz, funil e borboleta, com e sem loop/sink). O "melhor" dessa aba é o melhor de todos, então ela não mostra o aviso "o melhor está em outra aba". Abrir o balancer a partir do plano continua abrindo em Normal ou Borboleta; a pessoa troca para 3D se quiser.
- **A contagem de lifts acompanha a montagem visível.** Andares e Torres calculam os próprios lifts, e o painel de peças troca o número quando a pessoa alterna.
- O trabalho atual sem commit (borboleta para qualquer N→M, Vertical de volta no seletor, links do mod e dos blueprints, ajustes visuais) é a base do 3D.

## Deixado para quem constrói

- Algoritmo exato das Torres para cada família (matriz, funil, borboleta, com loop/sink): quais peças vão em qual coluna e em que altura, desde que cada coluna tenha as peças de uma entrada/faixa ou de uma saída, e as ligações entre colunas fiquem legíveis.
- Medidas da cena (tamanho da peça, altura do andar, espaçamento), próximas da escala do jogo.
- Forma exata das peças, das marcas e das setas.
- Como desenhar as esteiras entre alturas (rampa ou lift), desde que a contagem de lifts mostrada bata com o que está na cena.
- Detalhes de iluminação, sombra e performance.
