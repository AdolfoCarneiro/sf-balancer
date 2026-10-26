# Planejador de Logística entre Etapas — Satisfactory

## O que é

Um site estático (Vite + módulos ES), que abro do lado do jogo, com duas páginas:

- **Builder** (página inicial, `/`): monto a fábrica em blocos de receita no mapa em escala, como no Satisfactory Modeler, e vejo o fluxo, a falta, a sobra e a **ligação** (esteiras, Mergers, Splitters, balancer) entre os blocos. Ver "Builder" abaixo.
- **Balancer** (`/balancer`): a ferramenta original, para planejar a **camada física** (esteiras, mergers, splitters, balancers) **entre duas etapas** de uma fábrica no Satisfactory. É ela que o resto deste arquivo descreve, e o builder usa a mesma lógica (`src/logic/`) em cada ligação.

Eu já uso um planner que resolve a **camada lógica** (quantas máquinas, quanto flui de A para B). O que falta é traduzir isso para esteira: quando uma etapa entrega N linhas de um tamanho e a próxima precisa de M linhas de outro tamanho, como eu conecto, quanto sobra e onde preciso de balancer.

O **Balancer não é** um planner da cadeia inteira e **não conhece receitas**: eu informo as taxas na mão. Receitas e cadeia ficam no builder.

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

## Builder (página inicial: `/`, `/pt`, `/es`)

React + TypeScript (`index.html`, `src/planner/`). Fases 1–3 feitas; a fase 4 está no `docs/backlog.md`. Specs: `docs/superpowers/specs/2026-10-25-planner-2d-design.md` (fase 1), `…-fase2-design.md` (mapa) e `…-fase3-design.md` (montar como no Modeler); pesquisa do Modeler em `docs/superpowers/research/2026-10-25-modeler/`.

- **Montar (gestos do Modeler):** duplo clique ou botão direito no vazio (ou o botão "+ bloco") abre o seletor ali (busca, cartões com ícone, setas + Enter, Esc); arrastar de uma porta e soltar no vazio abre o seletor filtrado e o bloco nasce ligado; soltar numa porta compatível só liga. Delete apaga, setas movem 8 m, R gira, Ctrl+Z / Ctrl+Shift+Z.
- **Blocos:** receita, Miner (eu digito quanto sai), extrator (Water Extractor 120 m³/min; Oil Extractor 120 e Resource Well Extractor 60, com pureza 0,5/1/2; calcula quantos ou eu fixo) e os de sobra: Awesome Sink, Container e Saída (Export: para outra fábrica, por trem/caminhão/drone). Miner, extratores e Container são desenhados como marcadores de 8×8 m "fora de escala" (medida real pendente).
- **Números (fluxo físico, como o "Full" do Modeler):** `model/solve.ts` começa tudo no máximo que os limites deixam e só reduz pelo que falta na entrada ou não escoa na saída; o consumo limitado na frente volta para trás. Limites por bloco (máquinas, entrada por item); entrada bruta sem ligação nem limite fornece sem limite; saída principal sem ligação sai como produto final; subproduto sem saída trava o bloco; "coletar o excesso" por saída sólida; loops liberados, com o loop travado detectado. Bloco novo no vazio nasce fixado com uma fileira cheia. Roda no worker, com cache por componente (editar um bloco só recalcula o componente dele).
- **Ligação** (o "meio" no texto da tela; no código continua `meio`/`stage`): peça do mapa, arrastável na grade de 8 m. Clique abre o modal (`ui/LigacaoModal.tsx`, carregado sob demanda) com o desenho do fluxo, as montagens, o passo a passo e "Abrir no Balancer" (nova aba, com a montagem escolhida).
- **Estado v2** (`Factory` em `model/types.ts`: blocos, links, posições, montagens, `ligs`): salvo em `localStorage` (`sf-balancer:planner`) e compartilhado por `#p=`; o estado v1 (fases 1 e 2) abre migrado, com as máquinas de cada etapa fixadas.
- **Ícones do jogo** em `public/icons/<id>.webp` (64 px, servidos do próprio site) + `src/planner/data/icons.json`, gerados por `node scripts/icons.mjs` (baixa de um commit fixo do `rockfactory/satisfactory-logistics`; precisa do ImageMagick; não roda no build). A arte é © Coffee Stain Studios: o rodapé do builder traz o aviso (`plCredit`, nos três idiomas) e os READMEs também.
- **Dados do jogo** (`src/planner/data/game.json`) vêm do Docs do jogo na 1.1 (o jogo está na 1.2, sem mudança de receita segundo a wiki). Regerar: `node scripts/gamedata.mjs <en-US.json>` (usa `scripts/building-sizes.json` para os tamanhos).

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

- Site estático montado com **Vite** (módulos ES; o Balancer é JavaScript puro e o builder é React + TypeScript). Dependências: `three` (npm, carregado por `import()` dinâmico na aba 3D e no passo a passo), `react` e `react-dom` (builder); de desenvolvimento, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/*` e `playwright`.
- Estrutura do Balancer: `balancer.html` (HTML base em inglês), `src/main.js` (entrada), `src/logic/` (lógica pura, sem DOM; inclui `flownet.js`, `flowNet(alt)`: rede de peças de uma alternativa, e `flowlayout.js`, `flowLayout(net)`: colunas, linhas e lados das portas, que alimentam o diagrama do fluxo), `src/i18n/` (`pt.js`, `en.js`, `es.js`, `index.js`), `src/ui/` (interface), `src/view3d/` (cena 3D), `src/styles/main.css`, `public/` (estáticos copiados como estão para a raiz do site), `tests/` (testes e `tests/visual/`; `tests/fluxo-fluido.json` é a fixture que protege o desenho do modo fluido). Builder: `index.html` (entrada do Vite, HTML base em inglês, com o script que manda `/#s=` antigo para o Balancer), `src/planner/`: `model/` puro, sem DOM nem React (`types.ts` com o `Factory` v2; `factory.ts` operações e grupos de ligação; `factorystate.ts` ações, reducer, histórico, encode/decode e migração da v1; `solve.ts` o solver do fluxo; `solved.ts` blocos resolvidos e totais; `badges.ts` falta/represado/travado; `picker.ts` e `search.ts` o seletor; `ligacao.ts` o desenho do fluxo do modal; `meio.ts`/`meioresult.ts` o plano de cada ligação; `map/` a cena do mapa, com `ports.ts` as portas de arrastar e ligar), `worker/meio.worker.ts` (solve, ligações e desenho do modal fora da página), `solver.ts` e `meios.ts` (os hooks que falam com o worker), `store.ts`, `ui/` (componentes; `MapView.tsx` o canvas, `Picker.tsx`, `BlockPanel.tsx`, `LigacaoModal.tsx`, `mapDraw.ts`, `icons.ts`), `lang.ts` (os caminhos das duas páginas e o `legacyTarget`) e `data/` (`game.json`, `icons.json`); `src/styles/tokens.css` e `parts.css` (compartilhados pelas duas páginas); `scripts/gamedata.mjs` + `scripts/building-sizes.json` (geram `game.json`), `scripts/icons.mjs` (gera `public/icons/` e `icons.json`) e `tests/planner/*.test.ts`.
- Comandos: `npm run dev` (servidor local), `npm test` (testes da lógica), `npm run build` (gera `dist/`), `npm run preview` (serve o build), `npm run visual:capture -- <url-base> <pasta> [--routes] [--only=<trecho>] [--fixtures] [--fixtures-check]` (captura as telas; ex.: `npm run visual:capture -- http://localhost:4173 /tmp/out`; `--routes` inclui `/pt`, `/es`, `/pt/balancer` e `/es/balancer` (só com as rewrites: docker ou o site), `--only=` limita os cenários, `--fixtures` grava `tests/visual/fixtures.json`, `--fixtures-check` confere `#s=` e `localStorage` antigos) e `npm run visual:compare -- <pasta-a> <pasta-b>` (compara duas capturas; sai com código != 0 se algo diferir). `npm run smoke -- <url-base>` (Playwright contra o preview: canvas vazio → duplo clique → "Pure Iron" → Enter; arrastar da saída para o vazio → "Solid Steel Ingot"; segunda perna "Steel Pipe"; Ctrl+Z; clique na ligação abre o modal e Esc devolve o foco ao canvas; `/#s=` cai no Balancer; sai com código != 0 se um passo falhar), `npm run typecheck` (`tsc --noEmit`, só o builder); regerar os dados do jogo: `node scripts/gamedata.mjs <en-US.json>`. Os cenários do Balancer abrem `/balancer.html` (o `vite preview` não serve `/balancer` sem extensão em todo caso) e os do builder abrem `/?debug=1`: `builder`, `builder-bloco` (bloco selecionado), `builder-seletor` (duplo clique), `builder-seletor-teclado` (só teclado) e `builder-ligacao` (modal aberto), `--only=builder`. Com `?debug=1` (ou no `npm run dev`) o builder expõe `window.__sfPlanner = { scene, cam, ports }`, que a captura e o smoke usam para achar blocos, portas e ligações.
- **Três idiomas: português (pt-BR), inglês e espanhol.** Ver a seção "Idiomas" abaixo.
- Dark mode (vou usar do lado do jogo).
- Resultado atualiza ao vivo enquanto digito.
- Exemplo 1 já pré-carregado (no builder, a cadeia ferro puro → aço → vigas e canos).
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
- **Inglês é o padrão.** O idioma vem do caminho (`/pt`, `/es`, `/pt/balancer`, `/es/balancer`; sem prefixo é inglês), depois de `?lang=pt|en|es`, depois da escolha salva; sem nada disso, inglês (não detecta pelo navegador). No site (`*.vercel.app`) a URL e o `canonical` acompanham o idioma; aberto do disco, a URL não muda. O HTML base (título, `lang`, descrição, textos com `data-i18n`) fica em inglês: é o que os buscadores leem primeiro.
- **Ajuda contextual:** campos e resultados importantes têm um botão `?` (`class="tip" data-tip="chave"`, ou `tip('chave')` no HTML gerado) que abre um balão com `t(chave)`. Explicação nova = chave `tip...` nos três idiomas. A seção "Como funciona" e o FAQ no fim da página também usam `data-i18n`.
- **Idioma novo** também entra no script inline anti-piscada do `balancer.html` (regex `(pt|es|en)` e a chave `sf-balancer:lang`, espelho do `pickLang` em `src/ui/lang.js`), no `pathLang`/`BUILDER_PATH`/`BALANCER_PATH` de `src/planner/lang.ts` (e no script `legacyTarget` do `index.html`), e nos rewrites `/:lang(pt|es)` e `/:lang(pt|es)/balancer` do `vercel.json` (e no `nginx.conf`).
- Seletor com bandeira em SVG + sigla (`FLAGS`): emoji de bandeira não renderiza no Windows. Idioma novo precisa de bandeira em `FLAGS`.
- Os testes da lógica rodam em português; use `inLang('en', () => ...)` para testar outro idioma.

## Deploy e analytics

- Repositório público (MIT) `AdolfoCarneiro/sf-balancer`, com README em inglês, português e espanhol (`README.md`, `README.pt-BR.md`, `README.es.md`): mudança de comportamento visível atualiza os três; cada push no `master` publica na Vercel (https://sf-balancer.vercel.app).
- O deploy roda `npm run build` e publica `dist/`. Estáticos do site ficam em `public/`: `favicon.svg`, `og.png` (imagem de compartilhamento 1200×630), `robots.txt`, `sitemap.xml`. Arquivo estático novo do site vai em `public/`. O `.vercelignore` só deixa de fora docs e testes do upload. Rotas: o builder em `/`, `/pt`, `/es` (`index.html`) e o Balancer em `/balancer`, `/pt/balancer`, `/es/balancer` (`balancer.html`), com rewrites no `vercel.json` (`cleanUrls`) e as seis no `sitemap.xml`. Redirects: `/en` → `/`, `/en/balancer` → `/balancer`, `/planner` e `/en/planner` → `/`, `/pt/planner` e `/es/planner` → `/pt` e `/es` (os `#p=` compartilhados continuam valendo). Link antigo da ferramenta (`/#s=…`, `/pt#s=…`) abre o Balancer do mesmo idioma com o cenário (script no `<head>` do `index.html`, espelho do `legacyTarget`; `tests/planner/routes.test.ts` roda os dois). Headers de segurança e CSP ficam no `vercel.json`: qualquer script, fonte ou serviço externo novo precisa ser liberado lá (os ícones vêm de `/icons/`, coberto por `img-src 'self'`).
- Testar como em produção: `docker compose up --build` e abrir http://localhost:8080 (nginx servindo `dist/`, com as rotas e redirects acima como no `vercel.json`). `docker compose down --rmi local` limpa. O `nginx.conf` precisa espelhar as rotas do `vercel.json` (rewrites e redirects): mudou um, muda o outro. `Dockerfile`, `nginx.conf`, `docker-compose.yml` e `.dockerignore` não vão para a Vercel (estão no `.vercelignore`).
- Vercel Web Analytics via `<script defer src="/_vercel/insights/script.js">`, sem cookies. Localmente esse script dá 404, é esperado.

## Fora do escopo

O **Balancer** (`/balancer`) continua sem receitas, sem cadeia completa e com um item por vez. O builder fez as fases 1–3 (cadeia, mapa em escala, montar como no Modeler); fica para a fase 4 (ver `docs/backlog.md`): outros jeitos de montar as fileiras (Mergers no meio, uma entrada e duas saídas), portas reais dos prédios, andares e o Blueprint Designer no mapa, além das medidas reais de Miner, extratores e Container. Também fora: gerar a cadeia pela meta (só como ajuda no mesmo canvas, se vier), energia, somersloop, sub-fábricas, copiar e colar e seleção múltipla. Importação do planner de terceiros (`.sfmd`) segue fora.

## Ideias para depois

O backlog combinado (prioridades, bugs visuais anotados e ideias futuras) fica em `docs/backlog.md`.

Importar o `.sfmd` do Satisfactory Modeler (JSON só com o grafo e as receitas, sem taxas; o builder já conhece as receitas, falta um arquivo de exemplo), vários itens por etapa no Balancer.

Já feito: cenários salvos e link compartilhável (`#s=` com o estado em base64url, lido por `decodeShare`, que valida tudo), botão que abre issue no GitHub com o link do cenário, modo fluido, e o builder com receitas e cadeia (fases 1–3).