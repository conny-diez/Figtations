# QA checklist

Taken from PRD §11 plus the acceptance criteria of every FR. Every box needs a
human in the Figma desktop client (see DECISIONS.md, D-014).

**Status: 12 of 138 ticked.** A first functional pass was run against
`1.0.0-beta.1` on 2026-08-13 — the automated gate, plus a smoke test in the
desktop client covering creation, path editing and reconciliation. A box is
ticked only where that pass actually exercised it; adjacent criteria that look
covered but were not explicitly run are deliberately left open. The remaining 126
are untouched, and D-014 stays open until they are not.

How to run: `npm run build`, then in Figma → _Plugins → Development → Import
plugin from manifest…_ → pick `manifest.json` in the repo root.

---

## Automated gate (run before every manual pass)

- [x] `npm run typecheck` — both contexts, no errors
- [x] `npm run lint` — 0 errors
- [x] `npm run test` — all green, formatter coverage ≥ 90 % (76 tests, 98.9 %)
- [x] `npm run build` — `dist/main.js` and `dist/ui.html` written

---

## Lifecycle

- [ ] Open / close / open — no state loss, no duplicated event listeners
- [ ] Close the file and reopen it — all Figtations intact
- [ ] Second Figma instance on the same file (multiplayer) — no data corruption

## Selection & targets

- [ ] Target: Frame, Text, Instance, Component, Component Set, Rectangle, Vector, Group
- [ ] Target inside an instance — no override created on the target
- [ ] Target inside a section — card and connector become children of that section
- [ ] Target in nested auto layout
- [ ] Target is itself a Figtation card → refused with a hint

## FR-1 · Creating (CTA flow, see DECISIONS.md D-021)

- [ ] Typing a label or adding a property places **nothing** on the canvas yet
- [ ] The CTA is disabled while label and properties are both empty
- [x] _Create annotation_ places the card; target layout unchanged
- [ ] Cmd+Enter in the label field creates it too; plain Enter inserts a newline
- [ ] Abandoning a draft (change selection) leaves no card behind
- [ ] Target stays selected after creation
- [ ] After creating, the editor edits that Figtation live (no second CTA)
- [ ] A second Figtation on the same node does not overlap the first
- [ ] Cmd+Z removes card **and** connector in one step
- [ ] Multi-selection: _Create 3 annotations_ creates three Figtations

## FR-2 · Card rendering

- [ ] Visually matches screenshot 2 (dark card, coloured pill, label, right-aligned values)
- [ ] Label change in the panel updates the card without recreating it (same node id)
- [ ] Removing a property removes exactly one row, the card shrinks
- [ ] 20 properties in one card — no overlap, no clipping
- [ ] Umlauts, emoji and multi-line labels render correctly

## FR-3 · Property engine

- [ ] A node with a bound fill variable shows the variable name, not the hex value
- [ ] Mixed corner radius shows four values
- [ ] An instance of a variant shows the component set's name, e.g. `Button`,
      not `variant=primary, state=enabled` (D-024)
- [ ] On the card the value is underlined and in the link colour (D-026)
- [ ] Select that text node → Figma shows the link and it opens the main component
- [ ] Present/prototype mode → the link is directly clickable
- [ ] In the panel the value shows `↗` and navigates, switching page if needed
- [ ] A **library** instance shows a plain value plus `ⓘ` explaining why there is
      no link — no dead link, no silent absence
- [ ] Dev mode: the link still navigates (navigation is not a write, FR-11)
- [ ] An instance of a plain component shows that component's name
- [ ] An instance of a **library** variant still shows a usable name
- [ ] A renamed instance still reports the component, not the custom layer name
      (unless nothing else is resolvable)
- [ ] All 33 property types resolve; unknown ones fall back to `—`

## FR-4 · Categories

- [ ] Categories survive closing the plugin and reloading the file
- [ ] Renaming updates the pill text on every card using it
- [ ] Changing a colour updates the pill fill **and** the connector colour
- [ ] Reorder by drag persists
- [ ] `Cancel` discards every change in the modal
- [ ] Deleting a category in use offers _remove_ / _move to_ / _cancel_

## FR-5 · Leader line

- [ ] Drag the card anywhere → line follows, endpoint stays on the target
- [ ] Move the target → line follows
- [ ] Resize the target → anchor stays on the border, or proportional if set
- [ ] Elbow route has visibly rounded corners and no kink artefacts
- [ ] Card left / right / above / below the target → plausible exit side each time
- [ ] Connector and endpoint are not selectable and sit behind the card
- [ ] Delete the card → connector **and** endpoint go with it

## FR-5b · Path editing (Route A)

- [x] `Edit line` selects and unlocks the connector, the hint appears
- [x] `Enter` opens Figma's vector edit mode, handles are visible and draggable
- [x] Drag a segment → new corner, rounded, both ends still attached
- [x] `Done` → waypoints stored, connector locked again
- [ ] Move the card afterwards → the curved shape travels with it
- [ ] Move the target afterwards → only the last segment follows
- [ ] A bend-tool curve survives three sync rounds
- [ ] Delete a vertex in Figma → the route closes cleanly
- [ ] Drag the last vertex off the target → adopted as the new anchor, clamped
- [ ] Create a branched network → toast, previous route stays valid
- [ ] 12 waypoints, then move the card → shape preserved
- [ ] 13th waypoint → rejected with a toast, last valid state kept
- [ ] `Reset line` restores the automatic route
- [ ] Hard-kill the plugin → no unlocked connector, no visible handles
- [ ] Reload Figma with path edit active → the startup sweep locks every connector
- [ ] PNG export contains no editing artefacts
- [ ] Undo across a vector edit session leaves no inconsistent state

## FR-6 · Moving & sync

- [ ] Drag the card slowly → the line follows continuously, no lag, no jumps (D-023)
- [ ] Drag the annotated layer → same, the line stays attached
- [ ] Drag fast in circles and release → the line ends up correct, not stale
- [ ] Select 10+ Figtations and drag → tracking is skipped, the debounced path
      catches up after release (no freeze)
- [ ] Drag a card, then Cmd+Z → one undo step, no trail of connector edits
- [ ] Move the card, move the target, move both
- [ ] Resize the target, rotate the target
- [ ] Move frame with target and card together
- [ ] Close the plugin, move a frame, reopen → auto-sync fixes the lines
- [ ] Change padding on the target → the property value in the card updates
- [ ] Stress test with 100 Figtations: dragging stays fluid (< 200 ms sync)
- [ ] No sync loop (own writes do not retrigger the handler)
- [ ] Duplicate a card (Cmd+D) → new id, own connector
- [ ] Copy a card to another page → recognised as an orphan

## FR-7 · Panel, list, orphans

- [ ] Property picker: click outside closes it, Escape closes it, × closes it (D-027)
- [ ] Drag the bottom-right grip → the window resizes smoothly in both axes (D-028)
- [ ] Resize to the minimum and back out → no overshoot lag at the limit
- [ ] Close and reopen the plugin → the last size is restored
- [ ] Selection changes update the panel without noticeable delay
- [ ] Delete the target → card marked "Detached" on the next sync, no crash
- [ ] Reattach to a new node restores connector and live values
- [ ] `Keep as free note` clears the warning
- [ ] Move the target to another page → "Off-page" with the page name
- [ ] Search and filters work in combination
- [ ] Panel works with 0 and with 200 Figtations

## FR-8 · Auto-arrange

- [ ] After arranging, no card overlaps another or its target frame
- [ ] Pinned cards stay put
- [ ] Cmd+Z restores all positions
- [ ] Two frames side by side → cards land at their own frame

## FR-9 · Native bridge

- [ ] Round trip native → Figtations → native loses no labels, properties or categories
- [ ] Import across several pages works
- [ ] Categories that do not exist natively are created
- [ ] Export warns before overwriting
- [ ] Orphans and free notes are skipped and reported

## FR-10 · Settings

- [ ] Card width slider takes effect live
- [ ] Theme switch re-renders all cards, light theme matches the spec
- [ ] More than 50 cards → confirmation before the re-render
- [ ] Every toggle persists across a reload
- [ ] "Show layer name above the card" off → no title above the card on canvas,
      and none in a PNG export (D-022)
- [ ] Toggling it on → existing cards pick the descriptive name up on refresh
- [ ] Rename a card by hand → the name survives a refresh

## FR-11 · Dev mode

- [ ] All write actions disabled, banner visible
- [ ] Reading, filtering and navigating still work

## FR-12 · Canvas edits & reconciliation

- [x] Rewrite the label on the canvas → the panel shows the new text, no reset
- [x] Rewrite the label in the panel → the canvas text follows
- [ ] Alternate quickly between both → no flicker, no loop, no text loss
- [ ] Rewrite the category pill on the canvas → reset, exactly one toast
- [ ] Rewrite a property value / key → reset
- [ ] Delete a property row → restored with a toast
- [x] Change the card fill to red, then change the label in the panel → red survives
- [ ] Change card radius and padding → survive a sync
- [ ] Resize the card wider → `widthOverride` set, panel offers a reset
- [ ] Resize the card taller → snaps back to hug
- [ ] Drop an image and a text note into the card → survive three syncs
- [ ] Drag the card into a section → connector and endpoint follow into the same parent

## Robustness

- [ ] Label with 2000 characters
- [ ] Label with umlauts, emoji, RTL text
- [ ] 25 properties on one Figtation
- [ ] 200 Figtations on one page (performance, panel scroll)
- [ ] Delete a category used by 20 Figtations
- [ ] Delete all categories → "No category" still works
- [ ] Node with `figma.mixed` in fill, corner radius, stroke weight, font
- [ ] Node with bound variables in several fields
- [ ] Very small target (1 × 1 px) and very large target (10 000 px)

## Undo

- [ ] Create, edit, delete, arrange, import — one undo step each

## Performance (NFR-1 / NFR-2)

- [ ] Plugin start to interactive panel < 800 ms with 100 Figtations
- [ ] Sync after a node drag < 200 ms with 100 Figtations
- [ ] Read-back after a vector edit < 150 ms
