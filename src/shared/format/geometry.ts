/**
 * Anchor and path computation (PRD FR-5). Pure, unit tested, Figma free.
 * All coordinates are absolute canvas coordinates; the caller converts into
 * parent-local space when writing the vector network.
 */
import type { CardSide, NormalisedAnchor, RouteKind, RouteMode, Waypoint } from '../types'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type Side = 'left' | 'right' | 'top' | 'bottom'

export const SNAP_TOLERANCE = 4

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function edgeMidpoint(rect: Rect, side: Side): Point {
  const center = rectCenter(rect)
  switch (side) {
    case 'left':
      return { x: rect.x, y: center.y }
    case 'right':
      return { x: rect.x + rect.width, y: center.y }
    case 'top':
      return { x: center.x, y: rect.y }
    case 'bottom':
      return { x: center.x, y: rect.y + rect.height }
  }
}

/** True when `outer` fully contains `inner`. */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width + margin > b.x &&
    a.y < b.y + b.height + margin &&
    a.y + a.height + margin > b.y
  )
}

/**
 * The card edge facing the target. `auto` compares centre deltas: a dominant
 * horizontal delta exits left/right, otherwise top/bottom (PRD FR-5).
 */
export function resolveCardSide(card: Rect, target: Rect, preferred: CardSide): Side {
  if (preferred !== 'auto') return preferred
  const cardCenter = rectCenter(card)
  const targetCenter = rectCenter(target)
  const dx = targetCenter.x - cardCenter.x
  const dy = targetCenter.y - cardCenter.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

/** Nearest point on the target's border, seen from `from`. */
export function nearestBorderPoint(target: Rect, from: Point): Point {
  const clamped = {
    x: clamp(from.x, target.x, target.x + target.width),
    y: clamp(from.y, target.y, target.y + target.height),
  }
  const inside =
    from.x > target.x &&
    from.x < target.x + target.width &&
    from.y > target.y &&
    from.y < target.y + target.height
  if (!inside) return clamped

  // Inside the box: push out to the closest edge.
  const distances: Array<{ side: Side; d: number }> = [
    { side: 'left', d: from.x - target.x },
    { side: 'right', d: target.x + target.width - from.x },
    { side: 'top', d: from.y - target.y },
    { side: 'bottom', d: target.y + target.height - from.y },
  ]
  distances.sort((a, b) => a.d - b.d)
  const nearest = distances[0]
  if (!nearest) return clamped
  switch (nearest.side) {
    case 'left':
      return { x: target.x, y: from.y }
    case 'right':
      return { x: target.x + target.width, y: from.y }
    case 'top':
      return { x: from.x, y: target.y }
    case 'bottom':
      return { x: from.x, y: target.y + target.height }
  }
}

/** Absolute point → normalised `[u, v]` on the target box, clamped to 0…1. */
export function normaliseAnchor(target: Rect, point: Point): NormalisedAnchor {
  const u = target.width === 0 ? 0.5 : (point.x - target.x) / target.width
  const v = target.height === 0 ? 0.5 : (point.y - target.y) / target.height
  return [clamp(u, 0, 1), clamp(v, 0, 1)]
}

/** Normalised `[u, v]` → absolute point on the current target box. */
export function denormaliseAnchor(target: Rect, anchor: NormalisedAnchor): Point {
  return { x: target.x + anchor[0] * target.width, y: target.y + anchor[1] * target.height }
}

/** Which edge a point sits on (or is closest to). */
export function sideOfPoint(target: Rect, point: Point): Side {
  const distances: Array<{ side: Side; d: number }> = [
    { side: 'left', d: Math.abs(point.x - target.x) },
    { side: 'right', d: Math.abs(target.x + target.width - point.x) },
    { side: 'top', d: Math.abs(point.y - target.y) },
    { side: 'bottom', d: Math.abs(target.y + target.height - point.y) },
  ]
  distances.sort((a, b) => a.d - b.d)
  return distances[0]?.side ?? 'left'
}

function offsetFrom(point: Point, side: Side, distance: number): Point {
  switch (side) {
    case 'left':
      return { x: point.x - distance, y: point.y }
    case 'right':
      return { x: point.x + distance, y: point.y }
    case 'top':
      return { x: point.x, y: point.y - distance }
    case 'bottom':
      return { x: point.x, y: point.y + distance }
  }
}

function isHorizontal(side: Side): boolean {
  return side === 'left' || side === 'right'
}

const EPSILON = 0.01

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON
}

/** Drops duplicate and collinear points so no zero-length segment survives. */
export function simplify(points: Point[]): Point[] {
  const deduped: Point[] = []
  for (const point of points) {
    const last = deduped[deduped.length - 1]
    if (last && samePoint(last, point)) continue
    deduped.push(point)
  }
  if (deduped.length < 3) return deduped

  const result: Point[] = [deduped[0] as Point]
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = result[result.length - 1] as Point
    const current = deduped[i] as Point
    const next = deduped[i + 1] as Point
    const cross =
      (current.x - prev.x) * (next.y - prev.y) - (current.y - prev.y) * (next.x - prev.x)
    if (Math.abs(cross) < EPSILON) continue
    result.push(current)
  }
  result.push(deduped[deduped.length - 1] as Point)
  return result
}

/** Orthogonal route: perpendicular stub out, one corner, perpendicular stub in. */
export function elbowRoute(
  start: Point,
  startSide: Side,
  end: Point,
  endSide: Side,
  stub: number
): Point[] {
  const a = offsetFrom(start, startSide, stub)
  const b = offsetFrom(end, endSide, stub)
  // A sideways exit travels horizontally first (PRD FR-5).
  const corner = isHorizontal(startSide) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
  return simplify([start, a, corner, b, end])
}

/**
 * Snaps interior points onto the axis of their predecessor when the deviation is
 * within tolerance. Endpoints are anchors and stay put.
 */
export function snapToAxis(points: Point[], tolerance = SNAP_TOLERANCE): Point[] {
  if (points.length < 3) return points.map((point) => ({ ...point }))
  const result = points.map((point) => ({ ...point }))
  for (let i = 1; i < result.length - 1; i++) {
    const prev = result[i - 1] as Point
    const current = result[i] as Point
    const dx = Math.abs(current.x - prev.x)
    const dy = Math.abs(current.y - prev.y)
    if (dx <= tolerance && dx <= dy) current.x = prev.x
    else if (dy <= tolerance) current.y = prev.y
  }
  // Align the final interior point with the fixed end anchor as well.
  const last = result[result.length - 1] as Point
  const beforeLast = result[result.length - 2] as Point
  if (result.length >= 3) {
    const dx = Math.abs(last.x - beforeLast.x)
    const dy = Math.abs(last.y - beforeLast.y)
    if (dx <= tolerance && dx <= dy) beforeLast.x = last.x
    else if (dy <= tolerance) beforeLast.y = last.y
  }
  return result
}

export interface RouteInput {
  card: Rect
  target: Rect
  cardSide: CardSide
  anchor: NormalisedAnchor | 'auto'
  route: RouteKind
  mode: RouteMode
  waypoints: Waypoint[]
  stub: number
  snap: boolean
}

export interface RouteResult {
  points: Point[]
  side: Side
  anchorPoint: Point
  /** true when card and target overlap so much that a line is meaningless. */
  hidden: boolean
}

export function computeRoute(input: RouteInput): RouteResult {
  const side = resolveCardSide(input.card, input.target, input.cardSide)
  const cardPoint = edgeMidpoint(input.card, side)
  const anchorPoint =
    input.anchor === 'auto'
      ? nearestBorderPoint(input.target, cardPoint)
      : denormaliseAnchor(input.target, input.anchor)
  const hidden = contains(input.card, input.target) || contains(input.target, input.card)

  if (input.route === 'custom' && input.waypoints.length > 0) {
    const raw: Point[] = [cardPoint, ...input.waypoints.map(([x, y]) => ({ x, y })), anchorPoint]
    const snapped = input.snap ? snapToAxis(raw) : raw
    return { points: simplify(snapped), side, anchorPoint, hidden }
  }

  if (input.mode === 'straight') {
    return { points: simplify([cardPoint, anchorPoint]), side, anchorPoint, hidden }
  }

  const endSide = sideOfPoint(input.target, anchorPoint)
  return {
    points: elbowRoute(cardPoint, side, anchorPoint, endSide, input.stub),
    side,
    anchorPoint,
    hidden,
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Per-vertex corner radius. Endpoints stay sharp; interior radii are clamped to
 * half the shorter neighbouring segment so short segments stay predictable
 * (PRD FR-5, "Ecken-Rundung").
 */
export function cornerRadii(points: Point[], radius: number): number[] {
  return points.map((point, i) => {
    if (i === 0 || i === points.length - 1) return 0
    const prev = points[i - 1] as Point
    const next = points[i + 1] as Point
    const limit = Math.min(distance(prev, point), distance(point, next)) / 2
    return Math.max(0, Math.min(radius, limit))
  })
}

/** Shifts every waypoint by the same delta (PRD FR-6, D-4). */
export function translateWaypoints(waypoints: Waypoint[], dx: number, dy: number): Waypoint[] {
  return waypoints.map(([x, y]) => [x + dx, y + dy] as Waypoint)
}

/** Bounding box around a list of points, used to size the connector node. */
export function boundsOf(points: Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Midpoint of each segment, used for the segment handles of route B. */
export function segmentMidpoints(points: Point[]): Point[] {
  const result: Point[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as Point
    const b = points[i + 1] as Point
    result.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  }
  return result
}
