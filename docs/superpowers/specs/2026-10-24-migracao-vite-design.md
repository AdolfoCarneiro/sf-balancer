# Migração para Vite e módulos — design

Data: 2026-10-24. Aprovado em conversa com o usuário.

## Por que

O `index.html` passou de 5.600 linhas num arquivo só: CSS (~510), HTML fixo (~200), textos em três idiomas
(~1.200), lógica pura (~1.540) e interface (~2.160). Os testes precisam recortar o HTML entre `LOGIC-START` e
`LOGIC-END` para chegar na lógica. As próximas frentes (planta 2D definitiva, mais desenho e interação) vão
crescer justamente a parte que já é a maior. Quebrar agora em módulos deixa o código navegável e prepara o
terreno para, mais tarde, TypeScript e/ou um framework.

O usuário usa sempre o site publicado (https://sf-balancer.vercel.app), não abre o arquivo do disco. Por isso o
build pode gerar arquivos separados; não precisa de HTML único.

## Objetivo

Migração "de encanamento": quebrar em módulos com Vite **sem mudar nada do que o usuário vê ou faz**. Mesma
página, mesmos textos nos três idiomas, mesmos cálculos, mesmo link `#s=` (links antigos continuam abrindo),
mesma chave de `localStorage` (cenários salvos continuam lá), mesmas rotas `/`, `/pt`, `/es`.

## Não-objetivos

- Nenhuma feature nova, nenhuma correção de comportamento, nenhum ajuste visual. Bug encontrado no caminho é
  anotado no relatório, não corrigido nesta migração (a menos que a própria migração o cause).
- TypeScript, React/Preact/Svelte: ficam para depois, decididos quando começar a planta 2D.
- Reescrever algoritmos ou renomear funções além do necessário para exportar/importar.

## Anti-objetivos (seria fracasso mesmo "funcionando")

- Qualquer diferença visual nos cenários de referência (ver Verificação).
- Link compartilhado antigo ou cenário salvo antigo deixar de abrir.
- SEO pior: o HTML servido em `/` precisa continuar trazendo em inglês o título, descrição, `lang`, JSON-LD,
  canonical, og/twitter e os textos fixos com `data-i18n` (é o que os buscadores leem antes do JavaScript).
- Página mais lenta para abrir: o Three.js continua carregado só quando a aba 3D abre.

## Decisões

- **Build:** Vite (versão estável atual), `npm run dev` / `npm run build` / `npm test`. Saída em `dist/`.
- **Linguagem:** JavaScript puro, módulos ES. Sem TypeScript por enquanto.
- **Estrutura (alvo):**
  - `index.html` na raiz: só o HTML fixo e o `<script type="module" src="/src/main.js">`.
  - `src/styles/` (CSS importado pelo `main.js`, ou `<link>`; o que der o mesmo resultado).
  - `src/i18n/`: `pt.js`, `en.js`, `es.js` e um `index.js` com `I18N`, `LANGS`, `setLang`, `t`, `fmt`,
    `parseNum` e o que mais for do mecanismo de idioma.
  - `src/logic/`: módulos puros por assunto (por exemplo: belts/linhas, plano e alternativas, balancers e
    biblioteca, layout 3D/planta, grafo e simulação, histórico, link do cenário). Sem DOM.
  - `src/ui/`: render do planejador, planta do fluxo, desenho do balancer, biblioteca, ajuda, cenários,
    desfazer/refazer, eventos. Estado compartilhado de UI num módulo próprio se precisar.
  - `src/view3d/`: cena 3D.
  - `public/`: `favicon.svg`, `og.png`, `robots.txt`, `sitemap.xml` (e o arquivo de verificação do Google
    Search Console, se existir).
  - A divisão exata dos módulos fica a critério de quem implementa, seguindo os comentários `// ---- ... ----`
    que já separam o arquivo.
- **Three.js:** sai do CDN (importmap do jsdelivr) e vira dependência npm na mesma versão (0.160.0), com
  `import()` dinâmico para continuar em chunk separado carregado sob demanda. O jsdelivr sai da CSP.
- **Testes:** `tests/logic.test.js` passa a importar os módulos de `src/logic` e `src/i18n` direto (ESM), sem
  recortar HTML. Todos os testes atuais continuam, com as mesmas asserções. `node --test` continua sendo o
  runner (sem Vitest/Jest).
- **Deploy:** Vercel roda `npm run build` e publica `dist/`. `vercel.json` mantém `cleanUrls`, o redirect `/en`,
  os rewrites `/pt` e `/es` (agora para `/index.html` do build, conferir que funciona), headers e CSP. O
  `.vercelignore` deixa de listar arquivos do site (ou some, se não fizer mais sentido). Analytics
  (`/_vercel/insights/script.js`) continua igual.
- **Docs:** `AGENTS.md` atualizado: sai "um único `.html`, sem build"; entra a estrutura nova, os comandos e
  onde ficam os textos (`src/i18n/*`). A seção de idiomas continua valendo (mesmas regras, novo local). READMEs
  (os três) atualizados na parte de "rodar localmente", se houver.

## Verificação (critério de pronto)

1. `npm test`: os 84 testes atuais passando, com as mesmas asserções.
2. **Comparação visual pixel a pixel** entre o master antes da migração e o build novo (`vite preview`), com
   Playwright (Chromium em `~/.cache/ms-playwright`), numa lista fixa de cenários, nos três idiomas:
   planejador com o exemplo padrão; caso 2 e caso 3 do AGENTS.md; modo fluido; biblioteca 6→6 borboleta em
   Esquema, Planta (com a marcação padrão) e Por peça; biblioteca 9→9; balão de ajuda aberto; viewport de
   celular (390 px). A aba 3D: conferir que abre e renderiza sem erro (WebGL pode variar pixel; não exigir
   igualdade exata ali).
3. Abrir um link `#s=` gerado no master antigo e um cenário salvo no `localStorage` antigo no build novo.
4. Rotas `/`, `/pt`, `/es` com o idioma certo e o `canonical` certo.
5. Sem erros no console além do 404 esperado do analytics em local.
6. Deploy de preview na Vercel (push da branch) aberto e conferido antes de qualquer merge no `master`.

## Como fazer

Numa branch própria, em passos pequenos, cada um com os testes passando e a página idêntica:

1. Vite servindo o arquivo atual praticamente como está (package.json, build, Vercel, `public/`).
2. CSS para fora.
3. Textos (i18n) para fora.
4. Lógica pura para `src/logic` e testes importando os módulos.
5. Interface e cena 3D para `src/ui` e `src/view3d`; Three.js via npm.
6. Docs (`AGENTS.md`, READMEs), limpeza, verificação completa e preview.

O merge no `master` (que publica em produção) só depois do usuário conferir o preview.
