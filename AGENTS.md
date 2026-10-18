# Planejador de Logística entre Etapas — Satisfactory

## O que é

Uma ferramenta em **um único arquivo HTML**, que abro do lado do jogo, para planejar a **camada física** (esteiras, mergers, splitters, balancers) **entre duas etapas** de uma fábrica no Satisfactory.

Eu já uso um planner que resolve a **camada lógica** (quantas máquinas, quanto flui de A para B). O que falta é traduzir isso para esteira: quando uma etapa entrega N linhas de um tamanho e a próxima precisa de M linhas de outro tamanho, como eu conecto, quanto sobra e onde preciso de balancer.

**Não é** um planner da cadeia inteira. **Não conhece receitas.** Eu informo as taxas na mão.

## Exemplo real que motivou isso

- Ferro: 7 refinarias (Pure Iron Ingot, 65/min cada) por linha = **455/min por linha**, 6 linhas. O agrupamento de 7 vem do limite da esteira Mk4 (480).
- Aço: fundições consumindo 40/min de ferro cada (Solid Steel Ingot), 12 por linha = **480/min por linha**.
- Pergunta: como transformar 6×455 em linhas de 480? Quantas fecham, quanto sobra, como conectar?

Hoje faço essas contas por fora toda vez. Quero parar de fazer.

## Mecânicas do jogo a respeitar

Confirme comigo se tiver dúvida em alguma delas, não invente comportamento.

- **Esteiras (1.0):** Mk1 60, Mk2 120, Mk3 270, Mk4 480, Mk5 780, Mk6 1200 itens/min. Padrão da ferramenta: Mk4.
- **Splitter:** até 3 saídas, divide igualmente entre as saídas que aceitam item. Divisões diretas possíveis: frações formadas por metades e terços (1/2, 1/3, 1/4, 1/6, 1/9…). Divisões como 1/5 ou 1/7 **não saem direto**: precisam de balancer com loop, ou dividir num N alcançável e mandar as partes extras para o sink.
- **Merger:** até 3 entradas, puxa alternado (round-robin) das entradas que têm item, limitado pelo que a esteira de saída aceita. Consequência importante: uma linha de complemento passando **em série** por vários mergers é drenada pelos primeiros e os últimos ficam com fome. Não sugerir esse padrão.
- **Merge de duas fontes alimentando uma demanda** `c`**:** a demanda é atendida se a soma das duas fontes for ≥ `c`. O excesso fica represado na origem (as máquinas de lá desaceleram), o que é aceitável.
- **Manifold** se auto-equilibra entre máquinas. A ferramenta não precisa tratar a distribuição entre máquinas, só entre linhas.
- **Awesome Sink** recebe qualquer sobra.

## Entradas (no formato do meu planner)

Eu digito os dados como vêm do planner, em máquinas e taxas:

1. **Item** (só o nome, para exibição. Ex.: "Barra de ferro").
2. **Origem:** quantas máquinas e quanto cada uma produz por minuto. Ex.: 42 refinarias × 65/min.
3. **Destino:** quantas máquinas e quanto cada uma consome por minuto. Ex.: 60 fundições × 40/min.
4. **Tier da esteira** (padrão Mk4). Idealmente dá para escolher um tier por trecho (coleta, meio, distribuição), mas um só já serve na v1.
5. **Política da sobra:** represar na origem / mandar pro sink / sair numa linha extra.

## A ferramenta divide o problema em 3 trechos

1. **Coleta (origem):** agrupa as máquinas de origem em linhas. Sugere automaticamente quantas máquinas por linha = capacidade da esteira ÷ produção por máquina, arredondado para baixo (65/min em Mk4 → 7 por linha = 455). Trata a última linha incompleta se a divisão não for exata.
2. **Distribuição (destino):** agrupa as máquinas de destino em linhas de entrada do mesmo jeito (40/min em Mk4 → 12 por linha = 480). Também trata grupo incompleto.
3. **Meio (rebalanceamento):** liga as N linhas da coleta nas M linhas da distribuição. É aqui que entram os casos abaixo e o load balancer.

**Os agrupamentos sugeridos são editáveis.** Se eu quiser 6 por linha em vez de 7, mudo e todo o resto recalcula (inclusive o meio). Avisar se a minha escolha estourar a esteira.

## Saídas

Por trecho e no total:

- Quantas linhas, máquinas por linha e taxa de cada linha.
- **Quantidade de mergers e splitters** de cada trecho:
  - Coleta: mergers para juntar as máquinas de cada linha (manifold de saída).
  - Distribuição: splitters para alimentar as máquinas de cada linha (manifold de entrada).
  - Meio: mergers e splitters do rebalanceamento/balancer.
  - Deixar explícita a convenção usada (ex.: "a primeira máquina inicia a esteira, então k máquinas = k−1 mergers") e permitir alternar se eu preferir contar k.
- Oferta total, demanda total, sobra e para onde ela vai.
- **Classificação do caso** do meio e o **plano de conexão** em texto claro, passo a passo.
- **Montagem do load balancer** quando precisar: a fração de cada divisão, a sequência de splitters (ex.: "1 splitter em 3, depois cada saída num splitter em 2 = 6 partes"), se precisa de loop, e a alternativa "dividir em N alcançável + partes extras pro sink". Diagrama simples ajuda muito aqui.
- **Avisos:** linha acima da capacidade da esteira, demanda maior que oferta, parte de complemento menor que o déficit, grupo incompleto.

## Casos

- **A: origem ≥ demanda por linha.** Liga direto uma linha de origem em cada linha de destino. O excesso represa. As linhas de origem que sobram vão pro sink/outro uso/linha extra.
- **B: origem &lt; demanda por linha (precisa complementar).** Usar uma ou mais linhas como **doadoras**: dividir cada doadora em partes **iguais**, uma por linha de destino, e mergear cada parte com uma linha principal. Validar que principal + parte ≥ demanda. Se o número de partes não sair direto com splitter, mostrar as duas opções (loop ou dividir a mais e mandar o excedente pro sink).
- **C: origem muito menor que a demanda (ex.: linhas de 120 alimentando 480).** Juntar várias linhas de origem numa só, respeitando a capacidade da esteira e o limite de 3 entradas por merger (cascata).
- **D: linhas heterogêneas / mistura de casos.** Tentar agrupar respeitando a capacidade (tipo bin packing). Se não houver solução simples, dizer isso claramente em vez de inventar.

## Casos de teste (validar a lógica com eles)

1. **42 refinarias × 65/min → 60 fundições × 40/min, Mk4.**
   - Coleta: 7 por linha → 6 linhas de 455 (oferta 2.730). Mergers: 6 linhas × 6 = 36 (convenção k−1).
   - Distribuição: 12 por linha → 5 linhas de 480 (demanda 2.400). Splitters: 5 linhas × 11 = 55 (convenção k−1).
   - Meio: caso B. 5 linhas principais + 1 doadora dividida em 5 partes (91 cada, déficit de 25 por linha, ok). 1/5 não sai direto, então mostrar as opções: balancer com loop OU dividir em 6 (1 splitter em 3 + 3 splitters em 2 = 4 splitters; 75,8 por parte, ainda ≥ 25), 5 partes vão para mergers nas linhas principais (5 mergers) e 1 parte pro sink.
   - Sobra: 330 (parte represa na origem, parte vai pro sink, dependendo da política).
2. **42 refinarias × 65/min → destino com linhas de 440, Mk4** (ex.: 4 linhas). Esperado: caso A, liga 4 linhas direto, excesso represa, 2 linhas sobram (sink ou outro uso).
3. **Agrupamento editado:** caso 1, mas eu forço 6 refinarias por linha. Esperado: 7 linhas de 390, tudo recalcula, e o meio muda de configuração.

## Interface

- Um único `.html`, sem build. Dependências só se forem via CDN, e de preferência nenhuma.
- **Três idiomas: português (pt-BR), inglês e espanhol.** Ver a seção "Idiomas" abaixo.
- Dark mode (vou usar do lado do jogo).
- Resultado atualiza ao vivo enquanto digito.
- Exemplo 1 já pré-carregado.
- Diagrama simples (SVG) das conexões é bem-vindo, mas o texto do plano vem primeiro.

## Como construir

- Separar a **lógica em funções puras** (cálculo e classificação) da interface, e testar essas funções com os casos de teste acima antes de mexer na UI.
- Começar pequeno: casos A e B funcionando bem. C e D depois.
- Na dúvida sobre mecânica do jogo ou sobre o que eu quero, **pergunte** em vez de assumir.

## Idiomas (obrigatório em toda mudança)

**Tudo que aparece na tela existe em português, inglês e espanhol.** Isso vale para qualquer feature nova, aviso, rótulo, tooltip, `aria-label`, texto de SVG, título e descrição da página.

- Os textos ficam no objeto `I18N` no começo do bloco de lógica do `index.html` (`pt`, `en`, `es`). Nada de texto solto no código: use `t('chave')` ou `t('chave', ...args)`.
- Chave nova entra **nos três idiomas na mesma mudança**. O teste `idiomas: as mesmas chaves, do mesmo tipo, nos três` quebra se faltar alguma.
- Texto com número ou plural vira função: `stepUnfed: d => \`${d} fica sem alimentação...\``. Os números chegam já formatados com `fmt()`.
- Texto fixo do HTML usa `data-i18n="chave"` (conteúdo) ou `data-i18n-aria="chave"` (`aria-label`); `applyStatic()` aplica.
- Números seguem o idioma: `fmt()` usa `t('locale')` (pt-BR `2.730,5`, en `2,730.5`, es `2730,5`) e `parseNum()` lê no formato do idioma atual (em inglês a vírgula é milhar).
- Nomes de peças do jogo ficam em inglês nos três idiomas: Merger, Splitter, Smart Splitter, Awesome Sink, Any, Overflow, manifold, balancer (no espanhol, "balanceador" no texto corrido).
- Rótulo das linhas: origem `O1` em pt/es e `S1` em en (`srcTag`), destino `D1` (`dstTag`).
- **Inglês é o padrão.** O idioma vem do caminho (`/pt`, `/es`; `/` é inglês), depois de `?lang=pt|en|es`, depois da escolha salva; sem nada disso, inglês (não detecta pelo navegador). No site (`*.vercel.app`) a URL e o `canonical` acompanham o idioma; aberto do disco, a URL não muda. O HTML base (título, `lang`, descrição, textos com `data-i18n`) fica em inglês: é o que os buscadores leem primeiro.
- **Ajuda contextual:** campos e resultados importantes têm um botão `?` (`class="tip" data-tip="chave"`, ou `tip('chave')` no HTML gerado) que abre um balão com `t(chave)`. Explicação nova = chave `tip...` nos três idiomas. A seção "Como funciona" e o FAQ no fim da página também usam `data-i18n`.
- Seletor com bandeira em SVG + sigla (`FLAGS`): emoji de bandeira não renderiza no Windows. Idioma novo precisa de bandeira em `FLAGS`.
- Os testes da lógica rodam em português; use `inLang('en', () => ...)` para testar outro idioma.

## Deploy e analytics

- Repositório público (MIT) `AdolfoCarneiro/sf-balancer`, com README em inglês, português e espanhol (`README.md`, `README.pt-BR.md`, `README.es.md`): mudança de comportamento visível atualiza os três; cada push no `master` publica na Vercel (https://sf-balancer.vercel.app).
- Publicados (lista em `.vercelignore`): `index.html`, `vercel.json`, `favicon.svg`, `og.png` (imagem de compartilhamento 1200×630), `robots.txt`, `sitemap.xml`. Arquivo novo do site precisa entrar nessa lista. As rotas `/pt` e `/es` são rewrites no `vercel.json`. Headers de segurança e CSP ficam no `vercel.json`: qualquer script, fonte ou serviço externo novo precisa ser liberado lá.
- Vercel Web Analytics via `<script defer src="/_vercel/insights/script.js">`, sem cookies. Localmente esse script dá 404, é esperado.

## Fora do escopo (v1)

Receitas, cadeia completa, layout físico/posicionamento das máquinas, importação do planner, múltiplos itens ao mesmo tempo.

## Ideias para depois

Salvar cenários, catálogo de designs de balancer N→M, importar taxas do planner, vários itens por etapa.