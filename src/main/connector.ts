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
import { CONNECTOR_METRICS, NODE_NAMES, hexToRgb } from '../shared/tokens'
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

function styleConnector(vector: VectorNode, colorHex: string, settings: Settings): void {
  vector.name = NODE_NAMES.connector
  vector.strokes = [solid(colorHex)]
  vector.strokeWeight = settings.connectorWeight
  vector.strokeCap = 'ROUND'
  vector.strokeJoin = 'ROUND'
  vector.dashPattern = settings.connectorDashed ? [...CONNECTOR_METRICS.dashPattern] : []
  vector.fills = []
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
  let vector: VectorNode
  if (existingConnector && existingConnector.type === 'VECTOR') {
    vector = existingConnector
  } else {
    existingConnector?.remove()
    vector = figma.createVector()
    markSatellite(vector, 'connector', figtation.id)
  }
  set(vector, KEYS.cardId, figtation.id)
  vector.locked = false
  styleConnector(vector, input.colorHex, settings)
  await writeNetwork(vector, route.points, settings.connectorCornerRadius, figtation.tangents)
  const bounds = boundsOf(route.points)
  vector.x = bounds.x - origin.x
  vector.y = bounds.y - origin.y
  vector.visible = !route.hidden
  if (vector.parent !== parent) parent.appendChild(vector)
  vector.locked = !input.pathEditing

  // --- endpoint dot --------------------------------------------------------
  let endpointId = ''
  if (settings.showEndpointDot && !route.hidden) {
    let dot: EllipseNode
    if (existingEndpoint && existingEndpoint.type === 'ELLIPSE') {
      dot = existingEndpoint
    } else {
      existingEndpoint?.remove()
      dot = figma.createEllipse()
      markSatellite(dot, 'endpoint', figtation.id)
      dot.resize(CONNECTOR_METRICS.endpointSize, CONNECTOR_METRICS.endpointSize)
    }
    set(dot, KEYS.cardId, figtation.id)
    dot.name = NODE_NAMES.endpoint
    dot.locked = false
    dot.fills = [solid(input.colorHex)]
    dot.strokes = [solid(CONNECTOR_METRICS.endpointStrokeHex)]
    dot.strokeWeight = CONNECTOR_METRICS.endpointStrokeWeight
    dot.x = route.anchorPoint.x - origin.x - CONNECTOR_METRICS.endpointSize / 2
    dot.y = route.anchorPoint.y - origin.y - CONNECTOR_METRICS.endpointSize / 2
    dot.visible = true
    if (dot.parent !== parent) parent.appendChild(dot)
    dot.locked = true
    endpointId = dot.id
  } else {
    existingEndpoint?.remove()
  }

  // --- z-order: connector below endpoint below card ------------------------
  const cardIndex = parent.children.indexOf(card)
  if (cardIndex >= 0) {
    parent.insertChild(cardIndex, vector)
    const dot = endpointId === '' ? null : await findNode(endpointId)
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
