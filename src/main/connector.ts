/**
 * Leader line and endpoint dot (PRD FR-5).
 *
 * The line is a real `VectorNode` written through `setVectorNetworkAsync`, so
 * Figma rounds the corners itself (per-vertex `cornerRadius`) and the user can
 * edit the path in Figma's own vector edit mode (PRD C-9, FR-5b).
 */
import {
  boundsOf,
  computeRoute,
  cornerRadii,
  type Point,
  type Rect,
  type RouteResult,
} from '../shared/format/geometry'
import { CONNECTOR_METRICS, NODE_NAMES, hexToRgb, rgbToHex } from '../shared/tokens'
import type { Figtation, Settings } from '../shared/types'
import { KEYS, markSatellite, nodeType, set } from './store'

export type Container = BaseNode & ChildrenMixin

function solid(hex: string, opacity = 1): SolidPaint {
  return { type: 'SOLID', color: hexToRgb(hex), opacity }
}

/** Absolute origin of a parent, for converting absolute → parent-local. */
export function parentOrigin(parent: BaseNode): Point {
  const record = parent as unknown as { absoluteTransform?: Transform }
  const transform = record.absoluteTransform
  if (!transform) return { x: 0, y: 0 }
  const row0 = transform[0]
  const row1 = transform[1]
  return { x: row0?.[2] ?? 0, y: row1?.[2] ?? 0 }
}

export function boxOf(node: SceneNode): Rect | null {
  const box = node.absoluteBoundingBox
  if (!box) return null
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

async function findNode(id: string): Promise<SceneNode | null> {
  if (id === '') return null
  try {
    const node = await figma.getNodeByIdAsync(id)
    if (!node || node.removed) return null
    return node as SceneNode
  } catch {
    return null
  }
}

/** True when `paints` is already exactly one opaque solid of `hex`. */
function sameSolid(paints: MinimalFillsMixin['fills'], hex: string): boolean {
  if (!Array.isArray(paints) || paints.length !== 1) return false
  const paint = paints[0]
  if (!paint || paint.type !== 'SOLID') return false
  return rgbToHex(paint.color) === hex.toUpperCase() && (paint.opacity ?? 1) === 1
}

function styleConnector(vector: VectorNode, colorHex: string, settings: Settings): void {
  if (vector.name !== NODE_NAMES.connector) vector.name = NODE_NAMES.connector
  if (!sameSolid(vector.strokes, colorHex)) vector.strokes = [solid(colorHex)]
  if (vector.strokeWeight !== settings.connectorWeight) {
    vector.strokeWeight = settings.connectorWeight
  }
  if (vector.strokeCap !== 'ROUND') vector.strokeCap = 'ROUND'
  if (vector.strokeJoin !== 'ROUND') vector.strokeJoin = 'ROUND'
  const dash = settings.connectorDashed ? [...CONNECTOR_METRICS.dashPattern] : []
  if (vector.dashPattern.length !== dash.length) vector.dashPattern = dash
  if (Array.isArray(vector.fills) && vector.fills.length > 0) vector.fills = []
}

async function writeNetwork(
  vector: VectorNode,
  points: Point[],
  radius: number,
  tangents: Figtation['tangents']
): Promise<void> {
  const bounds = boundsOf(points)
  const radii = cornerRadii(points, radius)
  const tangentByIndex = new Map(tangents.map((entry) => [entry.i, entry]))

  const vertices: VectorVertex[] = points.map((point, index) => ({
    x: point.x - bounds.x,
    y: point.y - bounds.y,
    strokeCap: 'ROUND',
    strokeJoin: 'ROUND',
    cornerRadius: radii[index] ?? 0,
  }))

  const segments: VectorSegment[] = points.slice(1).map((_point, index) => {
    const tangent = tangentByIndex.get(index)
    if (!tangent) return { start: index, end: index + 1 }
    return {
      start: index,
      end: index + 1,
      tangentStart: { x: tangent.start[0], y: tangent.start[1] },
      tangentEnd: { x: tangent.end[0], y: tangent.end[1] },
    }
  })

  await vector.setVectorNetworkAsync({ vertices, segments, regions: [] })
}

export interface ConnectorSyncInput {
  figtation: Figtation
  card: FrameNode
  targetBox: Rect | null
  colorHex: string
  settings: Settings
  /** Keep the connector unlocked because the user is editing its path. */
  pathEditing: boolean
}

export interface ConnectorSyncResult {
  connectorId: string
  endpointId: string
  route: RouteResult | null
}

/** Creates or updates the connector and endpoint dot for one Figtation. */
export async function syncConnector(input: ConnectorSyncInput): Promise<ConnectorSyncResult> {
  const { figtation, card, targetBox, settings } = input
  const parent = card.parent as Container | null
  const existingConnector = await findNode(figtation.connectorId)
  const existingEndpoint = await findNode(figtation.endpointId)

  const cardBox = boxOf(card)
  if (!parent || !targetBox || !cardBox) {
    // No target (free note / detached): drop the line entirely (PRD FR-7).
    existingConnector?.remove()
    existingEndpoint?.remove()
    return { connectorId: '', endpointId: '', route: null }
  }

  const route = computeRoute({
    card: cardBox,
    target: targetBox,
    cardSide: figtation.cardSide,
    anchor: figtation.anchor,
    route: figtation.route,
    mode: figtation.routeMode,
    waypoints: figtation.waypoints,
    stub: CONNECTOR_METRICS.stub,
    snap: settings.snapWaypoints,
  })

  const origin = parentOrigin(parent)

  // --- connector -----------------------------------------------------------
  // Everything below is written on every geometry sync, which during a drag runs
  // ~30 times a second (D-023). Only actual changes are written: redundant writes
  // cost time and clutter the undo history.
  let vector: VectorNode
  if (existingConnector && existingConnector.type === 'VECTOR') {
    vector = existingConnector
  } else {
    existingConnector?.remove()
    vector = figma.createVector()
    markSatellite(vector, 'connector', figtation.id)
    set(vector, KEYS.cardId, figtation.id)
  }
  styleConnector(vector, input.colorHex, settings)
  await writeNetwork(vector, route.points, settings.connectorCornerRadius, figtation.tangents)
  const bounds = boundsOf(route.points)
  const vectorX = bounds.x - origin.x
  const vectorY = bounds.y - origin.y
  if (Math.abs(vector.x - vectorX) > 0.01) vector.x = vectorX
  if (Math.abs(vector.y - vectorY) > 0.01) vector.y = vectorY
  if (vector.visible === route.hidden) vector.visible = !route.hidden
  if (vector.parent !== parent) parent.appendChild(vector)
  // The API can write to a locked node, so there is no need to unlock first.
  const shouldLock = !input.pathEditing
  if (vector.locked !== shouldLock) vector.locked = shouldLock

  // --- endpoint dot --------------------------------------------------------
  let endpointId = ''
  let dot: EllipseNode | null = null
  if (settings.showEndpointDot && !route.hidden) {
    if (existingEndpoint && existingEndpoint.type === 'ELLIPSE') {
      dot = existingEndpoint
    } else {
      existingEndpoint?.remove()
      dot = figma.createEllipse()
      markSatellite(dot, 'endpoint', figtation.id)
      dot.resize(CONNECTOR_METRICS.endpointSize, CONNECTOR_METRICS.endpointSize)
      set(dot, KEYS.cardId, figtation.id)
      dot.name = NODE_NAMES.endpoint
      dot.strokeWeight = CONNECTOR_METRICS.endpointStrokeWeight
      dot.strokes = [solid(CONNECTOR_METRICS.endpointStrokeHex)]
    }
    if (!sameSolid(dot.fills, input.colorHex)) dot.fills = [solid(input.colorHex)]
    const dotX = route.anchorPoint.x - origin.x - CONNECTOR_METRICS.endpointSize / 2
    const dotY = route.anchorPoint.y - origin.y - CONNECTOR_METRICS.endpointSize / 2
    if (Math.abs(dot.x - dotX) > 0.01) dot.x = dotX
    if (Math.abs(dot.y - dotY) > 0.01) dot.y = dotY
    if (!dot.visible) dot.visible = true
    if (dot.parent !== parent) parent.appendChild(dot)
    if (!dot.locked) dot.locked = true
    endpointId = dot.id
  } else {
    existingEndpoint?.remove()
  }

  // --- z-order: connector below endpoint below card ------------------------
  const cardIndex = parent.children.indexOf(card)
  const vectorIndex = parent.children.indexOf(vector)
  const dotIndex = dot ? parent.children.indexOf(dot) : -1
  const ordered =
    cardIndex >= 0 &&
    vectorIndex >= 0 &&
    vectorIndex < cardIndex &&
    (dotIndex < 0 || (dotIndex > vectorIndex && dotIndex < cardIndex))
  if (!ordered && cardIndex >= 0) {
    parent.insertChild(cardIndex, vector)
    if (dot) {
      const nextCardIndex = parent.children.indexOf(card)
      if (nextCardIndex >= 0) parent.insertChild(nextCardIndex, dot)
    }
  }

  return { connectorId: vector.id, endpointId, route }
}

/** Removes connector, endpoint and any handles belonging to a Figtation. */
export async function removeSatellites(figtation: Figtation): Promise<void> {
  const connector = await findNode(figtation.connectorId)
  connector?.remove()
  const endpoint = await findNode(figtation.endpointId)
  endpoint?.remove()
}

/**
 * Locks every connector on the page. Run on startup so a crash during path
 * editing cannot leave unlocked lines behind (PRD FR-5b, "Sweep beim Start").
 */
export function lockAllConnectors(page: PageNode): number {
  let count = 0
  for (const node of page.findAll((candidate) => nodeType(candidate) === 'connector')) {
    if (!node.locked) {
      node.locked = true
      count += 1
    }
  }
  for (const node of page.findAll((candidate) => nodeType(candidate) === 'handle')) {
    node.remove()
    count += 1
  }
  return count
}
