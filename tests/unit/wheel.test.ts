import { describe, expect, test } from 'vitest'
import {
  conversionTargets,
  petalPositions,
  summarizeBatch,
  wheelRadius,
  wheelWindowSize,
} from '../../src/shared/wheel'

describe('wheel geometry', () => {
  test('radius grows with the pet and leaves room for the petals', () => {
    expect(wheelRadius(1)).toBe(108)
    expect(wheelRadius(1.5)).toBeGreaterThan(wheelRadius(1))
    expect(wheelRadius(0.75)).toBeLessThan(wheelRadius(1))
  })

  test('window never shrinks below the base pet window', () => {
    for (const scale of [0.75, 1, 1.5, 2]) {
      const size = wheelWindowSize(scale)
      expect(size.width).toBeGreaterThanOrEqual(Math.round(232 * scale))
      expect(size.height).toBeGreaterThanOrEqual(Math.round(240 * scale))
      expect(size.width).toBeGreaterThanOrEqual(2 * (wheelRadius(scale) + 40))
      expect(size.height).toBeGreaterThanOrEqual(
        2 * (wheelRadius(scale) + 40),
      )
    }
  })

  test('three petals sit on the ring at 120 degree steps', () => {
    const points = petalPositions(3, 100)
    expect(points).toHaveLength(3)
    expect(points[0].x).toBeCloseTo(0, 5)
    expect(points[0].y).toBeCloseTo(-100, 5)
    for (const point of points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(100, 5)
    }
    // Counter-clockwise from the top: lower-left, then lower-right.
    expect(points[1].angle).toBe(150)
    expect(points[1].x).toBeLessThan(0)
    expect(points[2].angle).toBe(30)
    expect(points[2].x).toBeGreaterThan(0)
  })

  test('clockwise order is available for the format ring', () => {
    expect(petalPositions(3, 100, -90, true)[1].angle).toBe(30)
  })

  test('an empty ring has no petals', () => {
    expect(petalPositions(0, 100)).toEqual([])
  })
})

describe('batch summary', () => {
  test('lists distinct extensions without any path', () => {
    expect(
      summarizeBatch([
        { name: '猫咪.png' },
        { name: '奶糖.PNG' },
        { name: '报告.pdf' },
      ]),
    ).toBe('3 个文件 · PNG、PDF')
  })

  test('caps the extension list and reports the remainder', () => {
    expect(
      summarizeBatch([
        { name: 'a.png' },
        { name: 'b.jpg' },
        { name: 'c.pdf' },
        { name: 'd.mp4' },
      ]),
    ).toBe('4 个文件 · PNG、JPG、PDF 等 4 种')
  })

  test('handles files without an extension', () => {
    expect(summarizeBatch([{ name: 'README' }])).toBe('1 个文件')
    expect(summarizeBatch([])).toBe('没有待处理文件')
  })
})

describe('conversion targets', () => {
  test('offers the planned image targets', () => {
    expect(conversionTargets(['照片.heic'])).toEqual(['JPG', 'PNG', 'PDF'])
    expect(conversionTargets(['a.png', 'b.jpg'])).toEqual([
      'JPG',
      'PNG',
      'WEBP',
      'PDF',
    ])
  })

  test('keeps only targets every file can reach', () => {
    expect(conversionTargets(['a.png', 'b.mp4'])).toEqual([])
    expect(conversionTargets(['a.png', 'b.pdf'])).toEqual(['JPG', 'PNG'])
    expect(conversionTargets(['a.docx', 'b.xlsx'])).toEqual(['PDF'])
  })

  test('unknown or empty input offers nothing rather than a guess', () => {
    expect(conversionTargets(['archive.unknownext'])).toEqual([])
    expect(conversionTargets([])).toEqual([])
  })

  test('respects the display limit', () => {
    expect(conversionTargets(['a.png'], 2)).toEqual(['JPG', 'PNG'])
  })
})
