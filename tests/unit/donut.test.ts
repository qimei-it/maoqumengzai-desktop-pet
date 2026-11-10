import { describe, expect, test } from 'vitest'
import {
  TAU,
  actionAt,
  angleOf,
  conversionTargets,
  donutMetrics,
  donutWindowSize,
  hitTest,
  indexAt,
  midAngle,
  outlinePath,
  pointAt,
  sliceCount,
  sliceGap,
  span,
  subIndexAt,
  subMidAngle,
  subSpan,
  wedge,
  type WedgeOutline,
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

  test('hit test separates the hole, the slices and the outside', () => {
    const { inner, outer, mid } = donutMetrics(1)
    expect(hitTest(0, 0, inner, outer, sliceCount).kind).toBe('center')
    expect(hitTest(0, inner - 4, inner, outer, sliceCount).kind).toBe('center')
    expect(hitTest(0, -mid, inner, outer, sliceCount)).toEqual({
      kind: 'segment',
      index: 0,
    })
    for (let index = 0; index < sliceCount; index += 1) {
      const point = pointAt(mid, midAngle(index, sliceCount))
      expect(hitTest(point.x, point.y, inner, outer, sliceCount)).toEqual({
        kind: 'segment',
        index,
      })
    }
    expect(hitTest(0, -(outer + 10), inner, outer, sliceCount).kind).toBe(
      'outside',
    )
    // Popped-out slices stay hittable through the slack.
    expect(hitTest(0, -(outer + 5), inner, outer, sliceCount, 7).kind).toBe(
      'segment',
    )
    expect(hitTest(0, -(outer + 8), inner, outer, sliceCount, 7).kind).toBe(
      'outside',
    )
  })

  test('actions follow the ring order and the centre cancels', () => {
    const { mid } = donutMetrics(1)
    expect(actionAt(0, 0, 1)).toBeNull()
    expect(actionAt(0, -mid, 1)).toBe('stash')
    expect(actionAt(0, mid, 1)).toBe('copy')
    expect(actionAt(mid, 0, 1)).toBe('compress')
    expect(actionAt(-mid, 0, 1)).toBe('ask')
    expect(actionAt(mid * Math.sin(Math.PI / 3), -mid * Math.cos(Math.PI / 3), 1)).toBe(
      'convert',
    )
    expect(
      actionAt(-mid * Math.sin(Math.PI / 3), mid * Math.cos(Math.PI / 3), 1),
    ).toBe('eat')
    expect(
      actionAt(mid * Math.sin(Math.PI / 3), mid * Math.cos(Math.PI / 3), 1),
    ).toBe('compress')
    expect(actionAt(0, -400, 1)).toBeNull()
  })
})

function outlinePoints(outline: WedgeOutline) {
  return [outline.start, ...outline.steps.map((step) => step.to)]
}

describe('wedge outlines (ported Filee cases)', () => {
  const inner = 68
  const outer = 126
  const sliceSpan = span(sliceCount)
  const mid = midAngle(1, sliceCount)

  test('a sharp slice keeps three steps on the two circles', () => {
    const outline = wedge(inner, outer, mid, sliceSpan, sliceGap, 0)
    expect(outline.cornerRadius).toBe(0)
    expect(outline.steps).toHaveLength(3)
    expect(Math.hypot(outline.start.x, outline.start.y)).toBeCloseTo(outer, 6)
    const path = outlinePath(outline)
    expect(path.match(/A /g)).toHaveLength(2)
    expect(path.match(/L /g)).toHaveLength(1)
  })

  test('a rounded slice stays inside its sharp shape and keeps the gap', () => {
    const outline = wedge(inner, outer, mid, sliceSpan, sliceGap, 6)
    expect(outline.cornerRadius).toBeCloseTo(6, 6)
    expect(outline.steps).toHaveLength(8)
    for (const point of outlinePoints(outline)) {
      const distance = Math.hypot(point.x, point.y)
      expect(distance).toBeGreaterThanOrEqual(inner - 1e-6)
      expect(distance).toBeLessThanOrEqual(outer + 1e-6)
      const delta = angleOf(point.x, point.y) - mid
      const offset = delta - TAU * Math.round(delta / TAU)
      expect(Math.abs(offset)).toBeLessThanOrEqual(sliceSpan / 2)
      expect(
        distance * Math.sin(sliceSpan / 2 - Math.abs(offset)),
      ).toBeGreaterThanOrEqual(sliceGap / 2 - 0.05)
    }
    const path = outlinePath(outline)
    expect(path.startsWith('M ')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path.match(/A /g)).toHaveLength(6)
  })

  test('thin slices get only the rounding that fits', () => {
    const thin = wedge(40, 126, 0, span(16), sliceGap, 6)
    expect(thin.cornerRadius).toBeGreaterThan(0.25)
    expect(thin.cornerRadius).toBeLessThanOrEqual(6)
    expect(thin.steps).toHaveLength(8)

    const shallow = wedge(inner, inner + 4, 0, span(4), sliceGap, 6)
    expect(shallow.cornerRadius).toBeLessThanOrEqual(2)
  })
})

describe('donut sizing', () => {
  test('hole, thickness and window follow the pet scale', () => {
    for (const scale of [0.75, 1, 1.25, 1.5]) {
      const metrics = donutMetrics(scale)
      expect(metrics.inner).toBe(Math.round(68 * scale))
      expect(metrics.outer - metrics.inner).toBe(Math.round(58 * scale))
      expect(metrics.window).toBe(2 * (metrics.outer + 30))
    }
    const metrics = donutMetrics(1)
    expect(metrics.inner).toBe(68)
    expect(metrics.outer).toBe(126)
    expect(metrics.window).toBe(312)
  })

  test('window never shrinks below the base pet window', () => {
    for (const scale of [0.75, 1, 1.25, 1.5]) {
      const size = donutWindowSize(scale)
      expect(size.width).toBeGreaterThanOrEqual(Math.round(132 * scale))
      expect(size.height).toBeGreaterThanOrEqual(Math.round(140 * scale))
    }
    expect(donutWindowSize(1)).toEqual({ width: 312, height: 312 })
  })

  test('a full-body pet fits inside the hole', () => {
    const { inner } = donutMetrics(1)
    expect(inner * 2).toBeGreaterThanOrEqual(120)
  })
})

describe('fan geometry (kept for the conversion sub-ring)', () => {
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
})

describe('conversion targets', () => {
  test('keep the formats every file shares', () => {
    expect(conversionTargets(['照片.heic'])).toEqual(['JPG', 'PNG', 'PDF'])
    expect(conversionTargets(['a.png', 'b.pdf'])).toEqual(['JPG', 'PNG'])
    expect(conversionTargets(['a.png', 'b.mp4'])).toEqual([])
    expect(conversionTargets([])).toEqual([])
  })
})
