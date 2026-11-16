/** Ark Seedream generation for custom desktop pet poses. */

import sharp from 'sharp'
import { generateVolcanoImage } from '../shared/volcano'
import {
  analyzePetImage,
  normalizePetImage,
  type PetImageAnalysis,
} from './pet-image'

export type PetGenerationRequest = {
  apiKey: string
  model: string
  prompt: string
  references?: Buffer[]
  size?: '1K' | '1.5K' | '2K'
}

export type PetGenerationResult = {
  buffer: Buffer
  analysis: PetImageAnalysis
  background?: string
  model?: string
}

async function referenceDataUrl(buffer: Buffer): Promise<string> {
  const image = sharp(buffer).rotate()
  const metadata = await image.metadata()
  if (metadata.hasAlpha) {
    const analysis = await analyzePetImage(buffer)
    if (analysis.hasTransparentPixels) {
      const png = await image.png().toBuffer()
      return `data:image/png;base64,${png.toString('base64')}`
    }
  }
  const jpeg = await image
    .resize({
      width: 1024,
      height: 1024,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

/** Generate one raw pose. Callers still decide whether to normalize it. */
export async function generatePetPose(
  request: PetGenerationRequest,
): Promise<PetGenerationResult> {
  const references = await Promise.all(
    (request.references ?? []).map(referenceDataUrl),
  )
  const result = await generateVolcanoImage(
    request.apiKey,
    {
      model: request.model,
      prompt: request.prompt,
      ...(references.length ? { images: references } : {}),
      size: request.size ?? '1K',
      background: 'transparent',
      outputFormat: 'png',
      responseFormat: 'b64_json',
    },
    { timeoutMs: 600_000 },
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : ''
    if (/not activated the model/i.test(message))
      throw new Error('火山方舟还没有开通这个图像模型，请在控制台开通后重试。')
    throw error
  })
  const image = result.images[0]
  if (!image) throw new Error('火山方舟没有返回图片。')
  if (image.error) throw new Error(`火山方舟生成失败：${image.error}`)
  if (!image.base64) throw new Error('火山方舟没有返回图片数据。')
  const buffer = Buffer.from(image.base64, 'base64')
  const analysis = await analyzePetImage(buffer)
  if (!analysis.hasAlphaChannel || !analysis.hasTransparentPixels)
    throw new Error(
      '生成结果没有真实透明通道，请确认模型支持透明 PNG 图生图。',
    )
  const padding = analysis.padding
  if (
    !padding ||
    Math.min(padding.top, padding.right, padding.bottom, padding.left) < 0.02
  )
    throw new Error('生成图片离边缘太近，请重新生成。')
  return {
    buffer,
    analysis,
    ...(image.background ? { background: image.background } : {}),
    ...(result.model ? { model: result.model } : {}),
  }
}

/** Generate and normalize one pose for the desktop pet renderer. */
export async function generatePetAsset(
  request: PetGenerationRequest,
): Promise<PetGenerationResult & { normalized: Buffer }> {
  const result = await generatePetPose(request)
  const normalized = await normalizePetImage(result.buffer)
  return { ...result, normalized: normalized.buffer }
}
