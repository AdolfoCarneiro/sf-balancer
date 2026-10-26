# Backlog

Ideias combinadas para seguir depois, de qualquer máquina. Nada aqui está planejado nem começado.

## Prioridades (escolhidas em 2026-10-24)

### 1. Casos estranhos do jogo viram teste

- Vai surgindo jogando. Cada caso esquisito vira um teste em `tests/logic.test.js`, partindo do link do cenário (`#s=`) ou do botão de reportar no GitHub.
- **Smart / Programmable Splitter (Overflow, Any):** em alguns cenários pode resolver com menos peças que um balancer exato. Confirmar a mecânica antes de implementar.

### 2. Builder (planner 2D): fases 1, 2 e 3 feitas

- Specs: [`2026-10-25-planner-2d-design.md`](superpowers/specs/2026-10-25-planner-2d-design.md) (fase 1: cadeia, meio nas ligações, etapa aberta), [`…-fase2-design.md`](superpowers/specs/2026-10-25-planner-2d-fase2-design.md) (fase 2: mapa em escala) e [`…-fase3-design.md`](superpowers/specs/2026-10-25-planner-2d-fase3-design.md) (fase 3: montar como no Modeler, fluxo físico, ligação arrastável com modal, origens e sobras, ícones). O builder é a página inicial (`/`) e a ferramenta original foi para `/balancer`.
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
