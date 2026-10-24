# Migração para Vite e módulos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quebrar o `index.html` de 5.676 linhas em módulos ES com Vite, sem nenhuma mudança visível.

**Architecture:** Primeiro congela uma linha de base (screenshots + estados) do site atual. Depois move todo o
JavaScript para um único módulo `src/main.js` servido pelo Vite e, a partir daí, recorta módulos de dentro dele
(CSS, i18n, lógica, UI, 3D), comparando com a linha de base a cada passo.

**Tech Stack:** Vite (estável atual), JavaScript ES modules, `node --test`, Playwright (devDependency, só para a
comparação visual), three@0.160.0 via npm, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-24-migracao-vite-design.md`

## Global Constraints

- Nenhuma mudança visível: textos, layout, cálculos, `#s=`, chave de `localStorage` (`sf-balancer:v3`, `sf-balancer:lang` e as de cenários/biblioteca existentes), rotas `/`, `/pt`, `/es`.
- O HTML servido em `/` mantém em inglês: `<title>`, `lang`, meta description, JSON-LD, canonical, og/twitter e os textos `data-i18n`.
- JavaScript puro (sem TypeScript, sem framework). Runner de teste: `node --test`.
- three na versão 0.160.0, carregado com `import()` dinâmico (chunk separado, só ao abrir a aba 3D).
- Regras de i18n do `AGENTS.md` continuam: chave nova nos três idiomas (a migração não deve criar chaves).
- Commits pequenos em português, estilo do `git log`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tudo na branch `migracao-vite`. Nada de merge no `master` nem push no `master`.

## Review Focus

1. Código que virou módulo roda em strict mode: atribuição a variável não declarada, `this` no topo e funções que dependiam de ser globais (chamadas por `window.x`, por string ou por outro `<script>`) quebram em silêncio só no navegador — a comparação visual e o "sem erro no console" de cada task pegam isso.
2. `let` exportado é só leitura para quem importa: estado de UI que vários módulos reatribuem (ex.: `selectedKey`, `histQuiet`, `HIST`, `LIB`, `BPS`) precisa ir para um objeto de estado compartilhado (`src/ui/state.js`), não para `export let`.
3. Rewrites do Vercel para `/pt` e `/es` com `cleanUrls` depois do build (o commit `0b775dc` já teve problema com isso): conferir no preview, não só local.
4. Link `#s=` e cenários salvos gerados pela versão antiga abrindo na nova (fixtures da Task 1).
5. Ordem de execução: o script antigo rodava síncrono no fim do `<body>`; módulo roda deferido. Qualquer leitura de DOM ou `localStorage` no topo continua funcionando, mas conferir o primeiro render (idioma pelo caminho, exemplo pré-carregado, hash `#s=`).

---

### Task 1: Linha de base e Vite servindo o arquivo atual

**Files:**
- Create: `package.json`, `vite.config.js`, `tests/visual/scenarios.js`, `tests/visual/capture.js`, `tests/visual/compare.js`, `tests/visual/fixtures.json`
- Move: `favicon.svg`, `og.png`, `robots.txt`, `sitemap.xml` (e qualquer `google*.html` de verificação) → `public/`
- Modify: `vercel.json`, `.vercelignore`, `.gitignore` (`node_modules`, `dist`)

**Interfaces:**
- Produces: `npm run dev`, `npm run build` (gera `dist/`), `npm run preview`, `npm test` (= `node --test tests/`), `npm run visual:capture -- <url-base> <pasta>` e `npm run visual:compare -- <pasta-a> <pasta-b>` (sai com código ≠ 0 se algum PNG diferir; ignora os de 3D, que só precisam existir e não ter erro de console).
- Linha de base em `/tmp/claude-1000/-home-adolfocarneiro-source-repos-sf-balancer/ef2933cf-ad5c-4066-8f5d-21dcadd838ed/scratchpad/baseline/` — fora do repo.

- [ ] **Step 1:** Criar a branch `migracao-vite` a partir do `master` (`4d3f176` ou posterior).
- [ ] **Step 2:** `package.json` (`"type": "module"`, `private: true`), devDependencies `vite` e `playwright` (usar os browsers já instalados em `~/.cache/ms-playwright`, `executablePath` como em `scratchpad/pw/designer.js`; não baixar browsers).
- [ ] **Step 3:** `tests/visual/scenarios.js`: lista fixa de cenários, cada um com `name`, `path` (`/`, `/pt`, `/es` ou `?lang=`), `viewport`, e `actions` (Playwright) — cobrir: exemplo padrão; caso 2 (destino 440/linha, 4 linhas); caso 3 (6 refinarias por linha); modo fluido; biblioteca 6→6 borboleta 240 Mk4 em Esquema, Planta e Planta+Por peça; biblioteca 9→9; balão de ajuda aberto num `?`; viewport 390×844; aba 3D aberta (marcar `fuzzy: true`). Cada cenário nos três idiomas. Usar `localStorage` limpo por contexto, `prefers-reduced-motion`, e esperar a rede/animações assentarem antes do screenshot.
- [ ] **Step 4:** `tests/visual/capture.js` salva `<pasta>/<name>-<lang>.png` + `<pasta>/console.json` (erros de console por cenário, ignorando 404 de `/_vercel/insights/script.js`). Também grava em `fixtures.json` (no repo) um link `#s=` real gerado pela página (botão Copiar link, cenário caso 1 com um grupo extra) e o conteúdo de `localStorage` depois de salvar um cenário nomeado — são as entradas antigas que a versão nova tem que abrir.
- [ ] **Step 5:** Capturar a linha de base servindo o `index.html` atual **sem Vite** (`python3 -m http.server`) e conferir que todos os PNGs existem e `console.json` está vazio.
- [ ] **Step 6:** Mover os estáticos para `public/`; Vite com `index.html` na raiz; o importmap do three pode ficar como está nesta task. `vercel.json`: `"buildCommand": "npm run build"`, `"outputDirectory": "dist"`, mantendo redirects/rewrites/headers. `.vercelignore`: não pode mais excluir `package.json`, `vite.config.js`, `src/`, `public/`; excluir só `docs/`, `tests/`, READMEs etc.
- [ ] **Step 7:** `tests/logic.test.js` continua recortando entre `LOGIC-START`/`LOGIC-END` do `index.html` nesta task. Rodar `npm test` → 84 pass.
- [ ] **Step 8:** `npm run build && npm run preview`, capturar em outra pasta e `visual:compare` contra a linha de base → nenhuma diferença, console limpo. Conferir `/pt` e `/es` no preview local.
- [ ] **Step 9:** Commit ("Vite servindo a página e linha de base visual").

### Task 2: Todo o JavaScript num módulo `src/main.js`

**Files:**
- Create: `src/main.js`
- Modify: `index.html` (sai o `<script>` da lógica e o da UI; entra `<script type="module" src="/src/main.js">`), `tests/logic.test.js`

**Interfaces:**
- Produces: `src/main.js` com o conteúdo dos dois blocos (lógica e UI) na ordem atual, ainda com os marcadores `// LOGIC-START` / `// LOGIC-END`. O teste passa a recortar de `src/main.js`.

- [ ] **Step 1:** Mover os dois `<script>` (lógica e UI) para `src/main.js`, um depois do outro. Manter o JSON-LD, o analytics e o importmap no HTML.
- [ ] **Step 2:** Corrigir o que o strict mode/escopo de módulo quebrar (Review Focus 1). Nada de mudar comportamento.
- [ ] **Step 3:** `npm test` → 84 pass.
- [ ] **Step 4:** Build + preview + capture + compare contra a linha de base → idêntico, console limpo; abrir o `#s=` e o `localStorage` de `fixtures.json` e conferir que o cenário aparece.
- [ ] **Step 5:** Commit ("JavaScript num módulo só").

### Task 3: CSS e textos (i18n) para fora

**Files:**
- Create: `src/styles/main.css` (ou alguns arquivos por área, importados em ordem), `src/i18n/pt.js`, `src/i18n/en.js`, `src/i18n/es.js`, `src/i18n/index.js`
- Modify: `index.html`, `src/main.js`, `tests/logic.test.js`

**Interfaces:**
- Produces: `src/i18n/index.js` exporta `I18N`, `LANGS`, `setLang`, `t`, `fmt`, `parseNum`, `getLang()` (no lugar de ler a variável `LANG` de fora; quem lia `LANG` passa a chamar `getLang()`), e o que mais o mecanismo de idioma tiver (`srcTag`, `dstTag`, `FLAGS` se for de idioma). `pt.js`/`en.js`/`es.js` exportam `default` o objeto de textos do idioma.
- Produces: helper de teste `inLang(lang, fn)` continua funcionando.

- [ ] **Step 1:** CSS para `src/styles/`, importado por `src/main.js` (ou `<link>`), mesma ordem de regras. Compare visual → idêntico.
- [ ] **Step 2:** Textos e mecanismo de idioma para `src/i18n/`. `src/main.js` importa. O teste `idiomas: as mesmas chaves, do mesmo tipo, nos três` passa a importar de `src/i18n/index.js`.
- [ ] **Step 3:** `npm test` → 84 pass. Build + compare → idêntico, console limpo.
- [ ] **Step 4:** Commit(s) ("CSS para fora", "Textos para src/i18n").

### Task 4: Lógica pura para `src/logic/` e testes em ESM

**Files:**
- Create: `src/logic/*.js` — um módulo por seção `// ---- ... ----` do bloco de lógica (por exemplo `belts.js`, `plan.js`, `balancers.js`, `layout.js`, `graph.js`, `history.js`, `share.js`); a divisão final é de quem implementa, sem ciclos de import.
- Modify: `src/main.js`, `tests/logic.test.js`

**Interfaces:**
- Produces: `src/logic/index.js` reexporta exatamente os nomes que o `module.exports` atual do bloco de lógica exporta (a lista da linha `if (typeof module !== 'undefined') module.exports = {...}`), com os mesmos nomes e assinaturas.
- `tests/logic.test.js` vira ESM: `import * as L from '../src/logic/index.js'` (e i18n de `src/i18n`), sem `new Function` nem recorte de HTML. As asserções não mudam.

- [ ] **Step 1:** Converter `tests/logic.test.js` para importar `src/logic/index.js` → deve falhar (módulo não existe).
- [ ] **Step 2:** Recortar a lógica de `src/main.js` para `src/logic/`, apagar os marcadores `LOGIC-START/END` e o `module.exports` condicional.
- [ ] **Step 3:** `npm test` → 84 pass, mesmas asserções (conferir com `git diff tests/` que só imports/cabeçalho mudaram).
- [ ] **Step 4:** Build + compare → idêntico, console limpo.
- [ ] **Step 5:** Commit ("Lógica em src/logic e testes importando os módulos").

### Task 5: Interface e cena 3D em módulos, three via npm

**Files:**
- Create: `src/ui/state.js`, `src/ui/*.js` (por seção `// ---- ... ----` da UI: idioma/aplicação de textos, grupos, ajuda, render, planta do fluxo, desenho do balancer, biblioteca, diálogo, cenários, desfazer/refazer, eventos), `src/view3d/scene.js`
- Modify: `src/main.js` (vira só o ponto de entrada: importa CSS, i18n e chama o init), `index.html` (sai o importmap), `package.json` (`three@0.160.0`), `vercel.json` (tira `https://cdn.jsdelivr.net` da CSP)

**Interfaces:**
- Produces: `src/ui/state.js` exporta um objeto único mutável (ex.: `export const S = { selectedKey: null, histQuiet: false, ... }`) para todo estado de UI reatribuído por mais de um módulo (Review Focus 2).
- `src/view3d/scene.js`: `load3d()` com `import('three')`, `import('three/addons/controls/OrbitControls.js')`, `import('three/addons/geometries/RoundedBoxGeometry.js')` (ou caminhos `three/examples/jsm/...` equivalentes) — continua chunk separado.

- [ ] **Step 1:** Criar `src/ui/state.js` e trocar as reatribuições cruzadas.
- [ ] **Step 2:** Recortar a UI em módulos; `src/main.js` só inicializa.
- [ ] **Step 3:** three via npm, sem importmap; conferir no `dist/` que o three está num chunk separado e que a página inicial não o carrega (aba de rede no Playwright).
- [ ] **Step 4:** CSP sem jsdelivr. Conferir que nada mais vinha de lá (`grep -r jsdelivr src index.html`).
- [ ] **Step 5:** `npm test` → 84 pass. Build + compare → idêntico; cenário 3D abre sem erro de console.
- [ ] **Step 6:** Commit(s) ("UI em módulos", "Three.js pelo npm").

### Task 6: Docs, verificação final e preview

**Files:**
- Modify: `AGENTS.md`, `README.md`, `README.pt-BR.md`, `README.es.md`, `docs/backlog.md` (se citar arquivo único)

- [ ] **Step 1:** `AGENTS.md`: trocar "um único `.html`, sem build" pela estrutura nova (`src/logic`, `src/i18n`, `src/ui`, `src/view3d`, `public/`), comandos (`npm run dev`, `npm test`, `npm run build`, `npm run visual:capture/compare`), textos em `src/i18n/*.js`, arquivo novo do site vai em `public/`, CSP no `vercel.json`. Manter todas as regras de idioma e as demais seções.
- [ ] **Step 2:** READMEs (três): seção de rodar localmente / estrutura, se existir.
- [ ] **Step 2b:** Docker simples para testar local como em produção: `Dockerfile` multi-stage (`node:24-alpine` roda `npm ci && npm run build`; `nginx:alpine` serve `dist/`) + `nginx.conf` reproduzindo o essencial do `vercel.json` (`/pt` e `/es` servindo o `index.html`, `/en` → `/` 301, cleanUrls) + `docker-compose.yml` com `docker compose up --build` em `http://localhost:8080`. `.dockerignore` com `node_modules`, `dist`, `.git`, `.claude`, `.superpowers`. Conferir subindo o container: `/`, `/pt`, `/es` com idioma certo e rodar `visual:capture` contra `http://localhost:8080` comparando com a linha de base. Documentar o comando no `AGENTS.md` e nos três READMEs.
- [ ] **Step 3:** Verificação final completa: `npm test`; build + compare de todos os cenários; fixtures `#s=` e `localStorage`; `/`, `/pt`, `/es` com idioma e canonical certos no preview local; `view-source` de `/` com o HTML em inglês para SEO.
- [ ] **Step 4:** Commit ("Docs: estrutura com Vite").
- [ ] **Step 5:** `git push -u origin migracao-vite` (gera preview na Vercel). Se houver URL de preview acessível (comentário/status do GitHub via `gh`), rodar o `visual:capture` contra ela e comparar; conferir `/pt` e `/es` lá. Não fazer merge.
