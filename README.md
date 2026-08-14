<!-- Both delivered marks, unchanged: GitHub switches on the reader's colour
     scheme. `figtations-mark-dark.svg` is drawn for a dark ground,
     `figtations-mark-light.svg` for a light one — see DESIGN.md §5 and `assets/`. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/figtations-mark-dark.svg">
  <img src="assets/figtations-mark-light.svg" width="72" height="72" alt="Figtations">
</picture>

# Figtations — Figma Plugin

**1.0.0 Beta 1** (`1.0.0-beta.1`)

**Annotations you can actually move.** A Figma plugin that replicates the native
annotation feature — categories, labels, pinned properties, value formatting —
and adds the one thing it lacks: annotations are free-floating nodes on the
canvas, movable by hand, still logically and visually tied to their target layer,
with property values that stay live.

Figma's native annotations are pinned to the layer, auto-placed, and nearly
invisible in Design mode. That makes them unusable for stakeholder reviews,
presentations, PNG/PDF exports and screenshots. Figtations puts the same
information on the canvas as real nodes, so it shows up everywhere the design
does — and lets you arrange it into a spec sheet.

## Key features

- **Free positioning.** A Figtation is a real auto-layout frame. Drag it
  anywhere; the leader line follows while you drag.
- **Live property values.** 33 property types resolved off the target node on
  every sync — including bound variables (shown by variable name), styles, mixed
  values and component/variant names. Nothing derived is ever persisted.
- **Editable leader lines.** The connector is a `VectorNode`, so Figma's own
  vector edit mode can reshape it. Waypoints and tangents are read back and
  validated.
- **Categories.** Your own register with name, colour and order; a rename or
  recolour propagates to every card and connector that uses it.
- **Auto-arrange.** Lays the unpinned cards out in a column beside their frame —
  the spec-sheet view the native feature cannot produce.
- **Native bridge.** Import from and export to Figma's own `node.annotations`,
  category mapping included.
- **Canvas is a second input channel.** Rewrite a label directly on the card and
  it flows back into the plugin data. Your own styling (fill, radius, padding)
  survives a sync.
- **No network.** `networkAccess` is `none`, no telemetry, fonts inlined at build
  time.

---

## Table of contents

- [Two honest limitations](#two-honest-limitations)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Using the plugin](#using-the-plugin)
- [Architecture](#architecture)
  - [Two runtimes, two tsconfigs](#two-runtimes-two-tsconfigs)
  - [Directory structure](#directory-structure)
  - [The RPC protocol](#the-rpc-protocol)
  - [Data flow](#data-flow)
  - [The sync engine](#the-sync-engine)
  - [The card renderer](#the-card-renderer)
  - [The connector](#the-connector)
  - [The property engine](#the-property-engine)
  - [Categories and the native bridge](#categories-and-the-native-bridge)
- [Data model and persistence](#data-model-and-persistence)
- [Settings reference](#settings-reference)
- [Available scripts](#available-scripts)
- [Testing](#testing)
- [Build and release](#build-and-release)
- [Design system](#design-system)
- [Brand assets](#brand-assets)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [Status](#status)
- [License](#license)

---

## Two honest limitations

These are inherent to the plugin API, not bugs:

1. **Cards scale with the zoom and appear in the layer panel.** There is no API
   for zoom-invariant overlays on the canvas, so anything visible has to be a
   real node. The upside: it exports, presents and screenshots.
2. **Live sync only happens while the plugin is open.** There is no drag event
   and no background execution. If you move layers with Figtations closed, the
   lines go stale. Reopening the plugin runs a full sync automatically; there is
   also a _Refresh_ button and a relaunch button on every card.

---

## Tech stack

| Layer               | Choice                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| **Language**        | TypeScript 5.7, `strict` plus `noUncheckedIndexedAccess`               |
| **Sandbox runtime** | Figma plugin sandbox — ES2017, no DOM, no `fetch`, no module loader    |
| **UI runtime**      | React 18 in the plugin iframe — ES2020, DOM                            |
| **Sandbox build**   | esbuild → a single IIFE at `dist/main.js`                              |
| **UI build**        | Vite 6 + `vite-plugin-singlefile` → one self-contained `dist/ui.html`  |
| **Styling**         | Plain CSS with custom properties (`src/ui/styles.css`), no framework   |
| **Fonts**           | Plus Jakarta Sans + JetBrains Mono, inlined as woff2 data URIs         |
| **Tests**           | Vitest, pure functions only                                            |
| **Lint / format**   | ESLint 9 (flat config) + typescript-eslint, Prettier                   |
| **Persistence**     | Figma _shared_ plugin data (`figtations` namespace) + `clientStorage`  |
| **Distribution**    | Zip artifact for the Figma Community, built by `scripts/build-release.sh` |

There is no server, no database and no runtime dependency beyond React — the
whole plugin is two files.

---

## Prerequisites

- **Node.js 20 LTS or newer.** Vite 6 and the flat ESLint config need it; the
  repo is developed on Node 24.
- **npm 10 or newer.** The lockfile is `lockfileVersion: 3`; `npm ci` is used by
  the release script.
- **The Figma desktop app.** Development plugins can only be imported there, not
  in the browser.
- A Figma account with edit rights on a file you can test in.

Nothing else — no database, no Docker, no environment variables, no API keys.

---

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/conny-diez/Figtations.git
cd Figtations
```

### 2. Install dependencies

```bash
npm install
```

This pulls React, the build chain and `@figma/plugin-typings` (the typings for
the `figma.*` global — a dev dependency, never bundled).

### 3. Build both bundles

```bash
npm run build
```

Two artifacts land in `dist/`, and they are the only two files the plugin ships:

| File            | Built by                     | Contents                                            |
| --------------- | ---------------------------- | --------------------------------------------------- |
| `dist/main.js`  | `esbuild.main.mjs`           | The sandbox bundle, minified, single IIFE, ES2017    |
| `dist/ui.html`  | `vite.config.ts`             | The panel — HTML, CSS, JS and both fonts in one file |

`dist/` is gitignored; it is a build output, not a source of truth.

### 4. Import the plugin into Figma

In the Figma **desktop app**:

**Plugins → Development → Import plugin from manifest…** → pick `manifest.json`
in the repo root.

Figtations now shows up under _Plugins → Development → Figtations (Beta)_.

### 5. The development loop

```bash
npm run dev
```

This runs two watchers concurrently (`concurrently`, prefixed `main` and `ui`):
esbuild rebuilds `dist/main.js` on every change to `src/main` or `src/shared`,
Vite rebuilds `dist/ui.html` on every change to `src/ui` or `src/shared`.

After a rebuild, pick up the change in Figma with
**Plugins → Development → Hot reload plugin** (or ⌥⌘P to re-run the last
plugin).

In watch mode the sandbox bundle is **not** minified and carries an inline
sourcemap; the production build has neither.

### 6. Before you commit

```bash
npm run verify
```

Typecheck (three tsconfigs) → lint → test → build. This is the gate for every
milestone; the release script refuses to pack an artifact if it fails.

---

## Using the plugin

### Menu commands

The manifest registers five commands (`manifest.json`, `menu`):

| Command                       | Behaviour                                                                   |
| ----------------------------- | --------------------------------------------------------------------------- |
| **Open Figtations**           | Opens the panel. Runs a full page sync first if _auto-refresh_ is on.        |
| **Annotate selection**        | Opens the panel with the current selection loaded into the editor.           |
| **Refresh all on this page**  | Headless — syncs every Figtation on the page, notifies, closes.              |
| **Arrange annotations**       | Headless — auto-arranges, notifies, closes.                                  |
| **Import native annotations** | Opens the panel and reports how many native annotations were found.          |

Every card also carries two relaunch buttons (`relaunchButtons` in the manifest):
_Edit annotation_ and _Refresh annotations_, so a card can bring the plugin back
without going through the menu.

### The panel

- **Annotate tab** — the editor. Pick a category, write a label, pin properties
  from the live list of what the selected layer actually has, then hit _Create
  annotation_. Nothing is placed on the canvas until you confirm (D-021). With a
  Figtation selected the same tab becomes an edit form with line controls
  (straight/elbow, exit side, _Edit line_, _Reset line_, custom width).
- **All tab** — every Figtation on the current page, with search, category
  filters, an _Orphans_ filter, canvas/category sorting and bulk actions
  (set category, arrange, delete). Detached and off-page annotations can be
  reattached or kept as a free note.
- **Footer** — _Refresh_, _Arrange_, _Settings_, and the count for this page.
- **Header** — the mark, the exact version (`v1.0.0-beta.1`) and the panel theme
  switch.

The panel window is resizable by its bottom-right handle; the size is persisted
in `clientStorage` when the drag ends, not on every frame.

### Path editing

The plugin API cannot open Figma's vector edit mode programmatically (PRD C-9).
So _Edit line_ unlocks and selects the connector and tells you to **press Enter**.
Drag the handles in Figma's own editor, then click _Done_ in the panel: the
vector network is read back and turned into waypoints and tangents.

Branched networks, closed loops and more than 12 inner waypoints are rejected
with a toast — the last valid route stays intact. Dragging the last vertex more
than 24 px away rebinds the anchor to a new point on the target.

### Dev Mode

Plugins are read-only in Dev Mode (PRD C-2). The panel shows a banner, every
mutating request is refused in the router, and the selection polling that keeps
lines attached is not even started. Reading, filtering and navigating stay
available.

---

## Architecture

### Two runtimes, two tsconfigs

A Figma plugin runs in two places at once, and they share nothing but messages:

- **The sandbox** (`src/main`) has the `figma` API and no DOM — no `window`, no
  `document`, no `fetch`, no `localStorage`.
- **The UI iframe** (`src/ui`) has the DOM and no `figma` API.
- **`src/shared`** is imported by both and may therefore touch neither.

This is not a convention, it is enforced. `eslint.config.mjs` sets
`no-restricted-globals` per directory, so code that would crash at runtime fails
the lint instead. And there are three tsconfigs rather than one:

| Config                | Target | Lib                    | Covers                     |
| --------------------- | ------ | ---------------------- | -------------------------- |
| `tsconfig.main.json`  | ES2017 | `ES2017`               | `src/main` + `src/shared`  |
| `tsconfig.ui.json`    | ES2020 | `ES2020`, `DOM`        | `src/ui` + `src/shared`    |
| `tsconfig.test.json`  | ES2020 | `ES2020`               | `tests` + `src/shared`     |

`tsconfig.json` itself compiles nothing (`"include": []`); it only holds the
strictness flags the three inherit: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`, `verbatimModuleSyntax`.

### Directory structure

```
├── manifest.json                 # Figma plugin manifest — id, entry points, menu
├── esbuild.main.mjs              # Sandbox build (IIFE, no module loader in the sandbox)
├── vite.config.ts                # UI build (single-file HTML, version injection)
├── vitest.config.ts              # Tests + coverage thresholds for src/shared
├── eslint.config.mjs             # Flat config; per-directory global restrictions
├── scripts/
│   └── build-release.sh          # Clean install → verify → build → pack → re-verify
├── assets/                       # Brand marks (SVG) — not bundled
├── docs/
│   ├── PRD.md                    # Product requirements this is built from
│   ├── DECISIONS.md              # Decision log (D-001 …), including what is unverified
│   └── QA.md                     # Manual test plan, 138 criteria
├── DESIGN.md                     # The design system the panel implements
├── CHANGELOG.md                  # Keep a Changelog format, SemVer
├── tests/
│   ├── geometry.test.ts          # Routing, anchors, snapping, corner radii
│   ├── properties.test.ts        # Value formatting
│   └── shared.test.ts            # Colour conversion, ids, type guards, defaults
└── src/
    ├── shared/                   # Pure TypeScript — no Figma, no DOM
    │   ├── types.ts              # Data model, settings, property enum, panel sizing
    │   ├── rpc.ts                # Request/response union + type guards
    │   ├── tokens.ts             # Card visual tokens, category colours, metrics
    │   ├── ids.ts                # Local id generation (no crypto in the sandbox)
    │   └── format/
    │       ├── properties.ts     # PropertyType → label + formatted value (pure)
    │       └── geometry.ts       # Anchor and path computation (pure)
    ├── main/                     # Figma sandbox
    │   ├── index.ts              # Entry, RPC router, lifecycle, menu commands
    │   ├── store.ts              # Shared plugin data read/write, schema version
    │   ├── registry.ts           # Finding Figtations on a page (feature-detected)
    │   ├── card.ts               # Card renderer — a reconciler, not a generator
    │   ├── connector.ts          # Leader line (VectorNode) + endpoint dot
    │   ├── handles.ts            # Path editing: read the vector network back
    │   ├── reconcile.ts          # Classifies document changes (canvas → plugin data)
    │   ├── probe.ts              # Live property values, incl. variables and styles
    │   ├── categories.ts         # Own category register + native mapping
    │   ├── native.ts             # Import/export of node.annotations
    │   ├── sync.ts               # Create, sync, delete, debounce, write guard
    │   ├── arrange.ts            # Auto-arrange
    │   ├── fonts.ts              # Font resolution + cache
    │   └── bus.ts                # Outbound channel to the UI; never throws
    └── ui/                       # React 18 in the iframe
        ├── index.html            # Vite entry; emitted as dist/ui.html
        ├── main.tsx              # React root
        ├── App.tsx               # Panel shell: tabs, footer, modals, toasts
        ├── rpc.ts                # Typed postMessage client with promises
        ├── strings.ts            # Every user-facing string (NFR-7)
        ├── styles.css            # Implements DESIGN.md; defines no values of its own
        ├── fonts.css             # @font-face, inlined as data URIs at build time
        └── components/
            ├── Editor.tsx        # Category, label, properties, line controls
            ├── AnnotationList.tsx# "All" tab: search, filters, bulk actions
            ├── CategoryManager.tsx
            ├── CategorySelect.tsx
            ├── PropertyPicker.tsx
            ├── ColorSwatches.tsx
            ├── SettingsPanel.tsx
            ├── ThemeSwitcher.tsx
            ├── Logo.tsx          # Draws the mark inline, follows the theme
            └── primitives/       # Button, Input, Select, Segmented, Modal, Toast…
```

### The RPC protocol

`src/shared/rpc.ts` defines one discriminated union per direction, and both ends
import it — so an unhandled request type is a compile error, not a runtime
surprise.

- **UI → sandbox:** `{ requestId, req: UiRequest }`. `src/ui/rpc.ts` wraps each
  send in a promise and keeps it in a `Map` keyed by `requestId`.
- **Sandbox → UI:** `MainEvent`. Two of them resolve promises (`ok`, `error`);
  the rest are pushes — `state`, `selectionChanged`, `listChanged`,
  `probeResult`, `labelChangedOnCanvas`, `routeChanged`, `pathEditMode`, `toast`.
- `ResponseMap` ties a request type to its response payload shape.
- Nothing is trusted: `isUiMessage` and `isMainEvent` guard every inbound
  payload, because `postMessage` data is `unknown`.

The router in `src/main/index.ts` wraps every handler in try/catch. An error
becomes both an `error` event (so the panel can toast it) and a
`figma.notify(…, { error: true })` — the plugin must never fail silently and
never crash (NFR-5). A global `onunhandledrejection` handler is the last net.

### Data flow

```
User edits in the panel
  UI component → request() → postMessage → router → handle() → sandbox mutation
                                                        ↓
                                         emit() → panel state update

User edits on the canvas
  nodechange → classify() → ChangeVerdict → (120 ms debounce) → flush()
                                                        ↓
                                        syncFigtation() per affected card
                                                        ↓
                                         emit() → panel state update
```

### The sync engine

`src/main/sync.ts` is the core. There is no drag event in the plugin API, so the
work is driven from three places:

1. **`nodechange` on the current page**, debounced 120 ms and coalesced by
   Figtation id — the general case. (`figma.on('documentchange')` would require
   `loadAllPagesAsync()` under `documentAccess: "dynamic-page"`, which would load
   every page of the file at startup; see D-017.)
2. **A polling tracker** at 32 ms while the selection touches a Figtation. A
   debounce waits for quiet, so during a drag the line would always lag — and a
   drag is exactly when the connection has to look attached (D-023). The tracker
   is cheap by construction: geometry only, no card render, no property probing,
   target nodes resolved once up front, and it gives up above 8 tracked
   Figtations.
3. **A full `syncAll`** whenever the plugin opens or the page changes, because
   state goes stale while the plugin is closed.

Two invariants hold this together:

- **The write guard.** `withWriteGuard()` increments a counter around every
  plugin write and releases it on the next tick, so the change events the
  renderer's own writes produce are swallowed instead of feeding back in.
- **Nothing derived is persisted.** Property *values* are always read live off
  the target; only the *selection* of properties is stored.

`reconcile.ts` keeps the classification side-effect free: it turns a `NodeChange`
into a `ChangeVerdict` — which cards need re-rendering, which connectors need
recomputing, which nodes moved, whether a protected field was edited, whether the
page index went stale — and `sync.ts` applies the consequences.

`registry.ts` indexes a page: card frames, `figtationId → card`,
`targetId → figtation ids`, satellites per Figtation, orphan satellites, and
`nodeId → owning figtation`. `findAllWithCriteria` with a plugin-data criterion
is not available in every typings/runtime combination, so it is feature-detected
once — and an empty result from the fast path is double-checked against the slow
predicate rather than trusted, because a runtime that accepts the criteria object
and ignores it would silently hide every Figtation (D-016).

### The card renderer

`card.ts` is a **reconciler, not a generator**. Children are located by their
`role` plugin data — never by index or name — so user edits on the canvas
survive a re-render. Which side wins per field depends on `RenderSource`:

| Source   | Triggered by                | Styling and layout | Text                              |
| -------- | --------------------------- | ------------------ | --------------------------------- |
| `create` | A new Figtation             | Applied            | Written                           |
| `theme`  | A settings change           | Re-applied         | Written                           |
| `plugin` | An edit in the panel        | Left alone         | Overwritten                       |
| `sync`   | A canvas change             | Left alone         | Canvas wins for the label;<br>protected fields are reset |

Protected fields are the category pill text and the property key/value texts —
those are managed in the plugin, and editing them on the canvas gets a throttled
toast plus a reset. Deleted property rows are restored, and the count is
reported. The card's layer name is only rewritten if the plugin wrote it in the
first place, so renaming a card by hand sticks (D-022).

Every visual value the renderer uses comes from `src/shared/tokens.ts` —
`CARD_THEMES` (dark and light), `CARD_METRICS`, `CATEGORY_HEX`. No magic numbers
in the renderer.

### The connector

`connector.ts` writes a real `VectorNode` through `setVectorNetworkAsync`, so
Figma rounds the corners itself (per-vertex `cornerRadius`) and the user can edit
the path in Figma's own vector edit mode. It is locked and drawn behind the card.

The routing itself is pure and unit-tested (`src/shared/format/geometry.ts`):
`resolveCardSide` → `nearestBorderPoint`/`denormaliseAnchor` → `elbowRoute` or a
straight line → `simplify` → `snapToAxis` → `cornerRadii`. Waypoints are stored
in absolute canvas coordinates and travel with the *card*, not the target — hence
the `pos` key, which records the last synced card origin so a move can be
translated (D-005).

### The property engine

`probe.ts` touches nodes, `format/properties.ts` is pure and tested. Resolution
order per value is **bound variable → style → raw value**. Variable and style
names are cached for the session. The result per property is a `ProbedProperty`:
label, formatted value, optional colour swatch, optional variable name, optional
link to a main component, and an `available` flag that greys the entry out in the
picker.

`mainComponent` shows the component name rather than its variant string (D-024)
and links to the local main component; a library component says so instead of
offering a link that cannot work (D-026).

### Categories and the native bridge

Figma has no remove or rename API for native annotation categories (PRD C-6), so
`categories.ts` keeps its own register in document plugin data and maps onto
native categories only at import/export time. On first run the register is seeded
from the file's native categories if there are any, otherwise from ten defaults
(Navigation, Interaction, Accessibility, Content, Component, Rule, Haptic
Feedback, Behaviour, Development, Change). Colours are restricted to the eight
values the native API accepts.

`native.ts` handles both directions, page- or file-scoped, optionally deleting
the native source after an import. Because Figtations uses the same property-type
enum as Figma, the round trip is lossless for labels, properties and categories.

---

## Data model and persistence

Everything lives in **shared** plugin data under the `figtations` namespace,
which means other tools and agents can read your annotations. Nothing is kept
only in memory, so a Figma crash loses nothing (NFR-6).

### Document level (`figma.root`)

| Key          | Contents                                       |
| ------------ | ---------------------------------------------- |
| `schema`     | Schema version — currently `"1"`               |
| `settings`   | JSON `Settings` object                         |
| `categories` | JSON array of `FigtationCategory`              |

`ensureSchema()` runs on every start and is where future migrations hook in.

### Card node (a `FrameNode`)

| Key                          | Contents                                                  |
| ---------------------------- | --------------------------------------------------------- |
| `type`                       | `card`                                                    |
| `id`                         | Figtation id                                              |
| `targetId` / `targetName`    | The annotated node; `targetId: ""` means a free note       |
| `categoryId`, `label`        | Category and label                                        |
| `props`                      | JSON array of `PropertyType` — the *selection*, never values |
| `connectorId`, `endpointId`  | Satellite node ids                                        |
| `pinned`                     | `1` → auto-arrange skips this card                        |
| `route`, `routeMode`         | `auto`/`custom`, `straight`/`elbow`                       |
| `waypoints`, `tangents`      | Custom path, absolute coordinates                          |
| `cardSide`, `anchor`         | Exit side, normalised anchor on the target (or `auto`)     |
| `widthOverride`              | Set when the card was resized by hand                      |
| `pos`                        | Last synced card origin, for translating waypoints        |
| `rev`                        | Render revision counter                                   |

Card children carry a `role` (`header`, `pill`, `pill-text`, `label`,
`properties`, `row`, `row-key`, `row-value`, `swatch`, `divider`, `badge`,
`token-chip`), which is how the reconciler finds them. Satellites carry
`type` (`connector`, `endpoint`, `handle`) plus `cardId`.

### Per user, not per document (`figma.clientStorage`)

| Key          | Contents                            |
| ------------ | ----------------------------------- |
| `panelSize`  | `{ width, height }` of the panel    |
| `panelTheme` | `dark` \| `light` — the panel theme |

Do not confuse `panelTheme` with `Settings.theme`: the first is the theme of the
plugin panel and is a personal preference; the second is the theme of the cards
drawn on the canvas and belongs to the document.

### Node budget per Figtation

1 card frame + n children + 1 connector + 1 endpoint dot. No handle nodes —
Route A path editing uses Figma's own editor (D-003).

---

## Settings reference

Document settings, edited in the panel's ⚙ modal and stored under the `settings`
key. Defaults come from `DEFAULT_SETTINGS` in `src/shared/types.ts`; the ranges
are clamped both on write and on read, so hand-edited plugin data cannot produce
an invalid card.

| Setting                 | Type                     | Default  | Range     | Effect                                            |
| ----------------------- | ------------------------ | -------- | --------- | ------------------------------------------------- |
| `cardWidth`             | number (px)              | `280`    | 200–480   | Base width; a per-card `widthOverride` beats it    |
| `theme`                 | `dark` \| `light`        | `dark`   | —         | Theme of the cards **on the canvas**               |
| `connectorStyle`        | `straight` \| `elbow`    | `elbow`  | —         | Default routing for new Figtations                 |
| `connectorDashed`       | boolean                  | `false`  | —         | Dashed leader lines (4/4)                          |
| `connectorCornerRadius` | number (px)              | `12`     | 0–32      | Elbow corner rounding                              |
| `connectorWeight`       | number (px)              | `1.5`    | —         | Stroke weight                                      |
| `showEndpointDot`       | boolean                  | `true`   | —         | Dot where the line meets the target                |
| `snapWaypoints`         | boolean                  | `true`   | —         | Snap custom waypoints to axes (4 px tolerance)     |
| `showPropertyValues`    | boolean                  | `true`   | —         | Values on the card, or keys only                   |
| `showCardLayerName`     | boolean                  | `false`  | —         | Figma paints frame names above the frame           |
| `autoRefreshOnOpen`     | boolean                  | `true`   | —         | Full sync when the plugin opens                    |
| `arrangeGutter`         | number (px)              | `80`     | 0–400     | Gap between frame and card column                  |
| `arrangeSide`           | `right` \| `left`        | `right`  | —         | Which side cards are placed on                     |

Changing `theme`, `cardWidth`, `showPropertyValues`, `showCardLayerName`,
`connectorDashed`, `connectorCornerRadius`, `showEndpointDot` or `connectorStyle`
triggers a re-render of every card on the page, in one undo step.

Panel window sizing is not a setting but a constraint set (`PANEL_SIZE`):
default 320 × 700, minimum 300 × 320, maximum 1600 × 1600.

---

## Available scripts

| Command                | What it does                                                          |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run dev`          | Watch build for sandbox and UI, side by side                          |
| `npm run dev:main`     | esbuild watch only (`dist/main.js`, unminified, inline sourcemap)      |
| `npm run dev:ui`       | Vite watch only (`dist/ui.html`)                                      |
| `npm run build`        | Production build → `dist/main.js`, `dist/ui.html`                     |
| `npm run build:main`   | Sandbox bundle only                                                   |
| `npm run build:ui`     | UI bundle only                                                        |
| `npm run typecheck`    | Type-checks sandbox, UI and tests separately                          |
| `npm run lint`         | ESLint over the whole repo                                            |
| `npm run format`       | Prettier, write                                                       |
| `npm run format:check` | Prettier, check only                                                  |
| `npm run test`         | Vitest, one pass                                                      |
| `npm run test:watch`   | Vitest, watch                                                         |
| `npm run verify`       | typecheck + lint + test + build — the gate for every milestone        |

---

## Testing

```bash
npm run test              # one pass
npm run test:watch        # watch mode
npx vitest run --coverage # with coverage
npx vitest run tests/geometry.test.ts          # one file
npx vitest run -t "computeRoute"               # one suite or case
```

76 tests across three files, all of them against `src/shared` — the pure layer:

| File                     | Covers                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| `tests/geometry.test.ts` | Rect helpers, `resolveCardSide`, anchors, `simplify`, `elbowRoute`, `snapToAxis`, `cornerRadii`, `computeRoute`, `translateWaypoints` |
| `tests/properties.test.ts` | `formatNumber`, `titleCase`, alignment, padding, radii, paints, `formatProperty` |
| `tests/shared.test.ts`   | Colour conversion, `createId`, type guards, defaults                        |

Coverage is measured on `src/shared/**` only, with thresholds enforced in
`vitest.config.ts`: 90 % lines, functions and statements, 80 % branches.

**Why nothing else is unit-tested.** `src/main` talks to the `figma` global and
`src/ui` renders React — mocking the plugin API well enough to be meaningful
costs more than it catches, so the split is deliberate: everything worth testing
in isolation lives in `src/shared`, and the rest is covered by the manual plan in
`docs/QA.md`, which needs a human in the Figma desktop client.

```bash
# The manual pass:
npm run build
# Figma → Plugins → Development → Import plugin from manifest… → manifest.json
# then walk docs/QA.md
```

---

## Build and release

There is no server to deploy to. "Deployment" here means producing the artifact
that gets imported into Figma or uploaded to the Figma Community.

### The release artifact

```bash
./scripts/build-release.sh              # uses the version in package.json
./scripts/build-release.sh 1.0.0-beta.1 # asserts the version matches
```

The script is fail-fast by design (`set -euo pipefail`, no pipes around any
command whose exit code matters) and does, in order:

1. Assert the requested version matches `package.json`.
2. `rm -rf node_modules dist` and `npm ci` — a clean install.
3. `npm run verify` — the full gate. A red gate cannot reach a zip.
4. `npm run build`, then assert both output files exist.
5. Reject sourcemaps: no `*.map` in `dist/`, no `sourceMappingURL` in either bundle.
6. Assert `dist/ui.html` actually contains `"v<version>"` — a stale build cannot slip through.
7. Stage `manifest.json` + `dist/` under `/tmp` (never inside the repo, where a
   minified bundle would end up in front of ESLint) and pack the zip.
8. Re-extract the archive and `diff` all three files against the build; assert
   the archive contains *exactly* those three.
9. Validate the extracted manifest: numeric id, relative `main`/`ui` paths that
   resolve.
10. Scan for anything that must not ship — `node_modules` references, private
    keys, tokens, absolute local paths.
11. Print path, size and SHA-256.

Output goes to `.context/release/`, which is gitignored: the process is
version-controlled, the build output is not.

### Publishing to the Figma Community

`manifest.json` carries the real, Figma-assigned plugin id `1669772164275856800`,
issued via _Plugins → Development → New plugin_. It is permanent — it is what
updates publish against and it is **not** replaced when the plugin goes to the
Community (D-015).

To publish: open the plugin in the Figma desktop app, then
_Plugins → Development → **Figtations (Beta)** → Publish_, and fill in the
Community listing (the SVGs in `assets/` are there for exactly that).

`manifest.name` is `Figtations (Beta)` so the plugin list shows the build's
status. That suffix lives in that one field and comes out again at the first
stable release (D-032). The manifest has no version field — the released version
lives in `package.json` and is injected into the panel header at build time by
`vite.config.ts`, so a bug report identifies an exact build.

### Versioning

[Semantic Versioning](https://semver.org/spec/v2.0.0.html), with a changelog in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Bump
`package.json`, write the `CHANGELOG.md` entry, run the release script, tag.

---

## Design system

`DESIGN.md` in the repo root **is** the design system: colour tokens for both
themes, the type scale, geometry, component specs and the rules that hold them
together. `src/ui/styles.css` implements it and defines no values of its own —
change a colour there and you have forked the system, so change it in `DESIGN.md`
first.

Two of its rules show up all over the panel code:

- **One yellow per surface.** Yellow is reserved for create and refresh, so while
  a draft is on screen the CTA is _Create_ and _Refresh_ steps back to secondary
  (D-030).
- **Procedural hints live at the end of the panel**, in the footer's own row —
  never inline, never coloured.

Dark is the default. The header carries the switch; the choice is per person and
lives in `clientStorage`.

Card visuals are a separate system: they are drawn as Figma nodes, not CSS, and
their tokens live in `src/shared/tokens.ts`.

---

## Brand assets

`assets/figtations-mark-{dark,light,mono}.svg` are the mark — a bracket with two
bands. `figtations-icon-16.svg` is the small-size drawing (thicker stroke,
tighter bands) for 24 px and below; a scaled-down mark loses its hairlines.

The panel loads none of them. `src/ui/components/Logo.tsx` draws the geometry
inline and takes its colours from the theme, so the header mark follows the
switch with no second copy. The files are for everything outside the bundle: the
Figma Community listing, docs, slides.

---

## Privacy

`networkAccess` is `none`. The plugin sends nothing anywhere and has no
telemetry. The two fonts it uses are compiled into `dist/ui.html` as data URIs at
build time, so nothing is fetched at runtime either. All data lives in the
document's _shared_ plugin data under the `figtations` namespace, which means
other tools and agents can read your annotations.

The lint config enforces this too: `fetch` is a restricted global in all three
directories.

---

## Troubleshooting

### The plugin does not appear in Figma

**Cause:** Development plugins can only be imported in the **desktop app**, not
in the browser.

**Fix:** Open the file in the desktop app, then _Plugins → Development → Import
plugin from manifest…_ and pick `manifest.json` in the repo root.

### "Cannot find module" or the plugin fails to start after a fresh clone

**Cause:** `dist/` is gitignored, and the manifest points at `dist/main.js` and
`dist/ui.html`.

**Fix:**

```bash
npm install && npm run build
```

### Changes do not show up in Figma

`npm run dev` writes the bundles, but Figma keeps the old ones loaded.

**Fix:** _Plugins → Development → Hot reload plugin_, or close and re-run the
plugin (⌥⌘P re-runs the last one).

### The lines are stale / point at the wrong place

**Cause:** Layers were moved while Figtations was closed. There is no background
execution and no drag event (PRD C-3).

**Fix:** Reopen the plugin (a full sync runs automatically if _Refresh when the
plugin opens_ is on), hit _Refresh_ in the footer, or use the _Refresh
annotations_ relaunch button on any card.

### "Read-only in Dev mode — switch to Design mode to edit"

**Cause:** Figma makes plugins read-only in Dev Mode (PRD C-2). Every mutating
request is refused in the router.

**Fix:** Switch the file to Design mode.

### Edits on a card keep getting reverted

**Cause:** The category pill text and the property key/value texts are protected
fields — they are derived from the plugin data and reset on the next sync.

**Fix:** Edit the category in the ⚙ category manager and the properties in the
editor. The *label* is not protected: rewriting it on the canvas flows back into
the plugin data. Fills, radii and padding you set yourself also survive.

### "Restored N property rows"

**Cause:** Property rows were deleted directly on the card. The renderer restores
them, because the plugin data still lists those properties.

**Fix:** Remove the property in the panel's editor instead.

### _Edit line_ does nothing visible

**Cause:** The plugin cannot open Figma's vector edit mode programmatically
(PRD C-9). It only unlocks and selects the connector.

**Fix:** Press **Enter** with the connector selected, drag the handles, then
click _Done_ in the panel.

### "Could not read the line back" after path editing

**Cause:** The read-back rejects branched networks, closed loops, disconnected
pieces and more than 12 inner waypoints.

**Fix:** The last valid route is left intact — use _Reset line_ and redraw with a
simple open path.

### Typecheck fails on something that runs fine

**Cause:** Three tsconfigs, three different lib sets. `window` in `src/main` or
`figma` in `src/ui` is a real error, not a config problem.

**Fix:** Move genuinely shared logic into `src/shared` (which may use neither),
and reach across the boundary with an RPC request instead.

### `npm ci` fails in `build-release.sh`

**Cause:** `package-lock.json` is out of sync with `package.json` — `npm ci`
refuses to reconcile them, unlike `npm install`.

**Fix:** Run `npm install` locally, commit the updated lockfile, re-run the
script.

### Fonts look wrong on the cards

**Cause:** Card text uses *Figma* fonts, not the panel's. `fonts.ts` tries Inter,
then Roboto, then Helvetica, then the first family that loads at all.

**Fix:** Install or enable Inter in Figma. (The *panel* fonts are bundled and
never fetched — a panel font problem is a build problem, not a system one.)

---

## Contributing

- **`npm run verify` is the gate.** Typecheck, lint, test, build — all green
  before a commit.
- **Values belong in one place.** Card visuals in `src/shared/tokens.ts`, panel
  visuals in `DESIGN.md`, user-facing strings in `src/ui/strings.ts` (NFR-7 —
  i18n-ready, English only in v1).
- **The boundaries are enforced, not suggested.** If ESLint stops you from using
  a global, that is the architecture talking.
- **Every non-obvious call gets an entry in `docs/DECISIONS.md`** — including
  what could *not* be verified, which is what D-014 exists for.
- **User actions are one undo step.** New mutations go through
  `withWriteGuard()` and end in `commitUndo()` (NFR-4).
- **Nothing derived gets persisted.** If a value can be read off the node, read
  it (PRD C-8).
- Prettier settings are in `.prettierrc.json`: no semicolons, single quotes,
  100 columns.

---

## Documentation

- `DESIGN.md` — the design system the panel implements
- `docs/PRD.md` — the product requirements document this is built from
- `docs/DECISIONS.md` — decision log, including what could not be verified yet
- `docs/QA.md` — the manual test plan; **still to be walked through**
- `CHANGELOG.md` — release notes

`docs/PRD.md` and `DESIGN.md` are in German; everything else, including all
user-facing strings, is English.

---

## Status

All eleven milestones from the PRD are implemented and the automated gate
(`npm run verify`) is green. The M7 spike is done: Route A path editing was
verified in the Figma desktop client, so Route B is dropped (D-003). The manual
acceptance pass is mostly open — 12 of 138 criteria in `docs/QA.md` are ticked,
covering the automated gate and a functional smoke test (D-014). Both performance
targets (NFR-1: interactive panel under 800 ms with 100 Figtations; NFR-2: sync
under 200 ms after a drag) are unmeasured.

Released as `v1.0.0-beta.1`. The plugin list shows it as **Figtations (Beta)**;
that suffix comes out at the first stable release (D-032).

---

## License

None declared. `package.json` is marked `private`, and there is no `LICENSE`
file in the repo — so all rights are reserved until one is added.
