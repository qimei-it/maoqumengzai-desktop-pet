/**
 * Image conversion worker. Reads one registered file, writes a sibling file
 * with an exclusive flag so an existing file or the source is never replaced.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  outputDirectory,
  outputName,
  type ImageTargetLower,
} from '../shared/convert'

export async function convertImage(
  sourcePath: string,
  target: ImageTargetLower,
  batch: boolean,
): Promise<string> {
  const folder = outputDirectory(sourcePath, batch)
  await mkdir(folder, { recursive: true })

  const pipeline = sharp(sourcePath, {
    limitInputPixels: 100_000_000,
  }).rotate()
  const buffer =
    target === 'jpg'
      ? await pipeline
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
          .toBuffer()
      : target === 'png'
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
        : await pipeline.webp({ quality: 90 }).toBuffer()

  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const destination = join(folder, outputName(sourcePath, target, attempt))
    if (destination === sourcePath) continue
    try {
      await writeFile(destination, buffer, { flag: 'wx' })
      return destination
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
  }
  throw new Error('输出目录里没有可用的文件名。')
}
