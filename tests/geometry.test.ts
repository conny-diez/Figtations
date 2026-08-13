import { describe, expect, it } from 'vitest'
import {
  boundsOf,
  computeRoute,
  contains,
  cornerRadii,
  denormaliseAnchor,
  edgeMidpoint,
  elbowRoute,
  nearestBorderPoint,
  normaliseAnchor,
  rectCenter,
  rectsOverlap,
  resolveCardSide,
  segmentMidpoints,
  sideOfPoint,
  simplify,
  snapToAxis,
  translateWaypoints,
  type Rect,
} from '../src/shared/format/geometry'

const target: Rect = { x: 0, y: 0, width: 100, height: 100 }

describe('rect helpers', () => {
  it('finds the centre and edge midpoints', () => {
    expect(rectCenter(target)).toEqual({ x: 50, y: 50 })
    expect(edgeMidpoint(target, 'left')).toEqual({ x: 0, y: 50 })
    expect(edgeMidpoint(target, 'right')).toEqual({ x: 100, y: 50 })
    expect(edgeMidpoint(target, 'top')).toEqual({ x: 50, y: 0 })
    expect(edgeMidpoint(target, 'bottom')).toEqual({ x: 50, y: 100 })
  })

  it('detects containment and overlap', () => {
    expect(contains(target, { x: 10, y: 10, width: 10, height: 10 })).toBe(true)
    expect(contains(target, { x: -10, y: 10, width: 10, height: 10 })).toBe(false)
    expect(rectsOverlap(target, { x: 90, y: 90, width: 20, height: 20 })).toBe(true)
    expect(rectsOverlap(target, { x: 200, y: 0, width: 20, height: 20 })).toBe(false)
    expect(rectsOverlap(target, { x: 105, y: 0, width: 20, height: 20 }, 10)).toBe(true)
  })

  it('computes bounds and segment midpoints', () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(
      boundsOf([
        { x: 0, y: 0 },
        { x: 10, y: 20 },
      ])
    ).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 20,
    })
    expect(
      segmentMidpoints([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ])
    ).toEqual([{ x: 5, y: 0 }])
  })
})

describe('resolveCardSide', () => {
  it('honours an explicit side', () => {
    expect(resolveCardSide({ x: 0, y: 0, width: 10, height: 10 }, target, 'top')).toBe('top')
  })

  it('picks the edge facing the target', () => {
    const left: Rect = { x: -300, y: 40, width: 100, height: 60 }
    expect(resolveCardSide(left, target, 'auto')).toBe('right')
    const right: Rect = { x: 300, y: 40, width: 100, height: 60 }
    expect(resolveCardSide(right, target, 'auto')).toBe('left')
    const above: Rect = { x: 20, y: -300, width: 100, height: 60 }
    expect(resolveCardSide(above, target, 'auto')).toBe('bottom')
    const below: Rect = { x: 20, y: 300, width: 100, height: 60 }
    expect(resolveCardSide(below, target, 'auto')).toBe('top')
  })
})

describe('anchors', () => {
  it('clamps an outside point onto the border', () => {
    expect(nearestBorderPoint(target, { x: -50, y: 50 })).toEqual({ x: 0, y: 50 })
    expect(nearestBorderPoint(target, { x: 150, y: 20 })).toEqual({ x: 100, y: 20 })
  })

  it('pushes an inside point out to the closest edge', () => {
    expect(nearestBorderPoint(target, { x: 10, y: 50 })).toEqual({ x: 0, y: 50 })
    expect(nearestBorderPoint(target, { x: 90, y: 50 })).toEqual({ x: 100, y: 50 })
    expect(nearestBorderPoint(target, { x: 50, y: 10 })).toEqual({ x: 50, y: 0 })
    expect(nearestBorderPoint(target, { x: 50, y: 90 })).toEqual({ x: 50, y: 100 })
  })

  it('round-trips normalised anchors', () => {
    const anchor = normaliseAnchor(target, { x: 100, y: 25 })
    expect(anchor).toEqual([1, 0.25])
    expect(denormaliseAnchor(target, anchor)).toEqual({ x: 100, y: 25 })
  })

  it('keeps a normalised anchor proportional when the target resizes', () => {
    const anchor = normaliseAnchor(target, { x: 100, y: 50 })
    const resized: Rect = { x: 0, y: 0, width: 200, height: 400 }
    expect(denormaliseAnchor(resized, anchor)).toEqual({ x: 200, y: 200 })
  })

  it('clamps out-of-range points and handles zero-sized boxes', () => {
    expect(normaliseAnchor(target, { x: 500, y: -50 })).toEqual([1, 0])
    expect(normaliseAnchor({ x: 0, y: 0, width: 0, height: 0 }, { x: 5, y: 5 })).toEqual([0.5, 0.5])
  })

  it('names the edge a point sits on', () => {
    expect(sideOfPoint(target, { x: 0, y: 50 })).toBe('left')
    expect(sideOfPoint(target, { x: 100, y: 50 })).toBe('right')
    expect(sideOfPoint(target, { x: 50, y: 0 })).toBe('top')
    expect(sideOfPoint(target, { x: 50, y: 100 })).toBe('bottom')
  })
})

describe('simplify', () => {
  it('drops duplicates', () => {
    expect(
      simplify([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ])
    ).toHaveLength(1)
  })

  it('drops collinear midpoints', () => {
    const points = simplify([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ])
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
  })

  it('keeps genuine corners', () => {
    const points = simplify([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
    expect(points).toHaveLength(3)
  })
})

describe('elbowRoute', () => {
  it('exits horizontally for a sideways exit and stays orthogonal', () => {
    const points = elbowRoute({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'left', 24)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[points.length - 1]).toEqual({ x: 200, y: 100 })
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      const orthogonal = Math.abs(a.x - b.x) < 0.001 || Math.abs(a.y - b.y) < 0.001
      expect(orthogonal).toBe(true)
    }
  })

  it('exits vertically for a top or bottom exit', () => {
    const points = elbowRoute({ x: 0, y: 0 }, 'bottom', { x: 100, y: 200 }, 'top', 24)
    // The 24px stub is collinear with the first turn, so simplify() folds it in.
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 176 },
      { x: 100, y: 176 },
      { x: 100, y: 200 },
    ])
  })

  it('keeps the corner when exit and entry are on different axes', () => {
    const points = elbowRoute({ x: 0, y: 0 }, 'right', { x: 200, y: 100 }, 'top', 24)
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
    ])
  })
})

describe('snapToAxis', () => {
  it('snaps a nearly vertical segment', () => {
    const points = snapToAxis([
      { x: 0, y: 0 },
      { x: 3, y: 50 },
      { x: 0, y: 100 },
    ])
    expect(points[1]?.x).toBe(0)
  })

  it('leaves points beyond the tolerance alone', () => {
    const points = snapToAxis([
      { x: 0, y: 0 },
      { x: 40, y: 50 },
      { x: 80, y: 100 },
    ])
    expect(points[1]?.x).toBe(40)
  })

  it('is a no-op for two points', () => {
    const points = snapToAxis([
      { x: 0, y: 0 },
      { x: 3, y: 100 },
    ])
    expect(points[1]?.x).toBe(3)
  })
})

describe('cornerRadii', () => {
  it('keeps endpoints sharp', () => {
    const radii = cornerRadii(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      12
    )
    expect(radii[0]).toBe(0)
    expect(radii[2]).toBe(0)
    expect(radii[1]).toBe(12)
  })

  it('clamps to half the shorter neighbouring segment', () => {
    const radii = cornerRadii(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 100 },
      ],
      12
    )
    expect(radii[1]).toBe(5)
  })
})

describe('computeRoute', () => {
  const card: Rect = { x: 300, y: 0, width: 200, height: 80 }

  it('draws a straight line between the anchors', () => {
    const result = computeRoute({
      card,
      target,
      cardSide: 'auto',
      anchor: 'auto',
      route: 'auto',
      mode: 'straight',
      waypoints: [],
      stub: 24,
      snap: true,
    })
    expect(result.side).toBe('left')
    expect(result.points).toHaveLength(2)
    expect(result.points[0]).toEqual({ x: 300, y: 40 })
    expect(result.anchorPoint).toEqual({ x: 100, y: 40 })
    expect(result.hidden).toBe(false)
  })

  it('uses the waypoints for a custom route', () => {
    const result = computeRoute({
      card,
      target,
      cardSide: 'auto',
      anchor: 'auto',
      route: 'custom',
      mode: 'elbow',
      waypoints: [[250, 200]],
      stub: 24,
      snap: false,
    })
    expect(result.points).toHaveLength(3)
    expect(result.points[1]).toEqual({ x: 250, y: 200 })
  })

  it('falls back to the auto route when there are no waypoints', () => {
    const result = computeRoute({
      card,
      target,
      cardSide: 'auto',
      anchor: 'auto',
      route: 'custom',
      mode: 'elbow',
      waypoints: [],
      stub: 24,
      snap: true,
    })
    // Card and target share a centre line, so the elbow collapses to a straight run.
    expect(result.points).toEqual([
      { x: 300, y: 40 },
      { x: 100, y: 40 },
    ])
  })

  it('produces a real elbow when the card sits below the target', () => {
    const result = computeRoute({
      card: { x: 300, y: 400, width: 200, height: 80 },
      target,
      cardSide: 'auto',
      anchor: 'auto',
      route: 'auto',
      mode: 'elbow',
      waypoints: [],
      stub: 24,
      snap: true,
    })
    expect(result.points.length).toBeGreaterThan(2)
    expect(result.points[result.points.length - 1]).toEqual(result.anchorPoint)
  })

  it('hides the line when the card covers the target', () => {
    const result = computeRoute({
      card: { x: -50, y: -50, width: 300, height: 300 },
      target,
      cardSide: 'auto',
      anchor: 'auto',
      route: 'auto',
      mode: 'elbow',
      waypoints: [],
      stub: 24,
      snap: true,
    })
    expect(result.hidden).toBe(true)
  })

  it('respects an explicit anchor', () => {
    const result = computeRoute({
      card,
      target,
      cardSide: 'right',
      anchor: [0.5, 1],
      route: 'auto',
      mode: 'elbow',
      waypoints: [],
      stub: 24,
      snap: true,
    })
    expect(result.anchorPoint).toEqual({ x: 50, y: 100 })
  })
})

describe('translateWaypoints', () => {
  it('shifts every waypoint by the same delta', () => {
    expect(
      translateWaypoints(
        [
          [0, 0],
          [10, 20],
        ],
        5,
        -5
      )
    ).toEqual([
      [5, -5],
      [15, 15],
    ])
  })
})
