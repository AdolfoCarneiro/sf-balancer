# Planner 2D — fase 3: montar como no Modeler

Data: 2026-10-25. Continua os specs da fase 1 (`2026-10-25-planner-2d-design.md`) e da fase 2 (`2026-10-25-planner-2d-fase2-design.md`); o que lá não for mudado aqui continua valendo. Branch: `planner-2d-fase3`, a partir do `planner-2d-fase2` (fases 1 e 2 prontas, fora da `master`). Pesquisa sobre o Modeler: `modeler-research.md` e as capturas em `modeler-shots/` (scratchpad da sessão; copiar para `docs/superpowers/research/` no começo da implementação).

**Mudança de rumo (decisão do dono):** a fase 3 deixou de ser "solver pela meta" (digitar o alvo e receber a fábrica pronta). Ela passa a ser **a experiência de montar do Satisfactory Modeler**, que o dono usa todo dia, com os nós sendo os nossos blocos em escala. Fileiras com outros jeitos de montar (Mergers no meio, uma entrada e duas saídas) foram para a fase 4.

## Intenção

No Modeler eu monto a fábrica nó por nó: crio um nó, escolho a receita, puxo de uma porta para o vazio e escolho o próximo, e os números se ajustam sozinhos. Montar passo a passo é o que eu gosto nele. O que falta lá é o chão: o nó é um quadradinho com "2,4 máquinas". Aqui, o mesmo jeito de montar, só que cada nó já é o bloco de fileiras de máquinas no tamanho real, e cada ligação já é a montagem de esteiras, Splitters, Mergers e balancer. Monto e já vejo a fábrica.

Sucesso: monto a cadeia de exemplo (ferro puro → aço → vigas e canos → Versatile Framework) só com os gestos do builder, sem abrir busca lateral nem painel, vejo falta e sobra na hora, abro uma ligação e vejo o balancer animado, e o mapa já é o que vou construir.

## Metas

- **O builder é a página principal** (`/`, `/pt`, `/es`). Monta-se direto nos blocos em escala: o grafo da fase 1 e o mapa da fase 2 viram uma vista só.
- **Gestos do Modeler** para criar e ligar blocos (ver "Montar").
- **Números como no Modeler, com fluxo físico** (ver "Números"): o bloco nasce consumindo o que chega, eu limito máquinas ou entrada quando quiser, falta e sobra aparecem na porta, e a sobra volta e se redistribui.
- **Blocos de sobra:** Awesome Sink, Container (estoque) e Saída (para outra fábrica, por trem/caminhão/drone) recebem o excesso de propósito, para nada ficar represado nas mineradoras.
- **Ligação** é o novo nome do "meio" (Connection / Conexión). É uma peça própria, que eu arrasto para onde quiser (hoje ela fica grudada no bloco de origem, e o dono não gostou).
- **Clicar numa ligação abre um modal** com o desenho do balancer da ferramenta atual (esteiras animadas, alternativas) e um botão para o montador passo a passo. Não sai mais da página.
- **A ferramenta atual vira a seção "Balancer"**: continua existindo sozinha (digitar taxas na mão, biblioteca de balancers, passo a passo, desenho do fluxo) e é aberta também a partir de uma ligação.
- **Ícones dos itens e prédios** no seletor de receitas, nos blocos e nas ligações, como no Modeler e no satisfactory-logistics (ver "Ícones": depende de decisão).
- **Visual de jogo e de fábrica**, feito com a skill `/frontend-design` (pedido do dono), mantendo o tema escuro e a identidade atual do site.

## Não-metas

- Solver pela meta (formulário de alvo → fábrica pronta). Pode voltar no futuro como "gerar a cadeia" dentro do mesmo canvas, nunca como fluxo principal.
- Jeitos de montar as fileiras (fase 4, junto com portas reais e andares).
- Outposts / sub-fábricas aninhadas, energia, somersloop (podem vir depois).
- Importar `.sfmd` (sem arquivo de exemplo ainda; continua no backlog).

## Anti-metas

- Montar ficar mais lento ou com mais cliques que no Modeler.
- Números que mudam sozinhos onde eu fixei um valor.
- Quebrar a ferramenta atual ou os links `#s=` e `#p=` antigos.
- Inventar mecânica do jogo (regra do `AGENTS.md`).

## Montar (decisões do dono, detalhes meus)

- **Criar bloco:** duplo clique (ou botão direito) no vazio abre o **seletor de receitas** ali mesmo: campo de busca com foco, receitas em cartões com ícone do produto, prédio e ingredientes, alternativas destacadas. Escolher cria o bloco onde cliquei.
- **Ligar:** arrastar de uma porta e soltar **no vazio** abre o seletor já filtrado (quem consome o item, se puxei de uma saída; quem produz, se puxei de uma entrada) e o bloco escolhido nasce ligado. Soltar **numa porta** compatível só liga. Uma porta aceita várias ligações (a ligação resolve a divisão e a junção, como hoje).
- **Trocar a receita** de um bloco no próprio bloco (o Modeler não tem; o nosso já tem).
- Desfazer/refazer em tudo, como hoje. Atalhos, copiar e colar, seleção múltipla: ficam para quem constrói, desde que não deixem montar mais lento.
- Entradas brutas (minério, água) continuam como entradas da cadeia; um bloco de **Recurso** (mineradora, extrator) é decisão de quem constrói, desde que o limite de recurso possa ser digitado (é o caso típico de "só tenho X de minério aqui").

## Números (decisões do dono)

O modelo é o físico do Modeler: o item anda para a frente e o consumo limitado na frente volta para trás.

- **Bloco novo nasce consumindo o que chega.** Puxei a saída de aço e criei Steel Beam: o bloco nasce com as máquinas para consumir esse aço.
- **Quando nada chega ainda (decisão minha):** o bloco é desenhado em escala, então não nasce vazio como no Modeler.
  - Primeiro bloco no canvas vazio: nasce com **uma fileira cheia** (o "por linha" sugerido) e esse valor já fica fixado; eu mudo depois.
  - Bloco criado puxando **de uma entrada** para trás (quem produz este item): nasce do tamanho que atende a demanda daquela entrada, sem fixar.
  - Entradas brutas (minério, água, carvão) fornecem o que for pedido, sem limite, até eu digitar um limite nelas (é o "só tenho X de minério aqui").
- **Outra perna divide.** Puxei a mesma saída de novo para Steel Pipe: o aço se divide entre as duas. Sem limite nas duas, divide por igual (decisão minha); se uma tem limite, ela pega o dela e a outra fica com o resto.
- **Limite meu, quando eu quiser.** Em cada bloco eu fixo a quantidade de máquinas, ou a quantidade de item que entra nele (por porta de entrada). O valor padrão (calculado) aparece de um jeito e o fixado de outro, e dá para voltar ao padrão.
- **Aumentar não puxa os de trás.** Fixei mais Steel Beam do que o aço dá: os de trás **não** crescem; aparece a **falta** em vermelho na porta, com a quantidade. Mudar os de trás é decisão minha, porque depende do recurso que existe no lugar da fábrica.
- **Diminuir devolve a sobra.** Se o Versatile Framework só consome 30 das 60 vigas, as vigas precisam de menos aço; o aço livre vai para a outra perna (canos) se ela não tiver limite; se não houver para onde ir, o consumo vai reduzindo para trás até as mineradoras, e aparece como **represado** onde parou (em verde, com a quantidade).
- **Aproveitar a sobra:** para nada ficar represado, ligo a sobra num bloco de sobra (Awesome Sink, Container ou Saída) ou marco uma saída como "coleta o excesso". Esses blocos recebem tudo que sobra ali.
- **Subproduto parado trava a máquina (decisão do dono, mecânica do jogo).** Se a saída de um subproduto (Heavy Oil Residue, Polymer Resin, Silica, a água da Alumina…) não tem para onde ir, ela enche e o bloco desacelera ou para, e isso se espalha pela cadeia como no jogo. O planner mostra o bloco travado e o motivo; resolver é comigo: ligar um consumidor, um Awesome Sink (sólido) ou uma Saída/Container. Fluido não vai pro sink (`AGENTS.md`), então água e outros fluidos sobrando só se resolvem com consumidor, Container (Fluid Buffer) ou Saída.
- **Loops liberados (decisão do dono).** Um bloco pode alimentar outro que está antes dele na cadeia (borracha e plástico reciclados, água da alumina). O cálculo repete até estabilizar e detecta quando a cadeia trava (tudo zera, como no Modeler), mostrando onde.
- O cadeado da fase 1 e o recálculo para cima e para baixo saem: todo valor fixado já é uma trava, e o fluxo é para a frente com a sobra voltando. Cadeias salvas antes da fase 3 abrem com as quantidades de máquinas de cada etapa como valores fixados.
- Máquinas fracionárias (como "2,4" no Modeler) viram a contagem inteira com clock, como a fase 1 já faz; o arredondamento e o clock do bloco seguem a fase 1.
- Os números rodam fora da tela (worker, como a fase 2), e a tela nunca espera o cálculo.

## Ligação

- O antigo "meio" passa a se chamar **Ligação** em toda a interface (pt "Ligação", en "Connection", es "Conexión"); "balancer" continua o nome da peça. O título no modal diz o que tem dentro, ex.: "Ligação · balancer 5→8".
- A ligação é uma peça do mapa: arrastável sozinha, presa na grade de 8 m, com as esteiras dos blocos até ela refeitas ao mover. A posição inicial continua sendo colada na saída da primeira origem (fase 2).
- **Modal da ligação:** abre por clique, mostra as alternativas e o desenho do fluxo da ferramenta atual (o mesmo desenho, com as esteiras animadas), a escolha da montagem (a da fase 2), e os botões "Montar passo a passo" (o montador da ferramenta atual, já com essa ligação) e "Abrir no Balancer" (a seção, em página cheia). Fecha com Esc e devolve o foco.

## Navegação

- `/` (e `/pt`, `/es`): o builder.
- "Balancer": a ferramenta atual, em rota própria (decisão de quem constrói, ex.: `/balancer`, `/pt/balancer`), com o mesmo comportamento de hoje. Links antigos (`/#s=…`, `/pt#s=…`) continuam abrindo o Balancer com o cenário, não o builder.
- `/planner…` redireciona para o builder (links compartilhados `#p=` continuam valendo).
- As rotas novas e os redirects entram juntos no `vercel.json` e no `nginx.conf`, e o `sitemap.xml` é atualizado. Título, descrição e `canonical` de cada página seguem a regra de idioma do `AGENTS.md`.
- O que sai do primeiro plano: o painel de digitar taxas deixa de ser a porta de entrada do site; a sidebar de busca da fase 1 dá lugar ao seletor no canvas.

## Ícones (decisão do dono: os do jogo)

Os ícones de itens e prédios são arte do jogo (Coffee Stain), não dos apps que os usam. Ferramentas de fã (Satisfactory Calculator, Satisfactory Tools, satisfactory-logistics) usam essa arte com um aviso de que os direitos são da Coffee Stain; não encontrei uma política oficial de conteúdo de fã que autorize ou proíba. O repositório `rockfactory/satisfactory-logistics` tem ícones de todos os itens em 64 e 256 px (`public/images/game/`).

Decisão do dono: **usar os ícones do jogo**, com o aviso de direitos da Coffee Stain no rodapé (pt/en/es), como os outros sites fazem. Os ícones ficam em `public/`, sem carregar de outro domínio (CSP), em formato leve (ex.: 64 px, WebP), gerados por um script versionado a partir da fonte (o `satisfactory-logistics` ou os arquivos do jogo).

## Publicação (decisão do dono)

Nada sobe antes da fase 3 terminar. Depois sobe tudo junto (fases 1, 2 e 3): o builder vira a página inicial e a ferramenta atual vai para a seção Balancer, numa vez só. Não precisa de estado intermediário (builder atrás de chave, `/planner` beta convivendo).

## Desempenho

Vale tudo da fase 2: cálculo fora do render, canvas só com o visível, cache. O solver de fluxo novo também roda no worker; editar um bloco só recalcula o que é afetado. Meta: montar e arrastar sem engasgar numa fábrica de ~2.000 máquinas.

## Fica para quem constrói

- O algoritmo do fluxo físico (propagação para a frente com limites e sobra voltando), desde que cumpra "Números" e seja testado com o exemplo do Versatile Framework e com divisão em duas pernas com e sem limite.
- Formato do estado salvo (versão nova da `Chain`, lendo as antigas).
- Visual do bloco no canvas (ícones, portas, falta/sobra), dentro do tema, feito com `/frontend-design`.
- Como o builder mostra o detalhe de um bloco (painel, popover, a tela de etapa da fase 1).
- Testes: lógica pura com `node --test`; telas com o harness visual.
- Atualizar `AGENTS.md`, READMEs, `docs/backlog.md` e o sitemap.
