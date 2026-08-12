# Decision log

Architecture decision records for Figtations. Kept per PRD §0 rule 4: anything
that could not be built as specified is recorded here instead of being silently
reshaped. Newest entries at the bottom.

Format: **Problem · Options · Decision · Rationale**

---

## D-001 · Card children carry plugin data

**Problem.** PRD FR-2 states "Alle Kinder-Nodes tragen kein pluginData — nur die
Card selbst", while §5.3b states the opposite and explains why: node names are
user-editable and therefore useless as identifiers for the reverse sync required
by C-10.

**Options.** (a) Follow FR-2 and identify children by name or index. (b) Follow
§5.3b and give every managed child a `role`.

**Decision.** (b). §5.3b explicitly supersedes the earlier wording ("Anders als
in einer früheren Fassung dieses Dokuments …").

**Rationale.** Without stable roles, `renderCard` cannot be a reconciler, and
FR-12 becomes unimplementable. The FR-2 bullet is a leftover from the previous
draft.

---

## D-002 · Two additional child roles

**Problem.** The role list in §5.3b has no role for the container that holds a
property value (swatch + text) or for the token chip shown on bound variables
(§7 requires both visually).

**Options.** (a) Rebuild the value subtree on every render. (b) Add `value` and
`token-chip` to the role enum.

**Decision.** (b). The enum is now
`header | pill | pill-text | label | properties | row | row-key | value |
row-value | swatch | divider | badge | token-chip`.

**Rationale.** Rebuilding nodes on every sync would churn node ids, pollute the
undo history and break "Label-Änderung … Node-ID bleibt identisch" (FR-2
acceptance). The addition is purely additive; nothing that reads the documented
roles breaks.

---

## D-003 · M7 spike could not be executed — Route A built, Route B deferred

**Problem.** PRD M7 requires a spike inside the Figma desktop client before any
production code: can a connector written via `setVectorNetworkAsync` be edited in
the native vector edit mode, do the edits read back, which events fire, do
tangents survive re-anchoring, how does per-vertex `cornerRadius` behave on short
segments. The implementing agent has no Figma client and cannot answer these
questions by reasoning.

**Options.** (a) Build nothing until a human runs the spike. (b) Build Route A
(the documented preference, D-3) with the read-back guarded by validation, and
leave Route B unbuilt. (c) Build both.

**Decision.** (b). `src/main/handles.ts` implements the Route A read-back:
network → ordered chain → absolute waypoints → `waypoints` / `tangents` /
optional new `anchor`. Branched networks, closed loops, disconnected pieces and
more than 12 inner waypoints are rejected with a toast and leave the stored route
untouched. Route B (own handle nodes) is **not** built.

**Rationale.** (c) contradicts the PRD ("Route B nur, wenn die Rückübernahme
unzuverlässig ist") and doubles the surface area. (a) would block eight other
milestones on a step only a human can perform.

**Open — requires a human.** Run the four spike questions from M7 in the desktop
client and record the answers below this entry. If question 1 or 2 fails, Route B
has to be built and this entry amended.

---

## D-004 · No `nanoid` dependency

**Problem.** §5.2 and §5.3 specify nanoid for ids. `nanoid` uses
`crypto.getRandomValues`, which does not exist in the Figma sandbox.

**Options.** (a) Ship nanoid and polyfill crypto. (b) Generate ids locally.

**Decision.** (b), `src/shared/ids.ts`: base36 timestamp + session counter +
random suffix from a 55-character alphabet.

**Rationale.** Ids only need to be unique inside one document. A polyfilled CSPRNG
buys nothing here and adds a runtime dependency, which §4.1 forbids without an
entry in this log.

---

## D-005 · Additional plugin-data key `pos`

**Problem.** FR-6 and D-4 require waypoints to travel with the card by delta
translation. Computing that delta needs the card's previous absolute position, and
the schema in §5.3 has no field for it. An in-memory map would be wrong across a
plugin restart — the very case C-3 is about.

**Options.** (a) In-memory map. (b) Persist the last synced card origin.

**Decision.** (b). Key `pos`, value `"<x>,<y>"`, written at the end of every sync.

**Rationale.** C-8 forbids persisting _derived_ values to keep the JSON small.
`pos` is not derived from anything still available after a restart; it is state.
Cost is ~20 bytes per Figtation.

---

## D-006 · Two files added to the §4.2 tree

**Problem.** The UI channel (`figma.ui.postMessage` plus `figma.notify` plus
toast throttling) is needed by six modules in `src/main`. Putting it in any of
them creates import cycles.

**Decision.** Added `src/main/bus.ts` (outbound events, toasts, throttling) and
`tsconfig.test.json` (vitest context — the sandbox and UI configs must not carry
test types).

**Rationale.** Both are additive. §4.1b's requirement of _separate_ configs per
runtime is respected; the test config is a third runtime, not a merge of the two.

---

## D-007 · `FigtationSummary` carries editor detail

**Problem.** The editor needs a Figtation's selected properties, route state,
width override and pin state. §4.4 has no request that returns them, only
`FigtationSummary` (label, target, prop count).

**Options.** (a) Add a `getFigtation` request. (b) Widen `FigtationSummary`.

**Decision.** (b). The summary now also carries `props`, `route`, `routeMode`,
`cardSide`, `waypointCount`, `widthOverride`, `pinned`.

**Rationale.** One round trip instead of two per selection change, and it keeps
`list` and `selection.figtations` interchangeable in the UI. The payload stays
small — no property _values_, only their types.

---

## D-008 · Rotated targets use the axis-aligned hull

Per PRD FR-5 #6: a rotated target is anchored via `absoluteBoundingBox`, i.e. its
axis-aligned hull. No rotation mathematics. Recorded here because the PRD asks for
it explicitly. Consequence: for a strongly rotated target the endpoint dot can sit
slightly off the visual edge.

---

## D-009 · D-1 — `GroupNode` allowed as a target

**Decision.** Groups may be annotated. They have an `absoluteBoundingBox`, so the
connector works. On native export they are skipped and counted in the report,
because `annotations` does not exist on groups.

**Rationale.** The PRD's own recommendation for D-1. Refusing would be surprising:
from the user's point of view a group is a layer like any other.

---

## D-010 · D-2 — Collision avoidance on creation checks cards only

**Decision.** `placementFor()` tests the new card against other cards, not
against frames. 40 attempts, 16 px step, then it places anyway.

**Rationale.** The PRD's recommendation. Frame collisions are what auto-arrange
(FR-8) is for, and testing against every frame on the page would put a page
traversal into the creation path.

---

## D-011 · D-5 — Protected fields are reset immediately

**Decision.** A canvas edit to a category pill, property key or property value is
reverted on the next sync, with one throttled toast (max. one per 5 s).

**Rationale.** The PRD's recommendation: predictable beats clever. A
"modified" badge would leave the card showing a value that is no longer true.

---

## D-012 · Grid anchor/span availability keyed on the _parent_

**Problem.** FR-3a lists all `grid*` properties as available when
`layoutMode === 'GRID'`. But `gridRowAnchorIndex`, `gridColumnAnchorIndex`,
`gridRowSpan` and `gridColumnSpan` live on the _children_ of a grid container, not
on the container.

**Decision.** Container properties (`gridRowGap`, `gridColumnGap`,
`gridRowCount`, `gridColumnCount`) require the node itself to be a grid; the four
child properties require the node's parent to be a grid.

**Rationale.** Reading them off the container would always yield "unavailable",
which contradicts the intent of FR-3a ("v1 unterstützt alle").

---

## D-013 · One branch, commits grouped by milestone cluster

**Problem.** §0 rule 2 asks for one branch plus one PR per milestone. The work
happens in a single Conductor workspace pinned to the branch `st-georges`, which
must not be renamed.

**Options.** (a) Eleven branches plus eleven PRs. (b) Eleven commits on
`st-georges`. (c) A small series of commits along module boundaries.

**Decision.** (c). Five commits, Conventional Commits, one PR for the series:
scaffold (M0) · data model and property engine (M1–M2) · renderer, connector,
sync, native bridge (M3, M6, M7, M9, M10) · panel UI (M4, M5, M8, M11) · docs.

**Rationale.** (a) is impossible from a single pinned branch. (b) would be
misleading: the code was written as one pass, so eleven commits would have to be
carved out artificially and the early ones would not build on their own (esbuild
has no entry point until `src/main/index.ts` exists). The five commits chosen do
map onto real module boundaries, which is what makes a diff reviewable.

**Consequence, stated plainly.** Intermediate commits are **not** individually
buildable. `npm run verify` is green at the tip.

**Open — requires a human.** If per-milestone PRs are needed for process reasons,
say so and the series can be re-cut.

---

## D-014 · Manual acceptance in the Figma client is outstanding

**Problem.** §0 rule 1 defines a milestone as finished only when all acceptance
criteria are verifiable by hand in the Figma desktop client. The implementing
agent cannot run Figma.

**Decision.** Every milestone is delivered with `npm run verify` green
(typecheck both contexts, ESLint, vitest, build). The acceptance checklists in
`docs/QA.md` are **unchecked** and have to be walked through by a human.

**Rationale.** Reporting these boxes as ticked would be false. The checklist is
therefore shipped as the actual, open handover item.

---

## D-015 · A numeric development id in the manifest — ~~superseded~~ revised

**Problem.** §4.3 specifies `"id": "TBD_AFTER_FIRST_PUBLISH"`. Figma assigns the
real id on publish.

**First decision (wrong).** Omit `id` during development, on the assumption that a
placeholder string might fail manifest validation on import.

**What actually happened.** The import accepted a missing `id` — but
`setRelaunchData()` does not:

> Cannot set relaunch data in a plugin without an ID. Make sure your plugin
> manifest has a valid "id" field.

Because that call sits at the end of `renderCard()`, it aborted the rest of
`createFigtations()`. Positioning and connector creation never ran, so cards
stayed at the page origin — reported as "annotations are far away from the
screen". See also D-020.

**Revised decision.** Ship a syntactically valid numeric development id
(`1417382967104512873`) and replace it with the real one on first publish (M11).
`setRelaunchData()` is additionally wrapped in try/catch (D-020), so the relaunch
button degrades instead of taking the card with it.

**Rationale.** The original reasoning inverted the risk: the field is required by
a runtime API, not just by the publish flow. A numeric id matches the format Figma
itself issues.

---

## D-016 · The plugin-data search criterion is verified, not trusted

**Problem.** §5.6 requires feature detection for `findAllWithCriteria` with a
plugin-data criterion. Detection by try/catch only covers a runtime that
_throws_. A runtime that accepts the criteria object but ignores the plugin-data
part returns an empty array — and every Figtation silently disappears from the
panel, the list and the sync.

**Decision.** An empty result from the fast path is checked once against the
`findAll` predicate. If the predicate finds something, the fast path is retired
for the session.

**Rationale.** The failure mode this prevents is both plausible and invisible: the
plugin would look like it works and quietly lose every annotation. The extra cost
is one traversal in exactly the case where the fast path found nothing.

---

## D-017 · `PageNode.on('nodechange')` instead of `figma.on('documentchange')`

**Problem.** C-3 and FR-6 name `figma.on('documentchange')` as the sync trigger.
Under `documentAccess: "dynamic-page"` (C-4) registering that handler throws:

> Cannot register documentchange handler in incremental mode without calling
> figma.loadAllPagesAsync first.

Found on the first manual launch in the Figma client — the plugin could not open
at all.

**Options.** (a) `await figma.loadAllPagesAsync()` before registering.
(b) `PageNode.on('nodechange')` on the current page, rebound on page switch.
(c) Drop `documentAccess: "dynamic-page"`.

**Decision.** (b). `sync.ts` exposes `watchPage()` / `unwatchPage()`; the
listener is bound in `registerListeners()`, rebound on `currentpagechange` and
released on `close`.

**Rationale.** (a) loads every page of the file at startup, which is exactly what
C-4 avoids and what NFR-1 (interactive panel < 800 ms with 100 Figtations) cannot
afford on a large file. (c) is not ours to change — C-4 is a hard constraint. The
Figma typings recommend (b) as _the_ granular alternative for this case, and it
fits the product: the registry, the list and the sync are all page-scoped
already. `NodeChange` is a subset of `DocumentChange`, so `reconcile.classify()`
is unchanged apart from its parameter type.

**Consequence.** Changes on other pages no longer produce events. That is not a
regression: `syncAll()` only ever operated on the current page, and a page switch
triggers a full sync.

---

## D-018 · Size the card before enabling auto layout

**Problem.** `resize()` on an auto-layout frame forces both sizing modes to
FIXED. `createCardShell()` enabled auto layout first and then resized to the
configured width, which would have taken the hug height away from every new card
— contradicting §7 ("Width fix, Height hug") and FR-12 ("Card-Höhe → Plugin").

**Decision.** Resize the plain frame first, then enable auto layout. In
`renderCard()`, where a width change has to happen on a live auto-layout frame,
the sizing modes are re-asserted after the resize — which doubles as the FR-12
rule that a manual vertical resize snaps back to hug.

**Rationale.** Caught by reading, not by a test: there is no unit test that can
see it, because it only exists inside the Figma runtime.

---

## D-019 · One coordinate conversion for absolute → parent-local

**Problem.** Two conversions had grown side by side: `connector.ts` used
`absoluteTransform` (`parentOrigin()`), while card placement in `sync.ts` and
`arrange.ts` used `absoluteBoundingBox`. The two disagree whenever the parent is
stroked, rotated, or a section — so a card and its own leader line could be
computed against different origins.

**Decision.** `parentOrigin()` from `connector.ts` is the single conversion, used
by placement, arrange and the connector alike.

**Rationale.** `absoluteBoundingBox` is the _visual_ hull; the child coordinate
space is defined by `absoluteTransform`. Only one of them is correct, and having
two was a latent bug waiting for a section.

---

## D-020 · A failing convenience call must not abort the build

**Problem.** `setRelaunchData()` threw (D-015) at the end of `renderCard()`. Since
`createFigtations()` positions the card and creates the connector _after_
rendering, the exception left a stranded, connector-less card at the page origin.
The error toast was correct and useless: it named the relaunch data, not the
visible damage.

**Decision.** Two changes. `setRelaunchData()` is wrapped in try/catch — the
relaunch button is a convenience, and a card without one is still a valid card.
And `buildFigtation()` now unwinds: if anything between "create frame" and "move
into place" throws, the half-built card is removed before the error propagates.

**Rationale.** A fresh frame lands at the page origin, which on a real canvas is
nowhere near the design. "Partly built, in the wrong place, still there" is the
worst of the three possible outcomes — worse than either success or a clean
failure. NFR-5 asks for no silent failures; NFR-6 asks for no lost state. Debris
serves neither.

---

## D-021 · Creating an annotation is confirmed with a CTA

**Problem.** FR-1 #4 specifies live-preview creation: "Beim ersten Property-Add
oder beim Verlassen des Label-Felds mit nicht-leerem Inhalt wird die Card auf dem
Canvas erzeugt (Live-Preview-Prinzip: es gibt kein separates 'Save')." In use this
turned out to be unwanted — every half-typed thought became a node on the canvas,
and abandoning a draft meant deleting a card.

**Decision.** Requested by the product owner and implemented: in create mode the
draft (category, label, properties) is local to the panel and nothing is written
to the canvas until the primary CTA is pressed — _Create annotation_, or _Create
n annotations_ for a multi-selection. `⌘↵` / `Ctrl+↵` in the label field submits;
plain `↵` stays a newline, because labels are multi-line. The button is disabled
until there is a label or at least one property.

Editing an **existing** Figtation stays live: category, label and properties apply
immediately, as before. The confirmation is about creation only.

**Rationale.** FR-1's live preview optimises for the fewest clicks; it pays for
that with canvas debris and an undo-driven workflow. The two-phase flow costs one
click and makes the draft cancellable by simply not pressing it. Directly
requested, so the product owner's call overrides the PRD.

**Consequence.** The FR-1 acceptance criterion "Card erscheint auf dem Canvas"
now means "after the CTA". `docs/QA.md` is updated accordingly.

---

## D-022 · The card's layer name is blank by default

**Problem.** Figma paints a frame's layer name above every top-level frame, so
`Figtation — {label}` (FR-2) is drawn on the canvas right above the card and
appears in exports — the very context the product exists to serve.

**Options.** (a) Keep the descriptive name. (b) Always blank. (c) A setting.

**Decision.** (c), with the blank name as the default: `showCardLayerName`,
default `false`. Figma does not keep an empty string — it substitutes a default —
so the blank name is a zero-width space (`​`), the shortest name that draws
no glyph.

**Rationale.** The descriptive name helps in the layer panel and hurts on the
canvas. A setting keeps both, and the default follows the request. Nothing in the
code identifies nodes by name (§5.6 uses plugin data), so a blank name is
functionally safe.

**Side effect worth stating.** The rename rule got stricter at the same time: a
sync no longer overwrites the layer name unless it is still one the plugin wrote
itself (`Figtation`, `Figtation — …`, or the blank name). Renaming a card by hand
is a visible, deliberate edit and now survives — while cards created before a
settings change still pick the new naming up on the next refresh.

---

## D-023 · A polling tracker keeps the line attached during a drag

**Problem.** Dragging a card made the leader line lag behind in visible jumps.
Cause: FR-6 prescribes `documentchange` with a **120 ms debounce**, and a debounce
waits for _quiet_. While the user keeps dragging, the timer is reset on every
event, so the line does not move at all until the drag pauses or ends. Dragging is
precisely the moment the connection has to look attached, so the specified
mechanism is wrong for its most important case. There is no drag event to use
instead (C-3).

**Options.** (a) Shorten the debounce — still waits for quiet, only shorter.
(b) Throttle instead of debounce — better, but capped by however often Figma
emits change events during a drag, which is not documented and not controllable.
(c) Poll the selection while it touches a Figtation.

**Decision.** (c), plus the groundwork that makes it affordable:

- `syncGeometry()` split out of `syncFigtation()`: waypoints, connector, endpoint
  only. No card render, no property probing — the expensive half stays on the
  debounced path.
- `trackSelection()` polls every 32 ms while the selection touches at most 8
  Figtations, in **either** direction: the card was grabbed, or the annotated
  layer was. Target nodes are resolved once up front so a tick needs no async
  lookup. It stops on empty selection, page change and plugin close.
- `syncConnector()` now writes only what changed. At 30 Hz, unconditionally
  rewriting z-order, lock state, strokes and dash pattern is both slow and noisy
  in the undo history. The temporary unlock/relock around the write is gone
  entirely: the plugin API can write to a locked node.

The debounced `nodechange` path stays as it is and remains the general mechanism —
it catches everything the tracker does not watch and does the full card re-render
after property changes.

**Rationale.** (a) and (b) both inherit the same ceiling: they are reactions to an
event stream whose cadence is out of our hands. Polling decouples the visual
follow from that cadence. The cost is bounded by construction — it runs only while
a Figtation is selected, only for the geometry, and only for up to 8 items — and it
is self-limiting: no selection, no timer.

**Consequence.** Above 8 selected Figtations, tracking is skipped and the
debounced path handles it. NFR-2's 200 ms budget for 100 Figtations is unaffected:
that path is unchanged.
