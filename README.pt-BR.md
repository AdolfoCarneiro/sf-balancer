<div align="center">

# SF Balancer

**Planejador de fábrica e balancer de esteiras para [Satisfactory](https://www.satisfactorygame.com/)**

Monte a cadeia como no seu planner, veja em escala e saiba como ligar.

[**Abrir o planejador →**](https://sf-balancer.vercel.app/pt)

[English](README.md) · Português · [Español](README.es.md)

[![No ar](https://img.shields.io/badge/no%20ar-sf--balancer.vercel.app-ff9b3d?style=flat-square)](https://sf-balancer.vercel.app/pt)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-8fe3a4?style=flat-square)](LICENSE)
![Site estático](https://img.shields.io/badge/build-vite-15324f?style=flat-square)

<img src="docs/screenshot-pt.png" alt="SF Balancer: seis linhas de origem de 455/min alimentando cinco linhas de destino de 480/min por uma árvore de splitters" width="900">

</div>

## O problema

Uma etapa da fábrica entrega **6 linhas de 455/min** (7 refinarias cada). A próxima precisa de **5 linhas de 480/min** (12 fundições cada). Como conectar? Quantas linhas fecham, quanto sobra e onde entra o balancer?

Dá para fazer essa conta na mão toda vez, ou digitar as máquinas e deixar o planejador desenhar.

## O builder da fábrica (página inicial)

Abrindo o site você cai no builder: monte a fábrica bloco a bloco, como no Satisfactory Modeler, só que cada bloco já conhece as suas fileiras de máquinas.

- **Duas vistas, um botão no topo.** **Montar** (a principal) mostra cada bloco como um cartão: prédio, receita e número de máquinas, enxuto como o nó do Satisfactory Modeler, e portas redondas na cor do estado, ligadas por esteiras animadas a um chip que diz o que cada ligação precisa (balancer "6 → 5", direto, + Sink, cano). **Planta em escala** mostra a mesma fábrica no tamanho real, na grade de fundações de 8 m. Nomes, portas e chips ficam legíveis em qualquer zoom. Selecionar um bloco mostra no painel uma miniatura das fileiras, com "Montar fileiras".
- **Monte com os gestos do Modeler.** Duplo clique (ou botão direito) no vazio abre o seletor de receitas ali mesmo (busca, ícones, setas + Enter). Arraste da porta de um bloco para o vazio e o seletor abre filtrado nas receitas que consomem (ou produzem) aquele item; o bloco novo nasce ligado. Soltando numa porta compatível, só liga. Delete apaga, as setas movem 8 m, R gira, Ctrl+Z desfaz. Shift + clique põe um bloco na seleção, Shift + arrastar no vazio desenha um retângulo de seleção e Ctrl+A (ou "Selecionar tudo" no painel) pega tudo: arraste um para mover todos, Delete apaga todos num passo só do desfazer.
- **Números como no Modeler, com o fluxo físico.** O bloco novo consome o que chega; fixe máquinas ou a entrada quando quiser. A falta aparece em coral na porta ("faltam 120/min"), a sobra represada em turquesa ("+330 sobrando"), a saída final da fábrica em laranja, e a sobra liberada vai para as outras pernas. A barra embaixo do topo resume o que entra, o que sai (produtos finais e o que chega aos blocos Container e Saída) e o que vai pro Awesome Sink, e os botões "N faltas" / "N sobras" levam a cada problema no mapa. Subproduto sem saída trava o bloco, como no jogo. Loops (borracha e plástico reciclados) funcionam, e o loop travado é apontado.
- **Origens e sobras.** Miner (você digita quanto sai), extratores de água, petróleo e Resource Well (ele diz quantos precisa, com pureza onde o jogo tem) e os blocos Awesome Sink, Container e Saída para receber a sobra de propósito.
- **Monte as fileiras como no jogo.** Duplo clique no bloco (ou "Montar fileiras" no painel) abre a tela da etapa: escolha um modelo (**Fileira simples**, **Costas com costas** ou **Mergers no meio**, com Inverter) e vire, espelhe ou mova cada fileira na grade de 8 m, corte a esteira a cada N máquinas, mande-a sair pela ponta, por baixo ou por cima com um Conveyor Lift, ou junte-a com a esteira da fileira de baixo. Os avisos (esteira acima da capacidade, Merger com mais de 3 entradas) trazem o conserto de um clique. A Planta em escala desenha o mesmo arranjo, com os lifts, e as ligações recebem as linhas dele.
- **Camadas.** O botão Camadas liga e desliga no mapa os ícones, os nomes, as ligações (esteiras e chips) e as portas; "Só as máquinas" esconde as quatro.
- **Ligações.** Cada ligação entre blocos é uma peça do mapa: as esteiras, Mergers, Splitters e o balancer que ela precisa, em escala e arrastável. Clique no chip dela para um resumo curto com Ver montagem (o fluxo animado, o passo a passo ou abrir no Balancer), Trocar montagem e Desligar.
- **Um painel que explica.** Selecionar um bloco abre o painel (uma folha de baixo no celular) com o problema numa frase e consertos de um clique (mandar a sobra pro Awesome Sink, reduzir as máquinas, aumentar a fonte, criar a fonte ou o destino que falta); sem seleção ele mostra a área da fábrica, os avisos e as listas. O botão Legenda explica as cores e os chips.
- Salvo no navegador, compartilhado por link. Links antigos de `/planner` e fábricas compartilhadas continuam abrindo.

Ícones e dados vêm dos arquivos do jogo: © Coffee Stain Studios.

## O Balancer (`/pt/balancer`)

A ferramenta original, para uma ligação digitada na mão: entram as taxas, saem esteiras, splitters, mergers e balancers. Links antigos de cenário (`#s=`) abrem nela.

- **Agrupa as máquinas em linhas de esteira.** Máquinas por linha = capacidade da esteira ÷ taxa por máquina, arredondado para baixo. No destino as máquinas são divididas em linhas iguais (14 que cabem 8 por linha viram 7 + 7), e cada grupo fica com suas próprias linhas. Editável, com aviso quando a esteira estoura.
- **Liga as linhas.** Lista todas as montagens que encontra, a melhor primeiro: direto, juntando linhas inteiras, uma linha doadora dividida em partes iguais, ou o overflow de um Smart Splitter passando o excesso para uma linha que está com falta. Você escolhe o destino do excesso: represar na origem (as máquinas desaceleram) ou ir pro Awesome Sink, e aí a recomendada enche todos os destinos sem represar nada, com um Smart Splitter na saída de cada linha que sobra.
- **Monta o load balancer.** A árvore exata de splitters ("1 splitter em 2, depois 2 em 3 = 6 partes", com os 2 primeiro porque gasta menos peças), se precisa de loop, e a alternativa "dividir em mais partes e mandar as extras pro sink", com diagrama.
- **Biblioteca de balancers.** Um gerador N→M que testa dez designs (matriz, funil e borboleta, cada um também com loop ou sink para 5, 7, 10…, e a matriz com loop dividido, que divide cada entrada em 2 antes do loop para a esteira cheia não engargalar: o 1→5 de 14 peças e o 1→7 de 24 que a comunidade usa), confere cada trecho interno contra o tier da esteira, explica por que escolheu um e mostra a montagem passo a passo, com a peça do passo destacada como o holograma da build gun. No plano, o balancer é um bloco que você clica para abrir essa montagem.
- **Normal, borboleta ou 3D.** Escolha o estilo de montagem: designs planos, borboleta (esteiras misturadas aos pares em rodadas, 16 peças no 4→4 em vez de 20 e 48 no 8→8 em vez de 88; como ela mistura faixas distantes e é mais difícil de montar, o planejador só recomenda a borboleta quando ela economiza mais de 20% das peças, abre o 3D dela em andares; qualquer N→M de 2→2 a 9→9 e além, com faixas vazias ou faixas a mais em loop, e o 5→5 sai com 24 peças) ou uma cena 3D que você gira e aproxima, montada em torres (as peças de cada camada empilhadas, com as esteiras cruzando entre as torres) ou em andares, com a contagem de lifts e o passo a passo como o holograma da build gun: o que já foi montado fica sólido, e o passo atual fica num holograma transparente pulsando, com luzes andando nas esteiras no sentido do fluxo. As esteiras ligam como no jogo, uma por face: o splitter recebe por trás e solta pela frente e pelos lados, o merger faz o contrário, e as setas no topo de cada peça mostram quais portas estão em uso. Passe o mouse ou toque numa peça para ver só as ligações dela, ou use Seguir para acender o caminho inteiro de uma entrada ou saída. No passo a passo, Por peça vai de um splitter ou merger por vez, com cada ligação explicada: por qual lado, de onde vem e para onde vai. Normal e borboleta são desenhados vistos de cima, com as esteiras em curva entrando e saindo pelo lado certo de cada peça, como no jogo (o splitter recebe por trás e solta pela frente e pelos lados, o merger o contrário, nunca duas esteiras no mesmo lado), e o desenho sempre cabe inteiro na tela. Um seletor Esquema / Planta mostra compacto ou em escala: grade de fundações de 8 m, peças quadradas ocupando ¼ de fundação (splitter laranja com em quantas divide, merger verde-água), esteiras saindo e entrando pelos lados de verdade, e quanto espaço ocupa (em fundações e metros) e qual Blueprint Designer comporta (Mk1 4×4, Mk2 5×5, Mk3 6×6). Na planta, marcações do Blueprint Designer em escala, com o piso e a grade de fundações do designer, ajudam a fatiar um balancer em blueprints: o menor designer que comporta já aparece cobrindo ele, você adiciona quantas marcações Mk1, Mk2 ou Mk3 quiser, e Ctrl + arrastar (ou Mover marcação no celular) move uma, encaixando na grade. O Por peça vale nos dois, com cada peça numerada (#1, #2…); na planta, a esteira misturada leva a cor da saída para onde vai, e passar o mouse ou tocar numa peça mostra só o caminho dela.
- **Seus blueprints primeiro.** Liste os blueprints de balancer que você já tem (começa com 3→4) e o planejador prefere eles quando o formato bate.
- **Atalhos para quem não quer montar.** Junto de cada balancer, aponta o mod [Modular Load Balancers](https://ficsit.app/mod/LoadBalancers) e os blueprints da comunidade no [Satisfactory Calculator](https://satisfactory-calculator.com/pt/blueprints).
- **Conta as peças.** Mergers, splitters e Smart Splitters de cada trecho (coleta, meio, distribuição), na convenção k ou k−1 que você preferir.
- **Mostra o fluxo.** Um diagrama animado em que os itens andam na velocidade do tier da esteira, como no jogo, e a espessura e o espaço entre os itens seguem a taxa real. Cada peça é desenhada como no jogo (splitter com até 3 saídas, cascata de mergers com até 3 entradas, retorno do loop, Smart Splitter, um Awesome Sink por esteira), com a taxa em cada esteira; o diagrama cresce e rola para o lado, e clicar num bloco abre o detalhe.
- **Avisa.** Esteira acima da capacidade, demanda maior que a oferta, parte da doadora menor que o déficit, linhas incompletas.
- **Fluido também.** Troque para "Fluido (cano)" e ele usa Pipeline Mk1 (300) e Mk2 (600 m³/min). Cano não tem splitter, então no lugar do balancer ele junta e divide os canos com Pipeline Junctions em canos coletores que respeitam a capacidade, e quando um cano de origem tem mais do que um coletor precisa, uma junction passa o resto para o próximo.
- **Desfazer e refazer.** Ctrl+Z desfaz e Ctrl+Y (ou Ctrl+Shift+Z, Cmd no Mac) refaz qualquer mudança nas entradas, mesmo digitando num campo, e o resultado volta junto. Uma digitação seguida é um passo só; o histórico vale enquanto a página está aberta.
- **Salva e compartilha cenários.** Salve quantos cenários quiser no navegador, com o nome do item, e copie um link que leva o cenário inteiro, para abrir em outro computador ou mandar para um amigo.
- **Reporte um caso estranho.** Um link no fim do plano abre uma issue no GitHub já preenchida com o link do cenário e a montagem mostrada, e você só descreve o que parece errado.
- **Se explica.** Todo campo e resultado tem um `?` com uma explicação curta, e no fim da página tem a seção "Como funciona".
- **Três idiomas:** English, Português (Brasil) e Español.

## Regras do jogo que ele respeita

| Peça | Comportamento |
| --- | --- |
| Esteiras | Mk1 60, Mk2 120, Mk3 270, Mk4 480, Mk5 780, Mk6 1.200 itens/min (1.0). |
| Splitter | Até 3 saídas, divide igual. A divisão direta só chega em produtos de 2 e 3, então 1/5 ou 1/7 pedem loop ou partes extras pro sink. |
| Merger | Até 3 entradas, alternando entre elas. Uma linha de complemento em série por vários mergers deixa os últimos com fome, então o planejador nunca sugere isso. |
| Smart Splitter | A saída Overflow só recebe item quando a saída Any está cheia. |
| Awesome Sink | Recebe qualquer sobra de item. Represar na origem também serve: as máquinas só desaceleram. Não aceita fluido. |
| Cano | Pipeline Mk1 300, Mk2 600 m³/min. Sem splitter: a Pipeline Junction (4 portas) junta ou divide e o fluido vai para onde tem espaço, sem garantir partes iguais. Para uma vazão certa, use uma Valve. |

O Balancer não conhece receitas: você digita as taxas do seu planner ou do jogo. O builder usa as receitas do jogo.

## Rodando localmente

É um site estático montado com Vite (Node 22.18+).

```bash
git clone https://github.com/AdolfoCarneiro/sf-balancer.git
cd sf-balancer
npm install
npm run dev       # servidor local
npm run build     # build de produção em dist/
```

Testes (lógica, idiomas e o modelo do builder), a checagem de tipos do builder e um smoke de ponta a ponta dos gestos contra o preview:

```bash
npm test
npm run typecheck
npm run build && npm run preview   # depois, em outro terminal:
npm run smoke -- http://localhost:4173
```

Para testar como em produção (nginx servindo o build, com as rotas `/pt`, `/es`, `/balancer`, `/pt/balancer` e `/es/balancer`), rode `docker compose up --build` e abra http://localhost:8080. Para limpar: `docker compose down --rmi local`.

## Como o código está organizado

```
index.html            o builder (React + TypeScript; HTML base em inglês, para os buscadores)
balancer.html         o Balancer (JavaScript puro)
src/planner/          builder: model/ (puro: estado da fábrica, solver do fluxo, cena do mapa), worker/ (solver e ligações fora da thread principal) e ui/
src/main.js           ponto de entrada do Balancer
src/logic/            funções puras, sem DOM (agrupamento, classificação dos casos, árvores de splitter, simulação do fluxo)
src/i18n/             textos em pt, en e es
src/ui/               interface
src/view3d/           cena 3D (three.js, carregado só ao abrir a aba 3D)
src/styles/main.css   estilos
public/               estáticos (favicon, og.png, robots.txt, sitemap.xml, ícones do jogo em icons/)
tests/                testes da lógica e a comparação visual
vercel.json           build, headers, CSP, rotas e redirects
scripts/              geradores dos dados e dos ícones do jogo (gamedata.mjs, icons.mjs; rodam na mão, fora do build)
Dockerfile, nginx.conf, docker-compose.yml   teste local como em produção (nginx servindo dist/)
```

A lógica é função pura importada direto pelos testes no Node, sem precisar de navegador.

## Contribuindo

Issues e pull requests são bem-vindos. Algumas regras mantêm o projeto em ordem:

1. **Respeite as camadas.** O Balancer é JavaScript puro e o builder é React + TypeScript, os dois montados com Vite; `src/logic` e `src/planner/model` não tocam no DOM.
2. **Todo texto visível existe nos três idiomas.** Os textos ficam em `src/i18n/` (`pt.js`, `en.js`, `es.js`) e são lidos com `t('chave')`. Chave nova entra nos três na mesma mudança; o teste `idiomas: as mesmas chaves...` quebra se faltar.
3. **Lógica em função pura, com teste.** Montagem ou regra nova ganha um caso em `tests/logic.test.js`.
4. **Não invente mecânica do jogo.** Na dúvida sobre como uma peça se comporta, abra uma issue antes.

O `AGENTS.md` tem a especificação completa e serve de instrução para agentes de IA.

## Apoie

Se a ferramenta te poupou umas contas, você pode [me pagar um café no Ko-fi](https://ko-fi.com/dofal). Totalmente opcional: a ferramenta continua grátis.

## Licença

[MIT](LICENSE). Ferramenta feita por fã, sem vínculo com a Coffee Stain Studios. Satisfactory é marca registrada da Coffee Stain Studios; os ícones e dados do jogo no builder são © Coffee Stain Studios.
