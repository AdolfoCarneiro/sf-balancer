# Planner 2D — cadeia com receitas e fábrica desenhada

Data: 2026-10-25. Telas de referência (canvas "Planner 2D", aprovadas pelo dono como a direção): https://claude.ai/artifact/4zd8tDeQc9GFKhL7nK5w99 — `Main` (cadeia nó a nó), `Etapa` (etapa aberta), `Mapa` (mapa).

## Intenção

Hoje uso o Satisfactory Modeler para a camada lógica: monto a cadeia nó a nó, ele diz "42 máquinas, 2.730/min" num card. O que ele não diz é **como isso fica no chão**: quantas fileiras, quantas máquinas por fileira, por onde passa cada esteira, onde entra o balancer entre uma etapa e outra. Hoje faço essa tradução na cabeça e no sf-balancer, uma ligação por vez, digitando as taxas na mão.

O planner é um **substituto do Modeler**: a mesma experiência de montar a cadeia com as receitas do jogo, mas cada etapa aparece desenhada como fileiras de máquinas em escala, cada ligação entre etapas já resolve o "meio" com a lógica que o site já tem, e a fábrica inteira pode ser vista num mapa, posicionada pela ferramenta e ajustada por mim.

Sucesso: consigo planejar uma cadeia real (ex.: ferro puro → aço → vigas e canos) sem abrir o Modeler e sem fazer conta por fora, e sei como montar cada etapa e cada ligação no jogo.

## Metas

- Conhecer as receitas e prédios do jogo (1.1), incluindo alternativas.
- Montar a cadeia **nó a nó** (como no Modeler) e, numa fase seguinte, **pelo objetivo** ("quero 480 de aço/min").
- Cada etapa desenhada em escala: fileiras de máquinas, esteiras/canos de entrada e saída, Splitters e Mergers dos manifolds.
- Cada ligação entre etapas resolvida pelo "meio" atual (casos A–D, balancer, sobra, peças), sem digitar taxas.
- Mapa da fábrica inteira: a ferramenta propõe a posição dos blocos, eu arrasto e ajusto.

## Não-metas

- Simulação de energia, logística de trem/drone/caminhão, mapa do mundo, nós de recurso.
- Editor livre de construção (peça por peça como no jogo). O mapa trabalha com blocos de etapa, não com fundações soltas.
- Layout ótimo. A ferramenta propõe um ponto de partida decente; quem decide sou eu.

## Anti-metas (falharia mesmo funcionando)

- Inventar mecânica do jogo (taxas, portas, comportamento de peças). Na dúvida, perguntar ao dono (regra do `AGENTS.md`).
- Esconder o desenho atrás de números: se a etapa vira só um card com "42 máquinas", é o Modeler de novo.
- Quebrar ou piorar a ferramenta atual. O site de hoje continua funcionando como está.

## Fases (a "v1" é o conjunto; cada fase já serve sozinha)

1. **Cadeia nó a nó com receitas.** Busca de receita (com alternativas), etapas ligadas no grafo, cada etapa mostra as fileiras em escala, cada ligação mostra o caso do meio e abre o meio completo. Tela da etapa aberta (receita, máquinas, clock, por linha, esteiras por porta, peças, área estimada). Telas `Main` e `Etapa`.
2. **Mapa.** Blocos das etapas em escala sobre a grade de fundações de 8 m, posicionados por moldes, com o meio entre os blocos que liga; arrastar, girar 90°, prender na grade, propor de novo. Tela `Mapa`.
3. **Pelo objetivo + importação.** Solver que monta a cadeia a partir de um alvo (alternativas, subprodutos, loops, sobras). Importar `.sfmd` do Modeler, se o formato permitir (ainda sem arquivo de exemplo).
4. **Detalhe fino.** Portas reais de cada prédio (medidas no jogo), andares, marcações do Blueprint Designer na fábrica inteira.

## Decisões do dono

- Visual segue o site atual (tema escuro, laranja FICSIT, placas, Chakra Petch + IBM Plex Sans). Sem design system.
- As três telas do canvas são a direção aprovada.
- Ferramenta propõe, eu ajusto (fileiras e, no mapa, posição dos blocos).
- Começar nos dois modos (nó a nó e pelo objetivo); nó a nó primeiro.
- **Nomes de itens e receitas em inglês por enquanto.** Depois devem acompanhar o idioma selecionado, quando o dono trouxer os arquivos `pt-BR` e espanhol do jogo (`steamapps/common/Satisfactory/CommunityResources/Docs/`). Ideia para depois: opção separada para o idioma dos itens (quem lê em português mas joga em inglês).
- O resto da interface segue a regra de sempre: pt/en/es em tudo.
- **A cadeia se recalcula, como no Modeler.** Mexer numa etapa (ex.: fundições de 60 para 70) recalcula a cadeia para cima e para baixo: as etapas que alimentam sobem para dar conta e as que consomem acompanham. Não são nós independentes que só avisam a diferença.
- **Um item indo para várias etapas (ou vindo de várias) é planejado pelo que eu quero produzir.** Eu digo quantas vigas e quantos canos quero; a ferramenta calcula quanto aço vai para cada lado e o meio **calcula e desenha a divisão**: linhas inteiras para cada consumidor quando fecha, e balancer, Splitters e Mergers onde não fecha, do mesmo jeito que o meio faz hoje entre duas etapas. Não é só "5 linhas, 3 para um lado e 2 para o outro".

## Restrições

- Tudo do `AGENTS.md` vale: i18n em três idiomas, nomes de peças em inglês, commits em português, deploy pelo push no `master` (confirmar antes), `nginx.conf` espelha o `vercel.json`, CSP no `vercel.json` para qualquer coisa externa nova.
- Roda estático no navegador, sem servidor (como hoje). Salvar local + link compartilhável, como os cenários atuais.
- Mecânicas já fixadas no `AGENTS.md` (capacidade de esteira e cano, Splitter/Merger com 3 portas, Awesome Sink sem fluido, Pipeline Junction) continuam valendo dentro das etapas e no meio.

## Como funciona (o que já está decidido)

### Dados do jogo

- Fonte: o `en-US.json` da pasta `CommunityResources/Docs` do jogo, versão 1.1. Há uma cópia pública em `rockfactory/satisfactory-logistics` (`data/docs-en.json`, atualizado para 1.1 em 2026-04-12; repositório MIT, os dados são do jogo). Um script nosso gera um JSON compacto (itens, receitas, prédios de produção, taxas por minuto, fluido ou sólido) que vai versionado no repo. O arquivo bruto não entra no build.
- Tamanho dos prédios: tabela feita à mão a partir da wiki (o Docs não traz). Já levantado: Smelter 5×10, Foundry 10×10, Constructor 8×10, Assembler 9×16, Manufacturer 18×20, Refinery 10×22, Blender 18×16, Packager 8×8, Particle Accelerator 24×38, Converter 16×16, Quantum Encoder 22×50 (m, largura × comprimento).
- Posição das portas: não documentada em lugar nenhum. Até a fase 4, o desenho usa uma convenção (entradas de um lado, saída do outro) e a área é marcada como estimativa.

### Etapa

- Uma etapa = uma receita + um prédio + quantidade de máquinas + clock. Por porta (cada item de entrada e saída): taxa por máquina, tier da esteira ou cano.
- Fileiras: uma fileira = uma linha de esteira, como a ferramenta já agrupa hoje. "Por linha" sugerido e editável. A sugestão sai da porta mais apertada, entradas e saídas, no tier padrão (Mk4, cano Mk2), arredondada para baixo. Assim a sugestão nunca estoura: refinaria de Pure Iron dá 7 (saída 455), Foundry de Solid Steel dá 8. Toda porta que estoura a capacidade gera aviso com as saídas possíveis (subir o tier daquela esteira ou reduzir por linha). Exemplo das telas: Foundry 12 por linha → entrada 480 (Mk4), saída 720 → Mk5.
- Peças da etapa: Splitters dos manifolds de entrada e Mergers do manifold de saída, com a convenção k−1 que já existe.
- Receita com várias portas (decisão minha, revista no plano): a sugestão usa a porta mais apertada entre todas, como descrito acima. Quem quiser 12 fundições por linha, como no exemplo do `AGENTS.md`, digita 12. A saída sobe sozinha para Mk5, porque o tier de cada porta é automático (o menor que comporta, a partir do padrão) até eu escolher outro.
- Subprodutos (decisão minha): cada saída da receita é uma porta com linhas próprias, que pode ser ligada a outra etapa. Uma saída sólida sem ligação vai pro sink; uma saída fluida sem ligação gera aviso, porque o Awesome Sink não aceita fluido.
- Clock (decisão minha): um clock para a etapa inteira, de 1% a 250% (power shards), e as taxas por máquina escalam junto. Somersloop e a máquina "quebrada" com clock menor, como o Modeler mostra, ficam para depois. Mecânica do jogo: confirmar com o dono antes de ampliar.

### Ligação e o meio

- Uma ligação leva um item da saída de uma etapa para a entrada de outra. O meio de cada ligação é calculado por `computePlan` com os dados que hoje digito: origem = linhas da etapa de cima, destino = linhas da etapa de baixo, mesmo item, mesmo tier, mesma política de sobra.
- No grafo, a ligação mostra o caso (A–D) e a sobra; clicar abre o painel (oferta, demanda, sobra, peças) e o botão "Abrir o meio completo" abre a tela atual do site com esse cenário (pelo mesmo estado do link `#s=`).
- Recursos brutos (minério, água, carvão) aparecem como entradas da cadeia, sem mineradoras na fase 1.
- **Divisão e junção (decisão do dono, acima).** Uma saída que alimenta N etapas, ou N saídas que alimentam uma entrada, é **um meio só** com várias origens ou vários destinos. Ele reparte as linhas inteiras primeiro e resolve o resto com a mesma maquinaria de hoje (doadoras, balancer, loop ou dividir a mais e mandar pro sink, cascata de Mergers). Isso **estende** `src/logic`. A lógica de 1 para 1 continua igual e com os mesmos testes, e os casos novos ganham testes próprios. Abrir o meio completo de uma divisão mostra a divisão inteira, não um par por vez.
- **Tier da ligação (decisão minha).** O meio usa o tier da esteira das linhas que existem fisicamente na origem, que é o maior dos dois lados (ex.: saída Mk5 de 720 entrando em fileiras Mk4 de 480). O tier por trecho, que já está no backlog, resolve isso de vez. Até lá, o link "abrir o meio completo" leva o tier maior.

### Recalcular a cadeia (decisão do dono, detalhes meus)

- A cadeia é guiada pelo que eu quero produzir: as etapas finais têm a meta (ex.: 450 vigas/min), e as de cima são calculadas para dar conta, somando o que cada consumidor pede.
- Editar a quantidade de uma etapa do meio recalcula para os dois lados: a de cima se ajusta para alimentar, e as de baixo escalam na mesma proporção (se ela divide entre vigas e canos, os dois sobem juntos).
- Contagem de máquinas arredondada para cima. O excesso vira sobra no meio, como hoje (represa, sink ou linha extra, pela política).
- Uma etapa pode ser fixada ("travar"). Uma etapa travada não muda com o recálculo, e a diferença aparece como falta ou sobra na ligação.

### Mapa (fase 2)

- Cada etapa vira um bloco retangular com suas fileiras em escala. Os blocos são postos por moldes: em sequência, na ordem da cadeia, ligados por esteiras retas, com o meio entre os dois blocos que liga. Arrastar o bloco leva junto as esteiras e o meio.
- Sem solver de posição. Cruzamentos de esteira são avisados, não resolvidos automaticamente.

### Stack (decisão minha)

- O planner é um editor grande (grafo com zoom, arrastar, desfazer, muitos estados). Ele vai em **TypeScript + React**, como combinado para quando o planner chegasse.
- Grafo da cadeia com React Flow (`@xyflow/react`, MIT) e arrumação automática com dagre, como no satisfactory-logistics.
- Solver da fase 3: HiGHS (`highs`, WASM, MIT), o mesmo do satisfactory-logistics e do Satisfactory Tools. YALPS (JS puro) é a alternativa se o tamanho do WASM pesar.
- A lógica atual (`src/logic`) é reaproveitada e chamada pelo planner. Ela só é estendida para o meio com várias origens ou destinos. A página atual continua como está.
- Idioma (decisão minha): o planner usa o mesmo estado de idioma e a mesma regra de rota (`/pt`, `/es`, `/` inglês) do site, e os textos que a lógica devolve já traduzidos por `t()` continuam assim. As rotas novas entram no `vercel.json` e no `nginx.conf` juntas.
- Ícones (decisão minha): a fase 1 é sem ícones do jogo, como nas telas. Usar a arte do jogo fica para depois de conferir a permissão.

## Referências

- `rockfactory/satisfactory-logistics` (MIT): exemplo de app React com dados 1.1, solver HiGHS, React Flow e parser de save. Serve de inspiração e de fonte dos dados. As ~600 imagens de `public/images/game` são arte do jogo (Coffee Stain), não do repositório: conferir antes de usar ícones.
- Kirk McDonald calculator / SFTools: formulação do solver (receita ≥ 0, balanço de itens ≥ alvo, receita de sink, custo pequeno por receita).
- Modeler: referência de experiência, formato `.sfmd` fechado e sem documentação.

## Fica para quem constrói

- Onde o planner mora no site (rota nova, página separada) e como a navegação liga as duas ferramentas.
- Formato do estado salvo e do link do planner, desde que siga o padrão de hoje (validação na leitura, como `decodeShare`).
- Desfazer/refazer, atalhos, seleção múltipla.
- Molde exato dos blocos no mapa e espaçamentos padrão (ex.: vão de 4 m entre fileiras), desde que editáveis.
- Testes: a lógica nova (dados, etapa, fileiras, ligação → meio, moldes do mapa) com `node --test` como hoje; telas com o harness visual.
- Atualizar `AGENTS.md` (a seção "Fora do escopo" hoje proíbe receitas, cadeia e layout físico), os READMEs e o `docs/backlog.md` quando a fase 1 entrar.
