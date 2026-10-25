# Backlog

Ideias combinadas para seguir depois, de qualquer máquina. Nada aqui está planejado nem começado.

## Prioridades (escolhidas em 2026-10-24)

### 1. Casos estranhos do jogo viram teste

- Vai surgindo jogando. Cada caso esquisito vira um teste em `tests/logic.test.js`, partindo do link do cenário (`#s=`) ou do botão de reportar no GitHub.
- **Smart / Programmable Splitter (Overflow, Any):** em alguns cenários pode resolver com menos peças que um balancer exato. Confirmar a mecânica antes de implementar.

### 2. Planner 2D: fases 1 e 2 (mapa) feitas

- Spec: [`docs/superpowers/specs/2026-10-25-planner-2d-design.md`](superpowers/specs/2026-10-25-planner-2d-design.md). A fase 1 (cadeia em grafo, meio nas ligações, etapa aberta) e a fase 2 (aba Mapa, em escala, com arrastar/girar e avisos) estão em `/planner`.
- **Ficou para a fase 4:** andares (o mapa é plano), portas reais dos prédios e entradas de um mesmo prédio em lados diferentes por item.
- **Conhecido:** a borboleta com loop é desenhada plana (a pegada fica maior que a real, rotulada "N andares"); os tamanhos das peças de fluido (cano, Junction, Valve) são estimativas e vêm marcados como tal.
- Ideia original da planta:

- A "planta vista de cima": cada linha vira uma fileira de máquinas no tamanho real, com o comprimento do manifold, as fundações ocupadas e onde ficam o meio e o balancer. Sem receitas, partindo das linhas e grupos que a ferramenta já calcula. Não é editor livre da fábrica nem ligação de etapas em cadeia.

## Futuro (depois da planta)

- Daí para frente, evoluir na linha do chão e das marcações do Blueprint Designer (já feitos na planta da biblioteca).

## Sugeridas e não priorizadas

Ficam registradas, sem compromisso: um tier de esteira por trecho (coleta, meio, distribuição), custo de material da montagem (peças, metros de esteira e lift), checklist de montagem salvo no cenário, modo compacto para segunda tela, layout de impressão.
