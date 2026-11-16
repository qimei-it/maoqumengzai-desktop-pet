/** Validation and normalization for generated desktop pet pose images. */

import sharp from 'sharp'

export type PetImageBounds = {
  left: number
  top: number
  width: number
  height: number
}

export type PetImagePadding = {
  top: number
  right: number
  bottom: number
  left: number
}

export type PetImageAnalysis = {
  width: number
  height: number
  hasAlphaChannel: boolean
  hasTransparentPixels: boolean
  hasOpaquePixels: boolean
  opaqueRatio: number
  bounds: PetImageBounds | null
  padding: PetImagePadding | null
}

export type NormalizedPetImage = {
  buffer: Buffer
  analysis: PetImageAnalysis
  size: number
  bounds: PetImageBounds
}

const alphaThreshold = 8

export async function analyzePetImage(
  buffer: Buffer,
): Promise<PetImageAnalysis> {
  const image = sharp(buffer).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1
  let opaque = 0
  let transparent = 0
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3] ?? 0
      if (alpha >= 250) opaque += 1
      if (alpha <= alphaThreshold) {
        transparent += 1
        continue
      }
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  const metadata = await sharp(buffer).metadata()
  const bounds =
    right >= left && bottom >= top
      ? {
          left,
          top,
          width: right - left + 1,
          height: bottom - top + 1,
        }
      : null
  return {
    width: info.width,
    height: info.height,
    hasAlphaChannel: Boolean(metadata.hasAlpha),
    hasTransparentPixels: transparent > 0,
    hasOpaquePixels: opaque > 0,
    opaqueRatio: opaque / (info.width * info.height),
    bounds,
    padding: bounds
      ? {
          top: top / info.height,
          right: (info.width - (bounds.left + bounds.width)) / info.width,
          bottom: (info.height - (bounds.top + bounds.height)) / info.height,
          left: left / info.width,
        }
      : null,
  }
}

/**
 * Trim transparent padding, fit the pet inside the safe area, center it
 * horizontally and keep a stable bottom anchor.
 */
export async function normalizePetImage(
  buffer: Buffer,
  options: { size?: number; edge?: number } = {},
): Promise<NormalizedPetImage> {
  const size = options.size ?? 448
  const edge = options.edge ?? 0.04
  const analysis = await analyzePetImage(buffer)
  if (!analysis.bounds) throw new Error('图片没有可见内容。')
  if (!analysis.hasAlphaChannel || !analysis.hasTransparentPixels)
    throw new Error('图片没有真实透明通道。')
  const safe = Math.max(1, Math.round(size * (1 - edge * 2)))
  const inset = Math.round(size * edge)
  const { bounds } = analysis
  const content = await sharp(buffer)
    .ensureAlpha()
    .extract({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    })
    .resize({ width: safe, height: safe, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true })
  const width = content.info.width
  const height = content.info.height
  if (width > safe || height > safe)
    throw new Error('图片缩放后超出安全区域。')
  const left = Math.floor((size - width) / 2)
  const top = Math.max(0, size - inset - height)
  const normalized = await sharp(content.data)
    .extend({
      top,
      bottom: size - top - height,
      left,
      right: size - left - width,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
  const output = await analyzePetImage(normalized)
  return {
    buffer: normalized,
    analysis,
    size,
    bounds: output.bounds ?? { left, top, width, height },
  }
}
