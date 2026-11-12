/** Pure naming and target rules for the conversion panel. */
import { basename, dirname, extname, join } from 'node:path'
import { conversionTargets } from './donut'
import {
  fileExtension,
  isAudioFile,
  isDocumentFile,
  isImageFile,
  isOfficeFile,
  isPdfFile,
  isVideoFile,
} from './file-kinds'

export { fileExtension, isImageFile, isPdfFile } from './file-kinds'

export const imageTargets = ['JPG', 'PNG', 'WEBP'] as const
export type ImageTarget = (typeof imageTargets)[number]
export type ImageTargetLower = 'jpg' | 'png' | 'webp'
export const mediaTargets = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'gif',
  'webp-anim',
  'mp3',
  'wav',
  'm4a',
  'flac',
  'ogg',
] as const
export type MediaTarget = (typeof mediaTargets)[number]
export type PdfConversionTarget = 'pdf-png' | 'pdf-jpg' | 'pdf-txt'
export type ConvertOutputExtension =
  | ImageTargetLower
  | MediaTarget
  | 'pdf'
  | 'txt'
  | 'docx'
  | 'xlsx'
  | 'pptx'
export type ConvertAction =
  | ImageTargetLower
  | MediaTarget
  | PdfConversionTarget
  | 'office-pdf'
  | 'office-docx'
  | 'office-xlsx'
  | 'office-pptx'
  | 'ofd-pdf'
  | 'ofd-png'
  | 'ofd-jpg'
  | 'csv-xlsx'
  | 'document-pdf'
  | 'pdf'
  | 'merge-pdf'
  | 'split-pdf'
export type ConvertTargetGroup = 'image' | 'video' | 'audio' | 'pdf'
export type ConvertTarget = {
  id: ConvertAction
  label: string
  group: ConvertTargetGroup
}

/** Batch conversions land in this folder next to each source directory. */
export const convertOutputFolder = 'convert_output'

export function isImageTarget(value: string): value is ImageTarget {
  return (imageTargets as readonly string[]).includes(value)
}

export function isMediaTarget(value: string): value is MediaTarget {
  return (mediaTargets as readonly string[]).includes(value)
}

export function isPdfTarget(value: string): value is PdfConversionTarget {
  return ['pdf-png', 'pdf-jpg', 'pdf-txt'].includes(value)
}

export function isOfficeTarget(
  value: string,
): value is 'office-pdf' | 'office-docx' | 'office-xlsx' | 'office-pptx' {
  return ['office-pdf', 'office-docx', 'office-xlsx', 'office-pptx'].includes(
    value,
  )
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

const videoTargets: readonly MediaTarget[] = [
  'mp4',
  'mov',
  'mkv',
  'webm',
  'gif',
  'webp-anim',
  'mp3',
  'wav',
  'm4a',
  'flac',
  'ogg',
]
const audioTargets: readonly MediaTarget[] = [
  'mp3',
  'wav',
  'm4a',
  'flac',
  'ogg',
]
const videoResultTargets = new Set<MediaTarget>([
  'mp4',
  'mov',
  'mkv',
  'webm',
  'gif',
  'webp-anim',
])
export function mediaTargetGroup(target: MediaTarget): 'video' | 'audio' {
  return videoResultTargets.has(target) ? 'video' : 'audio'
}

/** Media targets shared by the whole batch, including same-container re-encoding. */
export function availableMediaTargets(names: readonly string[]): MediaTarget[] {
  if (!names.length) return []
  let shared: readonly MediaTarget[] | undefined
  for (const name of names) {
    const own = isVideoFile(name)
      ? videoTargets
      : isAudioFile(name)
        ? audioTargets
        : null
    if (!own) return []
    shared = shared
      ? shared.filter((target) => own.includes(target))
      : [...own]
    if (!shared.length) return []
  }
  return [...(shared ?? [])]
}

export function targetExtension(target: ConvertOutputExtension): string {
  return target === 'webp-anim' ? 'webp' : target
}

export function outputDirectory(sourcePath: string, batch: boolean): string {
  const folder = dirname(sourcePath)
  return batch ? join(folder, convertOutputFolder) : folder
}

export function outputName(
  sourcePath: string,
  target: ConvertOutputExtension,
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

/** Targets offered by the panel for this batch. */
export function availableConvertTargets(
  names: readonly string[],
  options: { ffmpeg?: boolean } = {},
): ConvertTarget[] {
  if (!names.length) return []
  if (names.every(isImageFile)) {
    return [
      ...availableImageTargets(names).map((id) => ({
        id: id.toLowerCase() as ImageTargetLower,
        label: id,
        group: 'image' as const,
      })),
      { id: 'pdf', label: 'PDF', group: 'pdf' as const },
    ]
  }
  if (names.every(isPdfFile)) {
    return [
      ...(names.length > 1
        ? [{ id: 'merge-pdf' as const, label: '合并 PDF', group: 'pdf' as const }]
        : [{ id: 'split-pdf' as const, label: '拆分 PDF', group: 'pdf' as const }]),
      { id: 'pdf-png', label: 'PNG', group: 'pdf' },
      { id: 'pdf-jpg', label: 'JPG', group: 'pdf' },
      { id: 'pdf-txt', label: 'TXT', group: 'pdf' },
    ]
  }
  if (options.ffmpeg && names.every((name) => isVideoFile(name) || isAudioFile(name))) {
    return availableMediaTargets(names).map((id) => ({
      id,
      label: id === 'webp-anim' ? 'WEBP' : id.toUpperCase(),
      group: mediaTargetGroup(id),
    }))
  }
  if (names.every(isOfficeFile)) {
    const targets: ConvertTarget[] = [
      { id: 'office-pdf', label: 'PDF', group: 'pdf' },
    ]
    const extension = fileExtension(names[0])
    if (
      names.every((name) => fileExtension(name) === extension) &&
      (extension === 'doc' || extension === 'xls' || extension === 'ppt')
    )
      targets.push({
        id: `office-${
          extension === 'doc' ? 'docx' : extension === 'xls' ? 'xlsx' : 'pptx'
        }` as 'office-docx' | 'office-xlsx' | 'office-pptx',
        label:
          extension === 'doc' ? 'DOCX' : extension === 'xls' ? 'XLSX' : 'PPTX',
        group: 'pdf',
      })
    return targets
  }
  if (names.every((name) => fileExtension(name) === 'ofd'))
    return [
      { id: 'ofd-pdf', label: 'PDF', group: 'pdf' },
      { id: 'ofd-png', label: 'PNG', group: 'pdf' },
      { id: 'ofd-jpg', label: 'JPG', group: 'pdf' },
    ]
  if (names.every((name) => fileExtension(name) === 'csv'))
    return [
      { id: 'document-pdf', label: 'PDF', group: 'pdf' },
      { id: 'csv-xlsx', label: 'XLSX', group: 'pdf' },
    ]
  if (names.every(isDocumentFile))
    return [{ id: 'document-pdf', label: 'PDF', group: 'pdf' }]
  return []
}

export function splitOutputDirectory(sourcePath: string): string {
  const name = basename(sourcePath)
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  return join(dirname(sourcePath), convertOutputFolder, stem)
}

export function mergedOutputName(sourcePath: string, attempt: number): string {
  const name = basename(sourcePath)
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  return `${stem}-合并${attempt === 1 ? '' : ` (${attempt})`}.pdf`
}

export function splitPageName(page: number, attempt: number): string {
  return `page-${page}${attempt === 1 ? '' : ` (${attempt})`}.pdf`
}

export function pdfPageName(
  page: number,
  extension: 'png' | 'jpg',
  attempt: number,
): string {
  return `page-${page}${attempt === 1 ? '' : ` (${attempt})`}.${extension}`
}
