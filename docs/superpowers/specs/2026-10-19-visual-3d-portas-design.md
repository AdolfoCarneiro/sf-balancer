# Visual da aba 3D e ligações como no jogo

## Intenção

A aba 3D funciona, mas o dono acha a cena feia e, pior, confusa: não dá para saber onde cada esteira liga nem para onde vai quando duas se cruzam. Também há peças com duas esteiras na mesma face, o que não existe no jogo e confunde quem usa a cena como referência para montar.

Foram quatro rodadas de protótipo numa página de decisão (artifact "Estilo do 3D"). O dono escolheu o visual (rodada 2), aprovou o encaixe das portas em Torres (rodada 3) e em Andares (rodada 4). Este documento leva isso para o `index.html`.

O protótipo aprovado (rodada 4, com Torres e Andares) fica em `docs/superpowers/specs/2026-10-19-visual-3d-portas-prototipo.html` como referência visual e de código (roteador e desenho). É descartável: serve para olhar, não para copiar inteiro.

## Objetivos

### Ligações como no jogo (lógica, `layout3d`)

- **Portas por face**, com "frente" sendo o sentido do fluxo na horizontal:
  - Splitter: entrada **atrás**; saídas **frente**, **esquerda**, **direita**.
  - Merger: entradas **atrás**, **esquerda**, **direita**; saída **frente**.
  - Entrada (placa E/O): uma saída na frente. Saída (placa S/D) e sink: uma entrada atrás.
  - **No máximo uma esteira por face.**
- **Frente** em cada montagem: Torres, `+x` (das entradas para as saídas). Andares, `-z` (as entradas ficam na frente, `+z`, e as saídas atrás, `-z`); esquerda e direita são `±x`.
- A esteira **encosta na porta**: o primeiro ponto é o centro da face da peça de origem (na altura da esteira) e o último é o centro da face da peça de destino. Sai perpendicular à face por um toco curto antes de virar.
- As placas de entrada e saída ficam **na altura da esteira**, para a esteira não sair por baixo delas (bug visível hoje).
- `layout3d` devolve, para cada esteira, a face usada na origem e no destino (`fromSide`, `toSide`: `back|front|left|right`), para a cena desenhar as setas do topo e as golas das portas.
- Continua valendo o que os testes de hoje exigem: esteira não atravessa peça, não corre por cima de outra, `lifts` é o número de esteiras com trecho vertical, e o enquadramento cabe a montagem inteira. Loop e sink continuam como hoje (loop passa por cima de tudo).

### Visual (cena, `mount3d`)

Escolhas do dono na rodada 2 e 3:

- Câmera **em perspectiva** (como hoje).
- **Piso blueprint** azul com a grade das fundações (8 m) e a meia grade (4 m), sumindo nas bordas, sem sombra. Fundo escuro.
- **Peças chapadas** (cor sólida, cantos levemente arredondados): splitter laranja, merger verde-água, entradas na cor da faixa, saídas verdes, sink vermelho.
- **Topo da peça: setas nas quatro direções**, desenhadas do centro para fora (saída) ou de fora para o centro (entrada). As portas usadas ficam acesas na cor da esteira ligada; as livres ficam escondidas (o dono escolheu "livres escondidas"). Splitter: uma entra por trás, três saem. **Merger: três entram, uma sai pela frente** (no protótipo o merger saiu errado, como cópia do splitter girada; corrigir).
- Marca `1→2`, `1→3`, `2→1`, `3→1` na face da frente e na lateral, como hoje.
- **Esteira em tubo neon** fino, na cor da faixa (as mesmas cores do 2D), com **contorno escuro** em volta (separa duas esteiras que passam uma na frente da outra), **sem brilho** em volta.
- **Na porta:** gola escura onde a esteira encosta, **seta** na saída e **anel** na entrada, na cor da esteira.
- **Itens andando:** pontos de luz correndo pelas esteiras no sentido do fluxo, só nas esteiras já montadas.
- **Passo atual em holograma pulsando:** peças e esteiras do passo ficam translúcidas em ciano e pulsam devagar. Passos anteriores sólidos, futuros escondidos (como hoje).
- **Isolar caminho:** passar o mouse numa peça acende só ela e as esteiras ligadas a ela; o resto apaga. Clicar fixa; clicar no vazio solta. Numa placa de entrada acende tudo a jusante; numa de saída, tudo a montante.
- **Botões "Seguir"** embaixo da cena, um por entrada e saída (com os rótulos de hoje: E1/S1 na biblioteca, O1/D1 no plano, S1 em inglês), que fazem o mesmo que clicar na placa. Clicar de novo solta.
- `prefers-reduced-motion`: sem pulso (holograma parado, translúcido), sem itens andando.

### Textos

Tudo que for novo na tela nos três idiomas (pt, en, es), no `I18N`, como manda o AGENTS.md: rótulo e `aria-label` dos botões Seguir, dica de "passe o mouse numa peça, clique para fixar", legenda atualizada (seta de saída, anel de entrada, porta usada), e a dica `?` que explica como ler as setas do topo.

## Não objetivos

- Não muda a lógica do balancer, as contas, os designs gerados, as posições das peças nas torres e nos andares (só o roteamento das esteiras e a altura das placas).
- Não mexe em Normal e Borboleta (2D).
- Não tenta ser réplica do jogo em medida exata; é representação. A diferença agora é que as ligações são construíveis (uma por face, no lado certo).

## Anti-objetivos

- Esteira entrando ou saindo por um lado que a peça não tem no jogo, ou duas na mesma face.
- Seta do topo dizendo uma coisa e a esteira fazendo outra.
- Página mais pesada para quem nunca abre o 3D (Three.js continua sob demanda).

## Restrições

- Um `index.html`, sem build. Three.js 0.160.0 pelo jsDelivr, como hoje; `RoundedBoxGeometry` vem de `three/addons/` (mesma origem, já liberada no CSP).
- Lógica pura testada em `tests/logic.test.js` antes da cena.
- READMEs nos três idiomas: atualizar a frase do 3D (portas como no jogo, seguir caminho).

## Decidido na conversa

- Visual: perspectiva, piso blueprint, peças chapadas, tubo neon com contorno sem brilho, pontos de luz, seta/anel nas portas, isolar no mouse, holograma pulsando.
- Ligações como no jogo, uma por face, encostando na porta.
- Setas no topo com as usadas acesas; livres escondidas.
- Andares com as voltas do protótipo da rodada 4 (sai pela frente ou pelo lado, sobe por lift fora da fileira, entra pela porta certa) está aprovado. As saídas ficam no último andar; trazer de volta para baixo é com quem monta no jogo, a ferramenta não desenha lift de descida.

## Decisões minhas (o dono pode trocar)

- **Lados por altura**, como no protótipo: no splitter, a saída que vai para cima usa a esquerda e a que desce usa a direita; a que segue na mesma altura usa a frente. Com três saídas: a mais baixa à direita, a do meio na frente, a mais alta à esquerda. No merger, cada entrada prefere o lado de onde a esteira saiu da origem (assim não precisa contornar a peça); a que vem reta fica atrás; o resto pega o que sobrou. Em Andares, onde a altura não diferencia, o critério é a posição ao longo da fileira (desempate pela coordenada da fileira, como no protótipo).
- **Lifts no vão entre torres** (em Torres): lift colado na torre esbarra nas portas das peças de cima e de baixo.
- **Toco de toda porta reservado antes de rotear:** sem isso, a primeira esteira roteada tapa a porta de outra (em Andares foi de 28 para 1 trecho colado na butterfly 4→4).
- O protótipo roteia Andares girando a cena para o fluxo ficar em `+x`, e usa o mesmo roteador das torres; a versão de verdade pode fazer igual, devolvendo as coordenadas no sistema de hoje.
- O roteador do protótipo é guloso (uma esteira de cada vez, sem voltar atrás) e deixou 3 trechos colados na matriz 4→4. A versão de verdade precisa **refazer esteiras que travaram** (desfaz e tenta de novo em outra ordem, ou abre faixas novas) até passar nos testes.
- A cena antiga (chevrons na textura, placa azul opaca, faixa achatada) sai inteira; não fica opção para voltar.
- **Regras de porta são duras; folga entre esteiras é meta.** Para todo N→M de 2 a 9, nas duas montagens, nunca há lado errado nem duas esteiras na mesma face (teste novo cobre a faixa inteira). Não atravessar peça e não correr por cima de outra esteira continua exigido nas formas que o teste de hoje já cobre (4→4, 2→2, 3→4, 5→5, 2→5, 9→9); nas demais, se o roteador não achar caminho limpo, fica o de menos cruzamentos, como hoje.
- **Sink pode mudar de lugar:** passa a ficar na frente (ou no lado livre) da peça de onde sai, encostado na porta usada, já que a posição de hoje (`+z`) cai na face de trás em Andares. É a única exceção a "posições não mudam".
- **Loop:** o retorno continua passando por cima de tudo, mas desce e entra no merger por uma face livre (lado ou fundo), com o toco perpendicular. Os designs já limitam o merger a 3 entradas contando o retorno; se algum caso passar disso, o teste de portas acusa.
- O critério de lado fica numa função só, para trocar sem mexer no roteador.

## Deixado para quem constrói

- Algoritmo exato do roteamento, desde que cumpra as portas e os testes.
- Medidas finas (raio do tubo, tamanho do toco, distância entre faixas), próximas do protótipo.
- Desenho exato das setas do topo, da gola e da legenda.
- Performance (instancing dos itens, quantos itens por metro), desde que 9→9 continue fluido.
