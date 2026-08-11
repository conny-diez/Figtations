# PRD — Figtations

**Figma Plugin: verschiebbare Annotationen**
Version 1.0 · Stand 11.08.2026 · Zielgruppe dieses Dokuments: implementierender Coding-Agent (Claude Opus / Conductor)

---

## 0. Wie dieses Dokument zu benutzen ist

Dieses PRD ist die **einzige Quelle der Wahrheit** für v1. Es enthält bewusst konkrete Werte (Node-Typen, pluginData-Keys, Pixelwerte, Formatierungsregeln), damit keine Rückfragen nötig sind.

Regeln für den implementierenden Agenten:

1. Arbeite die Milestones in **§10** strikt der Reihe nach ab. Ein Milestone ist erst fertig, wenn **alle** Abnahmekriterien manuell im Figma-Desktop-Client verifizierbar sind.
2. Pro Milestone ein Branch + ein PR, Commit-Messages nach Conventional Commits.
3. **Sprache und Stack sind nicht verhandelbar:** TypeScript mit `strict: true`, Stack nach §4.1, getrennte tsconfigs nach §4.1b. Kein reines JavaScript, keine zusätzlichen Frameworks.
4. Wenn eine Anforderung technisch nicht umsetzbar ist: **nicht still umbauen.** Stattdessen in `docs/DECISIONS.md` dokumentieren (Problem, Optionen, gewählte Option, Begründung) und weiterarbeiten.
5. Alles, was in **§12 (Non-Goals)** steht, wird nicht gebaut — auch nicht „schnell mal mit".
6. Code, Identifier, UI-Strings und Kommentare in **Englisch**. Dieses PRD ist deutsch, der Code ist es nicht.

---

## 1. Problem & Motivation

Figmas natives Annotation-Feature ist funktional gut, hat aber drei harte Einschränkungen im Design-Alltag:

| Einschränkung                                                                                                                   | Auswirkung                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Annotationen sind **fest an den Node gepinnt** und werden automatisch platziert                                                 | Bei dichten Screens überlagern sich Annotationen, verdecken das Design oder landen an unlesbaren Stellen. Keine manuelle Korrektur möglich. |
| Annotationen sind **im Design Mode nahezu unsichtbar** (siehe Screenshot: „Annotations have limited visibility in design mode") | Der Handoff-Kontext ist in Reviews, Präsentationen, PDF-Exports und Screenshots nicht sichtbar. Für Stakeholder-Reviews unbrauchbar.        |
| Kein Layout-Einfluss, keine Gruppierung, keine Leserichtung                                                                     | Man kann keine „Spec-Sheet"-Ansicht bauen, in der Annotationen sauber in einer Spalte rechts vom Screen stehen.                             |

**Figtations** repliziert das native Feature möglichst 1:1 (Kategorien, Labels, gepinnte Properties, Werte-Formatierung) und ergänzt genau die fehlende Fähigkeit: **Annotationen sind frei auf dem Canvas positionierbar**, bleiben aber logisch und visuell (Leader-Line) mit ihrem Ziel-Node verbunden, und ihre Property-Werte bleiben live an den Node gekoppelt.

### Zielnutzer

Product Designer, die Handoff-Dokumentation direkt im Design-File erstellen und diese Dokumentation **im Design Mode** sichtbar brauchen — für Reviews mit PO/Entwicklung, für Anforderungs-Reviews und für Exporte.

### Erfolgskriterium v1

Ein Designer kann einen kompletten Screen (10–15 Annotationen) in unter 10 Minuten annotieren, die Annotationen so anordnen, dass nichts überlappt, und das Ergebnis als PNG/PDF exportieren, ohne den Design Mode zu verlassen.

---

## 2. Naming

**Entscheidung: Plugin-Name = `Figtations`**, Tagline = _„Annotations you can actually move."_

Begründung: „Better Annotations" ist generisch, nicht schützbar und in der Community-Suche gegen ein Dutzend ähnlicher Namen austauschbar. „Figtations" ist ein Portmanteau aus _Fig(ma)_ und _Annotations_ — merkfähig, selbsterklärend im Kontext und konsistent mit der etablierten `Fig-`-Namenskonvention der Community (Figmotion, Figstats).

**Vor der Veröffentlichung zu prüfen:** Figmas Brand- und Community-Richtlinien untersagen die Verwendung der Marke „Figma" in Plugin-Namen. „Figtations" enthält die Marke nicht vollständig und liegt damit voraussichtlich auf der sicheren Seite — die `Fig-`-Präfix-Praxis ist im Community-Katalog verbreitet und wird geduldet. Der Punkt ist trotzdem im Rahmen von M11 gegen die aktuellen Richtlinien zu verifizieren; fällt das Review negativ aus, ist der Fallback-Name `Movable Annotations` (Package/Namespace bleiben unverändert).

- Interner Package-Name: `figtations`
- pluginData-Namespace: `figtations` (siehe §5)
- Suchbegriffe für die Community-Beschreibung enthalten _annotations, handoff, spec, documentation, dev mode_ — damit ist die SEO-Funktion von „Better Annotations" abgedeckt, ohne den Namen zu verbrauchen.

---

## 3. Technische Grundannahmen & harte Constraints

Diese Punkte sind verifiziert und dürfen nicht umgangen werden. Sie erklären, warum die Architektur so aussieht wie in §4.

### C-1 — Plugins können den Canvas nicht überlagern

Es gibt keine API, um zoominvariante UI über dem Canvas zu zeichnen. Alles, was auf dem Canvas sichtbar sein soll, muss ein **echter Node** sein.

**Folge:** Eine Figtation ist ein `FrameNode` (Auto-Layout) auf dem Canvas, kein UI-Element. Konsequenzen, die als Feature kommuniziert werden:

- ✅ In allen Exporten, Präsentationen und Screenshots sichtbar
- ✅ Vom Nutzer nativ verschiebbar (das ist der Kern des Produkts)
- ⚠️ Skaliert mit dem Zoom (native Annotationen tun das nicht)
- ⚠️ Erscheint im Layer-Panel

### C-2 — Dev Mode ist für Plugins read-only

Im Dev Mode (`figma.editorType === 'dev'`) kann das Plugin das Dokument nicht verändern.

**Folge:** Manifest deklariert `"editorType": ["figma", "dev"]`. Im Dev Mode läuft das Plugin in einem **Read-Only-Modus**: Liste anzeigen, filtern, zu Annotationen navigieren, nach Native exportieren ist deaktiviert. Alle Schreib-Buttons sind disabled mit Hinweis „Switch to Design mode to edit".

### C-3 — Kein Drag-Event, kein kontinuierlicher Sync

Es gibt kein Event für „Nutzer zieht Node". Verfügbar ist `figma.on('documentchange', …)` — feuert nur, **während das Plugin geöffnet ist**.

**Folge (Sync-Modell):**

- Plugin offen → Leader-Lines und Property-Werte werden bei `documentchange` (debounced, 120 ms) aktualisiert.
- Plugin geschlossen → Zustand kann veralten (Nutzer verschiebt Frame, Line zeigt ins Leere).
- Beim Öffnen des Plugins läuft **immer** automatisch ein `syncAll()` über die aktuelle Seite.
- Zusätzlich: manueller Button „Refresh all" und `figma.setRelaunchData` auf jeder Card, damit der Nutzer aus dem Kontextmenü einer Annotation heraus resynchronisieren kann.

Dieses Verhalten muss in der Community-Beschreibung und im Empty State ehrlich erklärt werden. Es ist die zentrale Einschränkung des Produkts.

### C-4 — `documentAccess: "dynamic-page"`

Das Manifest nutzt `"documentAccess": "dynamic-page"`. Daraus folgt: alle Node-Zugriffe über `await figma.getNodeByIdAsync(id)`, Seiten über `await figma.loadAllPagesAsync()` bevor `figma.root.findAllWithCriteria` oder cross-page-Suche verwendet wird. **Kein** synchrones `figma.getNodeById`.

### C-5 — Native Annotation API (verifiziert)

```ts
// Auf SceneNode (FRAME, COMPONENT, COMPONENT_SET, INSTANCE, TEXT,
// RECTANGLE, ELLIPSE, LINE, POLYGON, STAR, VECTOR):
node.annotations: ReadonlyArray<Annotation>

interface Annotation {
  readonly label?: string
  readonly labelMarkdown?: string
  readonly properties?: ReadonlyArray<AnnotationProperty>  // { type: AnnotationPropertyType }
  readonly categoryId?: string
}

figma.annotations.getAnnotationCategoriesAsync(): Promise<AnnotationCategory[]>
figma.annotations.getAnnotationCategoryByIdAsync(id): Promise<AnnotationCategory | null>
figma.annotations.addAnnotationCategoryAsync({ label, color }): Promise<AnnotationCategory>

type AnnotationCategoryColor =
  'yellow' | 'orange' | 'red' | 'pink' | 'violet' | 'blue' | 'teal' | 'green'
```

`AnnotationPropertyType` (vollständige Liste, v1 unterstützt alle):
`width`, `height`, `maxWidth`, `minWidth`, `maxHeight`, `minHeight`, `fills`, `strokes`, `effects`, `strokeWeight`, `cornerRadius`, `textStyleId`, `textAlignHorizontal`, `fontFamily`, `fontStyle`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `itemSpacing`, `padding`, `layoutMode`, `alignItems`, `opacity`, `mainComponent`, `gridRowGap`, `gridColumnGap`, `gridRowCount`, `gridColumnCount`, `gridRowAnchorIndex`, `gridColumnAnchorIndex`, `gridRowSpan`, `gridColumnSpan`

**Wichtig:** Figtations verwendet **denselben Property-Type-Enum** wie Figma. Das macht Import/Export nach Native (§8, FR-9) verlustfrei und die Screenshots des Nutzers 1:1 reproduzierbar.

### C-6 — Kategorien: keine `remove`-API

Es gibt `addAnnotationCategoryAsync`, aber **keine** dokumentierte Methode zum Löschen oder Umbenennen nativer Kategorien.

**Folge:** Figtations führt ein **eigenes Kategorien-Register** in `figma.root` Shared Plugin Data (volle CRUD-Kontrolle) und mappt beim Native-Import/-Export gegen die nativen Kategorien (Match über `label` + `color`, sonst `addAnnotationCategoryAsync`).

### C-7 — Fonts müssen geladen werden

Vor jeder Text-Manipulation: `await figma.loadFontAsync({ family, style })`. Font-Strategie: versuche `Inter` in den Styles `Regular`, `Medium`, `Semi Bold`. Fällt das fehl, in dieser Reihenfolge weiter: `Roboto` → `Helvetica` → erster verfügbarer Font aus `figma.listAvailableFontsAsync()`. Der aufgelöste Font wird **einmal pro Session gecacht**.

### C-8 — Größenlimits pluginData

Ein pluginData-Wert ist auf ca. 100 kB begrenzt, das gesamte Dokument-Entry-Budget ist endlich. **Folge:** JSON kompakt halten (Kurz-Keys, keine Redundanz), keine berechneten Werte persistieren (Property-_Werte_ werden immer live aus dem Node gelesen, nur die _Auswahl_ der Properties wird gespeichert).

### C-9 — Griffe: kein Overlay, aber zwei nutzbare Mechanismen

Es gibt keine API für Overlay-UI, Hit-Testing, Drag-Events oder Custom-Cursor auf dem Canvas (folgt aus C-1). Trotzdem sind ziehbare Griffe an der Leader-Line möglich — über genau zwei Wege. Beide nutzen dasselbe Prinzip: **der Griff ist etwas Echtes, und Figma selbst übernimmt die Interaktion.**

**Route A — Nativer Vector-Edit-Mode (bevorzugt)**

Der Connector ist ein echter `VectorNode`. Selektiert der Nutzer ihn und drückt `Enter` (oder doppelklickt), öffnet Figma den eigenen Vector-Edit-Mode: echte Vertex- und Segment-Griffe, echtes Snapping, Bend-Tool, Vertex-Löschen per `Delete`. Das Plugin liest anschließend `node.vectorNetwork` zurück und übernimmt die Zwischenpunkte als `waypoints`.

Vorteile: keine eigenen Griff-Nodes, keine Handle-Sync-Kosten, keine Aufräum-Probleme, und die Interaktion fühlt sich exakt wie Figma an — weil sie Figma ist. Die Optik des Referenz-Screenshots entsteht dabei von selbst.

Grenzen, die im Spike (M7) zu verifizieren sind:

- Der Vector-Edit-Mode kann **nicht** programmatisch geöffnet werden. Das Plugin kann den Connector nur selektieren und den Hinweis „Press Enter to edit the line" anzeigen.
- Ob und wann `documentchange` während bzw. nach dem Vector-Editing feuert, ist zu messen. Fallback-Trigger: `selectionchange` beim Verlassen und der `Done`-Button im Panel.
- Der Connector muss zum Editieren **entsperrt** sein. Darum: `locked = true` im Normalzustand, `locked = false` nur während des Path-Edit-Modes.

**Route B — Eigene Griff-Nodes (Fallback)**

Kleine `EllipseNode`s als Griffe, die der Nutzer mit dem Move-Tool zieht; das Plugin liest die Position bei `documentchange` und rechnet den Pfad neu. Funktioniert garantiert, kostet aber Nodes, Sync-Zeit und Aufräum-Logik. Wird nur gebaut, wenn Route A im Spike durchfällt.

Für beide Routen gilt: Editieren funktioniert nur bei **geöffnetem Plugin** (C-3), und alle Gesten müssen mit **Ziehen** und **Delete** auskommen — Doppelklick, Hover und Rechtsklick stehen einem Plugin nicht zur Verfügung.

### C-10 — Der Canvas ist ein zweiter Eingabekanal

Sobald eine Figtation ein echter Frame ist (C-1), kann der Nutzer sie mit Figmas Bordmitteln bearbeiten: Text doppelklicken und umschreiben, Card resizen, Fill ändern, Kinder löschen. Das ist erwünscht (es ist das native Editiergefühl, das dem Native-Feature fehlt), kollidiert aber mit einem Renderer, der die Card aus pluginData neu aufbaut.

**Folge:** Der Renderer ist **kein Generator, sondern ein Reconciler.** Für jedes Feld muss festgelegt sein, welche Seite gewinnt. Diese Matrix ist normativ und steht in **FR-12**. Kernregel: Freitext (Label) → **Canvas gewinnt**, Rückschreibung in pluginData. Referenzen und abgeleitete Werte (Kategorie, Property-Werte) → **Plugin gewinnt**, Canvas-Edits werden beim Sync zurückgesetzt.

---

## 4. Architektur

### 4.1 Stack

| Bereich          | Wahl                                                                               | Begründung                                             |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Sprache          | TypeScript, `strict: true`                                                         | Plugin-Typings sind TS-first                           |
| Sandbox (`main`) | Plain TS, gebündelt mit esbuild zu einer IIFE                                      | Sandbox hat keine DOM/Browser-APIs                     |
| UI (iframe)      | React 18 + TypeScript, Vite + `vite-plugin-singlefile`                             | Manifest braucht **eine** HTML-Datei mit inline JS/CSS |
| Styling          | Plain CSS mit CSS-Custom-Properties, keine Framework-Dependency                    | Figma-Panel ist klein; Tailwind-Overhead unnötig       |
| Typings          | `@figma/plugin-typings` (aktuellste Version)                                       |                                                        |
| Tests            | `vitest` für pure Funktionen (Property-Formatter, Geometrie, Store-Serialisierung) | Figma-API ist nicht sinnvoll unit-testbar              |
| Lint/Format      | ESLint + Prettier                                                                  |                                                        |

**Keine** weiteren Runtime-Dependencies ohne Eintrag in `docs/DECISIONS.md`.

### 4.1b TypeScript-Konfiguration — zwei getrennte Contexts

Sandbox und UI laufen in **unterschiedlichen Laufzeitumgebungen**. Sie brauchen deshalb getrennte `tsconfig`-Dateien, sonst kompiliert Code, der zur Laufzeit crasht.

|            | Sandbox (`src/main`)                                                                                                                       | UI (`src/ui`)                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Laufzeit   | Figmas JS-Sandbox — **kein** DOM, **kein** `window`, **kein** `fetch`, kein `localStorage`, keine Timer-Garantien über `setTimeout` hinaus | Normaler Browser-iframe             |
| `lib`      | `["ES2017"]` — **DOM bewusst weggelassen**                                                                                                 | `["ES2020", "DOM", "DOM.Iterable"]` |
| `types`    | `["@figma/plugin-typings"]`                                                                                                                | `["vite/client"]`                   |
| `target`   | `ES2017`                                                                                                                                   | `ES2020`                            |
| Persistenz | `setSharedPluginData`, `figma.clientStorage`                                                                                               | keine eigene — alles über RPC       |

- Root-`tsconfig.json` enthält nur die gemeinsamen Optionen (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`), plus `tsconfig.main.json` und `tsconfig.ui.json`, die davon erben.
- `src/shared/**` wird von beiden Seiten importiert und darf deshalb **weder** Figma-APIs **noch** DOM-APIs berühren — nur pure TypeScript-Logik. Das ist per ESLint-Regel (`no-restricted-globals` für `window`, `document`, `figma` in `src/shared`) zu erzwingen, nicht per Konvention.
- `npm run typecheck` prüft beide Configs und ist Teil der Definition of Done jedes Milestones.

Häufiger Fehler, der damit ausgeschlossen wird: `fetch` oder `localStorage` im Sandbox-Code. Beides existiert dort nicht — Netzwerkzugriff ist ohnehin per Manifest untersagt (§4.3), Persistenz läuft über pluginData bzw. `figma.clientStorage`.

### 4.2 Repo-Struktur

```
/
├─ manifest.json
├─ package.json
├─ tsconfig.json
├─ vite.config.ts                 # UI build
├─ esbuild.main.mjs               # Sandbox build
├─ docs/
│  ├─ PRD.md                      # dieses Dokument
│  ├─ DECISIONS.md                # ADR-Log, vom Agenten zu pflegen
│  └─ QA.md                       # Testplan §11, als Checkliste
├─ src/
│  ├─ shared/                     # von main UND ui importiert, keine Figma-/DOM-APIs
│  │  ├─ types.ts                 # Figtation, FigtationCategory, Settings …
│  │  ├─ rpc.ts                   # Request/Response-Union + Typ-Guards
│  │  ├─ tokens.ts                # Card-Visual-Tokens (§7), Kategoriefarben
│  │  └─ format/
│  │     ├─ properties.ts         # PropertyType → Label + Value-Formatter (pure)
│  │     └─ geometry.ts           # Anchor-/Pfadberechnung (pure)
│  ├─ main/
│  │  ├─ index.ts                 # Entry, RPC-Router, Lifecycle
│  │  ├─ store.ts                 # sharedPluginData read/write, Schema-Migration
│  │  ├─ registry.ts              # Alle Figtations einer Seite/des Files finden
│  │  ├─ card.ts                  # Card-Node erzeugen/aktualisieren (Renderer)
│  │  ├─ connector.ts             # Leader-Line, Endpunkt-Dot, Routing anwenden
│  │  ├─ handles.ts               # Path-Edit-Mode: Griffe erzeugen, lesen, aufräumen
│  │  ├─ reconcile.ts             # Reverse-Sync Canvas → pluginData (FR-12)
│  │  ├─ probe.ts                 # Property-Werte aus Ziel-Node lesen (inkl. Variablen)
│  │  ├─ categories.ts            # CRUD eigenes Register + Native-Mapping
│  │  ├─ native.ts                # Import/Export node.annotations
│  │  ├─ sync.ts                  # syncAll, documentchange-Handler, Debounce
│  │  ├─ arrange.ts              # Auto-Arrange (FR-8)
│  │  └─ fonts.ts                 # Font-Resolution + Cache (C-7)
│  └─ ui/
│     ├─ index.html
│     ├─ main.tsx
│     ├─ App.tsx
│     ├─ rpc.ts                   # typed postMessage-Client mit Promises
│     ├─ components/
│     │  ├─ Editor.tsx            # Card-Editor (Kategorie, Label, Properties)
│     │  ├─ AnnotationList.tsx
│     │  ├─ CategoryManager.tsx    # Modal aus Screenshot 4
│     │  ├─ CategorySelect.tsx     # Dropdown aus Screenshot 5
│     │  ├─ PropertyPicker.tsx     # „+ Property"
│     │  ├─ ColorSwatches.tsx      # 8er-Palette aus Screenshot 3
│     │  └─ primitives/            # Button, Input, Select, Pill, Modal, Toast
│     └─ styles.css
└─ README.md
```

### 4.3 manifest.json

```json
{
  "name": "Figtations",
  "id": "TBD_AFTER_FIRST_PUBLISH",
  "api": "1.0.0",
  "main": "dist/main.js",
  "ui": "dist/ui.html",
  "editorType": ["figma", "dev"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] },
  "capabilities": [],
  "menu": [
    { "name": "Open Figtations", "command": "open" },
    { "separator": true },
    { "name": "Annotate selection", "command": "annotate-selection" },
    { "name": "Refresh all on this page", "command": "refresh-page" },
    { "name": "Arrange annotations", "command": "arrange" },
    { "separator": true },
    { "name": "Import native annotations", "command": "import-native" }
  ],
  "relaunchButtons": [
    { "command": "edit", "name": "Edit annotation" },
    { "command": "refresh-page", "name": "Refresh annotations" }
  ]
}
```

`networkAccess: none` ist bewusst gesetzt: das Plugin sendet keine Daten nach außen. Das ist ein Trust-Argument für die Community-Seite und beschleunigt das Review.

### 4.4 RPC-Protokoll

Typisiertes Request/Response über `postMessage`, jede Nachricht mit `id` für Promise-Auflösung. In `src/shared/rpc.ts`:

```ts
export type UiRequest =
  | { t: 'init' }
  | { t: 'getState' } // Kategorien, Settings, Selection-Kontext, Liste
  | { t: 'createFigtation'; targetId: string; draft: FigtationDraft }
  | { t: 'updateFigtation'; figtationId: string; patch: Partial<FigtationDraft> }
  | { t: 'deleteFigtation'; figtationId: string }
  | { t: 'duplicateFigtation'; figtationId: string }
  | { t: 'selectFigtation'; figtationId: string; zoom: boolean }
  | { t: 'selectTarget'; figtationId: string }
  | { t: 'reattach'; figtationId: string } // an aktuelle Selection neu binden
  | { t: 'enterPathEdit'; figtationId: string }
  | { t: 'exitPathEdit' }
  | { t: 'setRoute'; figtationId: string; mode: 'straight' | 'elbow'; cornerRadius?: number }
  | { t: 'resetRoute'; figtationId: string }
  | { t: 'setCardSide'; figtationId: string; side: CardSide }
  | { t: 'probeTarget'; targetId: string } // verfügbare Properties + Live-Werte
  | { t: 'listCategories' }
  | { t: 'upsertCategory'; category: FigtationCategory }
  | { t: 'deleteCategory'; categoryId: string; reassignTo: string | null }
  | { t: 'reorderCategories'; ids: string[] }
  | { t: 'refresh'; scope: 'page' | 'file' | 'one'; figtationId?: string }
  | { t: 'arrange'; scope: 'page' | 'selection'; options: ArrangeOptions }
  | { t: 'importNative'; scope: 'page' | 'file'; deleteSource: boolean }
  | { t: 'exportNative'; scope: 'page' | 'file' }
  | { t: 'updateSettings'; patch: Partial<Settings> }

export type MainEvent =
  | { t: 'state'; payload: PluginState }
  | { t: 'selectionChanged'; payload: SelectionContext }
  | { t: 'listChanged'; payload: FigtationSummary[] }
  | { t: 'probeResult'; targetId: string; payload: ProbedProperty[] }
  | { t: 'labelChangedOnCanvas'; figtationId: string; label: string }
  | { t: 'routeChanged'; figtationId: string; payload: RouteState }
  | { t: 'pathEditMode'; figtationId: string | null }
  | { t: 'toast'; level: 'info' | 'warn' | 'error'; message: string }
  | { t: 'error'; requestId: string; message: string }
  | { t: 'ok'; requestId: string; payload?: unknown }
```

**Fehlerregel:** Jeder Handler in `main` ist in try/catch gewrappt. Ein Fehler antwortet mit `{t:'error'}` **und** ruft `figma.notify(message, {error: true})`. Das Plugin darf niemals still fehlschlagen und niemals crashen.

---

## 5. Datenmodell & Persistenz

### 5.1 Namespace

Alles über `setSharedPluginData('figtations', key, value)` / `getSharedPluginData`. **Shared** (nicht privat), damit andere Tools und Agenten (z. B. Claude über einen Figma-MCP) die Annotationen lesen können. Das ist ein bewusster Interoperabilitäts-Entscheid.

### 5.2 Dokument-Ebene (`figma.root`)

| Key          | Inhalt                                        |
| ------------ | --------------------------------------------- |
| `schema`     | `"1"` — Schema-Version, Basis für Migrationen |
| `categories` | `FigtationCategory[]` als JSON                |
| `settings`   | `Settings` als JSON                           |

```ts
interface FigtationCategory {
  id: string // nanoid, plugin-eigen
  label: string
  color: AnnotationCategoryColor // exakt die 8 Figma-Werte (C-5)
  order: number
  nativeId?: string // Mapping auf Figma-Kategorie, falls bekannt
}

interface Settings {
  cardWidth: number // default 280, erlaubt 200–480
  theme: 'dark' | 'light' // default 'dark' (wie Screenshots)
  connectorStyle: 'straight' | 'elbow' // default 'elbow'
  connectorDashed: boolean // default false (durchgezogen, wie Referenz-Screenshot)
  connectorCornerRadius: number // default 12, erlaubt 0-32
  connectorWeight: number // default 1.5
  showEndpointDot: boolean // default true
  snapWaypoints: boolean // default true
  showPropertyValues: boolean // default true
  autoRefreshOnOpen: boolean // default true
  arrangeGutter: number // default 80, Abstand Card ↔ Zielframe bei Auto-Arrange
  arrangeSide: 'right' | 'left' // default 'right'
}
```

### 5.3 Card-Node (`FrameNode`, der Container einer Figtation)

| Key             | Inhalt                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`          | `"card"`                                                                                                                                                                                                                       |
| `id`            | `string` — Figtation-ID (nanoid), stabil über Copy/Paste hinweg **nicht** garantiert → siehe §5.6                                                                                                                              |
| `targetId`      | Node-ID des annotierten Nodes, `""` bei freistehender Annotation                                                                                                                                                               |
| `targetName`    | Letzter bekannter Name des Ziels (für Orphan-Anzeige)                                                                                                                                                                          |
| `categoryId`    | `""` = keine Kategorie                                                                                                                                                                                                         |
| `label`         | Plaintext des Labels                                                                                                                                                                                                           |
| `props`         | `string[]` als JSON — Liste von `AnnotationPropertyType`, **Reihenfolge = Anzeigereihenfolge**                                                                                                                                 |
| `connectorId`   | Node-ID der Leader-Line, `""` wenn keine                                                                                                                                                                                       |
| `endpointId`    | Node-ID des Endpunkt-Dots am Ziel, `""` wenn keiner                                                                                                                                                                            |
| `pinned`        | `"1"` = Position ist manuell gesetzt, Auto-Arrange überspringt sie                                                                                                                                                             |
| `route`         | `"auto"` \| `"custom"` — `custom`, sobald der Nutzer einen Griff bewegt hat                                                                                                                                                    |
| `routeMode`     | `"straight"` \| `"elbow"` — Basis-Routing, überschreibt `settings.connectorStyle` pro Figtation                                                                                                                                |
| `waypoints`     | `[number, number][]` als JSON — **absolute Canvas-Koordinaten** der Zwischenpunkte, leer bei `route:"auto"`, max. 12                                                                                                           |
| `tangents`      | JSON — optionale Bezier-Tangenten pro Segment, falls der Nutzer im Vector-Edit-Mode Kurven gezogen hat (FR-5b); leer bei rein orthogonalen Routen                                                                              |
| `cardSide`      | `"auto"` \| `"left"` \| `"right"` \| `"top"` \| `"bottom"` — Austrittsseite an der Card                                                                                                                                        |
| `anchor`        | `[u, v]` als JSON — normalisierte Position des Ziel-Ankers auf der Ziel-Bounding-Box, jeweils 0…1. Default `"auto"` (nächstliegender Randpunkt). Normalisiert, damit der Anker beim Resizen des Ziels proportional mitwandert. |
| `widthOverride` | Zahl als String, wenn der Nutzer die Card manuell resized hat; `""` = `settings.cardWidth`                                                                                                                                     |
| `rev`           | Integer, wird bei jedem Render inkrementiert (Debug/Diagnose)                                                                                                                                                                  |

### 5.3b Kind-Nodes der Card

Anders als in einer früheren Fassung dieses Dokuments tragen **die Kinder der Card pluginData** — sonst ist der Reverse-Sync aus C-10 nicht implementierbar (Node-Namen sind vom Nutzer änderbar und damit als Identifikator unbrauchbar).

| Key    | Inhalt                                                                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role` | `"header"` \| `"pill"` \| `"pill-text"` \| `"label"` \| `"properties"` \| `"row"` \| `"row-key"` \| `"row-value"` \| `"swatch"` \| `"divider"` \| `"badge"` |
| `prop` | nur bei `role:"row"` — der `AnnotationPropertyType` dieser Zeile                                                                                            |

Kinder **ohne** `role` sind Nutzer-Ergänzungen (eigene Bilder, Pfeile, Notizen). Der Renderer lässt sie unangetastet und sortiert sie unter die von ihm verwalteten Sektionen (FR-12).

### 5.4 Connector-, Endpunkt- und Handle-Nodes

**Connector** (`VectorNode`):

| Key      | Inhalt                            |
| -------- | --------------------------------- |
| `type`   | `"connector"`                     |
| `cardId` | Figtation-ID der zugehörigen Card |

**Endpunkt-Dot** (`EllipseNode`, am Ziel-Anker):

| Key      | Inhalt       |
| -------- | ------------ |
| `type`   | `"endpoint"` |
| `cardId` | Figtation-ID |

**Handle** (`EllipseNode`, nur im Path-Edit-Mode sichtbar):

| Key      | Inhalt                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| `type`   | `"handle"`                                                                                                 |
| `cardId` | Figtation-ID                                                                                               |
| `kind`   | `"vertex"` (existierender Waypoint) \| `"segment"` (Mittelpunkt eines Segments) \| `"anchor"` (Ziel-Anker) |
| `index`  | Index des Waypoints bzw. des Segments                                                                      |

Connector und Endpunkt-Dot sind immer `locked = true`. **Handles sind `locked = false`** — sie müssen ziehbar sein. Alle vier Node-Sorten liegen im selben Parent wie die Card (§FR-1) und heißen `Figtation connector` / `Figtation endpoint` / `Figtation handle`.

### 5.5 Ziel-Node

**Auf dem Ziel-Node wird nichts geschrieben.** Grund: Ziele liegen häufig innerhalb von Instances; pluginData dort ist fragil (Reset Overrides, Component-Updates) und schreibende Zugriffe können ungewollte Overrides erzeugen. Die Beziehung ist einseitig: Card → Target. Der Rückweg (welche Figtations hängen an Node X) wird über `registry.ts` berechnet.

### 5.6 Registry & Lookup

`registry.ts` findet Figtations so:

```ts
// Primär (schnell):
const nodes = figma.currentPage.findAllWithCriteria({
  pluginData: { keys: [] }, // ggf. Namespace-Filter je Typings-Version
})
```

**Robustheitsanforderung:** `findAllWithCriteria` mit pluginData-Kriterium ist je nach Typings-Version unterschiedlich verfügbar. Implementiere `registry.findCards(page)` mit **Feature-Detection und Fallback** auf `page.findAll(n => n.getSharedPluginData('figtations','type') === 'card')`. Der Fallback wird auf großen Seiten spürbar langsamer sein — deshalb Ergebnis pro Session in einer `Map<pageId, CardIndex>` cachen und bei `documentchange` mit `CREATE`/`DELETE` invalidieren.

**Duplikat-Handling:** Kopiert der Nutzer eine Card (Cmd+D oder Copy/Paste), wird die `id` mitkopiert. Beim nächsten `syncAll()` erkennt die Registry doppelte IDs und vergibt für alle bis auf die zuerst gefundene eine neue `id` samt neuem Connector. Cards, deren `targetId` auf einer anderen Seite liegt (Cross-Page-Paste), verlieren ihren Connector und werden als Orphan markiert.

---

## 6. Funktionale Anforderungen

Priorisierung: **P0** = v1-Blocker, **P1** = v1 gewünscht, **P2** = nach Release.

---

### FR-1 · Figtation erstellen — P0

**Flow**

1. Nutzer selektiert genau einen Node auf dem Canvas.
2. Panel zeigt den Editor mit: Kategorie-Dropdown (Default „No category"), Label-Textarea (Placeholder „Add an annotation"), `+ Property`-Button. Das entspricht Screenshot 6/8.
3. `+ Property` öffnet eine durchsuchbare Liste **nur der Properties, die auf diesem Node-Typ existieren** (siehe FR-3). Bereits hinzugefügte Properties sind ausgegraut.
4. Beim ersten Property-Add oder beim Verlassen des Label-Felds mit nicht-leerem Inhalt wird die Card auf dem Canvas erzeugt (Live-Preview-Prinzip: es gibt kein separates „Save").
5. Der Editor bleibt offen und editiert ab jetzt die existierende Figtation.

**Initiale Platzierung**

- Ziel-Bounding-Box über `absoluteBoundingBox` ermitteln.
- Card rechts vom **äußersten Frame-Vorfahren** des Ziels platzieren, mit `settings.arrangeGutter` Abstand, vertikal am Ziel oben ausgerichtet.
- Kollisionsvermeidung: existierende Cards auf der Seite einsammeln; überlappt die neue Position, um `cardHeight + 16` nach unten schieben, maximal 40 Versuche, dann trotzdem platzieren.
- `pinned = "0"` (Position ist noch nicht manuell bestätigt).

**Parent-Wahl**

- Hat das Ziel einen `SECTION`-Vorfahren → Card und Connector werden Kinder derselben Section (damit Section-Moves beides mitnehmen).
- Sonst → direkte Kinder von `figma.currentPage`.
- Card **niemals** in den Ziel-Frame legen (würde dessen Auto-Layout und Größe verändern).

**Mehrfachauswahl**

Bei mehreren selektierten Nodes: Editor zeigt „3 layers selected — annotate all". Bestätigen erzeugt eine Figtation pro Node mit identischem Label/Kategorie/Properties.

**Abnahme**

- [ ] Card erscheint auf dem Canvas, verändert das Ziel-Layout nicht
- [ ] Ziel-Node bleibt nach dem Erstellen selektiert (Selection wird nicht geklaut)
- [ ] Zweite Figtation am selben Node überlappt die erste nicht
- [ ] Undo (Cmd+Z) entfernt Card **und** Connector in einem Schritt
- [ ] Erstellung an einem Node innerhalb einer Instance funktioniert und erzeugt keinen Override am Ziel

---

### FR-2 · Card-Rendering — P0

Die Card wird als `FrameNode` mit vertikalem Auto-Layout gebaut. Vollständige Visual-Spec in **§7**. Der Renderer ist **idempotent**: `renderCard(figtation)` erzeugt bei Bedarf, aktualisiert sonst — und baut nicht jedes Mal neu (sonst verliert der Nutzer Selection und Undo-Historie wird verrauscht).

**Node-Struktur**

```
Frame  "Figtation — {label|category|'Annotation'}"     ← Card, trägt pluginData
├─ Frame  "header"            (horizontal, hug, gap 8, nur wenn Kategorie gesetzt)
│  └─ Frame  "category-pill"  (hug, radius 6, fill = Kategoriefarbe)
│     └─ Text  "Navigation"
├─ Text   "label"             (fill-width, nur wenn Label nicht leer)
└─ Frame  "properties"        (vertikal, fill-width, gap 4, nur wenn props.length > 0)
   └─ Frame  "row"            (horizontal, fill-width, space-between)  × n
      ├─ Text  "key"          "Width"
      └─ Frame "value"        (horizontal, hug, gap 6)
         ├─ Rect "swatch"     (10×10, radius 2 — nur bei fills/strokes)
         └─ Text "val"        "414px"
```

**Regeln**

- Leere Sektionen werden **entfernt**, nicht auf Höhe 0 gesetzt.
- Card-Breite = `settings.cardWidth`, fix. Höhe = hug.
- Card ist `locked = false` (muss verschiebbar sein), `expanded = false` im Layer-Panel.
- Alle Kinder-Nodes tragen kein pluginData — nur die Card selbst.
- `setRelaunchData(card, { edit: 'Edit this annotation' })`.
- Textfarben/Abstände ausschließlich aus `shared/tokens.ts`, keine Magic Numbers im Renderer.

**Abnahme**

- [ ] Card sieht dem Native-Panel aus Screenshot 2 optisch entsprechend aus (dunkle Card, farbige Kategorie-Pill, Label, Property-Rows mit rechtsbündigen Werten)
- [ ] Label-Änderung im Panel aktualisiert die Card ohne Neuerstellung (Node-ID bleibt identisch)
- [ ] Property entfernen entfernt genau eine Row, Card-Höhe schrumpft
- [ ] 20 Properties in einer Card → keine Überlappung, kein Text-Clipping
- [ ] Umlaute, Emoji und mehrzeilige Labels rendern korrekt

---

### FR-3 · Property-Engine — P0

Das Herzstück der Native-Parität. Zwei Teile: **Verfügbarkeit** (welche Properties gibt es an diesem Node) und **Formatierung** (wie sieht der Wert aus).

#### 3a Verfügbarkeit

`probe.ts` liefert pro Ziel-Node `ProbedProperty[]`:

```ts
interface ProbedProperty {
  type: AnnotationPropertyType
  key: string // Anzeige-Label, z. B. "Width", "Alignment"
  value: string // formatierter Wert
  swatch?: RGB // nur fills/strokes
  variable?: string // Variablenname, falls gebunden
  available: boolean // false → im Picker ausgegraut
}
```

Verfügbarkeitsregeln:

| Property-Gruppe                                                                                                          | Verfügbar wenn                    |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `width`, `height`, `opacity`                                                                                             | immer                             |
| `min/maxWidth`, `min/maxHeight`                                                                                          | Node hat das Feld und Wert ≠ null |
| `layoutMode`, `alignItems`, `itemSpacing`, `padding`                                                                     | `layoutMode !== 'NONE'`           |
| `grid*`                                                                                                                  | `layoutMode === 'GRID'`           |
| `cornerRadius`                                                                                                           | Node hat `cornerRadius`           |
| `fills`, `strokes`, `strokeWeight`, `effects`                                                                            | Node hat das jeweilige Feld       |
| `fontFamily`, `fontStyle`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlignHorizontal`, `textStyleId` | `node.type === 'TEXT'`            |
| `mainComponent`                                                                                                          | `node.type === 'INSTANCE'`        |

#### 3b Formatierung

**Reihenfolge der Auflösung pro Wert:** (1) gebundene Variable → (2) Style → (3) Rohwert.

1. **Variable:** `node.boundVariables?.[field]` → `await figma.variables.getVariableByIdAsync(id)` → `variable.name` ausgeben (z. B. `color/neutral/0`, wie in Screenshot 6). Bei gebundenen Werten wird der Wert im Panel mit einem Token-Chip markiert.
2. **Style:** `fillStyleId` / `strokeStyleId` / `textStyleId` → `await figma.getStyleByIdAsync(id)` → `style.name`.
3. **Rohwert** nach folgender Tabelle:

| Type                            | Anzeige-Key                     | Format                                                                                                                                         | Beispiel          |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `width` / `height`              | Width / Height                  | `{n}px`, gerundet auf 2 Dezimalen, `.0*` gestrippt                                                                                             | `414px`           |
| `min/maxWidth`, `min/maxHeight` | Min width / Max width / …       | wie oben, `null` → weglassen                                                                                                                   | `320px`           |
| `layoutMode`                    | Direction                       | `VERTICAL`→`Vertical`, `HORIZONTAL`→`Horizontal`, `GRID`→`Grid`, `NONE`→`None`                                                                 | `Vertical`        |
| `alignItems`                    | Alignment                       | Kombination aus `primaryAxisAlignItems` + `counterAxisAlignItems`, siehe Matrix unten                                                          | `Top center`      |
| `itemSpacing`                   | Gap                             | `{n}px`; bei `primaryAxisAlignItems === 'SPACE_BETWEEN'` → `Auto`                                                                              | `0px`             |
| `padding`                       | Padding                         | alle 4 gleich → `{n}px`; vertikal==vertikal & horizontal==horizontal → `{v}px {h}px`; sonst `{t}px {r}px {b}px {l}px`                          | `0px`             |
| `fills`                         | Fill                            | Variable → Name; Style → Name; sonst `#RRGGBB` (+ ` {opacity}%` wenn <100); mehrere → erster + ` +{n}`; `figma.mixed` → `Mixed`; leer → `None` | `color/neutral/0` |
| `strokes`                       | Stroke                          | wie `fills`                                                                                                                                    | `#E5E5E5`         |
| `strokeWeight`                  | Stroke weight                   | `{n}px`, `figma.mixed` → `Mixed`                                                                                                               | `1px`             |
| `cornerRadius`                  | Corner radius                   | `{n}px`; `figma.mixed` → `{tl}px {tr}px {br}px {bl}px`                                                                                         | `8px`             |
| `effects`                       | Effects                         | Style-Name, sonst `{n} effect(s)`, leer → `None`                                                                                               | `Shadow/sm`       |
| `opacity`                       | Opacity                         | `{round(o*100)}%`                                                                                                                              | `100%`            |
| `fontFamily`                    | Font                            | `fontName.family`, `mixed` → `Mixed`                                                                                                           | `Inter`           |
| `fontStyle`                     | Font style                      | `fontName.style`                                                                                                                               | `Semi Bold`       |
| `fontSize`                      | Font size                       | `{n}px`                                                                                                                                        | `16px`            |
| `fontWeight`                    | Font weight                     | numerisch aus `fontWeight`                                                                                                                     | `600`             |
| `lineHeight`                    | Line height                     | `AUTO`→`Auto`; `PIXELS`→`{n}px`; `PERCENT`→`{n}%`                                                                                              | `24px`            |
| `letterSpacing`                 | Letter spacing                  | `PIXELS`→`{n}px`; `PERCENT`→`{n}%`                                                                                                             | `0px`             |
| `textAlignHorizontal`           | Text align                      | Title Case                                                                                                                                     | `Left`            |
| `textStyleId`                   | Text style                      | Style-Name, leer → `None`                                                                                                                      | `body/md`         |
| `mainComponent`                 | Component                       | Instance mit Variant-Properties → `k=v` der `VARIANT`-Props, komma-separiert; sonst `mainComponent.name`                                       | `variant=single`  |
| `grid*`                         | Grid row gap / Grid columns / … | Zahl bzw. `{n}px`                                                                                                                              | `2` / `8px`       |

**Alignment-Matrix** (`layoutMode === 'VERTICAL'`; bei `HORIZONTAL` Achsen tauschen):

| counterAxis ↓ / primaryAxis → | MIN           | CENTER          | MAX            | SPACE_BETWEEN          |
| ----------------------------- | ------------- | --------------- | -------------- | ---------------------- |
| MIN                           | Top left      | Center left     | Bottom left    | Space between left     |
| CENTER                        | Top center    | Center          | Bottom center  | Space between center   |
| MAX                           | Top right     | Center right    | Bottom right   | Space between right    |
| BASELINE                      | Baseline left | Baseline center | Baseline right | Baseline space between |

Der Screenshot-Wert `Top center` bestätigt diese Matrix.

**Alle Formatter sind pure functions in `shared/format/properties.ts` und werden mit vitest getestet** — inklusive `figma.mixed`, `null`, negativen Werten, Nachkommastellen (`413.99` → `414px`? **Nein**: auf 2 Dezimalen runden, trailing Nullen strippen → `413.99px`. Nur exakte Ganzzahlen erscheinen ohne Dezimalstellen.)

**Abnahme**

- [ ] Ein Node mit gebundener Fill-Variable zeigt den Variablennamen, nicht den Hex-Wert
- [ ] Ein Node mit Mixed Corner Radius zeigt vier Werte
- [ ] Eine Instance zeigt ihre Variant-Properties analog zu Screenshot 6 (`variant=single`)
- [ ] Alle 33 Property-Typen sind implementiert; unbekannte Typen fallen auf `—` zurück statt zu crashen
- [ ] Unit-Test-Coverage der Formatter ≥ 90 %

---

### FR-4 · Kategorien — P0

Nachbau von Screenshot 3, 4 und 5.

**Seed:** Existiert kein Kategorien-Register, wird es beim ersten Start initialisiert. Reihenfolge und Farben exakt nach Screenshot 4:

| #   | Label           | Farbe  |
| --- | --------------- | ------ |
| 1   | Navigation      | green  |
| 2   | Interaction     | blue   |
| 3   | Accessibility   | pink   |
| 4   | Content         | orange |
| 5   | Component       | violet |
| 6   | Rule            | red    |
| 7   | Haptic Feedback | teal   |
| 8   | Behaviour       | yellow |
| 9   | Development     | green  |
| 10  | Change          | pink   |

Zusätzlich: falls native Kategorien im File existieren (`getAnnotationCategoriesAsync`), werden diese beim Seed **stattdessen** übernommen (Match über Label+Farbe), damit der Nutzer seine gewachsenen Kategorien behält.

**Category Manager (Modal, Screenshot 4)**

- Zeilen mit: Drag-Handle (Reorder), Farb-Dropdown, Label-Input, Minus-Button (Löschen)
- `+` im Header fügt eine leere Zeile hinzu
- Farb-Dropdown = 8 Swatches in genau der Reihenfolge `yellow, orange, red, pink, violet, blue, teal, green` (Screenshot 3), aktive Auswahl mit blauem Ring
- Footer: `Cancel` / `Done` — Änderungen werden erst mit `Done` committed
- **Doppelte Labels sind erlaubt** (Screenshot 4 zeigt „Behaviour" und „Behavior" parallel) — kein Blocker, aber eine dezente Warnung „Similar name exists"
- Löschen einer benutzten Kategorie: Dialog „3 annotations use this category" mit Optionen _Remove category from them_ / _Move to …_ / _Cancel_

**Category Select (Dropdown, Screenshot 5)**

- Erste Zeile „No category" mit Häkchen bei Auswahl
- Darunter alle Kategorien mit farbigem Punkt
- Footer-Zeile „Edit categories…" öffnet den Manager

**Abnahme**

- [ ] Kategorien überleben Plugin-Schließen und File-Reload
- [ ] Umbenennen aktualisiert alle Cards, die diese Kategorie nutzen (Pill-Text)
- [ ] Farbwechsel aktualisiert Pill-Fill **und** Connector-Farbe aller betroffenen Cards
- [ ] Reorder per Drag persistiert
- [ ] `Cancel` verwirft alle Änderungen im Modal restlos

---

### FR-5 · Leader-Line (Connector) — P0

Jede Figtation zeigt dauerhaft auf genau ein Ziel-Element. Die Verbindung ist ein **eigener Node**, keine UI (C-1), und wird bei jeder Bewegung von Card oder Ziel neu berechnet (FR-6).

**Node:** `VectorNode` via `figma.createVector()`, befüllt mit **`await node.setVectorNetworkAsync(network)`** — nicht über `vectorPaths`. Grund: `VectorVertex` besitzt ein Feld `cornerRadius`, mit dem Figma die Ecken selbst rundet. Das ersetzt handgebaute Bezier-Fillets vollständig und liefert die Optik des Referenz-Screenshots ohne eigene Kurvenmathematik. Zweiter Grund: Ein Vector-Network ist die Struktur, die Figmas nativer Vector-Edit-Mode schreibt — nur so ist die Rückwärtsrichtung aus FR-5b verlustfrei lesbar.

```ts
// Route: absolute Punkte -> Node-lokal, erster Punkt = Node-Position
await vec.setVectorNetworkAsync({
  vertices: pts.map((p, i) => ({
    x: p.x - origin.x,
    y: p.y - origin.y,
    // Ecken runden, Endpunkte nicht:
    cornerRadius: i === 0 || i === pts.length - 1 ? 0 : cornerRadius,
    strokeCap: 'ROUND',
    strokeJoin: 'ROUND',
  })),
  segments: pts.slice(1).map((_, i) => ({ start: i, end: i + 1 })),
  regions: [],
})
```

Unter `documentAccess: "dynamic-page"` ist `vectorNetwork` **read-only** — Schreiben ausschließlich über `setVectorNetworkAsync()` (C-4). Lesen bleibt synchron möglich und ist die Grundlage von FR-5b.

**Routing** (pure, in `shared/format/geometry.ts`, vollständig unit-getestet):

| Modus      | Pfad                                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `straight` | Direkte Linie Card-Anker → Ziel-Anker                                                                                                                                                                                                                                   |
| `elbow`    | Orthogonale Route. Achsen-Reihenfolge nach Austrittsseite: seitlicher Austritt → horizontal zuerst, vertikaler Austritt → vertikal zuerst. Standard-Route: Austritt 24 px senkrecht aus der Card, dann orthogonal zum Ziel-Anker, Eintritt 24 px senkrecht in das Ziel. |
| `custom`   | Polylinie über `waypoints`, danach zum Ziel-Anker. Segmente werden auf achsparallel gesnappt, wenn die Abweichung ≤ 4 px ist.                                                                                                                                           |

**Ecken-Rundung:** Über `cornerRadius` pro Vertex, Wert aus `settings.connectorCornerRadius` (default **12**). Figma klemmt den Radius selbst auf die verfügbare Segmentlänge; eine eigene Klemmung ist nicht nötig, der Wert wird aber defensiv auf `min(radius, halbe Länge des kürzeren Nachbarsegments)` begrenzt, damit die Route bei sehr kurzen Segmenten vorhersehbar bleibt.

**Styling** (Werte in `shared/tokens.ts`)

- `strokes`: Kategoriefarbe; ohne Kategorie Neutral `#8C8C8C`
- `strokeWeight`: **1.5**
- `dashPattern`: `[]` (default **durchgezogen**, wie im Referenz-Screenshot); gestrichelt `[4,4]` per `settings.connectorDashed`
- `strokeCap`: `ROUND`, `strokeJoin`: `ROUND`
- `locked = true` im Normalzustand, `name = "Figtation connector"`. Im Path-Edit-Mode temporär `locked = false` (C-9).
- **Z-Order:** direkt unter der Card, damit die Card die Linie überdeckt

**Endpunkt-Dot** (`EllipseNode`, entspricht dem runden Endpunkt im Referenz-Screenshot) — default **an**:

- 8×8 px, zentriert auf dem Ziel-Anker
- Fill = Kategoriefarbe, Stroke = `#FFFFFF` 1.5 px (Kontrast auf hellen und dunklen Flächen)
- `locked = true`, Z-Order über dem Connector, unter der Card

**Anker-Berechnung**

1. Bounding-Boxen von Card und Ziel absolut über `absoluteBoundingBox`.
2. **Card-Anker:** `cardSide === 'auto'` → Kante, die dem Ziel zugewandt ist (Vergleich der Mittelpunkt-Deltas; bei `|dx| >= |dy|` links/rechts, sonst oben/unten), Mittelpunkt dieser Kante. Sonst die explizit gewählte Kante.
3. **Ziel-Anker:** `anchor === 'auto'` → der Punkt auf dem Ziel-Rand, der dem Card-Anker am nächsten liegt (Clamp auf die Bounding-Box). Sonst `[u,v]` normalisiert auf die aktuelle Ziel-Box — dadurch wandert ein manuell gesetzter Anker beim Resizen des Ziels **proportional** mit.
4. Parent-Umrechnung: liegt der Connector in einer Section, absolute → Parent-lokale Koordinaten.
5. Überlappen Card und Ziel vollständig → Connector und Endpunkt `visible = false`.
6. Ziel ist rotiert → `absoluteBoundingBox` (achsparallele Hülle) verwenden, keine Rotationsmathematik. Bewusste Vereinfachung, in DECISIONS.md festhalten.

**Abnahme**

- [ ] Card an eine beliebige Canvas-Stelle ziehen → Linie folgt, Endpunkt bleibt exakt am Ziel
- [ ] Ziel verschieben → Linie folgt
- [ ] Ziel resizen → Anker bleibt am Rand bzw. proportional an seiner relativen Position
- [ ] Elbow-Route hat sichtbar runde Ecken und keine Knickartefakte
- [ ] Card links / rechts / über / unter dem Ziel → jeweils plausible Austrittsseite
- [ ] Connector und Endpunkt sind nicht selektierbar und liegen hinter der Card
- [ ] Card löschen → Connector **und** Endpunkt werden mitgelöscht
- [ ] Ziel löschen → siehe FR-7 (Orphan)

---

### FR-5b · Pfad-Editing — P1

Der Nutzer soll den Verlauf der Linie frei verändern können, mit Griffen direkt an der Linie. Umsetzung über **Route A** aus C-9; Route B nur als Fallback nach dem Spike.

#### Route A — nativer Vector-Edit-Mode (Primärimplementierung)

**Ablauf**

1. Panel-Button `Edit line` (aktiv, wenn genau eine Figtation selektiert ist) — oder Klick auf die Route-Vorschau im Editor.
2. Das Plugin setzt `connector.locked = false`, selektiert den Connector (`figma.currentPage.selection = [connector]`), zoomt ihn bei Bedarf ins Bild und zeigt im Panel den Hinweis: **„Press Enter to edit the line. Drag the handles, then click Done."** Der Vector-Edit-Mode lässt sich nicht programmatisch öffnen (C-9) — dieser Hinweis ist der Ersatz.
3. Der Nutzer editiert mit Figmas eigenen Werkzeugen: Vertex ziehen, Segment ziehen (erzeugt einen neuen Vertex), Vertex mit `Delete` entfernen, Bend-Tool für Kurven. Snapping, Guides und Undo kommen von Figma.
4. Das Plugin liest `connector.vectorNetwork` (synchron lesbar, auch unter `dynamic-page`) bei jedem der folgenden Trigger: `documentchange` auf dem Connector, `selectionchange` (Verlassen der Selektion), Klick auf `Done`.
5. **Rückübernahme:** Vertices → absolute Canvas-Koordinaten umrechnen (`connector.x/y` plus lokale Position, ggf. Parent-Offset). Erster und letzter Vertex sind die Anker und werden **verworfen**; alles dazwischen wird als `waypoints` gespeichert, `route = "custom"` gesetzt. Weicht der letzte Vertex um mehr als 24 px vom Ziel-Anker ab, wird er als neuer `anchor` interpretiert und normalisiert gespeichert (Clamp auf die Ziel-Box).
6. `Done` setzt `connector.locked = true` zurück und verlässt den Modus.

**Re-Anchoring danach:** Bei jedem folgenden Sync werden nur der erste und letzte Vertex neu gesetzt; die inneren Waypoints bleiben unangetastet (bzw. wandern mit der Card, FR-6). Kurven-Tangenten, die der Nutzer mit dem Bend-Tool erzeugt hat, werden **erhalten**: `tangentStart` / `tangentEnd` der inneren Segmente werden beim Neuschreiben des Netzwerks mitgeführt. Damit funktioniert auch freies Kurven-Editing, ohne dass es das Plugin selbst implementieren muss.

**Verlassen des Modus** durch: `Done`, Escape, Selektion außerhalb der Figtation, Plugin-Schließen. In jedem Fall wird der Connector wieder gesperrt. **Sweep beim Start:** `syncAll()` sperrt alle Connector-Nodes, damit ein Absturz keine entsperrten Linien hinterlässt.

**Grenzen**

- Maximal **12 innere Waypoints**. Mehr wird beim Zurücklesen abgelehnt (Toast), das Netzwerk wird auf die letzten gültigen Waypoints zurückgesetzt.
- Verzweigte Vector-Networks (mehr als zwei Segmente an einem Vertex, geschlossene Loops) sind keine gültige Route. Erkennung beim Zurücklesen → Toast „Line must be a single open path" + `Reset line` anbieten.
- `Reset line` verwirft alle Waypoints, Tangenten und Anker-Overrides und stellt die automatische Route wieder her.

#### Route B — eigene Griff-Nodes (Fallback, nur falls Spike scheitert)

`EllipseNode`s mit pluginData `type:"handle"` (§5.4), sichtbar nur im Path-Edit-Mode, außerhalb `visible = false` (sonst erscheinen sie in Exporten). Griff-Typen: `vertex` (10×10, Fill weiß, Stroke Kategoriefarbe 2 px), `segment` (8×8, Kategoriefarbe 60 % Opacity, am Segment-Mittelpunkt, erzeugt beim Ziehen einen neuen Waypoint), `anchor` (10×10 am Ziel-Anker, Position auf den Ziel-Rand geklemmt). Ziehen wird über `documentchange` mit 80 ms Debounce gelesen; Waypoint löschen = Griff selektieren und `Delete`; Snapping auf 8-px-Raster plus Achsengleichheit mit Ankern und Nachbarpunkten (Toleranz 6 px, `settings.snapWaypoints`). Nach jeder Änderung werden **alle** Griffe neu positioniert, geschützt durch den `isWriting`-Guard.

#### Panel (für beide Routen gleich)

Route-Vorschau als kleines SVG, Umschalter `Straight` / `Elbow`, Corner-Radius-Slider, Austrittsseite (`Auto` / `Left` / `Right` / `Top` / `Bottom`), `Reset line`, `Done`.

**Abnahme**

- [ ] `Edit line` selektiert den Connector, entsperrt ihn, Hinweistext erscheint
- [ ] `Enter` öffnet Figmas Vector-Edit-Mode; Vertex- und Segment-Griffe sind sichtbar und ziehbar
- [ ] Segment ziehen → neuer Knick, Ecke ist gerundet, beide Enden bleiben verbunden
- [ ] `Done` → Waypoints sind in pluginData gespeichert, Connector wieder gesperrt
- [ ] Danach Card verschieben → gebogener Verlauf wandert mit, Form bleibt erhalten
- [ ] Danach Ziel verschieben → nur das letzte Segment folgt, Waypoints bleiben stehen
- [ ] Mit dem Bend-Tool erzeugte Kurve überlebt drei Sync-Runden
- [ ] Vertex in Figma löschen → Route schließt sich sauber
- [ ] Letzten Vertex vom Ziel wegziehen → wird als neuer Anker übernommen und geklemmt
- [ ] Verzweigtes Netzwerk erzeugen (Vertex mit drei Segmenten) → Toast, Route bleibt gültig
- [ ] `Reset line` stellt die automatische Route wieder her
- [ ] Plugin hart schließen → kein entsperrter Connector, keine sichtbaren Griffe
- [ ] PNG-Export enthält keine Editier-Artefakte
- [ ] Undo über eine Vector-Edit-Session hinweg lässt keinen inkonsistenten Zustand zurück

---

### FR-6 · Freies Positionieren & Sync — P0

Das Kernfeature. Das Verschieben selbst passiert **nativ** (Nutzer zieht den Frame) — das Plugin muss nur korrekt reagieren.

**`documentchange`-Handler**

```
on documentchange(events):
  filter relevante Events:
    - PROPERTY_CHANGE mit properties ∩ {x, y, width, height, rotation,
      layoutMode, itemSpacing, padding*, fills, strokes, cornerRadius, …}
    - CREATE / DELETE
  → betroffene Figtations bestimmen (Card verschoben ODER Ziel verändert)
  → debounce 120 ms, coalesce nach Figtation-ID
  → pro Figtation: connector.update() und, wenn Ziel-Properties betroffen, card.update()
```

**Performance-Budget:** 100 Figtations auf einer Seite, Nutzer zieht einen Frame → Sync ≤ 200 ms, keine sichtbaren Ruckler. Erreicht durch: Debounce, Property-Whitelist, Ziel-Index (`Map<targetId, figtationId[]>`), und **keine** vollständige Seiten-Traversierung im Hot Path.

**Manuelles Verschieben markieren:** Bewegt der Nutzer eine Card, wird `pinned = "1"` gesetzt. Auto-Arrange (FR-9) respektiert das.

**Waypoints mitwandern lassen:** Ändert sich `card.x/y` und ist `route === "custom"`, werden **alle** Waypoints um dasselbe Delta verschoben, bevor der Pfad neu berechnet wird. Der gebogene Verlauf bleibt damit relativ zur Card erhalten, während das Zielende am Ziel klebt — das ist das Verhalten, das beim Verschieben einer Annotation erwartet wird. Bewegt sich stattdessen das **Ziel**, bleiben die Waypoints unangetastet und nur das letzte Segment folgt. Siehe D-4.

**Handle-Sync:** Ist eine Figtation im Path-Edit-Mode, werden Positionsänderungen ihrer Handle-Nodes mit 80 ms Debounce verarbeitet (Waypoint bzw. Anker aktualisieren → Pfad neu → **alle** Handles neu positionieren, inklusive der Segment-Griffe, deren Mittelpunkte sich verschoben haben). Der `isWriting`-Guard verhindert, dass das Neupositionieren der Handles einen weiteren Zyklus auslöst.

**`syncAll(scope)`**

Läuft beim Plugin-Öffnen (wenn `settings.autoRefreshOnOpen`), per Menü-Command und per Button. Ablauf: Registry aufbauen → Duplikat-IDs auflösen → pro Figtation Ziel auflösen, Card neu rendern, Connector neu berechnen → Orphans markieren → Progress via `figma.notify` bei > 50 Items → Abschluss-Toast „Refreshed 42 annotations".

**Abnahme**

- [ ] Card an eine völlig andere Canvas-Stelle ziehen → Verbindung bleibt korrekt
- [ ] Plugin schließen, Frame verschieben, Plugin öffnen → Linien sind nach dem Auto-Sync wieder korrekt
- [ ] Padding am Ziel ändern → Property-Wert in der Card aktualisiert sich
- [ ] Stresstest 100 Figtations: Drag bleibt flüssig
- [ ] Kein Sync-Loop (Card-Update triggert kein weiteres Update — Guard-Flag während eigener Schreibvorgänge)

---

### FR-7 · Panel, Liste & Orphan-Handling — P0

**Panel-Größe:** 360 × 560, resizable via `figma.ui.resize`, letzte Größe in `figma.clientStorage`.

**Zwei Tabs**

_Tab „Annotate"_ — kontextsensitiv zur Selection:

- Nichts selektiert → Empty State: „Select a layer to annotate" + Kurzhinweis auf das Sync-Verhalten (C-3)
- Layer selektiert, keine Figtation → Editor im Erstellmodus (FR-1)
- Layer selektiert, hat Figtation(s) → Liste dieser Figtations, erste aufgeklappt im Editmodus
- Figtation-Card selektiert → direkt der Editor dieser Figtation (Verhalten von `relaunchData`)

_Tab „All"_ — alle Figtations der Seite:

- Suchfeld (Label-Volltext + Ziel-Name)
- Filter-Chips pro Kategorie (multi-select) + „Orphans"
- Sortierung: Canvas-Reihenfolge (Y dann X) | Kategorie | zuletzt geändert
- Zeile: Kategorie-Punkt · Label (2 Zeilen max) · Ziel-Name · `{n} props`
- Klick → Card selektieren; Doppelklick → `figma.viewport.scrollAndZoomIntoView`
- Zeilen-Kontextmenü: Edit · Select target · Duplicate · Delete
- Bulk-Bar bei Mehrfachauswahl: Kategorie setzen · Löschen · Arrangieren

**Footer:** `Refresh` · `Arrange` · Settings-Zahnrad · Counter „42 annotations on this page"

**Orphan-Handling** (Ziel existiert nicht mehr):

- Card bekommt einen sichtbaren Zustand: 1px dashed Stroke `#FF6B6B`, Header-Chip `⚠ Detached`
- Connector wird gelöscht
- In der Liste rot markiert mit Ziel-Name aus `targetName`
- Aktionen: `Reattach` (an aktuelle Selection binden) · `Keep as free note` (Warnung entfernen, `targetId=""`) · `Delete`
- Ist `targetId` gesetzt, aber der Node liegt auf einer **anderen Seite**: Zustand „Off-page", nicht „Detached" — Connector unsichtbar, Liste zeigt Seitennamen

**Abnahme**

- [ ] Selection-Wechsel auf dem Canvas aktualisiert das Panel ohne merkbare Verzögerung
- [ ] Ziel löschen → Card wird beim nächsten Sync als Detached markiert, das Plugin crasht nicht
- [ ] Reattach an einen neuen Node stellt Connector und Live-Werte wieder her
- [ ] Suche und Filter arbeiten kombiniert
- [ ] Panel funktioniert bei 0 und bei 200 Figtations

---

### FR-8 · Auto-Arrange — P1

Ein Command, der alle nicht-gepinnten Cards einer Seite (oder der Selection) in eine saubere Spalte neben den Frames legt — die „Spec-Sheet"-Ansicht, die das Native-Feature nicht kann.

**Algorithmus**

1. Cards nach Ziel-Frame (äußerster Frame-Vorfahre) gruppieren.
2. Pro Gruppe: Cards nach Ziel-Y, dann Ziel-X sortieren (Leserichtung).
3. X-Position = Frame-Rechtskante + `arrangeGutter` (bzw. Linkskante − Gutter − Cardbreite bei `arrangeSide: 'left'`).
4. Y beim Ziel-Y der ersten Card starten; jede Card mindestens auf Höhe ihres Ziels, aber nie überlappend mit der vorherigen (`prevBottom + 16`).
5. Gepinnte Cards (`pinned="1"`) werden nicht bewegt, gelten aber als Hindernis.
6. Alle Connectors neu berechnen.
7. Ein Undo-Schritt für die gesamte Operation, Toast „Arranged 18 annotations".

**Abnahme**

- [ ] Nach Arrange überlappt keine Card eine andere und keine Card ihren Ziel-Frame
- [ ] Gepinnte Cards bleiben, wo sie sind
- [ ] Cmd+Z stellt alle Positionen wieder her
- [ ] Bei zwei Frames nebeneinander landen die Cards jeweils an ihrem eigenen Frame

---

### FR-9 · Native-Bridge (Import / Export) — P1

**Import** (`node.annotations` → Figtations)

- Scope: aktuelle Seite oder ganzes File (bei File: `await figma.loadAllPagesAsync()`)
- Pro nativer Annotation eine Figtation: `label` bzw. aus `labelMarkdown` gestrippter Plaintext, `properties` 1:1 (identischer Enum, C-5), `categoryId` gemappt auf das eigene Register (Match über Label+Farbe, sonst neu anlegen)
- Option „Delete native annotations after import" (default **aus**)
- Dry-Run-Vorschau: „Found 23 native annotations on 14 layers. Import?"

**Export** (Figtations → `node.annotations`)

- Setzt `node.annotations` auf dem Ziel. Kategorien werden über `label`+`color` gematcht, sonst per `addAnnotationCategoryAsync` erzeugt.
- Warnung vorab: „This overwrites existing native annotations on 12 layers." — Merge ist nicht möglich, weil `annotations` als Ganzes gesetzt wird.
- Orphans und freie Notizen werden übersprungen (Report im Toast).

Damit ist Figtations kein Datensilo: Der Nutzer kann jederzeit zwischen Native und Figtations wechseln, und Dev-Mode-Nutzer sehen die Annotationen auch im nativen Panel.

**Abnahme**

- [ ] Round-Trip Native → Figtations → Native verliert keine Labels, Properties oder Kategorien
- [ ] Import über mehrere Seiten funktioniert
- [ ] Kategorien, die es nativ nicht gibt, werden korrekt angelegt

---

### FR-10 · Settings — P1

Kleines Panel hinter dem Zahnrad, alle Werte aus §5.2: Card-Breite (Slider 200–480, live), Theme (Dark/Light), Connector-Stil (Straight/Elbow), gestrichelt (Toggle), Property-Werte anzeigen (Toggle), Auto-Refresh beim Öffnen (Toggle), Arrange-Gutter (Number), Arrange-Seite (Left/Right).

Änderungen an Card-Breite und Theme lösen ein Re-Render aller Cards der Seite aus (mit Bestätigung, wenn > 50 Cards).

**Light Theme:** Card-Background `#FFFFFF`, Border `#E5E5E5` 1px, Label `#1A1A1A`, Property-Key `#757575`, Property-Value `#1A1A1A`. Kategorie-Pill behält die Farbe, Pill-Text bleibt weiß.

---

### FR-11 · Dev-Mode-Modus — P1

Bei `figma.editorType === 'dev'`: Banner „Read-only in Dev mode — switch to Design mode to edit", alle mutierenden Controls disabled, Liste/Filter/Navigation voll funktionsfähig.

---

### FR-12 · Canvas-Editierbarkeit & Reconciliation — P0

Umsetzung von C-10. Diese Matrix ist **normativ** — jede Zeile ist einzeln zu implementieren und in der QA abzuprüfen.

| Element                                                 | Auf dem Canvas editierbar | Autorität  | Verhalten                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Label-Text**                                          | ✅ Doppelklick, tippen    | **Canvas** | Reverse-Sync: Text wird bei `documentchange` in `pluginData.label` geschrieben. Panel-Feld aktualisiert sich live.                                                                                                                |
| Label-Text im Panel geändert                            | —                         | **Plugin** | Schreibt in den Text-Node. Einziger Pfad, auf dem der Renderer Text _überschreibt_.                                                                                                                                               |
| Label vollständig gelöscht (Node oder Inhalt)           | ✅                        | Canvas     | `label = ""`, Label-Sektion wird beim nächsten Render entfernt                                                                                                                                                                    |
| **Kategorie-Pill-Text**                                 | ❌                        | **Plugin** | Ist eine Referenz auf das Register, kein Freitext. Canvas-Edit wird beim nächsten Sync zurückgesetzt, einmalig mit Toast: „Category names are managed in the plugin". Umbenennen ausschließlich über den Category Manager (FR-4). |
| Kategorie-Zuweisung, Kategorie-Farbe                    | ❌                        | Plugin     | nur über Dropdown / Manager                                                                                                                                                                                                       |
| **Property-Keys** (z. B. „Width")                       | ❌                        | Plugin     | Beim Sync zurückgesetzt                                                                                                                                                                                                           |
| **Property-Werte** (z. B. „414px")                      | ❌                        | Plugin     | Abgeleitet aus dem Ziel-Node. Beim Sync zurückgesetzt. Wer den Wert ändern will, ändert das Design.                                                                                                                               |
| Properties hinzufügen / entfernen / umsortieren         | ❌                        | Plugin     | Rows dürfen nicht per Hand gelöscht werden — wird beim Sync wiederhergestellt. Ausnahme: siehe „Row-Node fehlt" unten.                                                                                                            |
| **Card-Position**                                       | ✅                        | Canvas     | `pinned = "1"`, Connector folgt (FR-6)                                                                                                                                                                                            |
| **Card-Breite** (Resize)                                | ✅                        | Canvas     | Wird als `widthOverride` gespeichert; `settings.cardWidth` gilt dann nicht mehr für diese Figtation. Panel zeigt „Custom width — reset".                                                                                          |
| Card-Höhe                                               | ❌                        | Plugin     | Höhe ist immer Hug. Manueller Resize wird auf Hug zurückgesetzt.                                                                                                                                                                  |
| **Card-Styling** (Fill, Radius, Stroke, Effects)        | ✅                        | **Canvas** | Der Renderer setzt Styling **nur bei der Erstellung** und bei einem Theme-Wechsel, nie im laufenden Sync. Dadurch bleiben eigene Farbanpassungen erhalten.                                                                        |
| Card-Auto-Layout-Werte (Padding, Gap)                   | ✅                        | Canvas     | Wie Styling: nach der Erstellung nicht mehr überschrieben                                                                                                                                                                         |
| **Eigene Kinder** in der Card (Bilder, Notizen, Shapes) | ✅                        | Canvas     | Kinder ohne `role` (§5.3b) bleiben erhalten und werden unter die verwalteten Sektionen einsortiert                                                                                                                                |
| **Linien-Verlauf** (Handles)                            | ✅                        | Canvas     | `waypoints`, `route = "custom"` (FR-5b)                                                                                                                                                                                           |
| Linien-Farbe, -Stärke, -Dash                            | ❌                        | Plugin     | Aus Kategorie + Settings abgeleitet, wird beim Sync neu gesetzt                                                                                                                                                                   |
| Connector / Endpunkt verschieben                        | ❌ (gelockt)              | Plugin     | Nicht selektierbar                                                                                                                                                                                                                |
| **Card löschen**                                        | ✅                        | Canvas     | Kaskade: Connector, Endpunkt, Handles werden mitgelöscht                                                                                                                                                                          |
| Connector löschen (nach Entsperren)                     | ✅                        | Canvas     | Wird beim nächsten Sync neu erzeugt                                                                                                                                                                                               |
| Card in anderen Frame/Section verschieben               | ✅                        | Canvas     | Parent-Wechsel wird akzeptiert; Connector wandert in denselben Parent                                                                                                                                                             |
| Ziel-Zuordnung                                          | ❌                        | Plugin     | Nur über `Reattach` (FR-7). Drag des Anchor-Griffs auf einen anderen Node ist v1 **nicht** enthalten (§12).                                                                                                                       |

**Renderer-Regeln, die daraus folgen** (`main/card.ts`):

1. `renderCard()` arbeitet **diffbasiert**: Kinder werden über `role` gefunden, nicht über Index oder Name. Fehlt ein Node mit erwarteter Rolle, wird er erzeugt; existiert er, werden nur geänderte Felder gesetzt.
2. **Text wird nie ungefragt geschrieben.** Der Renderer setzt einen Text nur, wenn die Änderung aus dem Plugin kommt (`source: 'plugin'` im Render-Aufruf). Bei `source: 'sync'` gilt der Canvas-Text als Wahrheit und wird nach pluginData zurückgeschrieben.
3. Styling- und Layout-Properties werden nur bei `source: 'create'` und `source: 'theme'` gesetzt.
4. **Row-Node fehlt:** Hat der Nutzer eine Property-Row gelöscht, wird sie beim nächsten Sync neu erzeugt — mit einem Toast „Restored 1 property row. Remove properties in the plugin instead." Kein stilles Wiederherstellen.
5. **Sync-Loop-Guard:** Vor jedem eigenen Schreibvorgang wird ein Flag gesetzt (`isWriting`), `documentchange`-Events werden während dieser Zeit verworfen. Ohne diesen Guard erzeugt der Reverse-Sync eine Endlosschleife.

**Reverse-Sync-Erkennung:** Im `documentchange`-Handler wird bei `PROPERTY_CHANGE` mit `characters` geprüft, ob der geänderte Node ein `role: "label"`-Kind einer Card ist (über `node.parent`-Kette bis zur Card mit `type: "card"`, max. 4 Ebenen). Trifft zu → `label` aktualisieren, Panel benachrichtigen. Trifft `role: "pill-text"` oder `role: "row-key"` / `role: "row-value"` zu → zurücksetzen + Toast (throttled auf einen Toast pro 5 s).

**Abnahme**

- [ ] Label auf dem Canvas umschreiben → Panel zeigt den neuen Text, ohne dass er zurückgesetzt wird
- [ ] Label im Panel umschreiben → Canvas-Text folgt
- [ ] Beides schnell abwechselnd → kein Flackern, kein Loop, kein Textverlust
- [ ] Kategorie-Pill auf dem Canvas umschreiben → wird zurückgesetzt, Toast erscheint einmal
- [ ] Property-Wert auf dem Canvas umschreiben → wird zurückgesetzt
- [ ] Card-Fill auf Rot ändern, dann Label im Panel ändern → Rot bleibt erhalten
- [ ] Card resizen → Breite bleibt, Höhe springt auf Hug zurück
- [ ] Eigenes Bild in die Card ziehen → überlebt drei Sync-Runden
- [ ] Property-Row löschen → wird mit Toast wiederhergestellt

---

## 7. Visual Spec der Card (Dark Theme)

Alle Werte gehören nach `src/shared/tokens.ts`. Basis: Screenshots 1, 2 und 6.

### Card

| Eigenschaft   | Wert                                                 |
| ------------- | ---------------------------------------------------- |
| Fill          | `#2C2C2C`                                            |
| Corner radius | 13                                                   |
| Stroke        | `#3D3D3D`, 1px, inside                               |
| Effect        | Drop shadow, `rgba(0,0,0,0.28)`, blur 16, offset y 4 |
| Layout        | vertical, padding 16, gap 12                         |
| Width         | `settings.cardWidth` (fix), Height hug               |

### Kategorie-Pill

| Eigenschaft   | Wert                                         |
| ------------- | -------------------------------------------- |
| Fill          | Kategoriefarbe (Tabelle unten)               |
| Corner radius | 6                                            |
| Padding       | 5 vertikal, 10 horizontal                    |
| Text          | 13px / Semi Bold / `#FFFFFF`, line-height 16 |

### Label

13px / Regular / `#FFFFFF`, line-height 20, `textAutoResize: HEIGHT`, `layoutSizingHorizontal: FILL`.

### Property-Row

| Element                               | Wert                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Row                                   | horizontal, fill-width, `primaryAxisAlignItems: SPACE_BETWEEN`, `counterAxisAlignItems: CENTER`, min height 24, gap 12 |
| Key                                   | 13px / Regular / `#A1A1A1`                                                                                             |
| Value                                 | 13px / Regular / `#FFFFFF`, `textAlignHorizontal: RIGHT`                                                               |
| Swatch                                | 10×10, radius 2, Stroke `rgba(255,255,255,0.15)` 1px                                                                   |
| Token-Chip (gebundene Variable)       | Fill `rgba(94,140,255,0.18)`, radius 4, padding 1/5, Text `#A9C1FF`                                                    |
| Row-Gap                               | 4                                                                                                                      |
| Trenner zwischen Label und Properties | 1px Line `#3D3D3D`, full width, oben und unten 4px Abstand — **nur** wenn Label und Properties beide vorhanden         |

### Kategoriefarben

Exakt die 8 Werte aus `AnnotationCategoryColor` (C-5). Hex-Werte sind an die Screenshots angenäherte Figma-Palette:

| Name     | Hex       | Verwendung im Screenshot |
| -------- | --------- | ------------------------ |
| `yellow` | `#E5B800` | Behaviour, Behavior      |
| `orange` | `#D9822B` | Content                  |
| `red`    | `#D93F2B` | Rule                     |
| `pink`   | `#D93FA8` | Accessibility, Change    |
| `violet` | `#8B5CF6` | Component                |
| `blue`   | `#3B82F6` | Interaction              |
| `teal`   | `#3A7D8C` | Haptic Feedback          |
| `green`  | `#2E9E5B` | Navigation, Development  |

---

## 8. Plugin-UI (Panel) — Stil

Das Panel folgt Figmas eigener Dark-UI (Screenshots 3–5), nutzt aber **keine** privaten Figma-Assets.

| Token              | Wert                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| `--bg`             | `#2C2C2C`                                                                        |
| `--bg-elevated`    | `#383838`                                                                        |
| `--bg-input`       | `#3D3D3D`                                                                        |
| `--border`         | `#4A4A4A`                                                                        |
| `--text`           | `#FFFFFF`                                                                        |
| `--text-secondary` | `#A1A1A1`                                                                        |
| `--accent`         | `#0D99FF` (Primary Button, Focus Ring)                                           |
| `--danger`         | `#F24822`                                                                        |
| Font               | `Inter, system-ui, sans-serif`, Basis 11px (Figma-Panel-Konvention), Inputs 12px |
| Radius             | 6 (Inputs, Buttons), 13 (Modals)                                                 |
| Row-Höhe           | 32                                                                               |

**Accessibility:** Vollständige Tastaturbedienbarkeit (Tab-Order, Enter/Escape in Modals, Arrow-Keys in Dropdowns), sichtbarer 2px Focus-Ring in `--accent`, `aria-label` auf allen Icon-only-Buttons, Kontrast ≥ 4.5:1 für Text. Kategorien werden **nie** nur über Farbe kommuniziert — immer Farbe + Label.

---

## 9. Nicht-funktionale Anforderungen

| ID    | Anforderung                                                                                                                                                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | Plugin-Start bis interaktives Panel < 800 ms bei 100 Figtations auf der Seite                                                                                                                                                                                                                   |
| NFR-2 | Sync nach Node-Drag < 200 ms bei 100 Figtations (§FR-6). Rückübernahme nach Vector-Edit < 150 ms. Node-Budget pro Figtation bei Route A: 1 Card + n Kinder + 1 Connector + 1 Endpunkt — **keine** zusätzlichen Handle-Nodes. Bei Route B zusätzlich max. 26 Handles, nur im Edit-Mode sichtbar. |
| NFR-3 | Kein Datenverkehr nach außen (`networkAccess: none`), keine Telemetrie, keine externen Fonts oder Assets                                                                                                                                                                                        |
| NFR-4 | Jede Nutzeraktion ist mit **einem** Cmd+Z rückgängig zu machen                                                                                                                                                                                                                                  |
| NFR-5 | Keine unbehandelten Exceptions: globaler Handler in `main` und `ui`, jeder Fehler wird als Toast/`figma.notify` sichtbar                                                                                                                                                                        |
| NFR-6 | Kein Zustand geht verloren, wenn Figma abstürzt — alles liegt in pluginData, nichts nur im Memory                                                                                                                                                                                               |
| NFR-7 | UI-Strings zentral in `src/ui/strings.ts` (i18n-vorbereitet, v1 nur Englisch)                                                                                                                                                                                                                   |
| NFR-8 | Kompatibel mit Multiplayer: parallele Bearbeitung derselben Figtation führt nicht zu Datenverlust (Last-write-wins ist akzeptabel, Corruption nicht)                                                                                                                                            |
| NFR-9 | `strict` TypeScript, 0 ESLint-Errors, kein `any` außerhalb dokumentierter API-Grenzen                                                                                                                                                                                                           |

---

## 10. Milestones

Reihenfolge ist verbindlich. Jeder Milestone endet mit einem lauffähigen, in Figma manuell testbaren Plugin.

### M0 · Setup — Fundament

Repo-Struktur nach §4.2, Manifest nach §4.3, Build-Pipeline (esbuild für `main`, Vite+singlefile für `ui`), `npm run dev` mit Watch, `npm run build`, ESLint/Prettier/vitest, README mit Import-Anleitung („Plugins → Development → Import from manifest").
**Abnahme:** Plugin lässt sich in Figma importieren, öffnet ein Panel mit „Figtations", RPC-Roundtrip (`init` → `state`) funktioniert nachweislich.

### M1 · Datenmodell & Store

`shared/types.ts`, `main/store.ts` (shared pluginData, Schema-Version, Migrations-Hook), `main/registry.ts` mit Feature-Detection und Fallback (§5.6), `main/fonts.ts`.
**Abnahme:** Testbefehl schreibt und liest eine Figtation-Struktur, überlebt Reload; Registry findet 3 manuell mit pluginData markierte Nodes.

### M2 · Property-Engine

`shared/format/properties.ts` (alle 33 Typen, Tabelle in FR-3b), `main/probe.ts` inkl. Variablen- und Style-Auflösung. Vitest-Suite.
**Abnahme:** Panel zeigt für einen selektierten Node alle verfügbaren Properties mit korrekt formatierten Live-Werten. Kriterien aus FR-3 erfüllt.

### M3 · Card-Renderer

`main/card.ts`, `shared/tokens.ts`, Dark Theme.
**Abnahme:** FR-2 vollständig. Visueller Vergleich gegen Screenshot 2 dokumentiert (Screenshot in `docs/`).

### M4 · Editor & Erstellung

`ui/Editor.tsx`, `PropertyPicker`, Selection-Handling, FR-1 komplett.
**Abnahme:** FR-1 vollständig, inkl. Mehrfachauswahl und Undo.

### M5 · Kategorien

`main/categories.ts`, `CategoryManager`, `CategorySelect`, `ColorSwatches`, Seeding.
**Abnahme:** FR-4 vollständig, visuell konsistent mit Screenshots 3–5.

### M6 · Connector, Sync & Reconciliation — **der Kern-Milestone**

`shared/format/geometry.ts` (Routing inkl. Bezier-Rundungen), `main/connector.ts` (Linie + Endpunkt-Dot), `main/sync.ts` mit Debounce, Ziel-Index und `isWriting`-Guard, `main/reconcile.ts` (Reverse-Sync des Labels, Zurücksetzen geschützter Felder).
**Abnahme:** FR-5, FR-6 und FR-12 vollständig, inkl. Stresstest mit 100 Figtations. Vor Abschluss dieses Milestones wird nichts anderes gebaut.

### M7 · Pfad-Editing

**Beginnt mit einem Spike (max. 1 Arbeitseinheit), bevor Produktionscode entsteht.** Zu klären, jeweils mit Ergebnis in `docs/DECISIONS.md`:

1. Kann der Nutzer einen per `setVectorNetworkAsync` erzeugten Connector im nativen Vector-Edit-Mode bearbeiten, und liest `vectorNetwork` die Änderungen anschließend korrekt zurück?
2. Welche Events feuern dabei wann — `documentchange` während des Editierens, erst beim Verlassen, oder gar nicht? Danach richtet sich der Trigger für die Rückübernahme.
3. Überleben `tangentStart` / `tangentEnd` das Neuschreiben beim Re-Anchoring?
4. Verhalten von `cornerRadius` pro Vertex bei kurzen Segmenten.

Fällt Punkt 1 oder 2 durch, wird Route B (eigene Griff-Nodes, `main/handles.ts`) gebaut — der Spike entscheidet, nicht die Präferenz.

Danach: Rückübernahme in `waypoints`, Anker-Erkennung, Lock-Lifecycle plus Sweep, Validierung verzweigter Netzwerke, Route-Vorschau und `Reset line` im Panel.

**Abnahme:** FR-5b vollständig für die gewählte Route. Besonders zu verifizieren: kein entsperrter Connector nach hartem Plugin-Kill, keine Editier-Artefakte in Exporten.

### M8 · Liste, Filter, Orphans

Tab „All", Suche, Filter, Bulk-Aktionen, Orphan- und Off-page-Zustände.
**Abnahme:** FR-7 vollständig.

### M9 · Auto-Arrange & Settings

`main/arrange.ts`, Settings-Panel, Light Theme, Card-Breite-Re-Render.
**Abnahme:** FR-8 und FR-10 vollständig.

### M10 · Native-Bridge & Dev Mode

`main/native.ts`, Import/Export mit Vorschau, Read-Only-Modus.
**Abnahme:** FR-9 und FR-11 vollständig, Round-Trip-Test grün.

### M11 · Härtung & Release

Vollständiger QA-Durchlauf (§11), Performance-Messung gegen NFR-1/2, Fehlerpfade, Empty States, README + Community-Beschreibung (inkl. ehrlicher Erklärung von C-1 und C-3), Cover-Art-Spezifikation, `docs/DECISIONS.md` final.
**Abnahme:** Alle Checklistenpunkte aus §11 abgehakt, `npm run build` sauber, Plugin als Private Plugin veröffentlicht.

---

## 11. QA-Checkliste (nach `docs/QA.md` übernehmen)

**Lifecycle**

- [ ] Plugin öffnen/schließen/öffnen — kein Zustandsverlust, keine doppelten Event-Listener
- [ ] File schließen und neu öffnen — alle Figtations intakt
- [ ] Zweite Figma-Instanz auf demselben File (Multiplayer) — keine Datenkorruption

**Selection & Ziele**

- [ ] Ziel: Frame, Text, Instance, Component, Component Set, Rectangle, Vector, Group _(Group unterstützt keine nativen Annotationen — Figtations muss es trotzdem sauber handhaben oder klar ablehnen; Entscheidung in DECISIONS.md festhalten)_
- [ ] Ziel innerhalb einer Instance
- [ ] Ziel innerhalb einer Section
- [ ] Ziel in verschachteltem Auto-Layout
- [ ] Ziel ist selbst eine Figtation-Card → verhindern, mit Hinweis

**Linie & Pfad-Editing**

- [ ] Auto-Route bei Card links / rechts / oben / unten vom Ziel
- [ ] Runde Ecken bei sehr kurzen Segmenten (Radius wird geklemmt, kein Artefakt)
- [ ] 12 Waypoints setzen, dann Card verschieben → Form bleibt erhalten
- [ ] 13. Waypoint → wird mit Toast abgelehnt, letzter gültiger Zustand bleibt
- [ ] Anchor-Griff auf jede der vier Ziel-Kanten ziehen, danach Ziel resizen → Anker bleibt proportional
- [ ] Anchor-Griff weit vom Ziel wegziehen → springt zurück
- [ ] Vector-Edit-Mode: Vertex löschen, Segment ziehen, Bend-Tool, jeweils Rückübernahme prüfen
- [ ] Verzweigtes Netzwerk und geschlossener Loop → werden abgelehnt, Route bleibt gültig
- [ ] Path-Edit-Mode aktiv, dann Plugin schließen → Connector wieder gesperrt
- [ ] Path-Edit-Mode aktiv, dann Figma neu laden → Sweep sperrt alle Connectors
- [ ] PNG-Export der Seite enthält keine Editier-Artefakte
- [ ] `Reset line` nach 5 Waypoints

**Canvas-Edits (FR-12)**

- [ ] Label auf Canvas ändern, Panel prüfen; Label im Panel ändern, Canvas prüfen
- [ ] Label leeren → Sektion verschwindet, kein Layout-Bruch
- [ ] Kategorie-Pill-Text ändern → Reset + genau ein Toast
- [ ] Property-Wert und Property-Key ändern → Reset
- [ ] Property-Row löschen → Wiederherstellung + Toast
- [ ] Card-Fill, -Radius, -Padding ändern, dann Label im Panel ändern → Styling bleibt
- [ ] Card-Breite ziehen → `widthOverride` gesetzt, Panel zeigt Reset-Option
- [ ] Card-Höhe ziehen → springt auf Hug
- [ ] Eigenes Bild und eigene Textnotiz in die Card legen → überlebt drei Syncs und ein Re-Render
- [ ] Card in eine Section ziehen → Connector, Endpunkt, Handles folgen in denselben Parent
- [ ] Schnelles Wechseln zwischen Canvas- und Panel-Edit → kein Loop, kein Textverlust

**Verschieben & Sync**

- [ ] Card verschieben, Ziel verschieben, beide verschieben
- [ ] Ziel resizen, Ziel rotieren
- [ ] Frame mit Ziel und Card gemeinsam verschieben
- [ ] Ziel auf andere Seite verschieben → „Off-page"
- [ ] Ziel löschen → „Detached", Reattach funktioniert
- [ ] Card löschen → Connector weg, kein Waisen-Vector
- [ ] Card duplizieren (Cmd+D) → neue ID, eigener Connector
- [ ] Card auf andere Seite kopieren → als Orphan erkannt

**Robustheit**

- [ ] Label mit 2000 Zeichen
- [ ] Label mit Umlauten, Emoji, RTL-Text
- [ ] 25 Properties an einer Figtation
- [ ] 200 Figtations auf einer Seite (Performance, Panel-Scroll)
- [ ] Kategorie löschen, die in 20 Figtations benutzt wird
- [ ] Alle Kategorien löschen → „No category" funktioniert weiter
- [ ] Node mit `figma.mixed` in Fill, Corner Radius, Stroke Weight, Font
- [ ] Node mit gebundenen Variablen in mehreren Feldern
- [ ] Sehr kleines Ziel (1×1 px) und sehr großes Ziel (10000 px)

**Undo**

- [ ] Erstellen, Bearbeiten, Löschen, Arrangieren, Import — je ein Undo-Schritt

**Dev Mode**

- [ ] Alle Schreibaktionen disabled, Lesen und Navigieren funktioniert

---

## 12. Non-Goals für v1

Explizit **nicht** Teil von v1. Nicht implementieren, auch nicht als „kleine Zugabe":

- Markdown-Rendering im Card-Label (Import strippt Markdown zu Plaintext)
- Bilder, Anhänge oder Links in Annotationen
- Kommentar-/Threading-Funktionen, Zuweisungen, Status („done", „open")
- Export nach Markdown, CSV, PDF oder Jira/Confluence/Notion
- Multi-Node-Ziele (eine Annotation zeigt auf mehrere Nodes)
- Reattach durch Ziehen des Anchor-Griffs auf einen anderen Node (Reattach nur über das Panel, FR-7)
- Eine **eigene** Kurven-Editier-UI. Kurven entstehen über Figmas Bend-Tool im nativen Vector-Edit-Mode (FR-5b); das Plugin bewahrt die Tangenten, implementiert aber keine eigenen Kontrollpunkt-Griffe.
- Pfeilspitzen am Endpunkt (v1: runder Dot)
- Automatisches Ausweichen der Linie um andere Objekte (kein Obstacle-Avoidance-Routing)
- Gleichzeitiges Pfad-Editing an mehreren Figtations
- Messungen/Spacing-Annotationen (Figmas Measurement-Feature)
- FigJam-Support, Slides-Support
- Versionierung/Historie von Annotationen
- Zoominvariante Darstellung der Cards (technisch nicht möglich, C-1)
- Echtzeit-Sync bei geschlossenem Plugin (technisch nicht möglich, C-3)

---

## 13. Offene Entscheidungen

Diese drei Punkte sind bewusst offen und beim Erreichen des jeweiligen Milestones zu entscheiden und in `docs/DECISIONS.md` zu dokumentieren.

| #   | Frage                                                                                                                                                                                                                                                                                             | Betrifft |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D-1 | Sollen `GroupNode`s als Ziel erlaubt sein? Nativ nicht unterstützt, technisch bei Figtations möglich (Bounding-Box existiert), aber Import/Export nach Native wäre für diese Fälle lossy. Empfehlung: erlauben, beim Native-Export überspringen und im Report ausweisen.                          | M4       |
| D-2 | Kollisionsvermeidung beim Erstellen: nur gegen andere Cards prüfen, oder auch gegen Frames? Empfehlung: v1 nur Cards (billiger), Frames über Auto-Arrange lösen.                                                                                                                                  | M4       |
| D-3 | Route A (nativer Vector-Edit-Mode) oder Route B (eigene Griff-Nodes)? Entscheidung fällt im Spike zu Beginn von M7, nicht vorher. Präferenz: Route A, weil sie Figmas eigene Interaktion nutzt. Route B nur, wenn die Rückübernahme unzuverlässig ist.                                            | M7       |
| D-4 | Sollen `waypoints` beim Verschieben der Card mitwandern (Form bleibt relativ zur Card) oder absolut stehenbleiben (Linie verformt sich)? Dieses PRD spezifiziert **Mitwandern** per Delta-Translation. Fühlt sich das im Test falsch an, ist die Alternative ein Setting `keepWaypointsAbsolute`. | M7       |
| D-5 | Wie hart soll das Zurücksetzen geschützter Felder sein (FR-12)? Alternative zum sofortigen Reset: „modified"-Badge an der Card, Reset erst auf Klick. Empfehlung: v1 sofort zurücksetzen, weil vorhersehbarer.                                                                                    | M6       |

---

## 14. Anhang — API-Cheat-Sheet für die Implementierung

```ts
// Nodes (dynamic-page → immer async)
const node = await figma.getNodeByIdAsync(id) // SceneNode | null
await figma.loadAllPagesAsync() // vor cross-page-Suche

// Variablen & Styles
const v = await figma.variables.getVariableByIdAsync(id) // v.name
const s = await figma.getStyleByIdAsync(id) // s.name
node.boundVariables?.fills?.[0]?.id // VariableAlias

// Vector-Route schreiben und zurücklesen (FR-5, FR-5b)
await vec.setVectorNetworkAsync({ vertices, segments, regions: [] }) // Schreiben (dynamic-page)
const net = vec.vectorNetwork // Lesen bleibt synchron
// VectorVertex: { x, y, strokeCap?, strokeJoin?, cornerRadius?, handleMirroring? }
// VectorSegment: { start, end, tangentStart?, tangentEnd? }

// Nodes erzeugen
const f = figma.createFrame()
f.layoutMode = 'VERTICAL'
f.primaryAxisSizingMode = 'AUTO'
f.counterAxisSizingMode = 'FIXED'
child.layoutSizingHorizontal = 'FILL'
const t = figma.createText() // nach loadFontAsync!
const vec = figma.createVector()
vec.vectorPaths = [{ windingRule: 'NONE', data: 'M 0 0 L 100 50' }]

// Persistenz
node.setSharedPluginData('figtations', 'type', 'card')
node.getSharedPluginData('figtations', 'type')
figma.root.setSharedPluginData('figtations', 'categories', JSON.stringify(cats))

// Suche
figma.currentPage.findAllWithCriteria({ types: ['FRAME'] }) // + pluginData-Kriterium, Feature-Detection!

// Events
figma.on('documentchange', (e) => {
  /* e.documentChanges */
})
figma.on('selectionchange', () => {})
figma.on('close', () => {
  /* Listener aufräumen */
})

// Viewport & Feedback
figma.viewport.scrollAndZoomIntoView([node])
figma.notify('Refreshed 42 annotations')
figma.notify('Something went wrong', { error: true })

// Relaunch
node.setRelaunchData({ edit: 'Edit this annotation' })

// Native Annotationen
targetNode.annotations = [{ label, properties: [{ type: 'width' }], categoryId }]
const cats = await figma.annotations.getAnnotationCategoriesAsync()
const cat = await figma.annotations.addAnnotationCategoryAsync({ label: 'QA', color: 'teal' })
```

**Referenzen**

- Annotation-Typ und Beispiele: `developers.figma.com/docs/plugins/api/Annotation`
- `AnnotationProperty` (vollständiger Enum): `developers.figma.com/docs/plugins/api/AnnotationProperty`
- `figma.annotations.*`: `developers.figma.com/docs/plugins/api/figma-annotations`
- `AnnotationCategoryColor`: `developers.figma.com/docs/plugins/api/AnnotationCategoryColor`
