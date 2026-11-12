/** Metadata and thumbnails for converted outputs; paths never reach the renderer. */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import sharp from 'sharp'
import type { ConvertOutput, ConvertOutputKind } from '../shared/protocol'
import { ffmpegEnv } from './ffmpeg-bundle'

const thumbWidth = 320
const thumbHeight = 180
const animatedPreviewLimit = 1_500_000

const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])
const videoExtensions = new Set(['mp4', 'mov', 'mkv', 'webm'])
const audioExtensions = new Set(['mp3', 'wav', 'm4a', 'flac', 'ogg'])
const textExtensions = new Set(['txt'])
const officeExtensions = new Set(['docx', 'xlsx', 'pptx'])

function kindFor(extension: string): ConvertOutputKind {
  if (imageExtensions.has(extension)) return 'image'
  if (videoExtensions.has(extension)) return 'video'
  if (audioExtensions.has(extension)) return 'audio'
  if (textExtensions.has(extension)) return 'text'
  if (officeExtensions.has(extension)) return 'office'
  return 'pdf'
}

async function imagePreview(
  path: string,
  extension: string,
  allowAnimated: boolean,
): Promise<string> {
  const info = await stat(path)
  if (
    allowAnimated &&
    (extension === 'gif' || extension === 'webp') &&
    info.size <= animatedPreviewLimit
  ) {
    const bytes = await readFile(path)
    return `data:image/${extension};base64,${bytes.toString('base64')}`
  }
  const thumbnail = await sharp(path, { animated: false })
    .resize(thumbWidth, thumbHeight, { fit: 'cover' })
    .jpeg({ quality: 72 })
    .toBuffer()
  return `data:image/jpeg;base64,${thumbnail.toString('base64')}`
}

function videoPreview(ffmpeg: string | null, path: string): Promise<string | undefined> {
  if (!ffmpeg) return Promise.resolve(undefined)
  const frame = (seek: string): Promise<string | undefined> =>
    new Promise((resolve) => {
      execFile(
        ffmpeg,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          seek,
          '-i',
          path,
          '-frames:v',
          '1',
          '-vf',
          `scale=${thumbWidth}:-2`,
          '-f',
          'image2pipe',
          '-vcodec',
          'mjpeg',
          'pipe:1',
        ],
        {
          encoding: 'buffer',
          maxBuffer: 4 * 1024 * 1024,
          timeout: 15_000,
          env: ffmpegEnv(ffmpeg),
        },
        (error, stdout) => {
          if (error || !stdout.length) {
            resolve(undefined)
            return
          }
          resolve(`data:image/jpeg;base64,${stdout.toString('base64')}`)
        },
      )
    })
  return frame('0.1').then((preview) => preview ?? frame('0'))
}

export async function buildConvertOutput(
  ffmpeg: string | null,
  outputPath: string,
  allowAnimated = true,
): Promise<ConvertOutput> {
  const info = await stat(outputPath)
  const extension = extname(outputPath).slice(1).toLowerCase()
  const kind = kindFor(extension)
  let preview: string | undefined
  try {
    if (kind === 'image')
      preview = await imagePreview(outputPath, extension, allowAnimated)
    else if (kind === 'video') preview = await videoPreview(ffmpeg, outputPath)
  } catch {
    preview = undefined
  }
  return {
    id: randomUUID(),
    name: basename(outputPath),
    size: info.size,
    format: extension.toUpperCase(),
    kind,
    ...(preview ? { preview } : {}),
  }
}
