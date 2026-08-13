/**
 * Persistence layer (PRD §5). Everything lives in *shared* plugin data so other
 * tools can read the annotations.
 *
 * Keys are short and no derived value is ever persisted (PRD C-8): property
 * *values* are always read live off the target, only the *selection* of
 * properties is stored.
 */
import {
  DEFAULT_SETTINGS,
  NAMESPACE,
  SCHEMA_VERSION,
  SETTINGS_RANGES,
  isCategoryColor,
  isPropertyType,
  type CardSide,
  type Figtation,
  type FigtationCategory,
  type NormalisedAnchor,
  type PropertyType,
  type RouteKind,
  type RouteMode,
  type SegmentTangents,
  type Settings,
  type Waypoint,
} from '../shared/types'

export type NodeLike = Pick<BaseNode, 'getSharedPluginData' | 'setSharedPluginData'>

export const KEYS = {
  schema: 'schema',
  categories: 'categories',
  settings: 'settings',
  type: 'type',
  id: 'id',
  targetId: 'targetId',
  targetName: 'targetName',
  categoryId: 'categoryId',
  label: 'label',
  props: 'props',
  connectorId: 'connectorId',
  endpointId: 'endpointId',
  pinned: 'pinned',
  route: 'route',
  routeMode: 'routeMode',
  waypoints: 'waypoints',
  tangents: 'tangents',
  cardSide: 'cardSide',
  anchor: 'anchor',
  widthOverride: 'widthOverride',
  rev: 'rev',
  /** Last synced absolute card origin, needed to translate waypoints (PRD D-4). */
  pos: 'pos',
  role: 'role',
  prop: 'prop',
  cardId: 'cardId',
  kind: 'kind',
  index: 'index',
} as const

export type ChildRole =
  | 'header'
  | 'pill'
  | 'pill-text'
  | 'label'
  | 'properties'
  | 'row'
  | 'row-key'
  | 'value'
  | 'row-value'
  | 'swatch'
  | 'divider'
  | 'badge'
  | 'token-chip'

export type FigtationNodeType = 'card' | 'connector' | 'endpoint' | 'handle'

export function get(node: NodeLike, key: string): string {
  return node.getSharedPluginData(NAMESPACE, key)
}

export function set(node: NodeLike, key: string, value: string): void {
  node.setSharedPluginData(NAMESPACE, key, value)
}

export function clear(node: NodeLike, key: string): void {
  node.setSharedPluginData(NAMESPACE, key, '')
}

export function nodeType(node: NodeLike): FigtationNodeType | '' {
  const value = get(node, KEYS.type)
  return value === 'card' || value === 'connector' || value === 'endpoint' || value === 'handle'
    ? value
    : ''
}

export function roleOf(node: NodeLike): ChildRole | '' {
  return (get(node, KEYS.role) || '') as ChildRole | ''
}

function parseJson<T>(raw: string, fallback: T): T {
  if (raw === '') return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Document level: schema, settings, categories
// ---------------------------------------------------------------------------

/** Runs pending migrations and stamps the current schema version. */
export function ensureSchema(): string {
  const current = get(figma.root, KEYS.schema)
  if (current === SCHEMA_VERSION) return current
  if (current === '') {
    set(figma.root, KEYS.schema, SCHEMA_VERSION)
    return SCHEMA_VERSION
  }
  // Future migrations hook: `if (current === '1') migrateV1toV2()`.
  set(figma.root, KEYS.schema, SCHEMA_VERSION)
  return SCHEMA_VERSION
}

function clampRange(value: number, range: { min: number; max: number }, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(range.max, Math.max(range.min, value))
}

export function readSettings(): Settings {
  const stored = parseJson<Partial<Settings>>(get(figma.root, KEYS.settings), {})
  const merged: Settings = { ...DEFAULT_SETTINGS, ...stored }
  return {
    ...merged,
    cardWidth: clampRange(merged.cardWidth, SETTINGS_RANGES.cardWidth, DEFAULT_SETTINGS.cardWidth),
    connectorCornerRadius: clampRange(
      merged.connectorCornerRadius,
      SETTINGS_RANGES.connectorCornerRadius,
      DEFAULT_SETTINGS.connectorCornerRadius
    ),
    arrangeGutter: clampRange(
      merged.arrangeGutter,
      SETTINGS_RANGES.arrangeGutter,
      DEFAULT_SETTINGS.arrangeGutter
    ),
  }
}

export function writeSettings(settings: Settings): void {
  set(figma.root, KEYS.settings, JSON.stringify(settings))
}

export function readCategories(): FigtationCategory[] {
  const raw = parseJson<unknown[]>(get(figma.root, KEYS.categories), [])
  if (!Array.isArray(raw)) return []
  const categories: FigtationCategory[] = []
  raw.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) return
    const record = entry as Record<string, unknown>
    const id = typeof record['id'] === 'string' ? record['id'] : ''
    const label = typeof record['label'] === 'string' ? record['label'] : ''
    const color = isCategoryColor(record['color']) ? record['color'] : 'blue'
    if (id === '') return
    const category: FigtationCategory = {
      id,
      label,
      color,
      order: typeof record['order'] === 'number' ? record['order'] : index,
    }
    if (typeof record['nativeId'] === 'string' && record['nativeId'] !== '') {
      category.nativeId = record['nativeId']
    }
    categories.push(category)
  })
  return categories.sort((a, b) => a.order - b.order)
}

export function writeCategories(categories: FigtationCategory[]): void {
  const normalised = categories.map((category, index) => ({ ...category, order: index }))
  set(figma.root, KEYS.categories, JSON.stringify(normalised))
}

// ---------------------------------------------------------------------------
// Card level
// ---------------------------------------------------------------------------

function readProps(node: NodeLike): PropertyType[] {
  const raw = parseJson<unknown[]>(get(node, KEYS.props), [])
  if (!Array.isArray(raw)) return []
  const seen = new Set<PropertyType>()
  const props: PropertyType[] = []
  for (const entry of raw) {
    if (!isPropertyType(entry) || seen.has(entry)) continue
    seen.add(entry)
    props.push(entry)
  }
  return props
}

function readWaypoints(node: NodeLike): Waypoint[] {
  const raw = parseJson<unknown[]>(get(node, KEYS.waypoints), [])
  if (!Array.isArray(raw)) return []
  const points: Waypoint[] = []
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue
    const [x, y] = entry as unknown[]
    if (typeof x !== 'number' || typeof y !== 'number') continue
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push([x, y])
  }
  return points
}

function readTangents(node: NodeLike): SegmentTangents[] {
  const raw = parseJson<unknown[]>(get(node, KEYS.tangents), [])
  if (!Array.isArray(raw)) return []
  const tangents: SegmentTangents[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const index = record['i']
    const start = record['start']
    const end = record['end']
    if (typeof index !== 'number') continue
    if (!Array.isArray(start) || !Array.isArray(end)) continue
    tangents.push({
      i: index,
      start: [Number(start[0]) || 0, Number(start[1]) || 0],
      end: [Number(end[0]) || 0, Number(end[1]) || 0],
    })
  }
  return tangents
}

function readAnchor(node: NodeLike): NormalisedAnchor | 'auto' {
  const raw = get(node, KEYS.anchor)
  if (raw === '' || raw === 'auto') return 'auto'
  const parsed = parseJson<unknown>(raw, null)
  if (!Array.isArray(parsed) || parsed.length < 2) return 'auto'
  const [u, v] = parsed as unknown[]
  if (typeof u !== 'number' || typeof v !== 'number') return 'auto'
  return [u, v]
}

const CARD_SIDES: readonly CardSide[] = ['auto', 'left', 'right', 'top', 'bottom']

export function readFigtation(node: SceneNode): Figtation | null {
  if (nodeType(node) !== 'card') return null
  const id = get(node, KEYS.id)
  if (id === '') return null
  const routeRaw = get(node, KEYS.route)
  const routeModeRaw = get(node, KEYS.routeMode)
  const cardSideRaw = get(node, KEYS.cardSide) as CardSide
  const widthRaw = get(node, KEYS.widthOverride)
  const widthOverride = widthRaw === '' ? null : Number(widthRaw)
  return {
    id,
    cardId: node.id,
    targetId: get(node, KEYS.targetId),
    targetName: get(node, KEYS.targetName),
    categoryId: get(node, KEYS.categoryId),
    label: get(node, KEYS.label),
    props: readProps(node),
    connectorId: get(node, KEYS.connectorId),
    endpointId: get(node, KEYS.endpointId),
    pinned: get(node, KEYS.pinned) === '1',
    route: (routeRaw === 'custom' ? 'custom' : 'auto') satisfies RouteKind,
    routeMode: (routeModeRaw === 'straight' ? 'straight' : 'elbow') satisfies RouteMode,
    waypoints: readWaypoints(node),
    tangents: readTangents(node),
    cardSide: CARD_SIDES.includes(cardSideRaw) ? cardSideRaw : 'auto',
    anchor: readAnchor(node),
    widthOverride: widthOverride !== null && Number.isFinite(widthOverride) ? widthOverride : null,
    rev: Number(get(node, KEYS.rev)) || 0,
  }
}

export function writeFigtation(node: SceneNode, figtation: Figtation): void {
  set(node, KEYS.type, 'card')
  set(node, KEYS.id, figtation.id)
  set(node, KEYS.targetId, figtation.targetId)
  set(node, KEYS.targetName, figtation.targetName)
  set(node, KEYS.categoryId, figtation.categoryId)
  set(node, KEYS.label, figtation.label)
  set(node, KEYS.props, JSON.stringify(figtation.props))
  set(node, KEYS.connectorId, figtation.connectorId)
  set(node, KEYS.endpointId, figtation.endpointId)
  set(node, KEYS.pinned, figtation.pinned ? '1' : '0')
  set(node, KEYS.route, figtation.route)
  set(node, KEYS.routeMode, figtation.routeMode)
  set(node, KEYS.waypoints, JSON.stringify(figtation.waypoints))
  set(node, KEYS.tangents, JSON.stringify(figtation.tangents))
  set(node, KEYS.cardSide, figtation.cardSide)
  set(node, KEYS.anchor, figtation.anchor === 'auto' ? 'auto' : JSON.stringify(figtation.anchor))
  set(
    node,
    KEYS.widthOverride,
    figtation.widthOverride === null ? '' : String(figtation.widthOverride)
  )
  set(node, KEYS.rev, String(figtation.rev))
}

/** Writes a single field without rewriting the whole record. */
export function patchFigtation(node: SceneNode, patch: Partial<Figtation>): void {
  if (patch.targetId !== undefined) set(node, KEYS.targetId, patch.targetId)
  if (patch.targetName !== undefined) set(node, KEYS.targetName, patch.targetName)
  if (patch.categoryId !== undefined) set(node, KEYS.categoryId, patch.categoryId)
  if (patch.label !== undefined) set(node, KEYS.label, patch.label)
  if (patch.props !== undefined) set(node, KEYS.props, JSON.stringify(patch.props))
  if (patch.connectorId !== undefined) set(node, KEYS.connectorId, patch.connectorId)
  if (patch.endpointId !== undefined) set(node, KEYS.endpointId, patch.endpointId)
  if (patch.pinned !== undefined) set(node, KEYS.pinned, patch.pinned ? '1' : '0')
  if (patch.route !== undefined) set(node, KEYS.route, patch.route)
  if (patch.routeMode !== undefined) set(node, KEYS.routeMode, patch.routeMode)
  if (patch.waypoints !== undefined) set(node, KEYS.waypoints, JSON.stringify(patch.waypoints))
  if (patch.tangents !== undefined) set(node, KEYS.tangents, JSON.stringify(patch.tangents))
  if (patch.cardSide !== undefined) set(node, KEYS.cardSide, patch.cardSide)
  if (patch.anchor !== undefined) {
    set(node, KEYS.anchor, patch.anchor === 'auto' ? 'auto' : JSON.stringify(patch.anchor))
  }
  if (patch.widthOverride !== undefined) {
    set(node, KEYS.widthOverride, patch.widthOverride === null ? '' : String(patch.widthOverride))
  }
  if (patch.id !== undefined) set(node, KEYS.id, patch.id)
  if (patch.rev !== undefined) set(node, KEYS.rev, String(patch.rev))
}

export function markChild(node: SceneNode, role: ChildRole, prop?: PropertyType): void {
  set(node, KEYS.role, role)
  if (prop) set(node, KEYS.prop, prop)
}

export function markSatellite(
  node: SceneNode,
  type: Exclude<FigtationNodeType, 'card'>,
  cardId: string
): void {
  set(node, KEYS.type, type)
  set(node, KEYS.cardId, cardId)
}
