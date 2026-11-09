import { describe, expect, test } from 'vitest'
import {
  TAU,
  angleOf,
  arcPath,
  conversionTargets,
  donutMetrics,
  donutWindowSize,
  hitTest,
  indexAt,
  midAngle,
  pointAt,
  span,
  subIndexAt,
  subMidAngle,
  subSpan,
} from '../../src/shared/donut'

describe('donut geometry (ported Filee cases)', () => {
  test('slices cover the circle exactly', () => {
    for (const count of [1, 2, 3, 4, 6, 9, 12]) {
      expect(span(count) * count).toBeCloseTo(TAU, 6)
      for (let index = 0; index < count; index++) {
        expect(indexAt(midAngle(index, count), count)).toBe(index)
      }
    }
  })

  test('angles run clockwise from twelve o clock', () => {
    expect(angleOf(0, -10)).toBeCloseTo(0, 6)
    const right = pointAt(100, Math.PI / 2)
    expect(right.x).toBeCloseTo(100, 6)
    expect(right.y).toBeCloseTo(0, 6)
    const bottom = pointAt(100, Math.PI)
    expect(bottom.x).toBeCloseTo(0, 6)
    expect(bottom.y).toBeCloseTo(100, 6)
  })

  test('hit test separates the hole, the two halves and the outside', () => {
    const inner = 70
    const outer = 166
    const rotation = Math.PI / 2
    expect(hitTest(0, 0, inner, outer, 2, 0, rotation).kind).toBe('center')
    expect(hitTest(0, 10, inner, outer, 2, 0, rotation).kind).toBe('center')
    // Rotation π/2: slice 0 is the right half, slice 1 the left half.
    expect(hitTest(118, 0, inner, outer, 2, 0, rotation)).toEqual({
      kind: 'segment',
      index: 0,
    })
    expect(hitTest(-118, 0, inner, outer, 2, 0, rotation)).toEqual({
      kind: 'segment',
      index: 1,
    })
    expect(hitTest(108, 40, inner, outer, 2, 0, rotation)).toEqual({
      kind: 'segment',
      index: 0,
    })
    expect(hitTest(-108, -40, inner, outer, 2, 0, rotation)).toEqual({
      kind: 'segment',
      index: 1,
    })
    expect(hitTest(0, 200, inner, outer, 2, 0, rotation).kind).toBe(
      'outside',
    )
    expect(hitTest(0, 166, inner, outer, 2, 4, rotation).kind).toBe('segment')
    expect(hitTest(0, 171, inner, outer, 2, 4, rotation).kind).toBe('outside')
  })

  test('without rotation slice 0 is the top half (Filee default)', () => {
    const top = hitTest(0, -118, 70, 166, 2)
    expect(top.kind === 'segment' && top.index).toBe(0)
    const bottom = hitTest(0, 118, 70, 166, 2)
    expect(bottom.kind === 'segment' && bottom.index).toBe(1)
  })

  test('a fan keeps every slice inside its parent span', () => {
    const parent = span(2)
    const step = subSpan(parent, 3)
    expect(step * 3).toBeCloseTo(parent * 1.5, 6)
    expect(subSpan(span(1), 2)).toBeCloseTo(Math.PI, 6)
    expect(subSpan(span(12), 6, 190) * 190).toBeCloseTo(44, 6)
  })

  test('fan slices are found by angle and radius around the parent', () => {
    const parentMid = Math.PI * 1.5
    const step = subSpan(span(2), 3)
    for (let sub = 0; sub < 3; sub++) {
      const angle = subMidAngle(parentMid, sub, 3, step)
      const point = pointAt(190, angle)
      expect(
        subIndexAt(point.x, point.y, 172, 208, parentMid, 3, step),
      ).toBe(sub)
    }
    const wrongAngle = pointAt(190, Math.PI / 2)
    expect(
      subIndexAt(wrongAngle.x, wrongAngle.y, 172, 208, parentMid, 3, step),
    ).toBe(-1)
    const tooClose = pointAt(150, parentMid)
    expect(
      subIndexAt(tooClose.x, tooClose.y, 172, 208, parentMid, 3, step),
    ).toBe(-1)
  })

  test('arc path stays a single sweep for a half ring', () => {
    expect(arcPath(120, 0.1, Math.PI - 0.1)).toMatch(
      /^M .* A 120 120 0 0 1 /,
    )
    expect(arcPath(120, Math.PI + 0.1, TAU - 0.1)).toMatch(
      /^M .* A 120 120 0 0 1 /,
    )
  })
})

describe('donut sizing', () => {
  test('the hole keeps room for the sprite and the ring stays constant', () => {
    for (const scale of [0.75, 1, 1.5, 2]) {
      const metrics = donutMetrics(scale)
      expect(metrics.inner).toBeGreaterThanOrEqual(64)
      expect(metrics.outer - metrics.inner).toBe(76)
      expect(metrics.subOuter).toBeGreaterThan(metrics.outer)
      expect(metrics.window).toBe(2 * (metrics.outer + 34))
    }
  })

  test('window never shrinks below the base pet window', () => {
    for (const scale of [0.75, 1, 1.5, 2]) {
      const size = donutWindowSize(scale)
      expect(size.width).toBeGreaterThanOrEqual(Math.round(180 * scale))
      expect(size.height).toBeGreaterThanOrEqual(Math.round(192 * scale))
    }
    expect(donutWindowSize(1).width).toBe(348)
  })
})

describe('batch copy', () => {
  test('conversion targets stay an intersection', () => {
    expect(conversionTargets(['照片.heic'])).toEqual(['JPG', 'PNG', 'PDF'])
    expect(conversionTargets(['a.png', 'b.pdf'])).toEqual(['JPG', 'PNG'])
    expect(conversionTargets(['a.png', 'b.mp4'])).toEqual([])
    expect(conversionTargets([])).toEqual([])
  })
})
