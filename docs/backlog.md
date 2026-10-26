# Backlog

Ideias combinadas para seguir depois, de qualquer máquina. Nada aqui está planejado nem começado.

## Prioridades (escolhidas em 2026-10-24)

### 1. Casos estranhos do jogo viram teste

- Vai surgindo jogando. Cada caso esquisito vira um teste em `tests/logic.test.js`, partindo do link do cenário (`#s=`) ou do botão de reportar no GitHub.
- **Smart / Programmable Splitter (Overflow, Any):** em alguns cenários pode resolver com menos peças que um balancer exato. Confirmar a mecânica antes de implementar.

### 2. Builder (planner 2D): fases 1, 2 e 3 e a reforma visual feitas

- Specs: [`2026-10-25-planner-2d-design.md`](superpowers/specs/2026-10-25-planner-2d-design.md) (fase 1: cadeia, meio nas ligações, etapa aberta), [`…-fase2-design.md`](superpowers/specs/2026-10-25-planner-2d-fase2-design.md) (fase 2: mapa em escala) e [`…-fase3-design.md`](superpowers/specs/2026-10-25-planner-2d-fase3-design.md) (fase 3: montar como no Modeler, fluxo físico, ligação arrastável com modal, origens e sobras, ícones). O builder é a página inicial (`/`) e a ferramenta original foi para `/balancer`.
- **Reforma visual (feita):** spec [`2026-10-25-builder-reforma-visual-design.md`](superpowers/specs/2026-10-25-builder-reforma-visual-design.md), protótipo e capturas aprovados em `superpowers/research/2026-10-25-reforma/`. Montar (cartões com a faixa das fileiras, portas pelo estado, esteiras animadas, chips) e Planta em escala, Balanço com "N faltas/N sobras", mini painel do chip, painel com a frase do problema e consertos de um clique, seletor maior, dica de primeiro uso e Legenda.
- **Ficou de fora da reforma (para o dono decidir):**
  - Celular: o topo ocupa três linhas (abas, Montar/Planta + desfazer, Compartilhar + idiomas) e os controles do mapa quebram em duas (a Legenda entrou); a dica de primeiro uso cobre boa parte do mapa até "Entendi". Cartões se sobrepõem no zoom mínimo do celular (60 %), e aí o rótulo de uma porta pode cobrir o cartão vizinho.
  - Planta: o chip de uma ligação pequena fica em cima das portas dela (o chip ganha o clique; a porta só pega fora dele). A troca Montar → Planta mantém o centro e o zoom permitido, então a Planta abre bem perto até "Mostrar tudo".
  - O modal da ligação continua o da fase 3 (o protótipo mostra um desenho mais simples, "Montagem: Iron Ingot, 6 → 8", com o passo a passo embaixo).
  - Pequenos adiados das revisões: `viewGeo` aloca a cada quadro; fórmula da faixa e `CARD_HEAD` duplicados entre `model/map/cards.ts` e `ui/draw/cards.ts`; algumas cores fixas no desenho; o cano tem casca (o spec diz sem); chaves sem uso (`plMapScale`, `plMeioTooLargeShort`); o chip não distingue loop de balancer; o zoom/arraste do usuário não cancela a animação de 300 ms do "ir até o problema"; "Novo bloco" abre o seletor no alto e no meio, não onde se olha; `factoryBalance` é O(blocos × links); consertos recalculados a cada render; layout de 721–900 px não desenhado; contagem de produtoras por link em `fixes.ts` (não por bloco).
- **Fase 4 (próxima):**
  - Outros jeitos de montar as fileiras: Mergers no meio da fileira, uma entrada e duas saídas.
  - Portas reais dos prédios (e entradas de um mesmo prédio em lados diferentes por item).
  - Andares (o mapa é plano).
  - Blueprint Designer no mapa do builder (as marcações já existem na planta da biblioteca do Balancer).
- **Medidas reais de Miner, extratores (Water, Oil, Resource Well) e Container:** hoje são marcadores de 8×8 m rotulados "fora de escala". Pergunta ao dono (não chutar).
- **Ficou de fora da fase 3:** copiar e colar, seleção múltipla, gerar a cadeia pela meta no mesmo canvas (só como ajuda, nunca o fluxo principal), importar `.sfmd` (falta um arquivo de exemplo), energia, somersloop, sub-fábricas.
- **Adiados das revisões da fase 3 (pequenos):** ligação colada fora da grade pula até 4 m no primeiro empurrão; o seletor pode perder o foco sem fechar; `model/picker.ts` importa de `ui/icons.ts`; nomes de receita forçados podem cobrir vizinhos; o desenho proposto para fábricas grandes cruza muita esteira (10 blocos de 200 máquinas: colunas de ~1,4 km e 1.753 cruzamentos, mesmo com "Propor de novo") até o usuário arrumar.
- **Portas mudam de lugar na primeira abertura:** blocos sem posição salva são posicionados de novo quando a geometria das ligações chega do worker, e as portas andam junto (quem é rápido pode errar a porta; o smoke espera a geometria).
- **Capturas antigas:** `docs/screenshot*.png` ainda mostram o Balancer como página inicial; refazer com o builder.
- **Conhecido:** a borboleta com loop é desenhada plana (a pegada fica maior que a real, rotulada "N andares"); os tamanhos das peças de fluido (cano, Junction, Valve) são estimativas e vêm marcados como tal.
- Ideia original da planta:

- A "planta vista de cima": cada linha vira uma fileira de máquinas no tamanho real, com o comprimento do manifold, as fundações ocupadas e onde ficam o meio e o balancer. Sem receitas, partindo das linhas e grupos que a ferramenta já calcula. Não é editor livre da fábrica nem ligação de etapas em cadeia.

## Futuro (depois da planta)

- Daí para frente, evoluir na linha do chão e das marcações do Blueprint Designer (já feitos na planta da biblioteca).

## Sugeridas e não priorizadas

Ficam registradas, sem compromisso: um tier de esteira por trecho (coleta, meio, distribuição), custo de material da montagem (peças, metros de esteira e lift), checklist de montagem salvo no cenário, modo compacto para segunda tela, layout de impressão.
