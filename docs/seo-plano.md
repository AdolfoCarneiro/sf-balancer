# SEO do SF Balancer: diagnóstico e plano (2026-10-29)

Pesquisa e mapeamento, sem mudar nada no app. Regra para tudo que está aqui: **a experiência de uso não muda**. O que entra é texto lido pelos buscadores, páginas novas de conteúdo e divulgação fora do site.

Limite honesto: não tenho dados de volume de busca nem de posição no Google. As prioridades abaixo vêm do que aparece nas buscas hoje e do que os concorrentes fazem. Os números de verdade vão vir do Search Console (o site já tem a tag de verificação do Google no HTML, então ele deve estar configurado) e do Analytics da Vercel.

---

## 1. Onde estamos

| Ponto | Situação |
|---|---|
| robots.txt e sitemap | ok (6 URLs, hreflang entre os 3 idiomas) |
| Título e descrição | bons, com os termos certos, mas **só em inglês no HTML**; pt/es só aparecem depois do JavaScript |
| Canonical | **não existe no HTML**; o app põe com JavaScript |
| Texto para quem não roda JS | Fábrica: ~2.600 caracteres (Sobre + FAQ). **Balancer: 43 caracteres** (antes da unificação eram ~20 mil) |
| Dados estruturados | WebApplication nas duas; FAQPage só na Fábrica |
| Imagem de compartilhamento | uma só (o mapa da Fábrica), usada também no Balancer |
| Domínio | `sf-balancer.vercel.app` (subdomínio da Vercel) |
| Presença fora do site | **não aparece** na lista de ferramentas da wiki oficial, nem nas buscas que testei |
| Analytics | Vercel Web Analytics ligado nas duas páginas |
| Peso | JS principal ~163 KB comprimido, com cache longo; ok |

## 2. O mercado (quem já ocupa as buscas)

**Ferramentas grandes** (difícil disputar a busca genérica "satisfactory calculator/planner"): satisfactory-calculator.com (SCIM, com mapa, planejador e milhares de blueprints de balancer indexados um por um), satisfactorytools.com, FactorioLab, Satisfactory Modeler (app de desktop na Steam, 97% de avaliações positivas).

**Concorrentes diretos no nosso nicho** (balancer, esteira e logística):
- **satisfactory-balancer-calculator.app**: título "Satisfactory Balancer Calculator — belts, load, clock", H1 com o termo exato, ~1.000 palavras de texto fixo, FAQ, tabela de tiers de esteira, 3 idiomas (en, fr, es). É o modelo a bater.
- **Splitter Calculator** (icemoonmagic.github.io) e **Manifolder** (só o título, quase nenhum texto).
- **rapidtoolset.com**: calculadora de esteira simples, quase sem texto, mas aparece para "satisfactory belt calculator".

**O que a busca mostra:** para "balancer", "load balancer calculator" e "split belt into 5", quem aparece é a wiki, o Steam Community, o Reddit e as páginas de blueprint do SCIM, uma página por design ("6x240 to 5x270 loadbalancer", "4 to 3 Load Balancer"). Ou seja, **existe busca por design específico N→M**, e ninguém responde com uma página que calcula e explica.

**O que só a gente tem** (e o texto precisa dizer isso):
1. Balancer entre **duas etapas** a partir das máquinas (42 refinarias × 65 → 60 fundições × 40), não só "divide em N".
2. Montagens que **não saem direto** (5, 7) com as duas saídas (loop ou sink), o passo a passo peça por peça e o 3D.
3. **Abrir o .sfmd do Satisfactory Modeler no navegador** e ver a ligação de cada esteira.
4. Planejador de fábrica em mapa com escala real (fundações) e balancer em cada ligação.
5. Português e espanhol de verdade (o concorrente direto não tem português).

## 3. Mapa de palavras-chave

Prioridade: **A** = dá para ganhar logo, nicho com pouca concorrência boa; **B** = médio prazo; **C** = genérica, só como apoio.

### Página Balancer (`/balancer`)

| Prioridade | Inglês | Português | Espanhol |
|---|---|---|---|
| A | satisfactory balancer calculator · load balancer calculator · belt balancer calculator | balanceador de esteira satisfactory · calculadora de balancer satisfactory | balanceador satisfactory · calculadora balanceador cintas |
| A | satisfactory split belt into 5 / 7 · 1 to 5 splitter · 5 way splitter | dividir esteira em 5 satisfactory · splitter 1 para 5 | dividir cinta en 5 satisfactory |
| A | satisfactory 3 to 4 balancer (e cada N→M: 2→3, 4→5, 6→5…) | balancer 3 para 4 satisfactory | balanceador 3 a 4 satisfactory |
| A | satisfactory manifold vs balancer · do I need a balancer | manifold ou balancer satisfactory | manifold o balanceador satisfactory |
| B | satisfactory belt calculator · machines per belt · how many belts | quantas máquinas por esteira satisfactory | cuántas máquinas por cinta satisfactory |
| B | satisfactory splitter merger calculator · how many mergers | calculadora de splitter e merger | calculadora splitter merger |
| B | satisfactory butterfly balancer · vertical balancer · compact balancer | balancer vertical satisfactory | balanceador vertical satisfactory |
| C | satisfactory logistics planner · belt planner | planejador de logística satisfactory | planificador de logística satisfactory |

### Página Fábrica (`/`)

| Prioridade | Inglês | Português | Espanhol |
|---|---|---|---|
| A | satisfactory modeler online · in browser · web version · open sfmd | satisfactory modeler online · abrir sfmd | satisfactory modeler online |
| A | satisfactory modeler alternative | alternativa ao satisfactory modeler | alternativa a satisfactory modeler |
| B | satisfactory factory planner map · factory layout planner · foundation planner | planejador de fábrica satisfactory · planta da fábrica | planificador de fábrica satisfactory |
| B | satisfactory production chain planner · recipe planner with alternates | planejador de produção satisfactory | planificador de producción satisfactory |
| C | satisfactory calculator · satisfactory planner | calculadora satisfactory | calculadora satisfactory |

Os termos do jogo ficam como o jogador escreve: **Splitter, Merger, Smart Splitter, Awesome Sink, manifold, load balancer, Mk1–Mk6, 1.0/1.1**. Em pt e es o jogador mistura (busca "balancer" e "balanceador"), então o texto usa os dois.

## 4. Técnico (não muda a experiência)

Em ordem de impacto:

1. **Devolver o texto do `/balancer` no HTML.** Pôr "Como funciona", os casos A a D, as regras do jogo, a explicação de balancer e o FAQ, em inglês, dentro do `<div id="root">` do `balancer.html`. O React troca esse conteúdo quando monta, então ninguém vê diferença. É a perda mais séria e veio da unificação de ontem.
2. **Um HTML por idioma no build.** Gerar `/pt` e `/es` (e as duas do Balancer) com `lang`, título, descrição, `og:locale` e o texto fixo já no idioma. Hoje os buscadores leem inglês nas 6 URLs até rodar o JavaScript; o Bing e os buscadores de IA nem rodam.
3. **Canonical fixo** em cada um dos 6 HTML (hoje só existe via JavaScript).
4. **FAQPage no `/balancer`**, com as 6 perguntas que a página já tem (a Fábrica já tem).
5. **Sitemap com a data do build** e as páginas novas da seção 5 (gerado no build, não à mão).
6. **Imagem de compartilhamento própria do Balancer** (o desenho de um balancer 2→5 com loop, por exemplo); hoje a prévia no Discord e no Reddit mostra o mapa da Fábrica.
7. **Bing Webmaster Tools**: importar do Search Console em 2 cliques. O Bing alimenta o DuckDuckGo e a busca do ChatGPT.
8. **Medir a velocidade** (PageSpeed Insights, ou o Speed Insights da Vercel, que já está habilitado no projeto mas sem o script nas páginas). Atenção a um ponto: o script de entrada segura a primeira pintura até carregar (`blocking="render"`); isso evita o piscar, mas pode piorar o LCP. Medir antes de mexer.
9. **Domínio próprio (decidir cedo).** Um `.com` ou `.app` de uns US$ 10–15 por ano dá marca e confiança, e quanto mais tarde mudar, mais força se perde no redirecionamento (que a Vercel faz). Opcional.

## 5. Conteúdo novo (páginas a mais, o app fica igual)

O maior ganho possível, porque é onde existe busca e ninguém responde bem:

1. **Uma página por balancer N→M** (`/balancer/3-to-4`, `/pt/balancer/3-para-4`…): título "Satisfactory 3 to 4 Load Balancer — design, pieces and step by step", com o desenho em SVG, as peças, a vazão de cada trecho, o passo a passo em texto, a alternativa com loop ou sink, e o botão "Abrir no gerador". Tudo isso a lógica já calcula; a página seria gerada estática no build. Começar pelas combinações mais buscadas (1→3 a 1→9, 2→3, 2→5, 3→4, 4→5, 5→6, 6→5…), umas 30, não todas as 130; páginas demais e parecidas podem ser vistas como conteúdo raso.
2. **Guias curtos**, um por pergunta frequente, cada um com a resposta já no começo e um link para a ferramenta:
   - How to split a belt into 5 (or 7) in Satisfactory
   - Manifold vs load balancer: which one do you need
   - How many machines fit on a belt (Mk1–Mk6)
   - How to connect 6 lines of 455 into lines of 480 (o caso que motivou o projeto)
   - Open a Satisfactory Modeler (.sfmd) file in your browser
3. **Tabela de esteiras e canos** (Mk1–Mk6 e Pipeline Mk1–2, com quantas máquinas de cada receita comum cabem por linha): o concorrente direto tem uma tabela de tiers e isso aparece em busca.

Cada página nos 3 idiomas, com o texto escrito para cada um (não traduzido palavra por palavra).

## 6. Copy proposto (títulos e descrições)

Regra: o termo buscado primeiro, o diferencial depois, a marca no fim.

**Balancer**
- en: `Satisfactory Load Balancer Calculator — belts, splitters & mergers | SF Balancer`
- descrição en: `Free Satisfactory balancer calculator: from machine counts to belt lines, the exact splitters and mergers, and N→M load balancers, including 5 and 7 with loop or sink. Step by step, 2D and 3D.`
- pt: `Calculadora de Balancer para Satisfactory — esteiras, splitters e mergers | SF Balancer`
- es: `Calculadora de Balanceadores para Satisfactory — cintas, splitters y mergers | SF Balancer`
- H1 visível (o título acima do nome do item): trocar "Satisfactory belt balancer · logistics between stages" por "Satisfactory load balancer & belt calculator", mantendo o mesmo tamanho e estilo.

**Fábrica**
- en: `Satisfactory Factory Planner on a Map — Modeler (.sfmd) import & belt balancers | SF Balancer`
- descrição en: `Plan your Satisfactory factory on a map, like Satisfactory Modeler but in the browser: open .sfmd files, chain recipes with alternates, see shortages and get the belts, splitters and balancers of every connection. Free, no sign-up.`
- pt/es: o mesmo, escrito em cada idioma.

**Texto fixo das duas páginas** (o que os buscadores leem): de 600 a 1.000 palavras cada, com H2 em forma de pergunta (como o concorrente direto faz), a tabela de esteiras, e o caso das refinarias como exemplo. No Balancer, esse texto já existe ("Como funciona", biblioteca, FAQ); é só voltar para o HTML.

## 7. Fora do site (divulgação e links)

Para um nicho como este, é aqui que está o maior ganho, e sem mexer em código:

1. **Wiki oficial** (satisfactory.wiki.gg): entrar na página [Tools](https://satisfactory.wiki.gg/wiki/Tools) (os concorrentes diretos estão lá: Balancer Calculator, Splitter Calculator, Manifolder) e nos "External links" da página [Balancer](https://satisfactory.wiki.gg/wiki/Balancer), que hoje só cita o SCIM. É o link de maior autoridade possível no tema; precisa de conta na wiki e seguir o formato das outras entradas (link, uma linha, versão do jogo).
2. **Reddit** (r/SatisfactoryGame e r/satisfactory): um post "I made…" com um GIF do passo a passo do balancer 2→5 e outro com o .sfmd abrindo no navegador. É o que mais traz gente no começo.
3. **Comunidade do Satisfactory Modeler** (Discord e Steam): a importação do .sfmd é um gancho natural. Pedir licença antes de divulgar lá.
4. **Guia no Steam Community** ("How to plan belts and balancers between factory stages") com link para a ferramenta: guias do Steam aparecem bem no Google.
5. **Repositório no GitHub**: descrição e tópicos (`satisfactory`, `factory-planner`, `load-balancer`, `calculator`) e link do site no "About".
6. **Criadores de conteúdo** de Satisfactory no YouTube (pt e es têm pouca concorrência): mandar o link com o caso das refinarias.

## 8. Como medir

- **Search Console**: termos que trazem impressões, posição média e quais páginas estão indexadas (conferir se o `/balancer` e as versões pt/es estão).
- **Vercel Analytics**: visitantes, páginas e **de onde vieram** (Reddit, wiki, Google).
- Revisar 4 semanas depois de cada etapa: os termos da coluna A começaram a dar impressão?

## 9. Ordem sugerida

| Etapa | O quê | Esforço |
|---|---|---|
| 1 | Seção 4, itens 1–5 (texto do Balancer de volta, HTML por idioma, canonical, FAQPage, sitemap) | pequeno, código |
| 2 | Títulos, descrições e H1 da seção 6 | pequeno, só texto |
| 3 | Wiki, GitHub e Bing (seção 7, itens 1, 5 e 4.7) | pequeno, fora do código |
| 4 | Páginas N→M e guias (seção 5) | médio, código + texto nos 3 idiomas |
| 5 | Reddit, Steam e criadores (seção 7) | contínuo |
| 6 | Imagem de compartilhamento do Balancer, velocidade, domínio | quando der |

Fontes consultadas: [wiki: Tools](https://satisfactory.wiki.gg/wiki/Tools), [wiki: Balancer](https://satisfactory.wiki.gg/wiki/Balancer), [Satisfactory Balancer Calculator](https://satisfactory-balancer-calculator.app), [Manifolder](https://manifolder.app/), [RapidToolSet belt calculator](https://rapidtoolset.com/en/tool/satisfactory-belt-calculator), [Satisfactory Modeler (itch.io)](https://satisfactorymodeler.itch.io/satisfactorymodeler), [Steam: dividir esteira em 5](https://steamcommunity.com/app/526870/discussions/0/2805133852512441974), [SCIM blueprints de balancer](https://satisfactory-calculator.com/en/blueprints/live/preview/id/4284/name/6x240+to+5x270+loadbalancer).

---

## 10. Andamento (2026-10-29)

**Feito (etapas 1 a 4):**
- Uma página gerada no build por rota e idioma (`src/seo/pages.js`), com `lang`, título, descrição, canonical, hreflang, Open Graph e dados estruturados no idioma; o texto do Balancer voltou ao HTML; o sitemap é gerado com todas as páginas.
- Títulos, descrições e o H1 do Balancer novos (seção 6), nos 3 idiomas.
- 35 balancers N→M com página própria (`/balancer/3-to-4`, `/pt/balancer/3-para-4`, `/es/balancer/3-a-4`): desenho, passo a passo, vazão por trecho, outras montagens e links entre elas. No app, o endereço abre a biblioteca já naquele balancer, e a biblioteca ganhou a lista "Balancers prontos".
- GitHub: descrição e tópicos atualizados.

**Falta (precisa de você, fora do código):**
1. **Wiki** (precisa de conta no satisfactory.wiki.gg). Na página [Tools](https://satisfactory.wiki.gg/wiki/Tools), em "Macro Planning: Web Tools", seguindo o formato das outras linhas:

   > [https://sf-balancer.vercel.app SF Balancer] — Factory planner on a map that opens Satisfactory Modeler (.sfmd) files and works out the belts, splitters, mergers and N→M load balancers of every connection (including 5 and 7 with a loop or sink), step by step in 2D and 3D. English, Portuguese and Spanish. (1.0+)

   E na página [Balancer](https://satisfactory.wiki.gg/wiki/Balancer), em "External links":

   > [https://sf-balancer.vercel.app/balancer SF Balancer load balancer calculator] — Builds and compares N→M balancer designs (matrix, funnel, butterfly, with a loop or sink) and checks the rate on every belt segment.

2. **Search Console**: depois do deploy, enviar `https://sf-balancer.vercel.app/sitemap.xml` (Sitemaps → Adicionar) e pedir a indexação do `/balancer` (Inspeção de URL).
3. **Bing Webmaster Tools**: entrar com a conta Google e importar o site do Search Console (o sitemap vem junto).
