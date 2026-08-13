/**
 * Path editing (PRD FR-5b), Route A: Figma's own vector edit mode.
 *
 * The plugin cannot open that mode programmatically (PRD C-9), so it unlocks and
 * selects the connector and tells the user to press Enter. Afterwards the vector
 * network is read back and turned into `waypoints` / `tangents`.
 *
 * Route B (own handle nodes) is intentionally not built — see docs/DECISIONS.md,
 * D-003: the decision belongs to the M7 spike, which needs a human in the Figma
 * client.
 */
import { normaliseAnchor, type Point, type Rect } from '../shared/format/geometry'
import { MAX_WAYPOINTS, type SegmentTangents, type Waypoint } from '../shared/types'
import { parentOrigin } from './connector'

export interface ReadBackResult {
  ok: boolean
  /** Set when `ok` is false — shown as a toast, route stays untouched. */
  error?: string
  waypoints: Waypoint[]
  tangents: SegmentTangents[]
  /** A new target anchor, when the user dragged the last vertex away. */
  anchor?: [number, number]
}

/** Distance beyond which the last vertex counts as a new anchor (PRD FR-5b). */
const ANCHOR_REBIND_DISTANCE = 24

interface Chain {
  order: number[]
  /** segment index keyed by "from-to" position in the chain */
  segments: VectorSegment[]
}

/**
 * Orders the vertices of a single open path. Returns null for branched networks,
 * closed loops or disconnected pieces (PRD FR-5b, "Grenzen").
 */
function orderChain(network: VectorNetwork): Chain | null {
  const vertexCount = network.vertices.length
  if (vertexCount < 2) return null
  if (network.segments.length !== vertexCount - 1) return null
  if (network.regions && network.regions.length > 0) return null

  const adjacency = new Map<number, number[]>()
  for (const segment of network.segments) {
    if (segment.start === segment.end) return null
    const a = adjacency.get(segment.start) ?? []
    a.push(segment.end)
    adjacency.set(segment.start, a)
    const b = adjacency.get(segment.end) ?? []
    b.push(segment.start)
    adjacency.set(segment.end, b)
  }

  const ends: number[] = []
  for (let i = 0; i < vertexCount; i++) {
    const degree = (adjacency.get(i) ?? []).length
    if (degree === 0 || degree > 2) return null
    if (degree === 1) ends.push(i)
  }
  if (ends.length !== 2) return null

  const start = ends[0]
  if (start === undefined) return null
  const order: number[] = [start]
  const visited = new Set<number>([start])
  let current = start
  while (order.length < vertexCount) {
    const next = (adjacency.get(current) ?? []).find((candidate) => !visited.has(candidate))
    if (next === undefined) return null
    visited.add(next)
    order.push(next)
    current = next
  }

  return { order, segments: [...network.segments] }
}

function segmentBetween(
  segments: VectorSegment[],
  a: number,
  b: number
): VectorSegment | undefined {
  return segments.find(
    (segment) =>
      (segment.start === a && segment.end === b) || (segment.start === b && segment.end === a)
  )
}

function hasTangent(vector: { x: number; y: number } | undefined): boolean {
  return vector !== undefined && (Math.abs(vector.x) > 0.01 || Math.abs(vector.y) > 0.01)
}

/**
 * Reads the user's edits back out of the connector's vector network.
 * `expectedAnchor` is the anchor the plugin last drew, in absolute coordinates.
 */
export function readBackNetwork(
  connector: VectorNode,
  targetBox: Rect | null,
  expectedAnchor: Point | null
): ReadBackResult {
  const empty: ReadBackResult = { ok: true, waypoints: [], tangents: [] }
  const network = connector.vectorNetwork
  const chain = orderChain(network)
  if (!chain) {
    return {
      ok: false,
      error: 'Line must be a single open path.',
      waypoints: [],
      tangents: [],
    }
  }

  const origin = parentOrigin(connector.parent ?? figma.currentPage)
  const absolute: Point[] = chain.order.map((index) => {
    const vertex = network.vertices[index]
    return {
      x: (vertex?.x ?? 0) + connector.x + origin.x,
      y: (vertex?.y ?? 0) + connector.y + origin.y,
    }
  })

  const inner = absolute.slice(1, -1)
  if (inner.length > MAX_WAYPOINTS) {
    return {
      ok: false,
      error: `A line can have at most ${MAX_WAYPOINTS} waypoints.`,
      waypoints: [],
      tangents: [],
    }
  }

  const waypoints: Waypoint[] = inner.map((point) => [point.x, point.y])

  // Carry over bezier tangents the user created with the bend tool.
  const tangents: SegmentTangents[] = []
  for (let i = 0; i < chain.order.length - 1; i++) {
    const a = chain.order[i]
    const b = chain.order[i + 1]
    if (a === undefined || b === undefined) continue
    const segment = segmentBetween(chain.segments, a, b)
    if (!segment) continue
    const start = segment.start === a ? segment.tangentStart : segment.tangentEnd
    const end = segment.start === a ? segment.tangentEnd : segment.tangentStart
    if (!hasTangent(start) && !hasTangent(end)) continue
    tangents.push({
      i,
      start: [start?.x ?? 0, start?.y ?? 0],
      end: [end?.x ?? 0, end?.y ?? 0],
    })
  }

  const result: ReadBackResult = { ok: true, waypoints, tangents }

  const last = absolute[absolute.length - 1]
  if (last && targetBox && expectedAnchor) {
    const distance = Math.hypot(last.x - expectedAnchor.x, last.y - expectedAnchor.y)
    if (distance > ANCHOR_REBIND_DISTANCE) {
      result.anchor = normaliseAnchor(targetBox, last)
    }
  }

  return waypoints.length === 0 && tangents.length === 0 && result.anchor === undefined
    ? empty
    : result
}
