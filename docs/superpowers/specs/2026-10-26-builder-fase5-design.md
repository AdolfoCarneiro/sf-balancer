# Builder — fase 5: tela da etapa refeita, saídas espertas, vistas independentes, importar do Modeler e tutorial

Data: 2026-10-26. Continua a fase 4 (`2026-10-26-builder-fase4-fileiras-design.md`) e tudo antes dela. Branch: `planner-2d-fase3` (fases 1–4 prontas, nada na `master`, nada enviado). O dono testou a fase 4 no docker ("show demais") e trouxe estes pontos; quer tudo feito antes de subir.

Esboço aprovado da tela da etapa ("tá bão"): `docs/superpowers/research/2026-10-26-fase5/etapa-v2.png` (e `.html`). Exemplos de `.sfmd`: `docs/superpowers/research/2026-10-26-fase5/sfmd/` (BSD-3, de `dberlin/SatisfactorySolver`; mais exemplos grandes em `NicoBuilds/NicoBuilds-Blueprints`, pasta `Game Stuff/Factory Diagrams/Satisfactory Modeler/`).

## Por que (palavras do dono, resumidas)

- Tela da etapa: "ux aqui tá muito ruim, sobra espaço na tela, a lateral tá confusa, não tá intuitiva, navegação não tá legal, não tem um voltar pra voltar da config que entrei, e ainda tem um scroll sendo que tem espaço sobrando pra todo lado".
- Copper Ingot com 40 máquinas em "Mergers no meio" deu 4 saídas "sendo que dá pra fazer 3 … não é porque a entrada tá separada que a saída tem que ser também … o app tem que ter inteligência".
- "Ter opção de marcar se quer que o arraste de um influencie o outro, porque o Montar é meio que o mapa mental e a Planta é como vai ficar no mapa; arrasto pra ver como vai ficar minha fábrica e bagunça o Montar todo."
- "Dá pra subir do Modeler pra montar o mapa e planejar a fábrica depois na Planta? Tenho tudo lá, quero só mandar pra cá."
- "Rola um tutorial de tudo com opção de pular ou não, e botões pra ensinar a mexer na área também."

## Metas

### 1. Tela da etapa refeita (segue o esboço)

- **Topo fixo:** "← Voltar ao mapa" (botão principal, em destaque), caminho "Fábrica › Receita [› Fileira N | › Esteira …]" (cada parte clicável volta àquele nível), máquinas, clock e receita editáveis ali mesmo, e "? Como mexer".
- **Desenho ocupa todo o espaço livre**, com zoom (−, +, rodinha com Ctrl/pinça como no mapa), arrastar o fundo para mover e "Enquadrar"; abre enquadrado. Nada de faixa vazia nem rolagem da página.
- **Painel à direita, largo (~340 px) e sem rolagem**, em dois níveis:
  - *Visão geral* (nada selecionado): os três modelos como cartões com miniatura, "Inverter", a dica "clique numa fileira ou numa esteira para ajustar; as setas movem a fileira", "Voltar ao modelo" quando houver ajustes.
  - *Ajuste* (fileira ou esteira selecionada): "← Voltar à visão geral" no alto, só os controles daquela coisa (fileira: Virar, Espelhar, mover, as esteiras dela com "Juntar"; esteira: Sai/Entra por, Fecha a cada com "Recomendado" e a conta explicada — "16 × 30 = 480/min, cabe na Mk4; com 17 passaria do limite" —, Dividir igual, tier). Esc e o caminho no topo também voltam.
  - *Resumo fixo embaixo*, nos dois níveis: saídas (com as taxas), entradas, Splitters, Mergers, Conveyor Lifts, área, e "✓ Tudo dentro do limite" ou os avisos com o conserto.
- **Barra flutuante** sobre o desenho com as ações rápidas da seleção (como no esboço).
- No celular, o painel vira folha de baixo (como o painel do mapa).

### 2. Saídas espertas

- Em "Mergers no meio" (e no inverso, para entradas), a linha compartilhada do corredor **atravessa os dois pares da mesma faixa** quando isso dá menos saídas que fechar cada par separado. Copper Ingot, 40 máquinas, Mk4: 3 saídas, não 4. Quando cada par fecha certinho (o ferro do dono: 21 = 3 × 7 por par), continua igual a hoje (6 saídas de 455, 22 Mergers).
- **Opção "Dividir igual"** por esteira cortada (padrão: desligada = encher cada esteira até o limite, como hoje): com ela, as máquinas se dividem o mais igual possível entre o mesmo número de saídas (40 → 14, 13, 13 = 420, 390, 390 em vez de 16, 16, 8 = 480, 480, 240). Vale para linha compartilhada e para corte numa fileira.
- O número de saídas é sempre o mínimo que cabe na esteira, a menos que o usuário fixe "Fecha a cada N".

### 3. Montar e Planta com posições independentes

- Cada vista guarda as **suas** posições de blocos e ligações. Arrastar na Planta não mexe na Montar, e vice-versa.
- Opção **"Mover junto"** (nos controles do mapa; padrão desligada): ligada, arrastar numa vista aplica o mesmo deslocamento na outra.
- Estado salvo antigo: as posições de hoje viram as das duas vistas (nada muda ao abrir).
- Bloco novo nasce nas duas vistas no mesmo ponto; "Propor de novo"/"Mostrar tudo" valem para a vista atual.

### 4. Importar do Satisfactory Modeler (`.sfmd`)

- Botão **"Importar do Modeler"** (no painel sem seleção e no topo, junto de Compartilhar) abre o seletor de arquivo (`.sfmd`, JSON). Lido no navegador, nada sai da página.
- Cada nó vira um bloco: receita pelo nome (`Name` = nome da receita no jogo, inclusive alternativas); recurso minerável (ex.: "Iron Ore") vira Miner; "Water", "Crude Oil", "Nitrogen Gas" etc. viram o extrator certo; Awesome Sink e Dimensional Depot viram sobra (Awesome Sink / Container ou Saída — decisão de quem constrói, dita no relatório da importação). `Max` vira o limite do bloco (número de máquinas ou taxa, conforme o arquivo indicar — ver "Deixado para quem constrói"). `Inputs` (no consumidor, apontando para o índice do nó produtor) viram as ligações. `X`/`Y` viram as posições da **Montar** (escaladas para ficarem parecidas com o Modeler); a Planta recebe a proposta automática de hoje.
- Ao fim, um resumo: "N blocos, M ligações importados; não reconhecidos: …" (nome e motivo), nos três idiomas. Importar **substitui** a fábrica atual, com confirmação, e um Ctrl+Z desfaz.
- Arquivo inválido ou de outro programa: aviso claro, nada muda.

### 5. Tutorial e "Como mexer"

- **Tutorial guiado** na primeira visita (substitui a dica de primeiro uso de hoje): uma sequência curta de passos que destaca cada parte de verdade na tela (criar bloco, ligar arrastando da porta, chip da ligação, Balanço/faltas, painel e consertos, Montar × Planta, Camadas, abrir a etapa, importar do Modeler), com "Próximo", "Voltar" e **"Pular"** em todo passo. Fica lembrado no navegador; dá para rever pelo botão "Tutorial" (perto da Legenda).
- **Botões "? Como mexer"** em cada área (mapa, painel, tela da etapa): abrem só os passos/dicas daquela área (gestos, atalhos, o que cada controle faz).
- Tudo nos três idiomas, acessível pelo teclado, alvos ≥ 44 px, respeitando movimento reduzido.

## Não-metas

- Exportar para `.sfmd` (só importar).
- Importar posts, "Outpost"/agrupamentos, clock por nó além do que mapeia direto, waypoints das ligações e configurações do Modeler (modo de cálculo, multiplicadores): ignorados e listados no resumo se presentes.
- Mudar o solver, as mecânicas ou o Balancer.

## Anti-metas

- A tela da etapa continuar com espaço vazio e rolagem, ou ficar sem um "voltar" óbvio.
- Importação que inventa receita ou liga coisa errada em silêncio (o que não reconhecer, diz).
- Tutorial que não dá para pular ou que volta toda hora.
- Abrir uma fábrica salva e as posições mudarem.

## Restrições

- As de sempre (AGENTS.md): pt/en/es em todo texto; commits em português com o `Co-Authored-By`; sem push/merge sem o OK do dono; sem domínio novo na CSP; o Balancer não muda.
- Estado salvo: as posições por vista entram no `Factory` v2 com migração (sem as novas, as duas vistas usam as de hoje); `#p=` e `localStorage` antigos abrem iguais.
- Os exemplos `.sfmd` em `docs/superpowers/research/2026-10-26-fase5/sfmd/` viram fixtures de teste (com a licença BSD-3 junto).
- Desempenho do mapa como na fase 4.

## Decisões minhas (o dono pode mudar)

- **Linha que atravessa os pares:** é **uma esteira só** no corredor da faixa, correndo de uma ponta à outra (passa pelo vão entre os pares); os cortes ("fecha a cada N" ou "dividir igual") caem ao longo dela inteira e cada trecho sai onde termina (elevador ali, ou pela ponta). A direção da saída não depende de onde entram as entradas. Do lado das entradas (Inverter), o mesmo: uma linha de Splitters atravessando a faixa. Só atravessa quando dá menos saídas; senão cada par fecha a sua, como hoje.
- **Giro também é por vista:** cada vista guarda posição **e** giro dos blocos (girar na Planta não gira o cartão da Montar). "Mover junto" copia só o deslocamento, não o giro.
- **Geradores e o que não é receita do builder** (ex.: "Compacted Coal Generator", "Rocket Fuel Generator"): viram um bloco **Saída** (o produto "sai da fábrica"), com o nome original no resumo da importação ("virou Saída: gerador, energia fica fora"). Assim as ligações não somem e o combustível não aparece como sobra.
- **Planta depois de importar:** usa a proposta automática de hoje (pela cadeia), sem copiar o desenho da Montar; "Propor de novo" continua igual.

## Deixado para quem constrói

- O significado exato de `Max` (máquinas × taxa: há um campo `ShowPpm` em alguns arquivos) e de `Machine`, `ClockSpeed`, `Capacity`, `Title`, `Parent`, `Outpost`: confirmar lendo os exemplos e o parser em `ChrisUllery/SatisfactoryFloorPlanner` (`tools/sfmd-parser/`); o que não der para confirmar fica como "não reconhecido" no resumo.
- O desenho exato do tutorial (balões ancorados com destaque recortado, por exemplo) seguindo o visual da reforma.
- Como representar as posições por vista no modelo.
