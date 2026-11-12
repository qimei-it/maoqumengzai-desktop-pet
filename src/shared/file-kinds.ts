/** Renderer-safe file classification shared by the wheel and conversion guard. */
export type FileKind =
  | 'image'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'office'
  | 'document'
  | 'ofd'
  | 'other'

export type ConversionEngineId =
  | 'builtin'
  | 'ffmpeg'
  | 'libreoffice'
  | 'unsupported'

const imageExtensions = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'bmp',
  'tiff',
  'tif',
  'gif',
])
const videoExtensions = new Set([
  'mp4',
  'mov',
  'mkv',
  'webm',
  'avi',
  'm4v',
  'flv',
  'wmv',
  'mpg',
  'mpeg',
  'ts',
  '3gp',
])
const audioExtensions = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'])
const officeExtensions = new Set([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
])
const documentExtensions = new Set([
  'csv',
  'txt',
  'md',
  'markdown',
  'html',
  'htm',
])

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function fileKind(name: string): FileKind {
  const ext = fileExtension(name)
  if (imageExtensions.has(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'ofd') return 'ofd'
  if (videoExtensions.has(ext)) return 'video'
  if (audioExtensions.has(ext)) return 'audio'
  if (officeExtensions.has(ext)) return 'office'
  if (documentExtensions.has(ext)) return 'document'
  return 'other'
}

export function isImageFile(name: string): boolean {
  return fileKind(name) === 'image'
}

export function isPdfFile(name: string): boolean {
  return fileKind(name) === 'pdf'
}

export function isVideoFile(name: string): boolean {
  return fileKind(name) === 'video'
}

export function isAudioFile(name: string): boolean {
  return fileKind(name) === 'audio'
}

export function isOfficeFile(name: string): boolean {
  return fileKind(name) === 'office'
}

export function isDocumentFile(name: string): boolean {
  return fileKind(name) === 'document'
}

export function isOfdFile(name: string): boolean {
  return fileKind(name) === 'ofd'
}

/** Best-effort classification for dragover, where only MIME types may exist. */
export function fileKindFromMime(type: string): FileKind {
  const mime = type.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('ofd')) return 'ofd'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (
    mime.startsWith('text/') ||
    mime === 'application/csv' ||
    mime.includes('tab-separated-values')
  )
    return 'document'
  if (
    mime.includes('wordprocessingml') ||
    mime.includes('spreadsheetml') ||
    mime.includes('presentationml') ||
    mime.includes('msword') ||
    mime.includes('ms-excel') ||
    mime.includes('ms-powerpoint')
  )
    return 'office'
  return 'other'
}

/**
 * Which engine family a batch needs before the convert panel can be offered.
 * Images and PDF basics run on bundled sharp/pdf-lib; media needs FFmpeg.
 */
export function conversionEngineFor(
  names: readonly string[],
): ConversionEngineId {
  if (!names.length) return 'unsupported'
  return conversionEngineForKinds(names.map(fileKind))
}

export function conversionEngineForKinds(
  kinds: readonly FileKind[],
): ConversionEngineId {
  if (!kinds.length) return 'unsupported'
  if (
    kinds.every(
      (kind) =>
        kind === 'image' ||
        kind === 'pdf' ||
        kind === 'document' ||
        kind === 'ofd',
    )
  )
    return 'builtin'
  if (kinds.every((kind) => kind === 'video' || kind === 'audio'))
    return 'ffmpeg'
  if (kinds.every((kind) => kind === 'office')) return 'libreoffice'
  return 'unsupported'
}
