# Builder — reforma visual e de UX (antes da fase 4)

Data: 2026-10-25. Continua os specs das fases 1, 2 e 3 do Planner 2D (`2026-10-25-planner-2d-design.md`, `…-fase2-design.md`, `…-fase3-design.md`); o que não muda aqui continua valendo. Branch de partida: `planner-2d-fase3` (fases 1–3 prontas, nada na `master`, nada enviado).

**Referência visual aprovada pelo dono ("parece bom assim"):** o protótipo clicável
- publicado: https://claude.ai/artifact/P2azDszSg3g2FAKKBwYDhf
- cópia no repo: `docs/superpowers/research/2026-10-25-reforma/prototipo.html` (abre direto no navegador), capturas em `…/shots/`
- maquetes estáticas anteriores (primeira tentativa, **sem** as fileiras — o dono achou que mudava o produto): `…/Reforma.Montar.dc.html`, `Reforma.Planta.dc.html`, `Reforma.Ligacao.dc.html` (canvas https://claude.ai/artifact/4zd8tDeQc9GFKhL7nK5w99)

O protótipo é **referência de visual e de gestos**, não de código: o cálculo dele é simplificado e o desenho do balancer é genérico. O produto continua usando o solver (`src/planner/model/solve.ts`), as ligações (`meio`/`computePlan`) e a geometria real das fases 2 e 3.

## Por que

O dono testou a fase 3 e disse: funciona bem para uma v1, mas "tá feio", "não tá intuitivo", tudo muito pequeno (portas, ícones, lugares de clicar), tudo "perdido" no canvas; a ligação vinda do balancer fica estranha e não dá para apagar ou mexer direito; e, ao ligar algo, não dá para ver onde tem sobra ou gargalo. O Modeler é a referência de experiência: limpo, pouca informação, intuitivo. Mas o nosso produto mostra **as fileiras de máquinas e a grade** — isso é a identidade e não pode sumir ("pode ser igual ao modeler mas algo mostra a grade e linhas de máquina"). O dono quer isso resolvido antes da fase 4.

## Metas

1. **Bloco legível em qualquer zoom (como no Modeler) que mostra as fileiras.**
   - Cartão em tamanho de tela (não encolhe abaixo de ~70% no desktop, ~60% no celular): ícone grande do prédio, nome da receita, número de máquinas em destaque ("fixado" quando é limite do usuário), clock quando ≠ 100%, selo Alt.
   - Dentro do cartão, a **faixa de fileiras**: uma barra por fileira, um quadrado por máquina, a última fileira incompleta mais curta; esteira de entrada em cima e de saída embaixo de cada fileira, na cor do item; acima de ~6 fileiras, "+ N fileiras iguais". Rodapé: "6 fileiras de 7" / "8 fileiras de 8, última 4" e a taxa por fileira ("455/min cada").
2. **Duas vistas, um botão no topo: "Montar" (principal) e "Planta em escala".** A Planta é a fábrica no tamanho real (pegada da fase 2, grade de fundações de 8 m, régua), com a transição animada curta (respeitando `prefers-reduced-motion`). Nas duas vistas, nomes, portas e chips ficam **em tamanho de tela**.
3. **Portas grandes:** bolinhas de 44 px com o ícone do item, nas bordas do cartão. A cor diz o estado: neutra = atendida; vermelha = falta ("faltam 120/min"); verde-água = sobra/represado ("+330 sobrando"); laranja cheia = produto final ("sai 450/min"); tracejado amarelo = travada (subproduto sem destino). As cores diferem também em claridade. Ao arrastar, as portas compatíveis acendem e as outras apagam.
4. **Esteiras com cara de esteira:** grossas, com o tracejado andando (parado com movimento reduzido); cano tracejado azul; esteira que leva uma falta fica vermelha.
5. **Ligação como peça firme na esteira** (o "chip"): taxa com ícone em cima, montagem embaixo ("6 → 8", "direto", "3 → 4 + sink", "cano"). Arrastável. Clique abre um mini painel com **Ver montagem** (o modal com o desenho do fluxo da ferramenta, já existente na fase 3), **Trocar montagem** (as alternativas do plano) e **Desligar**; Delete desliga. Isso resolve "não dá pra apagar ou mexer nos balancers".
6. **Sobra e gargalo à vista na hora:**
   - Faixa "Balanço" no topo: o que **entra** (brutos, com ícone e taxa), o que **sai** (produtos finais) e o que vai pro sink; botões "N faltas" / "N sobras" que levam até o problema (centraliza e pisca o bloco/porta), passando por cada um a cada clique.
   - Painel do bloco: lista do que entra e sai com o estado de cada porta, **uma frase** explicando o problema ("O aço só consome 2.400. Sobram 330 por minuto aqui.") e **consertos de um clique**: "Mandar sobra pro sink", "Reduzir para N", "Aumentar a fonte", "Criar fonte".
7. **Navegação:** abas "Fábrica | Balancer" no topo, nas duas páginas, para uma nunca ficar perdida da outra (o dono reclamou que "uma não acessa a outra").
8. **Seletor de receitas maior:** cartões de ≥ 56 px, ícone de 42 px, a receita escrita com ícones ("60 Steel Ingot → 15 Steel Beam"), Alt; receitas primeiro, "Fontes e sobras" depois.
9. **Painel lateral** abre ao selecionar e fecha sem seleção (no desktop pode começar fechado para a fábrica caber); no celular vira folha de baixo. Sem seleção: área da fábrica, avisos clicáveis e lista de blocos.
10. **Dica de primeiro uso** dispensável e botão **Legenda** (estados das portas, tipos de chip, como ler a faixa de fileiras).

## Não-metas

- Mudar o cálculo (solver da fase 3), o modelo salvo (`Factory` v2) ou as rotas.
- Jeitos de montar as fileiras, portas reais, andares (fase 4).
- Copiar o código do protótipo: ele é referência; a implementação segue a arquitetura atual (canvas em `src/planner/ui/mapDraw.ts` + `MapView.tsx`, ou DOM/SVG para os cartões se fizer mais sentido — decisão de quem constrói, respeitando "Desempenho").

## Anti-metas

- Perder as fileiras de máquinas do primeiro plano (o dono rejeitou a versão só de cartões).
- Alvos de clique pequenos (< 44 px) ou texto ilegível em algum zoom.
- Ficar mais lento: a meta de ~2.000 máquinas sem engasgar continua (fase 2).
- Piorar a página Balancer.

## Visual (do protótipo e do site)

- Tema escuro único do site: fundo `#0d2136`, bancada `#0a1b2d`, placa `#13314f`, linha `#2d5176`, texto `#e4eef8`/`#c3d3e3`/`#9fb6cc`, laranja FICSIT `#ff9b3d`; estados: falta `#ff7a6b` (fundo `#3a1f24`), sobra `#45d4c8` (fundo `#123a3c`), travado `#ffd84a`. Chakra Petch (títulos, números) + IBM Plex Sans (texto). Ícones do jogo da fase 3 (`public/icons`).
- Ousadia num lugar só: as esteiras e as fileiras. O resto é quieto: sem caixas-alta em rótulos, sem cartões com sombra em tudo.
- Quem implementar usa a skill `frontend-design` (pedido do dono) e compara com o protótipo lado a lado.

## Decisões minhas (o dono pode mudar)

- "Montar" é a vista principal e abre por padrão; a Planta é um botão.
- Na Montar, os cartões não seguem a escala real; o tamanho real fica na Planta e nas medidas do painel.
- O chip da ligação fica no meio da esteira por padrão; arrastado, a posição é salva (`Factory.ligs`, já existe).
- Os estados das portas usam o `BlockFlow`/`PortFlow` do solver (deficit, held, exits, stalled); "sobra" no protótipo = `held` + saída ligada que não escoa tudo.

## Fica para quem constrói

- Plano em tarefas (usar `superpowers:writing-plans`; execução subagent-driven como nas fases 1–3).
- Se os cartões viram DOM/SVG sobre o canvas ou continuam no canvas — desde que cumpram os alvos de 44 px, a legibilidade e o desempenho.
- Testes: lógica nova pura com `node --test`; visual com `npm run visual:capture -- … --only=builder` e `npm run smoke`.
- i18n pt/en/es em tudo (o protótipo só tem pt).

## Estado ao parar esta sessão (para quem continuar)

- Branches sem merge e sem push: `planner-2d` (fase 1), `planner-2d-fase2` (mapa), `planner-2d-fase3` (montar como no Modeler; contém as anteriores). 274 testes passando no `planner-2d-fase3`.
- O dono decidiu: **sobe tudo junto** (fases 1–3 + esta reforma) só depois das melhorias. Merge na `master` e push só com o ok dele.
- Docker local: `docker compose up --build -d` → http://localhost:8080 (`/pt` é o builder, `/pt/balancer` a ferramenta).
- Pendências conhecidas no `docs/backlog.md` (portas que pulam no primeiro carregamento, layout ruim de fábricas enormes, medidas reais de Miner/extratores/Container, fase 4).
