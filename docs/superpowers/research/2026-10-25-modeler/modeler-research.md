# Satisfactory Modeler: UX research

Researched 2026-10-25. Per the owner's clarification, the focus is on **graph-building interaction** (creating nodes, picking recipes, drag-to-link, moment-to-moment feel). Solver, power and format get short sections.

Confidence tags: **[P]** primary source (dev docs, dev changelog, UI strings shipped with the app). **[V]** seen in a video transcript or screenshot. **[C]** community report (Reddit, Steam). **[G]** my inference or guess.

## 0. What it is

- A free, closed-source **desktop app** (Steam app 3187030, also on itch.io) by David Price. Released 2024-09-17. Runs on Windows, macOS and Linux. Steam rating is "Overwhelmingly Positive", about 97% of roughly 1.8k English reviews. [P] https://store.steampowered.com/app/3187030/ , https://satisfactorymodeler.itch.io/satisfactorymodeler
- The dev's own definition: "a visual calculator that allows quick planning and calculations for any custom layout. Place recipes, connect them together, add limits and it will tell you how many machines you need to build." It "is NOT designed to be a layout planner detailing exactly where and in what orientation to place things." [P] https://satisfactorymodeler.github.io/docs/
- The dev says it is not open source and there are no plans for that. The dev has spent "over 2 years" on the calculation engine (quoted from Discord in a Reddit post). [P] https://satisfactorymodeler.github.io/docs/faq/faq.html , [C] https://reddit.com/r/satisfactory/comments/1n8aqy4/
- Docs: https://satisfactorymodeler.github.io/docs/ (Quick Start, Planning Basics, Specialty Machines, Calculators, All Zeros, Long Calculations, Blank Values, FAQ).
- Changelog: Steam news, retrieved through the `ISteamNews` API. There are 15 posts, from 2024-09 to 2026-05.
- The full UI string table (`en-US.json`, 607 keys) shipped with the app is mirrored in a clean-room clone: https://github.com/EvanTrow/Satisfactory-Colab-Modeler (`resources/languages/translations/en-US.json`, and `PLAN.md` §2 for their own description of the original's interaction model).

## 1. Building a chain, step by step (core of the request)

### Empty canvas → first node
1. **Double-click or right-click the empty background** to open the **Recipe Chooser**. [P] Quick Start https://satisfactorymodeler.github.io/docs/quick_start/quick_start.html
2. The chooser has **two lists**. Specialty machines are on the left (Outpost, Blueprint, Splurger, Priority Splurger/Splitter/Merger, AWESOME Sink, Storage Container, Dimensional Depot, and others). All game recipes are on the right, "filtered at the top" by a text box. [P] Quick Start.
3. You **type a part name** (e.g. "Iron Rod") and get **recipe cards**. Default recipes have a **black background** and alternates are **blue**. Each card shows the icons of its required inputs. **Hovering a card for a moment** shows full recipe inputs and outputs. [V] DS_Jeezy https://www.youtube.com/watch?v=26hvq2YmfGw ("you can see next to each one of these alt recipes what type of resources are required. But hovering over a card for a few seconds will show you more detailed recipe inputs and outputs"). [V] Jogatina Épic (PT-BR) https://www.youtube.com/watch?v=s4jEhQm2iZo ("Tudo que vocês estão vendo com o fundo preto são receitas padrão… as receitas em azul são receitas alternativas").
   - Raw resources are recipes too. Picking "Limestone" places a **Miner** node that defaults to 60/min (Mk.1 on a Normal node). [V] Jogatina; [P] `game_data.json` has `"DefaultMax": "60"` for Miner.
   - UI strings include `RECIPE_NAME`, `RECIPE_INPUTS`, `RECIPE_OUTPUTS`, `MACHINE`, `TIER`, `ALTERNATE_RECIPE`. These are probably the fields in the hover card or the filter. [P] strings; how they're used is [G]. The clone's PLAN claims you can filter "by name, machine, tier, and alternate-recipe toggle". [C]
   - The dev's changelog says recipe descriptions show "Approximate Tier information". It also notes that searching in other languages raises accent-matching issues (e.g. whether "e" should match "é"), which implies the search is a substring text match. [P] Steam news 2024-11-02 and 2026-04-24.
4. Clicking a recipe **places one node**: a box with the building icon, input-part icons on the left edge and output-part icons on the right edge. The node has **no numbers yet** because nothing constrains it. [V] Jogatina ("não tem nenhum número nela ainda… O modeler não tem nenhum parâmetro para começar essa conta"). [P] Blank Values: "A blank value means there is nothing limiting that machine." https://satisfactorymodeler.github.io/docs/blank_values/blank_values.html

### Giving it a number
5. The **bottom field of the node** is the **limit**. Type a machine count (bold) or toggle the node to parts-per-minute (italic). Miners and Sinks default to ppm; everything else defaults to machine count. Values can be integers, decimals or fractions ("1 1/5", "6/5", even "4.32/3.6"). Values are exact, with no rounding. [P] Quick Start; Steam news 2024-11-21.
6. Alternatively, **double-click an output part on the node** to set a **part limit** ("set a part limit. Say we want 10"). [V] DS_Jeezy. A common community trick: drag the final product into an **AWESOME Sink** and put the target number on the sink. [C] https://reddit.com/r/SatisfactoryGame/comments/1lspppy/
7. The number above the limit field is the **calculated value** (e.g. "4.5" machines). Hovering it shows the exact fraction ("2 + 2/3 machines"). [P] Quick Start ("Hover over numbers to see the exact amount in fraction form"); [V] Jogatina.

### Growing the chain by dragging from ports (the key gesture)
8. **Drag from a port to empty space and release.** The Recipe Chooser opens **pre-filtered to valid recipes** for that part. [P] Quick Start: "Dragging a connection onto the background will open the recipe chooser filtered to valid recipes."
   - Dragging **left from an input port** (e.g. Iron Ingot): the chooser "autopopulates with whatever the input is" and lists producers. Pick one and it is placed and **already connected**. [V] DS_Jeezy; Steam guide https://steamcommunity.com/sharedfiles/filedetails/?id=3473622997 ("Drag from the Iron Ingot port to the left, you'll then be prompted for a machine that produces Iron Ingots").
   - Dragging **right from an output port** (e.g. Limestone): it lists what can be made from it (Concrete, and so on), plus specialty targets such as Storage Container and Sink. [V] Jogatina.
   - The new node **appears where you released**. [G] Strongly implied: users "pull out all of our nodes" and then rearrange by hand. [V] https://www.youtube.com/watch?v=506qxY0qhnc
9. **Drag from a port onto an existing node's port** to link to existing machines. Example: route a second Iron Ingot demand to "the existing smeltery bank"; the smelter count and ore draw update automatically. [V] DS_Jeezy. Drag works in both directions (output→input or input→output). [P] Quick Start.
10. **Any port accepts multiple connections.** Every connection point acts as an implicit splitter or merger, so explicit Splurgers are "often" unnecessary. [P] https://satisfactorymodeler.github.io/docs/specialty_machines/specialty_machines.html. The Full calculator splits evenly unless something downstream is limited. [P] Full calculator docs; [C] https://reddit.com/r/SatisfactoryGame/comments/1s5t98x/
11. **Typed ports.** Links are per part. Each link is drawn as a curve with a **mid-label showing the part icon and the rate** (e.g. "[icon] 90"). [V] doc screenshots, e.g. https://satisfactorymodeler.github.io/docs/planning_basics/correct2.png
12. The whole chain **recalculates on every change**. Each edit in Full mode re-solves the graph. Small graphs feel instant. Large or loopy graphs show a spinner, `?` values and a **STOP** button. [P] Blank Values ("? … still calculating"), `STOP_HELP` string; [V] https://www.youtube.com/watch?v=7mAGiFRa4ug

### Typical session flow (what users actually do)
- **Backward ("pull")**: pick the final product, set a machine or part limit, then drag back from each input until you reach a miner. "Everything in Modeler is given to you piecemeal… you'll be prompted to work back from there until you hit raw resources. At every stage, you'll be given information about what alternative recipes are available." [V] DS_Jeezy. A Steam reviewer said this got rid of the "analysis paralysis" they hit with other tools. [C]
- **Forward ("push")**: place resource nodes with their real ppm, then drag forward to see what they can make. "I start by adding all my resources in the area… and figure out what I can produce with it." [C] https://reddit.com/r/SatisfactoryGame/comments/1lfpyqk/ ; [V] Jogatina shows both.
- **Swap a recipe to compare**: marquee-select the line, copy and paste it, delete the smelter, then drag again from the port to pick the alternate (Foundry). [C] Steam guide. There is **no "change recipe in place" action** documented anywhere. [G] Absent from the docs and strings.
- **One node per recipe, not per machine.** The dev insists on this ("The point of The Modeler is to calculate the number of these machines for you, not to have you place them all down individually"). Duplicating a recipe node is fine when the paths are logically different. [P] https://satisfactorymodeler.github.io/docs/planning_basics/planning_basics.html
- Advanced users split work into **banks** by hand (e.g. "six banks of eight refineries… each producing 480… exactly the max of a Mk5 belt"), because **links are not belts and have no throughput cap**. [V] https://www.youtube.com/watch?v=7mAGiFRa4ug ; [C] https://reddit.com/r/SatisfactoryGame/comments/1ulc23w/ ("the speed of the conveyor belts isn't taken into account at all"). **This is exactly the gap our "middle" tool fills.**

## 2. Rate propagation (brief)

- **No goal → chain generation.** You build the graph topology yourself. The solver then computes flows given that topology plus whatever **limits** (upper bounds) you typed on any nodes. "Set up your machines however you like, adding optional limits… and the tool will calculate how the parts will flow and how many of each machine type are getting used." [P] Steam description.
- **Limits can go anywhere**: on the end product, on a miner, on an intermediate node, on a sink, or on an output port. The solver maximizes flow without exceeding any limit, so a limit on one node drives the rest both up and down the chain. [P] Quick Start; Full calculator docs (examples with limits on inputs vs on outputs).
- **Four calculator modes** (Settings → General) [P] https://satisfactorymodeler.github.io/docs/calculators/calculators.html:
  - **Full** (default): models real splitter/merger even-split preference and priority splitters/mergers. Values are limits. Can be slow.
  - **Basic**: limits, no splitter preference, any max solution. Fast.
  - **Manual**: entered values are the desired final values, "most like a spreadsheet". Underdefined graphs show `?`; conflicting values are arbitrarily ignored.
  - **None**: numbers are notes only.
  - An "Experimental Manual" mode (2026-01) treats inputs as limits, so it never goes negative. [P]
- **How deficits and surpluses show**: an **unconnected or unsatisfied input** gets a **red** tile with the missing rate. An **unconnected output with flow** gets a **green** tile with the surplus rate. Machines can be colored red (invalid) or orange (calculated value ≠ entered value). [V] doc screenshots; [P] strings `UNMADE_TOOLTIP` = "Red labeled inputs", `UNUSED_TOOLTIP` = "Green labeled outputs", `HIGHLIGHT_INVALID_VALUES`, `HIGHLIGHT_NON_MATCHING_VALUES`.
- **"All zeros"**: if the graph would deadlock in-game (bad loop ratios, or a merger preference that starves a loop), the Full solver drives everything to 0. The dev calls this "one of the best features". Users perceive it as the #1 bug. [P] https://satisfactorymodeler.github.io/docs/all_zeros/all_zeros.html ; [C] many Reddit threads.
- A miner set to 240 shows 60 if downstream only consumes 60, because it displays **actual** flow, not potential. New users find this confusing. [C] https://reddit.com/r/SatisfactoryGame/comments/1lspppy/

## 3. What a node shows; node types

**Recipe node** (see screenshots in the docs and on Steam):
- Building icon in the middle, input-part icons on the left edge, output-part icons on the right edge (each one is a port).
- **Calculated value** in the middle: machine count in bold, or ppm in italic.
- **Limit field** at the bottom: a dark band, editable inline.
- Optional **title** above the box. Typing `::Part Name::` embeds that part's icon. [P] news 2024-10-05
- Red or green tiles beside unmatched ports, with rates.

**Right-click or double-click a node** opens its menu [P] news + [V]:
- Clock speed. The **−/+ buttons snap the clock** so the machine count lands on the next whole number.
- **Auto Round**, which keeps the clock adjusted so the count is whole.
- Somersloop / power-shard count.
- Machine count vs PPM toggle.
- Miner Mk.1/2/3 and node purity (Impure/Normal/Pure).
- Title, copy/paste settings, delete.

**Right-click a port**: set a part limit, add a waypoint, "Align With Connection" (moves the node so the link is perfectly horizontal), clear connections. [P] news 2025-01-21; [C] Steam guide.

**Ports can be reordered**: drag one port onto another on the same node to swap them and uncross links. [P] news 2025-01-21; [V] https://www.youtube.com/watch?v=506qxY0qhnc

**Power** is not shown on the node by default. There is a hover tooltip (`MACHINE_POWER_TOOLTIP`), and power is summarized in the Summary panel. [P] strings; [G] exact display.

**Node types** [P] Specialty Machines docs:
- Recipe nodes, including raw resources: Miner, Oil, Water, Resource Well.
- **Outpost**: a nested sub-canvas "like a folder". Its ports are created by dropping a link onto it from outside, or onto its "+" bar inside.
- **Blueprint**: an outpost whose contents count as N copies; the solver computes N.
- **Splurger**: an explicit splitter/merger.
- **Priority Splurger / Priority Splitter / Priority Merger**: top port has priority.
- **AWESOME Sink**: with a belt tier, so its count can be computed.
- **Storage Container**: Partially Full / Full / Empty / Input=Output. Used as an infinite source or sink, and to cut the solve into independent chunks.
- **Dimensional Depot**.
- **Space Elevator phases**, which are modeled as recipes.

Also: **titles as notes**. There are no free-floating note or comment nodes; users ask for them. [C]

## 4. Interaction-speed features

- Pan by dragging the background; zoom with the wheel; infinite canvas; UI scale setting. [P] news 2024-09-21
- **Click** a node to select it. **Right-click-drag** draws a marquee. Shift+drag adds to the selection; Ctrl+drag toggles it. [P] news 2024-10-05, 2025-03-26
- **Cut, copy, paste, delete, select all** use standard keys, plus Ctrl+Insert / Shift+Insert. **Middle-click pastes at the cursor.** Internal links are preserved, so you can cut a group and paste it into an outpost. [P] news 2024-11-02; [C] Steam guide.
- **Undo/redo** with Ctrl+Z / Ctrl+Y. [P] Quick Start; [V] Steam guide overlay.
- Delete or Backspace deletes a node. Ctrl+L opens language selection. Ctrl+S saves. [P] news.
- Drag threshold for click vs drag: 25 px by default, configurable. Users complained that the threshold made clicks register as drags. [P] news 2024-11-02, 2025-01-21
- **Connection styles**: Curves, Direct, or 2D (orthogonal). **Draggable waypoints**: drag a link's label to anchor it; double-left-click adds a waypoint; double-right-click deletes. [P] news 2025-01-21
- **Snap to grid** for machines and waypoints, with separate grid sizes. [P] news 2025-01-21
- **No auto-layout.** Everything stays exactly where you drop it. Tidying is manual and some users enjoy it ("it's kind of fun to do"). [V] https://www.youtube.com/watch?v=506qxY0qhnc ; [G] no layout command appears in the strings.
- **Organization**: nested outposts and blueprints instead of tabs. There is a single save holding everything. "Current Outpost / Everything / Selected" scopes apply to the summary and to bulk actions. [P]
- **Summary panel** (book icon, bottom-left, can pop out into its own window): power, shards and sloops, outputs (unused/used/sunk), inputs (unmade/made/mined), sink points, machine counts, cost to build. [P] news 2024-11-02
- **Machine Defaults** settings set the default limit, ppm-vs-count and Auto Round, with "apply to existing" over a chosen scope. [P] news 2024-11-21
- Autosave every 5 min with backups, Steam Cloud sync, export/import of `.sfmd`. [P] news 2025-02-11, 2025-02-24

## 5. Byproducts, loops, alternates, power, space (brief)

- **Byproducts** are just extra output ports. If unconnected they show green. You route them like any other part (to a sink, a container or back into a loop). [V] screenshots.
- **Loops** are allowed and modeled realistically, so they often go to "all zeros". The fix is a priority merger, a priority splitter, or extra supply. [P] All Zeros.
- **Alternates** are picked per node in the chooser (blue cards). There is no global "unlocked alternates" list. [V]; [G] none in the strings.
- **Power** is computed in the Summary (average/max used, min made, net, Alien Power Augmenter boost) using the real overclock exponent. Game-mode multipliers (recipe cost, power, space elevator) were added in 2026-05. [P]
- **Physical size / belts**: none. Links have no belt tier or throughput cap; the only belt setting is on the AWESOME Sink. Users export `.sfmd` into a third-party **floor planner** to get footprints: https://chrisullery.github.io/SatisfactoryFloorPlanner/ [C]. Load balancers can be drawn with splurgers (a Steam screenshot shows a 1/7 loop balancer), but a YouTuber gave up on a 1→10 balancer and reports manifolds-as-splurger-chains get very slow. [V] https://www.youtube.com/watch?v=7mAGiFRa4ug

## 6. Praise and complaints

**Praise** [C]:
- Free; seen as "the best" planner by many.
- Piecemeal backward/forward building with alternates offered at each step.
- Total control ("the level of control is exactly what I want").
- Realistic splitter/merger modeling.
- Outposts as an archive of the whole save, plus save-wide summaries.
- Exact fractions.
- Active dev; dark mode.
- Reviews: https://steamcommunity.com/app/3187030/positivereviews/ . One reviewer: "Late game it becomes a civilization planner."

**Complaints** [C]:
- **Steep learning curve**: mouse gestures are inconsistent (right-click vs double-click both open menus; menus are hard to dismiss).
- The limit-vs-value distinction confuses new users.
- **Full solver is slow, hangs or goes to all zeros** on big or loopy graphs, and gives little explanation why.
- Splitters seem limited, and it is hard to make arbitrary ratios.
- No belt tiers or throughput.
- No physical layout (users want boxes sized in foundations).
- No free notes or "built ✓" checkmarks.
- No collaboration (people share screenshots).
- No mobile version.
- One save holds everything; there is no "new file" flow (an old complaint; import/export now exists).
- Sources: https://steamcommunity.com/app/3187030/negativereviews/ , https://reddit.com/r/SatisfactoryGame/comments/1vcdrop/ , https://reddit.com/r/SatisfactoryGame/comments/1td507d/ , https://reddit.com/r/SatisfactoryGame/comments/1tyi3zb/ , https://reddit.com/r/SatisfactoryGame/comments/1qo1stn/

**Mixed**: one user says Modeler "drastically reduces my decision-making… planning is 5 min, then build feels like a job". https://reddit.com/r/satisfactory/comments/1smn3h7/

**Comparisons** [C]:
- Satisfactory Tools is a goal → solver (LP) tool where you toggle recipes globally. Users praise its speed for overviews but complain it picks weird recipes (SAM conversions) and fails with "couldn't calculate" (see the transcript of https://www.youtube.com/watch?v=rgG5gg-zd6s).
- A common workflow is: Satisfactory Tools to explore → SCIM map for location → Modeler to plan the actual factory. https://reddit.com/r/SatisfactoryGame/comments/1r7766v/ (comment o5vfxua)
- Another user: Modeler "translates better to how a factory would actually function in game". https://reddit.com/r/SatisfactoryGame/comments/1uhhcps/ (comment ou7x55d)
- Feature requests in the clone threads include a "node optimizer" (pick inputs and outputs, let it choose recipes). This suggests goal/optimize is wanted **in addition to** the graph, not instead of it. https://reddit.com/r/satisfactory/comments/1n8aqy4/
- The colab clone added a "Generate Factory" dialog (`apps/web/src/canvas/generator/`) that writes nodes into the same editable canvas.

## 7. `.sfmd` format (brief)

- It is JSON. The top level is `{ "Data": [ node, ... ] }`.
  - Each node has `Name`: the recipe name, or a specialty name such as "Dimensional Depot".
  - `Max`: the entered limit, as a rational string like "1/2" or "5".
  - `Inputs`: links stored **on the consumer** as `{ partName: [[upstreamIndex, partName?], ...] }`, with varying nesting. Nodes are referenced by **array index**.
  - Some nodes have `Capacity` (e.g. "60/min").
  - Other fields exist (position, clock, title, ppm flag, outpost children, waypoints) but were not confirmed. [G]
  - Source: the parser in https://github.com/ChrisUllery/SatisfactoryFloorPlanner (`tools/sfmd-parser/app.js`, `app.js`). It **recomputes all rates itself** from `game_data.json`, so the file evidently stores **inputs (limits), not computed rates**. This matches the owner's note.
- Since 2026-05 the file also carries settings: calculator mode, connection style, grid, cost multipliers and number locale. [P] news 2026-05-11
- Game data lives in an editable `game_data.json` with `Machines`, `MultiMachines`, `Parts` and `Recipes`. Rates are rational strings; recipe `Parts` use a negative `Amount` for inputs. Mods inject recipes there (ModelerModRecipes). [P/C] https://github.com/Shanak0r/ModelerModRecipes

## Not verified

- I did not run the app, so I never saw the recipe chooser directly. Its appearance comes from two video transcripts plus docs text; I found no screenshot of the chooser itself.
- The exact filter controls in the chooser.
- Whether a dropped node lands exactly at the cursor.
- Whether links snap or highlight compatible ports while dragging. Not mentioned anywhere. [G] Probably only valid ports accept the drop, given that links are typed.
- The exact full `.sfmd` schema.
- Discord content (not accessible).
- Steam review API was blocked, so only the top 10 positive and negative reviews were read.
