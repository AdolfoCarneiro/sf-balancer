# Backlog

Ideias combinadas para seguir depois, de qualquer máquina. Nada aqui está planejado nem começado.

## Prioridades (escolhidas em 2026-10-24)

### 1. Casos estranhos do jogo viram teste

- Vai surgindo jogando. Cada caso esquisito vira um teste em `tests/logic.test.js`, partindo do link do cenário (`#s=`) ou do botão de reportar no GitHub.
- **Smart / Programmable Splitter (Overflow, Any):** em alguns cenários pode resolver com menos peças que um balancer exato. Confirmar a mecânica antes de implementar.

### 2. Desfazer e refazer

- Ctrl+Z / Ctrl+Y nas entradas (agrupamentos, taxas, tier etc.), voltando o cálculo junto.

### 3. Planta 2D definitiva

- A "planta vista de cima": cada linha vira uma fileira de máquinas no tamanho real, com o comprimento do manifold, as fundações ocupadas e onde ficam o meio e o balancer. Sem receitas, partindo das linhas e grupos que a ferramenta já calcula. Não é editor livre da fábrica nem ligação de etapas em cadeia.

### 4. Marcação do Blueprint Designer no desenho "Planta" da biblioteca

- Mostrar no desenho Planta a borda do tamanho do Blueprint Designer Mk1, Mk2 ou Mk3 (escolhível).
- **Ctrl + arrastar** move só essa marcação (e não a vista), para fatiar um balancer grande em pedaços.
- Motivo: o balancer não cabe nem no Mk3, ou o jogador só tem o Mk2. Aí ele posiciona a marcação em 2 ou 4 partes, salva um blueprint de cada e monta o balancer maior juntando os pedaços.

## Melhoria pequena: voltas das esteiras nas pontas da borboleta

- Não é bug, e nada sai da área do blueprint. É só uma melhoria de leitura, de baixa prioridade.
- Onde ver: Biblioteca de load balancers, 6 → 6, 455/min, Mk4, Montagem Borboleta, Desenho Planta, Por peça.
- Entre a coluna de splitters em 3 (#13 a #18) e a de mergers (#19 a #24), as esteiras das pontas dão voltas estranhas por cima do #13 e por baixo do #18 até mergers distantes. Com rotas mais simples, a montagem ficaria mais fácil de seguir.

## Futuro (depois da planta)

- Chão no estilo do Blueprint Designer: grade de fundações bem parecida com a do jogo, mais fácil de ler.
- Os marcadores dos designers (Mk1, Mk2, Mk3) nessa grade, com Ctrl + arrastar encaixando na grade.
- Daí para frente, evoluir nessa linha.

## Sugeridas e não priorizadas

Ficam registradas, sem compromisso: um tier de esteira por trecho (coleta, meio, distribuição), custo de material da montagem (peças, metros de esteira e lift), checklist de montagem salvo no cenário, modo compacto para segunda tela, layout de impressão.
