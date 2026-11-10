/** Pure naming and target rules for the image conversion panel. */
import { basename, dirname, extname, join } from 'node:path'
import { conversionTargets } from './donut'

export const imageTargets = ['JPG', 'PNG', 'WEBP'] as const
export type ImageTarget = (typeof imageTargets)[number]
export type ImageTargetLower = 'jpg' | 'png' | 'webp'

const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp'])
/** Batch conversions land in this folder next to each source directory. */
export const convertOutputFolder = 'convert_output'

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isImageFile(name: string): boolean {
  return imageExtensions.has(fileExtension(name))
}

export function isImageTarget(value: string): value is ImageTarget {
  return (imageTargets as readonly string[]).includes(value)
}

/**
 * Targets shared by every image in the batch, excluding a target that every
 * source file already has (re-encoding JPEG to JPEG is not offered).
 */
export function availableImageTargets(names: readonly string[]): ImageTarget[] {
  if (!names.length || !names.every(isImageFile)) return []
  const shared = conversionTargets(names).filter(isImageTarget)
  return shared.filter(
    (target) =>
      !names.every((name) => {
        const ext = fileExtension(name)
        return target === 'JPG' ? ext === 'jpg' || ext === 'jpeg' : ext === target.toLowerCase()
      }),
  )
}

export function targetExtension(target: ImageTargetLower): string {
  return target
}

export function outputDirectory(sourcePath: string, batch: boolean): string {
  const folder = dirname(sourcePath)
  return batch ? join(folder, convertOutputFolder) : folder
}

export function outputName(
  sourcePath: string,
  target: ImageTargetLower,
  attempt: number,
): string {
  const name = basename(sourcePath)
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  return `${stem}${attempt === 1 ? '' : ` (${attempt})`}.${targetExtension(target)}`
}

/**
 * First free output path. `exists` lets tests supply a fake file system; the
 * source file itself is always skipped, so a conversion can never overwrite it.
 */
export function candidateOutputPath(
  sourcePath: string,
  target: ImageTargetLower,
  batch: boolean,
  exists: (path: string) => boolean,
): string {
  const folder = outputDirectory(sourcePath, batch)
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const path = join(folder, outputName(sourcePath, target, attempt))
    if (path === sourcePath) continue
    if (!exists(path)) return path
  }
  throw new Error('输出目录里没有可用的文件名。')
}
