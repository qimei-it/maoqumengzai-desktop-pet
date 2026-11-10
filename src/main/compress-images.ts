import { stat } from 'node:fs/promises'
import sharp from 'sharp'
import {
  compressOutputDirectory,
  compressedName,
  shrinkMaxEdge,
} from '../shared/archive'
import { writeExclusive } from './write-output'

export type ShrinkResult = {
  path: string
  before: number
  after: number
}

/**
 * Re-encodes one image at a lower quality and caps its long edge. The source
 * is never replaced; the result gets a `-压缩` suffix or a new attempt number.
 */
export async function shrinkImage(
  sourcePath: string,
  batch: boolean,
): Promise<ShrinkResult> {
  const before = (await stat(sourcePath)).size
  const extension = sourcePath.slice(sourcePath.lastIndexOf('.') + 1).toLowerCase()
  const pipeline = sharp(sourcePath, {
    limitInputPixels: 100_000_000,
  }).rotate()
  const meta = await pipeline.metadata()
  if (Math.max(meta.width ?? 0, meta.height ?? 0) > shrinkMaxEdge)
    pipeline.resize({
      width: shrinkMaxEdge,
      height: shrinkMaxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })

  const buffer =
    extension === 'png'
      ? await pipeline
          .png({ compressionLevel: 9, palette: true, quality: 85 })
          .toBuffer()
      : extension === 'webp'
        ? await pipeline.webp({ quality: 82 }).toBuffer()
        : await pipeline
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .jpeg({ quality: 82, mozjpeg: true })
            .toBuffer()

  const path = await writeExclusive(
    compressOutputDirectory(sourcePath, batch),
    (attempt) => compressedName(sourcePath, attempt),
    buffer,
  )
  return { path, before, after: buffer.byteLength }
}
