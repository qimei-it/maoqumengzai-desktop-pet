/**
 * Image conversion worker. Reads one registered file, writes a sibling file
 * with an exclusive flag so an existing file or the source is never replaced.
 */
import { imagePipeline } from './image-source'
import {
  outputDirectory,
  outputName,
  type ImageTargetLower,
} from '../shared/convert'
import { writeExclusive } from './write-output'

export async function convertImage(
  sourcePath: string,
  target: ImageTargetLower,
  batch: boolean,
): Promise<string> {
  const pipeline = (await imagePipeline(sourcePath)).rotate()
  const buffer =
    target === 'jpg'
      ? await pipeline
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
          .toBuffer()
      : target === 'png'
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
        : await pipeline.webp({ quality: 90 }).toBuffer()

  return writeExclusive(
    outputDirectory(sourcePath, batch),
    (attempt) => outputName(sourcePath, target, attempt),
    buffer,
  )
}
