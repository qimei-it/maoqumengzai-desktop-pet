/**
 * Runs image, video and speech generation for the agent panel.
 * MiniMax models use the MiniMax APIs; Seedream uses the Volcano Ark API.
 * Outputs are downloaded into a local folder served by the mqmz-media scheme.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { AgentAttachmentKind, AgentMediaKind } from '../../shared/agent'
import type { AgentModelId } from '../../shared/agent-models'
import { modelInfo } from '../../shared/agent-models'
import type {
  GenerationParams,
  ImageArea,
  ImageRatio,
} from '../../shared/generation'
import { generateVolcanoImage } from '../../shared/volcano'
import {
  cancelMiniMaxVideo,
  createMiniMaxVideo,
  editMiniMaxImage,
  generateMiniMaxImage,
  generateMiniMaxSpeech,
  uploadMiniMaxFile,
  waitForMiniMaxVideo,
  type MiniMaxVideoTask,
} from './minimax-api'

export type GenerationReference = {
  path: string
  kind: AgentAttachmentKind
}

export type GeneratedMedia = {
  path: string
  name: string
  kind: AgentMediaKind
  size?: number
  width?: number
  height?: number
  durationSeconds?: number
}

export type GenerationOutcome = {
  items: GeneratedMedia[]
  warnings: string[]
}

export type GenerationRequest = {
  apiKey: string
  model: AgentModelId
  prompt: string
  params: GenerationParams
  references: GenerationReference[]
  outputDir: string
  signal: AbortSignal
  onProgress(text: string): void
}

function stamp(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function imageExtension(format: string): string {
  return format === 'jpeg' || format === 'jpg' ? 'jpg' : format
}

function parseSize(value?: string): { width?: number; height?: number } {
  if (!value) return {}
  const match = /^(\d+)x(\d+)$/i.exec(value.trim())
  if (!match) return {}
  return { width: Number(match[1]), height: Number(match[2]) }
}

async function download(url: string, signal: AbortSignal): Promise<Buffer> {
  const timeout = AbortSignal.timeout(180_000)
  const combined = AbortSignal.any([signal, timeout])
  let response: Response
  try {
    response = await fetch(url, { signal: combined })
  } catch (error) {
    if (signal.aborted) throw error
    if (timeout.aborted) throw new Error('下载生成结果超时，请稍后重试。')
    throw new Error('下载生成结果失败，请检查网络后重试。')
  }
  if (!response.ok)
    throw new Error(`下载生成结果失败（${response.status}）。`)
  return Buffer.from(await response.arrayBuffer())
}

async function saveFile(
  outputDir: string,
  name: string,
  data: Buffer,
): Promise<{ path: string; size?: number }> {
  const path = join(outputDir, name)
  await writeFile(path, data)
  const info = await stat(path).catch(() => null)
  return { path, ...(info ? { size: info.size } : {}) }
}

async function assertReferenceSizes(
  references: GenerationReference[],
  limits: Partial<Record<AgentAttachmentKind, number>>,
): Promise<void> {
  for (const reference of references) {
    const limit = limits[reference.kind]
    if (!limit) continue
    const info = await stat(reference.path).catch(() => null)
    if (!info?.isFile()) throw new Error('参考文件已不在。')
    if (info.size > limit)
      throw new Error(
        `${reference.kind === 'video' ? '参考视频' : reference.kind === 'audio' ? '参考音频' : '参考图片'}不能超过 ${Math.round(limit / 1024 / 1024)} MB。`,
      )
  }
}

async function uploadReferences(
  apiKey: string,
  references: GenerationReference[],
  purpose: 'image_generation_input' | 'video_generation_input',
  signal: AbortSignal,
): Promise<string[]> {
  const ids: string[] = []
  for (const reference of references) {
    if (signal.aborted) throw new Error('已取消。')
    const { fileId } = await uploadMiniMaxFile(
      apiKey,
      { path: reference.path, purpose },
      { signal, timeoutMs: 180_000 },
    )
    ids.push(`mm_file://${fileId}`)
  }
  return ids
}

async function runImage(
  request: GenerationRequest,
): Promise<GenerationOutcome> {
  const images = request.references.filter((item) => item.kind === 'image')
  const unsupported = request.references.filter(
    (item) => item.kind !== 'image',
  )
  if (unsupported.length)
    throw new Error('图片生成只支持图片作为参考素材。')
  if (images.length > 16) throw new Error('图片编辑最多支持 16 张参考图。')
  if (images.length && request.references.length !== images.length)
    throw new Error('图片生成只支持图片作为参考素材。')
  await assertReferenceSizes(images, { image: 64 * 1024 * 1024 })

  let urls: string[] = []
  if (images.length) {
    request.onProgress(`正在上传 ${images.length} 张参考图…`)
    urls = await uploadReferences(
      request.apiKey,
      images,
      'image_generation_input',
      request.signal,
    )
  }

  request.onProgress(
    `正在生成 ${request.params.image.count} 张图片，可能需要几十秒…`,
  )
  const result = images.length
    ? await editMiniMaxImage(
        request.apiKey,
        {
          prompt: request.prompt,
          images: urls,
          count: request.params.image.count,
          area: request.params.image.area,
          aspectRatio: request.params.image.ratio,
          outputFormat: request.params.image.format,
          responseFormat: 'url',
        },
        { signal: request.signal },
      )
    : await generateMiniMaxImage(
        request.apiKey,
        {
          prompt: request.prompt,
          count: request.params.image.count,
          area: request.params.image.area,
          aspectRatio: request.params.image.ratio,
          outputFormat: request.params.image.format,
          responseFormat: 'url',
        },
        { signal: request.signal },
      )

  if (!result.images.length) throw new Error('MiniMax 没有返回图片。')
  request.onProgress('正在保存图片…')
  const items: GeneratedMedia[] = []
  const warnings: string[] = []
  let index = 0
  for (const image of result.images) {
    index += 1
    if (image.error) {
      warnings.push(image.error)
      continue
    }
    if (!image.url && !image.base64) {
      warnings.push('有一张图片没有返回内容。')
      continue
    }
    const data = image.base64
      ? Buffer.from(image.base64, 'base64')
      : await download(image.url!, request.signal)
    const name = `图片-${stamp()}-${randomUUID().slice(0, 6)}-${index}.${imageExtension(
      request.params.image.format,
    )}`
    const saved = await saveFile(request.outputDir, name, data)
    const dimensions = parseSize(image.size)
    items.push({
      ...saved,
      name,
      kind: 'image',
      ...dimensions,
    })
  }
  if (!items.length)
    throw new Error(warnings[0] || '图片生成失败，请调整描述后重试。')
  return { items, warnings }
}

const seedreamModel = 'doubao-seedream-5-5-261028'
const seedreamSizes: Record<
  '1K' | '2K',
  Record<Exclude<ImageRatio, 'auto'>, string>
> = {
  '1K': {
    '21:9': '1568x672',
    '16:9': '1424x800',
    '4:3': '1152x864',
    '1:1': '1024x1024',
    '3:4': '864x1152',
    '9:16': '800x1424',
  },
  '2K': {
    '21:9': '3136x1344',
    '16:9': '2816x1584',
    '4:3': '2368x1776',
    '1:1': '2048x2048',
    '3:4': '1776x2368',
    '9:16': '1584x2816',
  },
}

function seedreamSize(area: ImageArea, ratio: ImageRatio): string {
  if (area === '4K')
    throw new Error('Doubao Seedream 5.5 不支持 4K，请使用 1K 或 2K。')
  if (ratio === 'auto') return area === '1K' ? '1024x1024' : '2048x2048'
  return seedreamSizes[area][ratio]
}

async function referenceDataUrl(path: string): Promise<string> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new Error('参考文件已不在。')
  const image = sharp(path).rotate()
  const metadata = await image.metadata()
  if (metadata.hasAlpha) {
    const png = await image.png().toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  }
  const jpeg = await image
    .resize({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

async function runVolcanoImage(
  request: GenerationRequest,
): Promise<GenerationOutcome> {
  const { image: params } = request.params
  if (params.count !== 1)
    throw new Error(
      'Doubao Seedream 5.5 每次只能生成 1 张图片，请把 count 改为 1。',
    )
  if (params.format === 'webp')
    throw new Error('Doubao Seedream 5.5 只支持 png 或 jpeg 输出。')
  const unsupported = request.references.filter(
    (item) => item.kind !== 'image',
  )
  if (unsupported.length)
    throw new Error('图片生成只支持图片作为参考素材。')
  await assertReferenceSizes(request.references, {
    image: 30 * 1024 * 1024,
  })
  request.onProgress(
    request.references.length
      ? `正在准备 ${request.references.length} 张参考图…`
      : '正在生成图片…',
  )
  const images = await Promise.all(
    request.references.map((reference) => referenceDataUrl(reference.path)),
  )
  const result = await generateVolcanoImage(
    request.apiKey,
    {
      model: seedreamModel,
      prompt: request.prompt,
      ...(images.length ? { images } : {}),
      size: seedreamSize(params.area, params.ratio),
      background: 'opaque',
      outputFormat: params.format === 'png' ? 'png' : 'jpeg',
      responseFormat: 'b64_json',
    },
    { signal: request.signal },
  )
  const items: GeneratedMedia[] = []
  const warnings: string[] = []
  let index = 0
  for (const image of result.images) {
    index += 1
    if (image.error) {
      warnings.push(image.error)
      continue
    }
    if (!image.url && !image.base64) {
      warnings.push('有一张图片没有返回内容。')
      continue
    }
    const data = image.base64
      ? Buffer.from(image.base64, 'base64')
      : await download(image.url!, request.signal)
    const extension = image.format === 'jpeg' ? 'jpg' : 'png'
    const name = `图片-${stamp()}-${randomUUID().slice(0, 6)}-${index}.${extension}`
    const saved = await saveFile(request.outputDir, name, data)
    const dimensions = parseSize(image.size)
    items.push({
      ...saved,
      name,
      kind: 'image',
      ...dimensions,
    })
  }
  if (!items.length)
    throw new Error(warnings[0] || '图片生成失败，请调整描述后重试。')
  return { items, warnings }
}

async function runVideo(
  request: GenerationRequest,
): Promise<GenerationOutcome> {
  const images = request.references.filter((item) => item.kind === 'image')
  const videos = request.references.filter((item) => item.kind === 'video')
  const audios = request.references.filter((item) => item.kind === 'audio')
  const other = request.references.filter(
    (item) =>
      item.kind !== 'image' && item.kind !== 'video' && item.kind !== 'audio',
  )
  if (other.length)
    throw new Error('视频生成只支持图片、视频和音频作为参考素材。')
  if (images.length > 9) throw new Error('视频生成最多支持 9 张参考图。')
  if (videos.length > 3) throw new Error('视频生成最多支持 3 段参考视频。')
  if (audios.length > 3) throw new Error('视频生成最多支持 3 段参考音频。')
  await assertReferenceSizes(request.references, {
    image: 30 * 1024 * 1024,
    video: 50 * 1024 * 1024,
    audio: 15 * 1024 * 1024,
  })

  const hasReferenceMedia = videos.length > 0 || audios.length > 0
  const firstFrameMode = images.length === 1 && !hasReferenceMedia
  const frameMode = images.length === 2 && !hasReferenceMedia

  let imageUrls: string[] = []
  let videoUrls: string[] = []
  let audioUrls: string[] = []
  if (images.length) {
    request.onProgress('正在上传参考图片…')
    imageUrls = await uploadReferences(
      request.apiKey,
      images,
      'video_generation_input',
      request.signal,
    )
  }
  if (videos.length) {
    request.onProgress('正在上传参考视频…')
    videoUrls = await uploadReferences(
      request.apiKey,
      videos,
      'video_generation_input',
      request.signal,
    )
  }
  if (audios.length) {
    request.onProgress('正在上传参考音频…')
    audioUrls = await uploadReferences(
      request.apiKey,
      audios,
      'video_generation_input',
      request.signal,
    )
  }

  request.onProgress('正在创建视频任务…')
  const { taskId } = await createMiniMaxVideo(
    request.apiKey,
    {
      model: 'MiniMax-H3',
      prompt: request.prompt,
      resolution: request.params.video.resolution,
      duration: request.params.video.duration,
      ratio: request.params.video.ratio,
      ...(firstFrameMode
        ? { firstFrameUrl: imageUrls[0] }
        : frameMode
          ? { firstFrameUrl: imageUrls[0], lastFrameUrl: imageUrls[1] }
          : imageUrls.length
            ? { referenceImageUrls: imageUrls }
            : {}),
      ...(videoUrls.length ? { referenceVideoUrls: videoUrls } : {}),
      ...(audioUrls.length ? { referenceAudioUrls: audioUrls } : {}),
    },
    { signal: request.signal },
  )

  const started = Date.now()
  const cancelTask = (): void => {
    // Only queued tasks can be cancelled; ignore errors for running tasks.
    void cancelMiniMaxVideo(request.apiKey, taskId, {
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {})
  }
  request.signal.addEventListener('abort', cancelTask, { once: true })
  let task: MiniMaxVideoTask
  try {
    task = await waitForMiniMaxVideo(request.apiKey, taskId, {
      signal: request.signal,
      intervalMs: 5_000,
      maxWaitMs: 20 * 60_000,
      onProgress: (value) => {
        const seconds = Math.round((Date.now() - started) / 1000)
        request.onProgress(
          value.status === 'queued'
            ? `视频任务排队中 · 已用时 ${seconds} 秒`
            : `视频生成中 · 已用时 ${seconds} 秒`,
        )
      },
    })
  } finally {
    request.signal.removeEventListener('abort', cancelTask)
  }
  if (!task.url) throw new Error('MiniMax 没有返回视频地址。')
  request.onProgress('正在保存视频…')
  const data = await download(task.url, request.signal)
  const name = `视频-${stamp()}-${randomUUID().slice(0, 6)}.mp4`
  const saved = await saveFile(request.outputDir, name, data)
  return {
    items: [
      {
        ...saved,
        name,
        kind: 'video',
        ...(task.duration ? { durationSeconds: task.duration } : {}),
      },
    ],
    warnings: [],
  }
}

async function runSpeech(
  request: GenerationRequest,
): Promise<GenerationOutcome> {
  if (request.references.length)
    throw new Error('语音合成不需要参考附件。')
  request.onProgress('正在合成语音…')
  const result = await generateMiniMaxSpeech(
    request.apiKey,
    {
      text: request.prompt,
      model:
        request.model === 'speech-2.8-turbo'
          ? 'speech-2.8-turbo'
          : 'speech-2.8-hd',
      voiceId: request.params.speech.voiceId,
      speed: request.params.speech.speed,
      ...(request.params.speech.emotion
        ? { emotion: request.params.speech.emotion }
        : {}),
      format: request.params.speech.format,
      outputFormat: 'hex',
    },
    { signal: request.signal },
  )
  if (!result.audio) throw new Error('MiniMax 没有返回音频数据。')
  request.onProgress('正在保存音频…')
  const name = `语音-${stamp()}-${randomUUID().slice(0, 6)}.${request.params.speech.format}`
  const saved = await saveFile(request.outputDir, name, result.audio)
  return {
    items: [
      {
        ...saved,
        name,
        kind: 'audio',
        ...(result.durationMs
          ? { durationSeconds: Math.round(result.durationMs / 100) / 10 }
          : {}),
      },
    ],
    warnings: [],
  }
}

export function generationKindForModel(
  model: AgentModelId,
): AgentMediaKind | null {
  const info = modelInfo(model)
  if (!info || info.kind === 'text') return null
  return info.kind === 'speech' ? 'audio' : info.kind
}

export async function runAgentGeneration(
  request: GenerationRequest,
): Promise<GenerationOutcome> {
  await mkdir(request.outputDir, { recursive: true })
  const info = modelInfo(request.model)
  if (info?.provider === 'volcano') return runVolcanoImage(request)
  const kind = generationKindForModel(request.model)
  if (kind === 'image') return runImage(request)
  if (kind === 'video') return runVideo(request)
  if (kind === 'audio') return runSpeech(request)
  throw new Error('当前模型不支持生成。')
}
