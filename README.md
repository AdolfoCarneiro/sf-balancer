<div align="center">

# SF Balancer

**Factory planner & belt balancer for [Satisfactory](https://www.satisfactorygame.com/)**

Build the chain like in your production planner, see it to scale, and get how to wire it.

[**Open the planner →**](https://sf-balancer.vercel.app)

English · [Português](README.pt-BR.md) · [Español](README.es.md)

[![Live](https://img.shields.io/badge/live-sf--balancer.vercel.app-ff9b3d?style=flat-square)](https://sf-balancer.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-8fe3a4?style=flat-square)](LICENSE)
![Static site](https://img.shields.io/badge/build-vite-15324f?style=flat-square)

<img src="docs/screenshot.png" alt="SF Balancer: six source lines of 455/min feeding five destination lines of 480/min through a splitter tree" width="900">

</div>

## The problem

One stage of your factory makes **6 lines of 455/min** (7 refineries each). The next one needs **5 lines of 480/min** (12 foundries each). How do you connect them? How many lines fill up, how much is left over, and where does the balancer go?

You can do that math by hand every time, or you can type the machine counts and let the planner draw it.

## The factory builder (home page)

Open the site and you land on the builder: build the factory block by block, like in Satisfactory Modeler, except every block already knows its rows of machines.

- **Two views, one button at the top.** **Build** (the main one) shows each block as a card: building, recipe and machine count, compact like a Satisfactory Modeler node, and round ports colored by state, linked by animated belts to a chip that says what each connection needs ("6 → 5" balancer, direct, + Sink, pipe). **Scale plan** shows the same factory to its real size on an 8 m foundation grid. Names, ports and chips stay readable at any zoom. Each view keeps its own positions, so tidying Build doesn't scramble the Scale plan (turn on "Move together" to drag in both). Selecting a block shows a preview of its rows in the side panel, with "Arrange rows".
- **Build with the Modeler's gestures.** Double-click (or right-click) empty space to open the picker right there: resources first, one tile per item like in the Modeler, then recipes and the outlets (search, icons, arrow keys + Enter). Drag from a block's port to empty space and the picker opens filtered to the recipes that take (or make) that item; the new block is born connected. Drop on a matching port to just connect. Delete removes, arrows move 8 m, R rotates, Ctrl+Z undoes. Shift or Ctrl + click adds a block to the selection, Shift + drag on empty space draws a selection box and Ctrl+A (or "Select all" in the panel) takes everything: drag one to move them all, Delete removes them all in a single undo step.
- **Numbers like the Modeler, with the physical flow.** A new block consumes what reaches it; fix machines or an input rate when you want. Shortage shows in coral on the port ("120/min short"), backed-up surplus in teal ("+330 spare"), the factory's final output in orange, and freed surplus flows to the other branches. The bar under the header sums up what comes in, goes out (final products and what reaches Container and Export blocks) and goes to the Awesome Sink, and the "N shortages" / "N surpluses" buttons take you to each problem on the map. A byproduct with nowhere to go stalls its block, as in the game. Loops (recycled rubber and plastic) are fine, and a deadlocked loop is pointed out.
- **Sources and outlets.** Miner (type what it gives), Water, Oil and Resource Well extractors (it says how many you need, with purity where the game has it), and Awesome Sink, Container and Export blocks to take the surplus on purpose.
- **Arrange the rows like in the game.** Double-click a block (or "Arrange rows" in the panel) to open its stage screen: pick a model (**Single row**, **Back to back** or **Mergers in the middle**, with Invert), then flip, mirror or move each row on the 8 m grid, cut a belt every N machines, send it out the end, down or up through a Conveyor Lift, or join it with the belt of the row below. Warnings (belt over capacity, a Merger with more than 3 inputs) come with a one-click fix. The Scale plan draws the same arrangement, lifts included, and the connections receive its lines. On a back-to-back pair the shared belt crosses both rows when that needs fewer outputs, and "Split evenly" shares the machines of a belt as evenly as possible instead of filling each output to the limit. The stage screen has its own pan and zoom and a summary (rate of each output, Splitters, Mergers, lifts, warnings); "← Back to map" brings you back.
- **Layers.** The Layers button turns icons, names, connections (belts and chips) and ports on or off on the map, remembered separately for the build view and the to-scale plan; "Machines only" hides all four.
- **Several factories.** The "Factories" button at the top lists the factories saved in this browser: open, rename, duplicate, delete or start a new one. Select some blocks and "Split into a new factory" moves them out (whatever crossed the cut becomes an Input and an Export on both sides), handy to untangle a big Modeler file. "Download backup" saves every factory to a `.json` file and "Open backup" brings them into the list on another PC.
- **Power and overclocked extractors.** Biomass Burner, coal, fuel and nuclear generators burn their fuel (with water and waste where the game has them) and the balance bar adds up the MW; on the to-scale plan they take their real footprint, in rows of as many as one belt or pipe feeds; extractors take a clock speed up to 250%, so a pure oil node gives 600/min like in the game. Resources show the item with the building in the corner, so an Oil Extractor never looks like a Resource Well.
- **Copy and paste.** Ctrl+C copies the selected blocks with the connections between them, Ctrl+V pastes them where the mouse is (even in another factory) and Ctrl+D duplicates.
- **Input (container or train).** A source for any item coming from outside the factory, with an optional rate limit; without one it delivers what is asked and shows how much. It's the first entry among the resources in the picker.
- **Import from Modeler.** The "Import from Modeler" button reads a Satisfactory Modeler `.sfmd` file right in your browser (nothing is uploaded), shows what it found (blocks, connections, what was skipped or adjusted) and, only when you confirm, adds it as a new factory in your list. Splurgers and Storage Containers that something pulls from become direct connections, and an empty Storage Container becomes an unlimited Input. Recipe clock speeds come along. The file carries the graph and the recipes, not the rates, so the numbers are recalculated here; the Build view keeps the Modeler's layout and the Scale plan gets the automatic proposal.
- **Connections.** Each link between blocks is a Connection on the map: the belts, Mergers, Splitters and balancer it needs, drawn to scale and draggable. Click its chip for a short summary with See layout (the animated flow, the step-by-step build, or open it in the Balancer), Change layout and Unlink.
- **A side panel that explains.** Selecting a block opens the panel (a bottom sheet on phones) with what is wrong in one sentence and one-click fixes (send the surplus to the Awesome Sink, reduce the machines, raise the source, create the missing source or destination); with nothing selected it shows the factory's area, warnings and lists. A Legend button explains the colors and chips. On the first visit a short guided tutorial points at each part of the screen (skip it anytime; the Tutorial button shows it again), and a "? How to use" button on the map, the panel and the stage screen shows just that area's steps.
- Saved in your browser, shared with a link. Old `/planner` links and shared factories still open.

Game icons and data come from the game files: © Coffee Stain Studios.

## The Balancer (`/balancer`)

The original tool, for one connection typed by hand: rates in, belts, splitters, mergers and balancers out. Old `#s=` scenario links open it.

- **Groups machines into belt lines.** Machines per line = belt capacity ÷ rate per machine, rounded down. On the destination the machines are split into equal lines (14 that fit 8 per line become 7 + 7), and each group keeps its own lines. Editable, with a warning when you overload a belt.
- **Connects the lines.** Lists every layout it finds, best first: direct, merging whole lines, a donor line split into equal parts, or a Smart Splitter overflow passing excess to a line that's short. Choose what happens to the excess: back up at the source (machines slow down) or go to the Awesome Sink, in which case the recommended layout fills every destination with nothing backed up, using a Smart Splitter at the exit of each line with surplus.
- **Designs the load balancer.** Exact splitter tree ("1 splitter into 2, then 2 into 3 = 6 parts", 2s first because it takes fewer pieces), whether it needs a loop, and the "split into more parts and sink the extra" alternative, with a diagram.
- **Balancer library.** An N→M generator that tries ten designs (matrix, funnel and butterfly, each also with a loop or sink for 5, 7, 10…, plus a split looped matrix that divides each input in 2 before the loop, so a full belt doesn't bottleneck: the 14-piece 1→5 and 24-piece 1→7 the community uses), checks every internal segment against the belt tier, explains why it picked one, and shows the build step by step with the current piece highlighted like a build gun hologram. In the plan, the balancer is a block you click to open that build.
- **Normal, butterfly or 3D.** Pick the build style: flat designs, a butterfly (belts mixed in pairs over rounds, 16 pieces for 4→4 instead of 20 and 48 for 8→8 instead of 88; since it mixes lanes that are far apart and is harder to build, the planner only recommends a butterfly when it saves more than 20% of the pieces, opens its 3D view in floors; any N→M from 2→2 to 9→9 and beyond, with empty lanes or spare lanes on a loop, so 5→5 takes 24 pieces), or a 3D scene you can spin and zoom, built as towers (each layer's pieces stacked, belts crossing between towers) or floors, with the lift count and the step by step as a build gun hologram: what's built is solid, the current step is a pulsing see-through hologram, with lights running along the belts in the flow direction. Belts connect like in the game, one per face: a splitter takes input at the back and outputs at the front and sides, a merger the other way around, and the arrows on top of each piece show which ports are in use. Hover or tap a piece to see only its connections, or use Follow to light up the whole path of an input or output. Switch the step by step to By piece to go one splitter or merger at a time, with every connection spelled out: which side, where it comes from and where it goes. Normal and butterfly are drawn from above with curved belts that go in and out through the right side of each piece, like in the game (a splitter takes input at the back and outputs at the front and sides, a merger the other way around, never two belts on the same side), and the whole drawing always fits the screen. A Diagram / Plan switch shows it compact or to scale: an 8 m foundation grid, square pieces taking ¼ of a foundation (orange splitter with how many ways it splits, teal merger), belts leaving and entering through the real sides, and how much space it takes (in foundations and meters) and which Blueprint Designer it fits (Mk1 4×4, Mk2 5×5, Mk3 6×6). On the plan, Blueprint Designer markers to scale, with the designer's floor and foundation grid, help you slice a balancer into blueprints: the smallest designer that fits already shows covering it, you add as many Mk1, Mk2 or Mk3 markers as you want, and Ctrl + drag (or Move marker on a phone) moves one, snapping to the grid. By piece works in both, with each piece numbered (#1, #2…); on the plan, a mixed belt takes the color of the output it goes to, and hovering or tapping a piece shows only its path.
- **Your blueprints first.** List the balancer blueprints you already have (it starts with 3→4) and the planner prefers them when the shape fits.
- **Shortcuts when you don't want to build it.** Next to each balancer it points to the [Modular Load Balancers](https://ficsit.app/mod/LoadBalancers) mod and to the community blueprints on [Satisfactory Calculator](https://satisfactory-calculator.com/en/blueprints).
- **Counts the pieces.** Mergers, splitters and Smart Splitters for each segment (collection, middle, distribution), with the k or k−1 convention you prefer.
- **Shows the flow.** An animated diagram where items move at the belt tier's speed, like in the game, and belt thickness and item spacing follow the real rate. Every piece is drawn as in the game (splitters up to 3 outputs, merger cascades up to 3 inputs, loop returns, Smart Splitter, one Awesome Sink per belt), with the rate on each belt; the diagram grows and scrolls sideways, and clicking a block opens its detail.
- **Warns you.** Belt over capacity, demand above supply, a donor part too small to cover the deficit, incomplete lines.
- **Fluids too.** Switch to "Fluid (pipe)" and it uses Pipeline Mk1 (300) and Mk2 (600 m³/min). Pipes have no splitter, so instead of a balancer it joins and divides pipes with Pipeline Junctions into header pipes that stay within capacity, and when a source pipe has more than one header needs, a junction passes the rest on to the next one.
- **Undo and redo.** Ctrl+Z undoes and Ctrl+Y (or Ctrl+Shift+Z, Cmd on Mac) redoes any change to the inputs, even while typing in a field, and the result follows. A burst of typing is a single step; the history lasts while the page is open.
- **Saves and shares scenarios.** Save as many scenarios as you want in your browser, named after the item, and copy a link that carries the whole scenario, to open on another computer or send to a friend.
- **Report an odd case.** A link at the bottom opens a GitHub issue already filled in with the scenario link and the layout shown, so you only describe what looks wrong.
- **Explains itself.** Every field and result has a `?` with a short explanation, and there's a "How it works" section at the bottom.
- **Three languages:** English, Português (Brasil) and Español.

## Game rules it follows

| Piece | Behavior |
| --- | --- |
| Belts | Mk1 60, Mk2 120, Mk3 270, Mk4 480, Mk5 780, Mk6 1,200 items/min (1.0). |
| Splitter | Up to 3 outputs, splits evenly. Direct splits only reach products of 2 and 3, so 1/5 or 1/7 need a loop or extra parts to the sink. |
| Merger | Up to 3 inputs, round-robin. A top-up line in series through several mergers starves the last ones, so the planner never suggests that. |
| Smart Splitter | The Overflow output only gets items when the Any output is full. |
| Awesome Sink | Takes any leftover item. Backing up at the source is fine too: the machines just slow down. It doesn't take fluids. |
| Pipes | Pipeline Mk1 300, Mk2 600 m³/min. No splitter: a Pipeline Junction (4 ports) joins or divides and the fluid goes wherever there's room, with no guarantee of equal parts. For an exact flow, use a Valve. |

The Balancer knows no recipes: you type the rates from your production planner or the game. The builder uses the game's recipes.

## Running it locally

It's a static site built with Vite (Node 22.18+).

```bash
git clone https://github.com/AdolfoCarneiro/sf-balancer.git
cd sf-balancer
npm install
npm run dev       # local dev server
npm run build     # production build into dist/
```

Tests (logic, i18n and the builder's model), the builder's type check and an end-to-end smoke of its gestures against the preview:

```bash
npm test
npm run typecheck
npm run build && npm run preview   # then, in another terminal:
npm run smoke -- http://localhost:4173
```

To try it as in production (nginx serving the build, with the `/pt`, `/es`, `/balancer`, `/pt/balancer` and `/es/balancer` routes), run `docker compose up --build` and open http://localhost:8080. Clean up with `docker compose down --rmi local`.

## How the code is organized

```
index.html            the builder (React + TypeScript; base HTML in English, for search engines)
balancer.html         the Balancer (plain JavaScript)
src/planner/          builder: model/ (pure: factory state, flow solver, map scene), worker/ (solver and connections off the main thread) and ui/
src/main.js           Balancer entry point
src/logic/            pure functions, no DOM (grouping, case classification, splitter trees, flow simulation)
src/i18n/             texts in pt, en and es
src/ui/               interface
src/view3d/           3D scene (three.js, loaded only when the 3D tab opens)
src/styles/main.css   styles
public/               static files (favicon, og.png, robots.txt, sitemap.xml, game icons in icons/)
tests/                logic tests and the visual comparison harness
vercel.json           build, headers, CSP, routes and redirects
scripts/              game data and icons generators (gamedata.mjs, icons.mjs; run by hand, not in the build)
Dockerfile, nginx.conf, docker-compose.yml   local production-like test (nginx serving dist/)
```

The logic is pure functions imported straight by the tests in Node, so the UI never needs a browser to be tested.

## Contributing

Issues and pull requests are welcome. A few rules keep the project healthy:

1. **Keep the layers.** The Balancer is plain JavaScript and the builder is React + TypeScript, both built with Vite; `src/logic` and `src/planner/model` stay free of the DOM.
2. **Every visible text exists in three languages.** Strings live in `src/i18n/` (`pt.js`, `en.js`, `es.js`) and are read with `t('key')`. A new key goes into all three in the same change; the test `idiomas: as mesmas chaves...` fails otherwise.
3. **Logic goes in pure functions with tests.** Add a test case to `tests/logic.test.js` for any new layout or rule.
4. **Don't invent game mechanics.** If you're not sure how a piece behaves in the game, open an issue first.

`AGENTS.md` has the full spec (in Portuguese) and works as instructions for AI coding agents.

## Support

If the tool saved you some math, you can [buy me a coffee on Ko-fi](https://ko-fi.com/dofal). Totally optional: the tool stays free.

## License

[MIT](LICENSE). Fan-made tool, not affiliated with Coffee Stain Studios. Satisfactory is a trademark of Coffee Stain Studios; the game icons and data in the builder are © Coffee Stain Studios.
