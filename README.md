# Figtations

**Annotations you can actually move.**

A Figma plugin that replicates the native annotation feature — categories,
labels, pinned properties, value formatting — and adds the one thing it lacks:
annotations are free-floating nodes on the canvas, movable by hand, still
logically and visually tied to their target layer, with property values that stay
live.

## Why

Figma's native annotations are pinned to the layer, auto-placed, and nearly
invisible in Design mode. That makes them unusable for stakeholder reviews,
presentations, PNG/PDF exports and screenshots. Figtations puts the same
information on the canvas as real nodes, so it shows up everywhere the design
does — and lets you arrange it into a spec sheet.

## Two honest limitations

These are inherent to the plugin API, not bugs:

1. **Cards scale with the zoom and appear in the layer panel.** There is no API
   for zoom-invariant overlays on the canvas, so anything visible has to be a
   real node. The upside: it exports, presents and screenshots.
2. **Live sync only happens while the plugin is open.** There is no drag event and
   no background execution. If you move layers with Figtations closed, the lines
   go stale. Reopening the plugin runs a full sync automatically; there is also a
   _Refresh_ button and a relaunch button on every card.

## Install for development

```bash
npm install
npm run build
```

Then in Figma: **Plugins → Development → Import plugin from manifest…** and pick
`manifest.json` in the repo root.

For iterative work use `npm run dev` (watches both bundles) and hit
_Plugins → Development → Hot reload plugin_ in Figma after a change.

## Scripts

| Script              | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Watch build for sandbox and UI                                 |
| `npm run build`     | Production build → `dist/main.js`, `dist/ui.html`              |
| `npm run typecheck` | Type-checks sandbox, UI and tests separately                   |
| `npm run lint`      | ESLint                                                         |
| `npm run test`      | vitest (pure functions: formatters, geometry, store)           |
| `npm run verify`    | typecheck + lint + test + build — the gate for every milestone |

## Architecture in one screen

```
src/shared/   pure TypeScript, imported by both runtimes — no Figma, no DOM
  types.ts        data model, settings, property enum
  rpc.ts          request/response union + type guards
  tokens.ts       card visual tokens, category colours
  format/         property formatting and path geometry (unit tested)

src/main/     Figma sandbox (ES2017, no DOM)
  index.ts        entry, RPC router, lifecycle, menu commands
  store.ts        shared plugin data, schema version
  registry.ts     finding Figtations on a page (with feature detection)
  card.ts         card renderer — a reconciler, not a generator
  connector.ts    leader line (VectorNode) + endpoint dot
  handles.ts      path editing: read the vector network back
  reconcile.ts    classifies document changes (canvas → plugin data)
  probe.ts        live property values, incl. variables and styles
  categories.ts   own category register + native mapping
  native.ts       import/export of node.annotations
  sync.ts         create, sync, delete, debounce, write guard
  arrange.ts      auto-arrange
  fonts.ts        font resolution + cache

src/ui/       React 18 in the iframe (ES2020, DOM)
```

The sandbox and the UI have **separate tsconfigs** on purpose: the sandbox has no
DOM, no `window`, no `fetch`, no `localStorage`. ESLint enforces that, so code
that would crash at runtime fails the lint instead.

## Privacy

`networkAccess` is `none`. The plugin sends nothing anywhere, has no telemetry and
loads no external fonts or assets. All data lives in the document's _shared_
plugin data under the `figtations` namespace, which means other tools and agents
can read your annotations.

## Documentation

- `docs/PRD.md` — the product requirements document this is built from
- `docs/DECISIONS.md` — decision log, including what could not be verified yet
- `docs/QA.md` — the manual test plan; **still to be walked through**

## Status

All eleven milestones from the PRD are implemented and the automated gate
(`npm run verify`) is green. The manual acceptance runs in `docs/QA.md` are open,
and the M7 spike (native vector edit mode) needs a human in the Figma desktop
client — see DECISIONS.md D-003 and D-014.
