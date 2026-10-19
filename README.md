<div align="center">

# SF Balancer

**Belt balancer & logistics planner for [Satisfactory](https://www.satisfactorygame.com/)**

Your production planner tells you how many machines. This tells you how to wire them.

[**Open the planner →**](https://sf-balancer.vercel.app)

English · [Português](README.pt-BR.md) · [Español](README.es.md)

[![Live](https://img.shields.io/badge/live-sf--balancer.vercel.app-ff9b3d?style=flat-square)](https://sf-balancer.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-8fe3a4?style=flat-square)](LICENSE)
![Single HTML file](https://img.shields.io/badge/build-none-15324f?style=flat-square)

<img src="docs/screenshot.png" alt="SF Balancer: six source lines of 455/min feeding five destination lines of 480/min through a splitter tree" width="900">

</div>

## The problem

One stage of your factory makes **6 lines of 455/min** (7 refineries each). The next one needs **5 lines of 480/min** (12 foundries each). How do you connect them? How many lines fill up, how much is left over, and where does the balancer go?

You can do that math by hand every time, or you can type the machine counts and let the planner draw it.

## What it does

- **Groups machines into belt lines.** Machines per line = belt capacity ÷ rate per machine, rounded down. Editable, with a warning when you overload a belt.
- **Connects the lines.** Lists every layout it finds, best first: direct, merging whole lines, a donor line split into equal parts, or a Smart Splitter overflow passing excess to a line that's short.
- **Designs the load balancer.** Exact splitter tree ("1 splitter into 3, then 3 into 2 = 6 parts"), whether it needs a loop, and the "split into more parts and sink the extra" alternative, with a diagram.
- **Balancer library.** An N→M generator that tries six designs (matrix, funnel, and each with a loop or sink for 5, 7, 10…), checks every internal segment against the belt tier, explains why it picked one, and shows the build step by step with the current piece highlighted like a build gun hologram. In the plan, the balancer is a block you click to open that build.
- **Your blueprints first.** List the balancer blueprints you already have (it starts with 3→4) and the planner prefers them when the shape fits.
- **Counts the pieces.** Mergers, splitters and Smart Splitters for each segment (collection, middle, distribution), with the k or k−1 convention you prefer.
- **Shows the flow.** An animated diagram where items move at the belt tier's speed, like in the game, and belt thickness and item spacing follow the real rate.
- **Warns you.** Belt over capacity, demand above supply, a donor part too small to cover the deficit, incomplete lines.
- **Explains itself.** Every field and result has a `?` with a short explanation, and there's a "How it works" section at the bottom.
- **Three languages:** English, Português (Brasil) and Español.

## Game rules it follows

| Piece | Behavior |
| --- | --- |
| Belts | Mk1 60, Mk2 120, Mk3 270, Mk4 480, Mk5 780, Mk6 1,200 items/min (1.0). |
| Splitter | Up to 3 outputs, splits evenly. Direct splits only reach products of 2 and 3, so 1/5 or 1/7 need a loop or extra parts to the sink. |
| Merger | Up to 3 inputs, round-robin. A top-up line in series through several mergers starves the last ones, so the planner never suggests that. |
| Smart Splitter | The Overflow output only gets items when the Any output is full. |
| Awesome Sink | Takes any leftover. Backing up at the source is fine too: the machines just slow down. |

The planner knows no recipes. You type the rates from your production planner or the game.

## Running it locally

There is nothing to build. It's one HTML file.

```bash
git clone https://github.com/AdolfoCarneiro/sf-balancer.git
cd sf-balancer
# open index.html in your browser, or serve the folder:
npx serve .
```

Tests (Node 18+, no dependencies):

```bash
node --test tests/logic.test.js
```

## How the code is organized

```
index.html            the whole app: styles, i18n, pure logic and UI
tests/logic.test.js   tests for the logic block, run against the real index.html
vercel.json           headers, CSP and /pt, /es routes
```

Inside `index.html`, the code between `// LOGIC-START` and `// LOGIC-END` is pure functions (grouping, case classification, splitter trees, flow simulation). The tests extract that block and run it in Node, so the UI never needs a browser to be tested.

## Contributing

Issues and pull requests are welcome. A few rules keep the project healthy:

1. **Keep it one file, no build.** No frameworks, no bundler. Opening `index.html` has to work.
2. **Every visible text exists in three languages.** Strings live in the `I18N` object (`pt`, `en`, `es`) and are read with `t('key')`. A new key goes into all three in the same change; the test `idiomas: as mesmas chaves...` fails otherwise.
3. **Logic goes in pure functions with tests.** Add a test case to `tests/logic.test.js` for any new layout or rule.
4. **Don't invent game mechanics.** If you're not sure how a piece behaves in the game, open an issue first.

`AGENTS.md` has the full spec (in Portuguese) and works as instructions for AI coding agents.

## Support

If the tool saved you some math, you can [buy me a coffee on Ko-fi](https://ko-fi.com/dofal). Totally optional: the tool stays free.

## License

[MIT](LICENSE). Fan-made tool, not affiliated with Coffee Stain Studios. Satisfactory is a trademark of Coffee Stain Studios.
