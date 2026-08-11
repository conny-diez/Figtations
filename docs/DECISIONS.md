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
