/**
 * Shared data model. Imported by both the sandbox and the UI, therefore free of
 * Figma and DOM APIs (PRD §4.1b).
 */

export const SCHEMA_VERSION = '1'

/** pluginData namespace (PRD §5.1). Shared, so other tools can read it. */
export const NAMESPACE = 'figtations'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** Exactly the eight values Figma's native annotation API accepts (PRD C-5). */
export const CATEGORY_COLORS = [
  'yellow',
  'orange',
  'red',
  'pink',
  'violet',
  'blue',
  'teal',
  'green',
] as const

export type CategoryColor = (typeof CATEGORY_COLORS)[number]

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === 'string' && (CATEGORY_COLORS as readonly string[]).includes(value)
}

export interface FigtationCategory {
  id: string
  label: string
  color: CategoryColor
  order: number
  /** Mapping onto a native Figma category, when known. */
  nativeId?: string
}

// ---------------------------------------------------------------------------
// Property types
// ---------------------------------------------------------------------------

/**
 * The full `AnnotationPropertyType` enum (PRD C-5). Duplicated here rather than
 * imported from the Figma typings because the UI context has no access to them.
 */
export const PROPERTY_TYPES = [
  'width',
  'height',
  'maxWidth',
  'minWidth',
  'maxHeight',
  'minHeight',
  'fills',
  'strokes',
  'effects',
  'strokeWeight',
  'cornerRadius',
  'textStyleId',
  'textAlignHorizontal',
  'fontFamily',
  'fontStyle',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'itemSpacing',
  'padding',
  'layoutMode',
  'alignItems',
  'opacity',
  'mainComponent',
  'gridRowGap',
  'gridColumnGap',
  'gridRowCount',
  'gridColumnCount',
  'gridRowAnchorIndex',
  'gridColumnAnchorIndex',
  'gridRowSpan',
  'gridColumnSpan',
] as const

export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === 'string' && (PROPERTY_TYPES as readonly string[]).includes(value)
}

/** A property with its live value, as resolved from a target node. */
export interface ProbedProperty {
  type: PropertyType
  /** Display label, e.g. "Width", "Alignment". */
  key: string
  /** Formatted value. */
  value: string
  /** Only for fills/strokes: `#RRGGBB`. */
  swatch?: string
  /** Variable name, when the field is bound to one. */
  variable?: string
  /**
   * Node id this value points at — currently the local main component of an
   * instance. Rendered as a hyperlink on the card and as a link in the panel
   * (DECISIONS.md D-026). Absent for library components, whose main component
   * lives in another file.
   */
  link?: string
  /**
   * Why `link` is absent, when a link would have been expected. Shown in the
   * panel so a missing link is explained instead of just missing (D-026).
   */
  linkStatus?: 'library' | 'unresolved'
  /** false → greyed out in the picker. */
  available: boolean
}

// ---------------------------------------------------------------------------
// Figtations
// ---------------------------------------------------------------------------

export type CardSide = 'auto' | 'left' | 'right' | 'top' | 'bottom'
export type RouteMode = 'straight' | 'elbow'
export type RouteKind = 'auto' | 'custom'

/** Absolute canvas coordinates. */
export type Waypoint = [number, number]

/** Normalised anchor on the target's bounding box, each component 0…1. */
export type NormalisedAnchor = [number, number]

/** Optional bezier tangents carried over from Figma's vector edit mode. */
export interface SegmentTangents {
  /** Index of the segment inside the full point list. */
  i: number
  start: [number, number]
  end: [number, number]
}

export interface Figtation {
  id: string
  /** Node id of the card frame. */
  cardId: string
  /** Node id of the annotated node, `''` for a free-standing note. */
  targetId: string
  /** Last known name of the target, for the detached state. */
  targetName: string
  /** `''` = no category. */
  categoryId: string
  label: string
  /** Order is display order. */
  props: PropertyType[]
  connectorId: string
  endpointId: string
  /** Position was set by hand; auto-arrange skips it. */
  pinned: boolean
  route: RouteKind
  routeMode: RouteMode
  waypoints: Waypoint[]
  tangents: SegmentTangents[]
  cardSide: CardSide
  anchor: NormalisedAnchor | 'auto'
  /** Set when the user resized the card by hand, else null. */
  widthOverride: number | null
  rev: number
}

export type FigtationDraft = Pick<Figtation, 'categoryId' | 'label' | 'props'> &
  Partial<Pick<Figtation, 'cardSide' | 'routeMode'>>

export type FigtationState = 'ok' | 'detached' | 'off-page' | 'free'

export interface FigtationSummary {
  id: string
  cardId: string
  label: string
  categoryId: string
  targetId: string
  targetName: string
  propCount: number
  /** Selected properties in display order — the editor needs them. */
  props: PropertyType[]
  state: FigtationState
  /** Page name, only for `off-page`. */
  pageName?: string
  /** Absolute card position, used for canvas-order sorting. */
  x: number
  y: number
  route: RouteKind
  routeMode: RouteMode
  cardSide: CardSide
  waypointCount: number
  widthOverride: number | null
  pinned: boolean
}

export const MAX_WAYPOINTS = 12

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface Settings {
  cardWidth: number
  theme: 'dark' | 'light'
  connectorStyle: RouteMode
  connectorDashed: boolean
  connectorCornerRadius: number
  connectorWeight: number
  showEndpointDot: boolean
  snapWaypoints: boolean
  showPropertyValues: boolean
  /** Figma paints a frame's name above it, so this is visible on the canvas. */
  showCardLayerName: boolean
  autoRefreshOnOpen: boolean
  arrangeGutter: number
  arrangeSide: 'right' | 'left'
}

export const DEFAULT_SETTINGS: Settings = {
  cardWidth: 280,
  theme: 'dark',
  connectorStyle: 'elbow',
  connectorDashed: false,
  connectorCornerRadius: 12,
  connectorWeight: 1.5,
  showEndpointDot: true,
  snapWaypoints: true,
  showPropertyValues: true,
  showCardLayerName: false,
  autoRefreshOnOpen: true,
  arrangeGutter: 80,
  arrangeSide: 'right',
}

/**
 * The panel's own theme, as opposed to `Settings.theme`, which is the theme of
 * the cards on the canvas. This one is a personal preference and lives in
 * `clientStorage`; that one belongs to the document and is shared.
 */
export type PanelTheme = 'dark' | 'light'

/** DESIGN.md §3 puts the panel at 320px wide. It stays resizable (FR-7). */
export const PANEL_SIZE = {
  defaultWidth: 320,
  defaultHeight: 700,
  minWidth: 300,
  minHeight: 320,
  maxWidth: 1600,
  maxHeight: 1600,
} as const

export function clampPanelSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.min(PANEL_SIZE.maxWidth, Math.max(PANEL_SIZE.minWidth, Math.round(width))),
    height: Math.min(PANEL_SIZE.maxHeight, Math.max(PANEL_SIZE.minHeight, Math.round(height))),
  }
}

export const SETTINGS_RANGES = {
  cardWidth: { min: 200, max: 480 },
  connectorCornerRadius: { min: 0, max: 32 },
  arrangeGutter: { min: 0, max: 400 },
} as const

// ---------------------------------------------------------------------------
// Selection & plugin state
// ---------------------------------------------------------------------------

export interface SelectedNodeInfo {
  id: string
  name: string
  type: string
  /** false → cannot be annotated (e.g. it is a Figtation card itself). */
  annotatable: boolean
  /** Reason shown to the user when `annotatable` is false. */
  reason?: string
}

export interface SelectionContext {
  /** Selected nodes that are candidate targets. */
  nodes: SelectedNodeInfo[]
  /** Figtations attached to the current selection, or selected directly. */
  figtations: FigtationSummary[]
  /** Set when the selection *is* a Figtation card. */
  activeFigtationId: string | null
}

export interface RouteState {
  route: RouteKind
  routeMode: RouteMode
  cardSide: CardSide
  waypointCount: number
  anchor: NormalisedAnchor | 'auto'
  widthOverride: number | null
  pinned: boolean
}

export interface ArrangeOptions {
  gutter: number
  side: 'right' | 'left'
}

export interface NativeScanResult {
  annotationCount: number
  layerCount: number
  pageCount: number
}

export interface PluginState {
  /** 'dev' means read-only (PRD C-2). Kept as a string: Figma keeps adding types. */
  editorType: string
  readOnly: boolean
  schema: string
  categories: FigtationCategory[]
  settings: Settings
  selection: SelectionContext
  list: FigtationSummary[]
  pageName: string
  pathEditFigtationId: string | null
  panelTheme: PanelTheme
}
