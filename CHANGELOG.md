# Changelog

All notable changes to Figtations are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-beta.1] - 2026-08-13

First beta. All eleven PRD milestones are implemented, the automated gate
(`npm run verify`) is green, and a smoke test in the Figma desktop client has
confirmed the core flows — including that Route A path editing works, which
settles D-003. Most of `docs/QA.md` remains unwalked; see _Not verified_ below.

### Added

- **Creating annotations (FR-1).** Label and pinned properties are composed in
  the panel and committed with a _Create annotation_ CTA, so nothing lands on the
  canvas until confirmed. Multi-selection creates one Figtation per target.
- **Card rendering (FR-2).** Each Figtation is an auto-layout `FrameNode` with a
  category pill, label and right-aligned property values. The renderer is
  idempotent — it updates the existing node instead of rebuilding it, so
  selection and undo history survive an edit.
- **Property engine (FR-3).** 33 property types resolve against the live node,
  including bound variables (shown by variable name), styles, mixed values and
  component/variant names. Component values link to their main component.
- **Categories (FR-4).** Own category register with name, colour and order;
  renaming or recolouring propagates to every card and connector that uses it.
- **Leader line (FR-5).** A real `VectorNode` plus endpoint dot, straight or
  elbow, recomputed whenever the card or the target moves. Locked and drawn
  behind the card.
- **Path editing (FR-5b, Route A).** _Edit line_ unlocks the connector for
  Figma's native vector edit mode; waypoints and tangents are read back and
  validated. Branched networks, closed loops and more than 12 inner waypoints are
  rejected with a toast, leaving the last valid route intact.
- **Free positioning and sync (FR-6).** Moving is native — the plugin reacts.
  Document changes are debounced at 120 ms, and a polling tracker keeps the line
  attached while a card is being dragged.
- **Panel, list and orphan handling (FR-7).** Resizable 360 × 560 panel with
  search and filters, detached/off-page detection, reattach and _keep as free
  note_.
- **Auto-arrange (FR-8).** Lays non-pinned cards out in a column beside their
  frames — the spec-sheet view — in one undo step.
- **Native bridge (FR-9).** Import from and export to Figma's own
  `node.annotations`, including category mapping, with orphans and free notes
  reported rather than silently skipped.
- **Settings (FR-10).** Card width, canvas theme, connector style, dashed lines,
  property values, auto-refresh on open, arrange gutter and side.
- **Dev Mode (FR-11).** Read-only mode with a banner; reading, filtering and
  navigating stay available.
- **Canvas edits and reconciliation (FR-12).** Labels rewritten directly on the
  canvas flow back into the plugin data; protected fields (category pill,
  property rows) are reset with a toast; user styling such as fill, radius and
  padding survives a sync.
- Privacy: `networkAccess` is `none`, no telemetry, fonts inlined as data URIs at
  build time — nothing is fetched at runtime.
- The panel header shows the full `package.json` version (`V1.0.0-BETA.1`) rather
  than a major.minor label, so a bug report identifies an exact build.

### Known limitations

Inherent to the Figma plugin API, not defects (PRD §3):

- Cards are real nodes, so they scale with the zoom and appear in the layer panel
  (C-1). The trade-off is that they show up in exports, presentations and
  screenshots.
- Live sync of lines and values only runs while the plugin is open (C-3). With
  the plugin closed, lines can go stale; reopening runs a full sync, and there is
  a _Refresh all_ button plus a relaunch button on every card.
- Dev Mode is read-only for plugins (C-2), so all write actions are disabled
  there.

### Not verified

- The manual acceptance pass is mostly outstanding: 12 of 138 criteria in
  `docs/QA.md` are ticked — the automated gate plus a functional smoke test in
  the desktop client (creation, path editing, reconciliation). The remaining 126
  have not been run, including both performance targets (NFR-1, NFR-2), the
  FR-5b robustness cases, Lifecycle, FR-6 and the native bridge (D-014).

### Internal

- `manifest.json` carries the plugin id `1669772164275856800`, issued by Figma via
  _Plugins → Development → New plugin_. This is the permanent id the plugin
  publishes updates to; it is not replaced at Community publish, and the PRD
  placeholder `TBD_AFTER_FIRST_PUBLISH` rested on a false premise (D-015). It
  replaces `1417382967104512873`, which had been fabricated to look like a Figma
  id in order to satisfy `setRelaunchData()`.
- The manifest has no version field; the released version is tracked in
  `package.json` and shown in the panel header.
- `manifest.name` is `Figtations (Beta)` so the Figma plugin list shows the
  build's status. The suffix lives in that one field and comes out again for the
  first stable release (D-032).
- ESLint now ignores `.context/**`, the Conductor scratch directory, so staged
  build output cannot fail the lint.
- `scripts/build-release.sh` builds the release artifact: clean install, verify,
  build, pack, then re-extract and diff the archive against `dist/` before
  printing the checksum. Fail-fast throughout, so a red gate cannot reach a zip.

[Unreleased]: https://github.com/conny-diez/Figtations/compare/v1.0.0-beta.1...HEAD
[1.0.0-beta.1]: https://github.com/conny-diez/Figtations/releases/tag/v1.0.0-beta.1
