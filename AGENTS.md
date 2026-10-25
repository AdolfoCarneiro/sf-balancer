# Planejador de Logística entre Etapas — Satisfactory

## O que é

Uma ferramenta em **uma página estática (Vite + módulos ES)**, que abro do lado do jogo, para planejar a **camada física** (esteiras, mergers, splitters, balancers) **entre duas etapas** de uma fábrica no Satisfactory.

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
- **Awesome Sink** recebe qualquer sobra de item. Não aceita fluido.
- **Cano (fluido):** Pipeline Mk1 300, Mk2 600 m³/min. Não tem splitter nem balancer: a Pipeline Junction (4 portas) junta ou divide e o fluido vai para onde tem espaço, sem garantir partes iguais (Valve limita a vazão). No modo fluido o meio só liga direto ou passa por canos coletores dentro da capacidade; altura e bombas ficam fora.

## Planner 2D (beta, em `/planner`)

Página à parte (React + TypeScript, `planner.html`), ligada à ferramenta por um link no cabeçalho. Aqui há **receitas**: o planner encadeia etapas (receita, prédio, máquinas, clock), calcula o fluxo entre elas e mostra o **meio de cada ligação** com a lógica pura da ferramenta (`src/logic/`), com o botão que abre a ferramenta já preenchida. Fase 1 (cadeia em grafo, etapa aberta com as fileiras em escala) e fase 2 (aba **Mapa**: a cadeia numa planta em escala, num canvas, com blocos arrastáveis e girados, meios desenhados entre eles, avisos de sobreposição e cruzamento) feitas; as fases 3–4 (por meta, andares, portas reais etc.) estão fora. Spec: `docs/superpowers/specs/2026-10-25-planner-2d-design.md`; fase 2: `docs/superpowers/specs/2026-10-25-planner-2d-fase2-design.md`. Arquivos do mapa: `src/planner/model/map/` (cena pura: `scene.ts`, `block.ts`, `meiogeo.ts`, `camera.ts`, `edit.ts`, `checks.ts`, `geo.ts`, `sizes.ts`), `src/planner/worker/meio.worker.ts` + `src/planner/meios.ts` (o cálculo dos meios roda no worker, com cache, e cai para o síncrono sem `Worker`; nunca no render) e `src/planner/ui/` (`MapView.tsx` canvas com zoom/pan, `MapPanel.tsx` painel lateral, `mapDraw.ts` desenho só do visível). A captura visual tem o cenário `planner-mapa` (`--only=planner`). O vão entre peças ligadas do meio é da cadeia (`Chain.mapGap`, 1–8 m, padrão 2) e entra na chave do cache dos meios. Os dados do jogo (`src/planner/data/game.json`) vêm do Docs do jogo na 1.1; o jogo está na 1.2 e, segundo a wiki, sem mudança de receita. Regerar: `node scripts/gamedata.mjs <en-US.json>` (usa `scripts/building-sizes.json` para os tamanhos).

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
- **Montagem do load balancer** quando precisar: a fração de cada divisão, a sequência de splitters (ex.: "1 splitter em 2, depois cada saída num splitter em 3 = 6 partes"; os 2 vêm primeiro porque cada nível custa o produto dos anteriores: 2 × 3 são 3 splitters, 3 × 2 seriam 4), se precisa de loop, e a alternativa "dividir em N alcançável + partes extras pro sink". Diagrama simples ajuda muito aqui.
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
   - Meio: caso B. 5 linhas principais + 1 doadora dividida em 5 partes (91 cada, déficit de 25 por linha, ok). 1/5 não sai direto, então mostrar as opções: balancer com loop OU dividir em 6 (1 splitter em 2 + 2 splitters em 3 = 3 splitters; 75,8 por parte, ainda ≥ 25), 5 partes vão para mergers nas linhas principais (5 mergers) e 1 parte pro sink.
   - Sobra: 330 (parte represa na origem, parte vai pro sink, dependendo da política).
2. **42 refinarias × 65/min → destino com linhas de 440, Mk4** (ex.: 4 linhas). Esperado: caso A, liga 4 linhas direto, excesso represa, 2 linhas sobram (sink ou outro uso).
3. **Agrupamento editado:** caso 1, mas eu forço 6 refinarias por linha. Esperado: 7 linhas de 390, tudo recalcula, e o meio muda de configuração.

## Interface

- Página estática montada com **Vite** (módulos ES; a ferramenta é JavaScript puro e o planner é React + TypeScript). Dependências: `three` (npm, carregado por `import()` dinâmico na aba 3D), `react`, `react-dom`, `@xyflow/react` e `@dagrejs/dagre` (planner); de desenvolvimento, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/*` e `playwright`.
- Estrutura: `index.html` (HTML base em inglês), `src/main.js` (entrada), `src/logic/` (lógica pura, sem DOM; inclui `flownet.js`, `flowNet(alt)`: rede de peças de uma alternativa, e `flowlayout.js`, `flowLayout(net)`: colunas, linhas e lados das portas, que alimentam o diagrama do fluxo), `src/i18n/` (`pt.js`, `en.js`, `es.js`, `index.js`), `src/ui/` (interface), `src/view3d/` (cena 3D), `src/styles/main.css`, `public/` (estáticos copiados como estão para a raiz do site), `tests/` (testes e `tests/visual/`; `tests/fluxo-fluido.json` é a fixture que protege o desenho do modo fluido). Planner: `planner.html` (entrada própria do Vite), `src/planner/` (`model/` puro, sem DOM nem React, com `model/map/` para a cena do mapa, `worker/` e `ui/` com os componentes; `lang.ts` tem os caminhos `/planner`, `/pt/planner`, `/es/planner`), `scripts/gamedata.mjs` + `scripts/building-sizes.json` (geram `src/planner/data/game.json`) e `tests/planner/*.test.ts`.
- Comandos: `npm run dev` (servidor local), `npm test` (testes da lógica), `npm run build` (gera `dist/`), `npm run preview` (serve o build), `npm run visual:capture -- <url-base> <pasta> [--routes] [--only=<trecho>] [--fixtures] [--fixtures-check]` (captura as telas; ex.: `npm run visual:capture -- http://localhost:4173 /tmp/out`; `--routes` inclui `/pt` e `/es`, `--only=` limita os cenários, `--fixtures` grava `tests/visual/fixtures.json`, `--fixtures-check` confere `#s=` e `localStorage` antigos) e `npm run visual:compare -- <pasta-a> <pasta-b>` (compara duas capturas; sai com código != 0 se algo diferir). `npm run typecheck` (`tsc --noEmit`, só o planner); regerar os dados do jogo: `node scripts/gamedata.mjs <en-US.json>`. A captura visual ganhou os cenários `planner`, `planner-etapa` e `planner-mapa` (`--only=planner`), em `/planner.html` porque o `vite preview` não serve `/planner` sem a extensão.
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

- Os textos ficam em `src/i18n/pt.js`, `en.js` e `es.js` (objetos `pt`, `en`, `es`, reunidos em `I18N` por `src/i18n/index.js`). Nada de texto solto no código: use `t('chave')` ou `t('chave', ...args)`.
- Chave nova entra **nos três idiomas na mesma mudança**. O teste `idiomas: as mesmas chaves, do mesmo tipo, nos três` quebra se faltar alguma.
- Texto com número ou plural vira função: `stepUnfed: d => \`${d} fica sem alimentação...\``. Os números chegam já formatados com `fmt()`.
- Texto fixo do HTML usa `data-i18n="chave"` (conteúdo) ou `data-i18n-aria="chave"` (`aria-label`); `applyStatic()` aplica.
- Números seguem o idioma: `fmt()` usa `t('locale')` (pt-BR `2.730,5`, en `2,730.5`, es `2730,5`) e `parseNum()` lê no formato do idioma atual (em inglês a vírgula é milhar).
- Nomes de peças do jogo ficam em inglês nos três idiomas: Merger, Splitter, Smart Splitter, Awesome Sink, Any, Overflow, manifold, balancer (no espanhol, "balanceador" no texto corrido).
- Rótulo das linhas: origem `O1` em pt/es e `S1` em en (`srcTag`), destino `D1` (`dstTag`).
- **Inglês é o padrão.** O idioma vem do caminho (`/pt`, `/es`; `/` é inglês), depois de `?lang=pt|en|es`, depois da escolha salva; sem nada disso, inglês (não detecta pelo navegador). No site (`*.vercel.app`) a URL e o `canonical` acompanham o idioma; aberto do disco, a URL não muda. O HTML base (título, `lang`, descrição, textos com `data-i18n`) fica em inglês: é o que os buscadores leem primeiro.
- **Ajuda contextual:** campos e resultados importantes têm um botão `?` (`class="tip" data-tip="chave"`, ou `tip('chave')` no HTML gerado) que abre um balão com `t(chave)`. Explicação nova = chave `tip...` nos três idiomas. A seção "Como funciona" e o FAQ no fim da página também usam `data-i18n`.
- **Idioma novo** também entra no script inline anti-piscada do `index.html` (regex `(pt|es|en)` e a chave `sf-balancer:lang`, espelho do `pickLang` em `src/ui/lang.js`) e no rewrite `/:lang(pt|es)` do `vercel.json` (e no `nginx.conf`).
- Seletor com bandeira em SVG + sigla (`FLAGS`): emoji de bandeira não renderiza no Windows. Idioma novo precisa de bandeira em `FLAGS`.
- Os testes da lógica rodam em português; use `inLang('en', () => ...)` para testar outro idioma.

## Deploy e analytics

- Repositório público (MIT) `AdolfoCarneiro/sf-balancer`, com README em inglês, português e espanhol (`README.md`, `README.pt-BR.md`, `README.es.md`): mudança de comportamento visível atualiza os três; cada push no `master` publica na Vercel (https://sf-balancer.vercel.app).
- O deploy roda `npm run build` e publica `dist/`. Estáticos do site ficam em `public/`: `favicon.svg`, `og.png` (imagem de compartilhamento 1200×630), `robots.txt`, `sitemap.xml`. Arquivo estático novo do site vai em `public/`. O `.vercelignore` só deixa de fora docs e testes do upload. As rotas `/pt` e `/es` são rewrites no `vercel.json`. Headers de segurança e CSP ficam no `vercel.json`: qualquer script, fonte ou serviço externo novo precisa ser liberado lá. O planner tem as rotas `/planner`, `/pt/planner` e `/es/planner` (rewrite no `vercel.json`, `location` no `nginx.conf`, `/en/planner` redireciona para `/planner`) e entram no `sitemap.xml`.
- Testar como em produção: `docker compose up --build` e abrir http://localhost:8080 (nginx servindo `dist/`, com `/pt`, `/es` e `/en` → `/` como no `vercel.json`). `docker compose down --rmi local` limpa. O `nginx.conf` precisa espelhar as rotas do `vercel.json` (rewrites e redirects): mudou um, muda o outro. `Dockerfile`, `nginx.conf`, `docker-compose.yml` e `.dockerignore` não vão para a Vercel (estão no `.vercelignore`).
- Vercel Web Analytics via `<script defer src="/_vercel/insights/script.js">`, sem cookies. Localmente esse script dá 404, é esperado.

## Fora do escopo (v1)

A **ferramenta de meio** (a página `/`) continua sem receitas, sem cadeia completa e com um item por vez. O que o planner 2D cobre e o que ainda fica de fora (fases 3–4: por meta, andares, portas reais) está nos specs `docs/superpowers/specs/2026-10-25-planner-2d-design.md` e `docs/superpowers/specs/2026-10-25-planner-2d-fase2-design.md` (o mapa, fase 2, está feito). Importação do planner de terceiros segue fora.

## Ideias para depois

O backlog combinado (prioridades, bugs visuais anotados e ideias futuras) fica em `docs/backlog.md`.

Importar taxas do planner (o usado é o Satisfactory Modeler, que salva `.sfmd` em JSON só com o grafo e as receitas, sem taxas: importar exigiria conhecer as receitas), vários itens por etapa.

Já feito: cenários salvos e link compartilhável (`#s=` com o estado em base64url, lido por `decodeShare`, que valida tudo), botão que abre issue no GitHub com o link do cenário, modo fluido.