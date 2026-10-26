# Builder — fase 4: montar as fileiras como no jogo

Data: 2026-10-26. Continua os specs das fases 1–3 (`2026-10-25-planner-2d-design.md`, `…-fase2-design.md`, `…-fase3-design.md`) e da reforma visual (`2026-10-25-builder-reforma-visual-design.md`); o que não muda aqui continua valendo. Branch: `planner-2d-fase3` (fases 1–3 e a reforma prontas, mais a seleção múltipla e o zoom de longe; nada na `master`, nada enviado). O dono quer a fase 4 feita **antes** de subir tudo junto.

Referência da conversa: o desenho da fábrica de ferro do dono, aprovado por ele ("isso aí mesmo"), em `docs/superpowers/research/2026-10-26-fase4/fabrica-ferro-2x2.png` (e `.html`).

## Por que

Hoje cada bloco de receita só sabe montar as máquinas de um jeito: N fileiras iguais, cada uma com a esteira de entrada de um lado (Splitters) e a de saída do outro (Mergers), a entrada numa ponta e a saída na outra. Na fábrica real do dono não é assim. Exemplo dele (Pure Iron Ingot, 42 refinarias):

- 4 fileiras, duas de cada lado (11 em cima e 10 embaixo, dos dois lados);
- o minério entra pelas pontas de fora e anda para dentro (cada fileira tem a sua esteira de entrada);
- no corredor do meio, **uma linha só de Mergers** recebendo das fileiras de cima e de baixo (um Merger por coluna);
- essa linha **fecha a cada 7 máquinas** (7 × 65 = 455, cabe na Mk4) e cada trecho desce por elevador para o andar de logística: 6 saídas, "tortas", onde caírem.

Ele quer conseguir montar coisas assim no builder, ver se cabe no espaço e se alguma esteira estoura. Ao mesmo tempo, com a Planta em escala pronta, a vista Montar pode virar o que o Modeler é: limpa, sem a faixa das fileiras. Palavras dele: "o modo montar fica sendo literalmente uma cópia do Modeler, funciona igual, limpo e claro, e pra fazer a fábrica a gente usa o modo planta".

## Metas

### 1. Montar enxuta, igual ao Modeler

- O cartão da Montar perde a faixa das fileiras: ícone, receita (selo Alt), número de máquinas em destaque ("fixado" quando é limite do usuário), clock quando ≠ 100 %, e as portas. Nada mais. Cartões menores → mais fábrica na tela; `proposeMap` reserva o tamanho novo.
- O estado das portas, os chips, o Balanço, o painel e os gestos da reforma continuam iguais.
- **Ver as fileiras sem sair da Montar** (decisão minha, o dono deixou "o jeito que for melhor pra UX"): selecionar o bloco mostra, no painel, uma miniatura das fileiras como estão montadas (o desenho da Planta daquele bloco, sem grade), com o nome do modelo e as saídas ("6 saídas de 455/min · descem por elevador"). Duplo clique (ou "Montar fileiras" no painel) abre a tela da etapa, onde se edita. Nada de expandir dentro do cartão: empurraria os vizinhos.

### 2. Montar as fileiras na tela da etapa

A tela da etapa (`ui/StageView.tsx`, aberta pelo duplo clique; hoje "Cadeia › Wire" com as fileiras L1…L5 e o painel de receita, máquinas, clock, por linha, esteiras, peças e área) vira o lugar de montar o arranjo do bloco. O dono quer **as duas coisas**: modelos prontos já calculados com o recomendado **e** liberdade para personalizar ("tem que ter os modelos prontos mas também ser bem personalizável").

**Modelos prontos** (cada um gera o arranjo inteiro a partir do número de máquinas, das taxas da receita e do tier da esteira, com o recomendado já calculado: máquinas por fileira, onde cada esteira fecha, quantas entradas e saídas, tudo dentro do limite):

- **Fileira simples** (o de hoje): cada fileira com a entrada numa ponta e a saída na outra.
- **Costas com costas:** fileiras em pares, viradas uma para a outra, dividindo o corredor do meio (as saídas das duas lado a lado, ou as entradas).
- **Mergers no meio** (a fábrica do dono): fileiras dos dois lados de um corredor; entradas pelas pontas de fora, cada fileira com a sua; uma linha só de Mergers no corredor recebendo de cima e de baixo, fechando a cada N máquinas; cada trecho sai por baixo ou por cima (elevador). O inverso também (entradas no meio, saídas nas pontas).

**Personalizar** (depois de escolher um modelo, ou partindo de um):

- virar uma fileira de cabeça para baixo (a entrada passa para o outro lado);
- espelhar (entrada na outra ponta);
- arrastar uma fileira para outro lugar (na grade de 8 m da etapa);
- mudar o "fecha a cada N" de uma esteira (de entrada ou de saída);
- escolher por onde cada esteira entra/sai: pela ponta da fileira (esquerda/direita), pelo meio, **por baixo** ou **por cima** (elevador).
- Quando duas fileiras ficam com as saídas (ou as entradas) coladas, o app entende que elas podem dividir a mesma esteira (é assim que o "Mergers no meio" funciona) e conta junto.

**O app avisa, sempre ao vivo:** esteira que passa do limite do tier (com o conserto: subir o tier ou fechar antes), Merger com mais de 3 entradas, linha de complemento em série (o padrão que o AGENTS.md proíbe sugerir), arranjo que não usa todas as máquinas, e "Mergers no meio" com saída pela ponta (perde o sentido: o dono disse que esse arranjo só vale saindo por baixo ou por cima; o app avisa e sugere por baixo).

**Como o "fecha a cada N" conta numa linha de Mergers dividida** (resposta do dono): conta **máquinas**, não colunas. Quando o corte cai no meio de uma coluna (a máquina de cima vai para um trecho e a de baixo para o próximo), aquela coluna leva **dois Mergers**, um em cada trecho, e cada saída fica com exatamente N máquinas (no exemplo, 6 saídas de 7 = 455). As marcas de desce/sobe ficam no fim de cada trecho, onde caírem.

Peças (Splitters, Mergers) e área da etapa recontam a cada mudança.

### 3. O arranjo vale para o resto do builder

- **Planta em escala:** o bloco desenha as fileiras como montadas: posição e direção de cada fileira, as esteiras com os cortes, os Mergers/Splitters e as **marcas de "desce" / "sobe"** onde a esteira vai para outro andar. A pegada do bloco é a do arranjo.
- **Portas na Planta:** cada porta fica onde a esteira realmente sai ou entra: na ponta da fileira, no meio, ou na marca de desce/sobe. A ligação continua no mapa como hoje, saindo dessa porta (o andar de logística não é desenhado: "só marcar que sai por baixo já serve").
- **Ligação:** as saídas do arranjo são as "linhas de origem" da ligação, e as entradas do arranjo do bloco seguinte são as "linhas de destino". No exemplo do dono, a ligação recebe 6 linhas de 455 (antes: 6 fileiras de 7 = as mesmas 6 de 455, mas por outro motivo). Linhas de tamanhos diferentes (ex.: entradas de 11 e de 10 máquinas) entram como linhas diferentes.
- **Montar:** nada muda no cartão (é enxuto); o número de portas continua um por item.

### 4. "Só as máquinas"

Botão **Camadas** nos controles do mapa (decisão minha sobre o formato; o pedido do dono foi "uma opção de ocultar ícones e ligações, só as máquinas mesmo"), valendo nas duas vistas: liga/desliga **ícones**, **nomes**, **ligações** (esteiras do mapa e chips) e **portas** (com os rótulos de estado). Tudo desligado = só os blocos/máquinas e a grade. A escolha fica salva no navegador (como o painel), não no `Factory`.

## Não-metas (decididas pelo dono)

- **Andar de logística:** não desenhar o andar de baixo nem as esteiras dele; basta a marca de "sai por baixo/por cima".
- **Portas reais dos prédios**, **Blueprint Designer no mapa** e **medidas reais de Miner, extratores e Container**: "nem pra depois, não vejo isso como relevante". Saem do backlog.
- Mudar o solver (fluxo físico) ou como a falta/sobra é calculada. O dono olhou um bloco "42 fixado" rodando a 3 máquinas por causa da frente e disse que estava certo do jeito que está; mostrar gargalo na frente "pode incomodar".
- Desenho livre de esteira ponto a ponto (traçar cada esteira à mão). A liberdade é sobre as fileiras e as esteiras delas (virar, arrastar, cortar, por onde sai), não um editor de esteiras.

## Anti-metas

- A Montar voltar a ficar poluída (faixa, rótulos demais) — ela é a cópia limpa do Modeler.
- Modelo pronto que gera esteira estourada ou Merger com 4 entradas sem avisar.
- Mexer no arranjo e a ligação continuar calculando com as linhas antigas.
- Perder fábrica salva: estados antigos (`#p=`, `localStorage`) abrem com o arranjo "Fileira simples" equivalente ao de hoje, idêntico em números e peças.

## Restrições

- Todas as do AGENTS.md: pt/en/es em todo texto novo; commits em português com o `Co-Authored-By`; sem push/merge sem o OK do dono; sem domínio novo na CSP; o Balancer (`/balancer`) não piora.
- Mecânicas: Merger e Splitter com no máximo 3 entradas/saídas; esteiras Mk1–Mk6 (60/120/270/480/780/1200); canos sem Splitter/Merger (fluido: Junction, sem garantir partes iguais — no arranjo, o cano só liga e respeita a capacidade, como hoje). Na dúvida sobre mecânica, perguntar ao dono.
- O arranjo entra no `Factory` v2 (por bloco de receita) e passa pelo `encode/decode` que valida tudo; valor inválido cai no "Fileira simples".
- Quando o número de máquinas muda (bloco livre, o solver recalcula), o arranjo se refaz a partir do modelo e dos ajustes que ainda fazem sentido (ex.: "fecha a cada 7" e "sai por baixo" continuam; uma fileira arrastada que deixou de existir some). Decisão minha; o builder escolhe a representação.
- Desempenho: o mapa continua com quadro ≤ ~7 ms na fábrica de 2.000 máquinas; a tela da etapa responde ao vivo.
- `npm test`, `npm run typecheck`, `npm run build` e `npm run smoke` passando; o smoke ganha um passo de trocar o modelo do arranjo e ver a ligação mudar.

## Decisões minhas (o dono pode mudar)

Vieram da leitura de revisão; o dono não decidiu estas, eu decidi:

- **Receita com mais de um item** (ex.: Pure Iron Ingot leva água; receitas com duas entradas sólidas ou subproduto): o arranjo é **por fileira e por item**. Cada item tem a sua esteira (ou cano) em cada fileira, com o seu "fecha a cada N" e o seu ponto de entrada/saída. Os modelos põem os itens que não são o principal do jeito mais simples: cada um com a sua esteira por fileira, entrando pela mesma ponta da entrada principal; subproduto sai junto da saída principal, mas na sua própria esteira. O dono disse que a água "é meio que tanto faz": o cano segue a entrada, sem cortes.
- **Costas com costas × Mergers no meio:** em "Costas com costas" as esteiras das duas fileiras ficam **separadas**, lado a lado no corredor; é só o arranjo. Dividir a mesma esteira acontece no "Mergers no meio" ou quando o usuário liga **"juntar"** em duas esteiras coladas do mesmo item e do mesmo lado (nunca sozinho). Juntar soma as taxas e passa pela checagem do limite e das 3 entradas do Merger.
- **Portas:** continua **uma porta por item** no bloco, na Montar e na Planta; o `Link` não muda. Na Planta, a porta fica no ponto médio das saídas daquele item (ou na única saída), e o desenho do bloco mostra cada esteira e cada marca de desce/sobe. A ligação recebe **todas** as linhas daquele item que o arranjo produz.
- **Elevador (desce/sobe):** conta como peça na lista de peças da etapa ("Elevador: N"), não muda o tier nem a área do chão; é a marca no desenho e a posição da porta.
- **Bloco rodando abaixo do total** (o solver reduz pelo que a frente leva): as linhas do arranjo vão para a ligação escaladas pelo clock de funcionamento, como o `meioInput` faz hoje com as fileiras; cada linha mantém a proporção do número de máquinas dela.

## Deixado para quem constrói

- A representação do arranjo no modelo (lista explícita de fileiras + esteiras com cortes e saídas, ou modelo + parâmetros + ajustes), desde que cubra os três modelos e os ajustes acima e migre o estado de hoje sem mudar números.
- Como a ligação recebe linhas de tamanhos diferentes (o `computePlan` hoje recebe grupos de "N máquinas por linha" com a última incompleta; linhas heterogêneas podem precisar do caso D ou de grupos por tamanho).
- O desenho exato da tela da etapa (onde ficam o seletor de modelo e os controles de cada fileira), seguindo o visual da reforma; vale fazer um protótipo e mostrar ao dono antes de construir.
- O desenho da miniatura no painel.
