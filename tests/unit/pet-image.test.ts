import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import {
  analyzePetImage,
  normalizePetImage,
} from '../../src/main/pet-image'

async function canvas(
  width: number,
  height: number,
  rect?: { left: number; top: number; width: number; height: number },
  alpha = 0,
): Promise<Buffer> {
  const channels = 4
  const data = Buffer.alloc(width * height * channels)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside =
        rect &&
        x >= rect.left &&
        x < rect.left + rect.width &&
        y >= rect.top &&
        y < rect.top + rect.height
      const offset = (y * width + x) * channels
      data[offset] = 180
      data[offset + 1] = 140
      data[offset + 2] = 110
      data[offset + 3] = inside ? 255 : alpha
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer()
}

describe('pet image normalization', () => {
  test('detects real alpha and visible bounds', async () => {
    const buffer = await canvas(1024, 1024, {
      left: 300,
      top: 100,
      width: 400,
      height: 800,
    })
    const analysis = await analyzePetImage(buffer)
    expect(analysis).toMatchObject({
      width: 1024,
      height: 1024,
      hasAlphaChannel: true,
      hasTransparentPixels: true,
      hasOpaquePixels: true,
    })
    expect(analysis.bounds).toEqual({
      left: 300,
      top: 100,
      width: 400,
      height: 800,
    })
    expect(analysis.padding?.bottom).toBeCloseTo(124 / 1024)
  })

  test('fits into 448 and pins the bottom anchor', async () => {
    const buffer = await canvas(1024, 1024, {
      left: 300,
      top: 100,
      width: 400,
      height: 800,
    })
    const result = await normalizePetImage(buffer)
    const output = await sharp(result.buffer).metadata()
    expect(output).toMatchObject({ width: 448, height: 448, hasAlpha: true })
    expect(result.bounds.width).toBeLessThanOrEqual(413)
    expect(result.bounds.height).toBeLessThanOrEqual(413)
    expect(result.bounds.top + result.bounds.height).toBe(430)
    expect(result.bounds.left).toBe(
      Math.floor((448 - result.bounds.width) / 2),
    )
    const check = await analyzePetImage(result.buffer)
    expect(check.hasTransparentPixels).toBe(true)
    expect(check.padding?.bottom).toBeCloseTo(18 / 448, 2)
  })

  test('rejects opaque images', async () => {
    const buffer = await canvas(1024, 1024, undefined, 255)
    await expect(normalizePetImage(buffer)).rejects.toThrow('真实透明通道')
  })

  test('rejects empty images', async () => {
    const buffer = await canvas(1024, 1024, undefined, 0)
    await expect(normalizePetImage(buffer)).rejects.toThrow('没有可见内容')
  })
})
