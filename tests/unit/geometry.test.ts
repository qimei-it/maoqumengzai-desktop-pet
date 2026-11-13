import { describe, expect, it } from 'vitest'
import {
  fitToDisplays,
  hitOpaquePixel,
  movedBeyondThreshold,
} from '../../src/shared/geometry'
import { commandSchema, maskSchema, pathsSchema } from '../../src/main/schemas'

describe('recoverable multi-display placement', () => {
  const primary = { x: 0, y: 25, width: 1440, height: 850 }
  const left = { x: -1920, y: -100, width: 1920, height: 1080 }
  it('preserves valid negative monitor coordinates', () => {
    const bounds = { x: -700, y: 200, width: 232, height: 240 }
    expect(fitToDisplays(bounds, [primary, left])).toEqual(bounds)
  })
  it('recovers a window after its monitor is unplugged', () => {
    expect(
      fitToDisplays({ x: -700, y: 200, width: 232, height: 240 }, [primary]),
    ).toEqual({ x: 0, y: 200, width: 232, height: 240 })
  })
  it('fits oversized windows without placing them above the usable area', () => {
    expect(
      fitToDisplays({ x: 100, y: 0, width: 3000, height: 2000 }, [primary]),
    ).toEqual(primary)
  })
  it('selects the largest overlap while crossing monitors', () => {
    expect(
      fitToDisplays({ x: -100, y: 100, width: 232, height: 240 }, [
        left,
        primary,
      ]).x,
    ).toBe(0)
  })
})

describe('scaled transparent pixels', () => {
  const mask = {
    rect: { x: 20, y: 30, width: 40, height: 40 },
    width: 2,
    height: 2,
    alpha: [0, 255, 31, 32],
  }
  it('passes transparent corners through and keeps opaque pixels interactive', () => {
    expect(hitOpaquePixel(mask, 21, 31)).toBe(false)
    expect(hitOpaquePixel(mask, 59, 31)).toBe(true)
    expect(hitOpaquePixel(mask, 21, 69)).toBe(false)
    expect(hitOpaquePixel(mask, 59, 69)).toBe(true)
  })
  it('excludes the right/bottom boundary rather than sampling the next row', () => {
    expect(hitOpaquePixel(mask, 60, 50)).toBe(false)
    expect(hitOpaquePixel(mask, 50, 70)).toBe(false)
  })
  it('keeps a missing mask recoverable and separates click from drag', () => {
    expect(hitOpaquePixel(undefined, 0, 0)).toBe(true)
    expect(movedBeyondThreshold({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false)
    expect(movedBeyondThreshold({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true)
  })
})

describe('IPC boundary validation', () => {
  it('rejects unknown commands, extra fields, invalid scales, and path-shaped file IDs', () => {
    for (const input of [
      { type: 'exec', value: 'test' },
      { type: 'recover', command: 'test' },
      { type: 'scale', scale: 10 },
      { type: 'remove-file', fileId: '/tmp/test.txt' },
    ]) {
      expect(commandSchema.safeParse(input).success).toBe(false)
    }
  })
  it('accepts archive and eat commands with folder ids', () => {
    const id = '00000000-0000-4000-8000-000000000000'
    expect(
      commandSchema.safeParse({
        type: 'archive-open',
        fileIds: [],
        folderIds: [id],
      }).success,
    ).toBe(true)
    expect(
      commandSchema.safeParse({ type: 'archive-open', fileIds: [id] }).success,
    ).toBe(true)
    expect(
      commandSchema.safeParse({
        type: 'eat-files',
        fileIds: [id],
        folderIds: [id],
      }).success,
    ).toBe(true)
    expect(
      commandSchema.safeParse({
        type: 'archive-open',
        fileIds: Array(33).fill(id),
        folderIds: [],
      }).success,
    ).toBe(false)
    expect(
      commandSchema.safeParse({
        type: 'archive-open',
        fileIds: [],
        folderIds: ['/tmp/folder'],
      }).success,
    ).toBe(false)
  })
  it('limits mask size, enforces pixel count, and rejects nonfinite positions', () => {
    expect(
      maskSchema.safeParse({
        rect: { x: 0, y: 0, width: 20, height: 20 },
        width: 2,
        height: 2,
        alpha: [0],
      }).success,
    ).toBe(false)
    expect(
      maskSchema.safeParse({
        rect: { x: NaN, y: 0, width: 20, height: 20 },
        width: 1,
        height: 1,
        alpha: [255],
      }).success,
    ).toBe(false)
    expect(pathsSchema.safeParse(Array(33).fill('/tmp/file')).success).toBe(
      false,
    )
  })
})
