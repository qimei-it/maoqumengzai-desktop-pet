/** Pure geometry and copy for the pet's three-action wheel. */

export const basePetSize = { width: 232, height: 240 }

/** The wheel stays comfortably outside the sprite at every supported scale. */
export function wheelRadius(scale: number): number {
  return Math.round(64 * scale + 44)
}

/** Transparent window size that can host the wheel without clipping it. */
export function wheelWindowSize(scale: number): {
  width: number
  height: number
} {
  const edge = 2 * (wheelRadius(scale) + 52)
  return {
    width: Math.max(Math.round(basePetSize.width * scale), edge),
    height: Math.max(Math.round(basePetSize.height * scale), edge),
  }
}

export type PetalPosition = { angle: number; x: number; y: number }

/**
 * Evenly spaced points around the pet; `startDeg` uses screen coordinates.
 * Counter-clockwise keeps the first item after the top on the lower left.
 */
export function petalPositions(
  count: number,
  radius: number,
  startDeg = -90,
  clockwise = false,
): PetalPosition[] {
  if (count <= 0) return []
  return Array.from({ length: count }, (_, index) => {
    const raw = startDeg + ((clockwise ? 1 : -1) * (360 / count)) * index
    const angle = ((raw % 360) + 360) % 360
    const radians = (angle * Math.PI) / 180
    return {
      angle,
      x: radius * Math.cos(radians),
      y: radius * Math.sin(radians),
    }
  })
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1).toLowerCase() : ''
}

/** Human summary for the wheel footer; never includes a full path. */
export function summarizeBatch(files: readonly { name: string }[]): string {
  if (!files.length) return '没有待处理文件'
  const extensions = [
    ...new Set(files.map((file) => extensionOf(file.name)).filter(Boolean)),
  ]
  const listed = extensions
    .slice(0, 3)
    .map((extension) => extension.toUpperCase())
    .join('、')
  const more =
    extensions.length > 3 ? ` 等 ${extensions.length} 种` : ''
  return `${files.length} 个文件${listed ? ` · ${listed}${more}` : ''}`
}

/**
 * Targets offered per source extension. Kept local and declarative so the
 * preview can never claim a conversion the future engine does not plan to ship.
 */
const conversionMap: Record<string, readonly string[]> = {
  png: ['JPG', 'PNG', 'WEBP', 'PDF'],
  jpg: ['JPG', 'PNG', 'WEBP', 'PDF'],
  jpeg: ['JPG', 'PNG', 'WEBP', 'PDF'],
  webp: ['JPG', 'PNG', 'WEBP', 'PDF'],
  heic: ['JPG', 'PNG', 'PDF'],
  bmp: ['JPG', 'PNG', 'WEBP'],
  tiff: ['JPG', 'PNG', 'PDF'],
  gif: ['JPG', 'PNG', 'WEBP'],
  pdf: ['PNG', 'JPG', 'TXT'],
  doc: ['PDF'],
  docx: ['PDF'],
  xls: ['PDF'],
  xlsx: ['PDF'],
  csv: ['PDF', 'XLSX'],
  ppt: ['PDF'],
  pptx: ['PDF'],
  mp4: ['MP4', 'GIF', 'MP3'],
  mov: ['MP4', 'GIF', 'MP3'],
  mkv: ['MP4', 'GIF', 'MP3'],
  webm: ['MP4', 'GIF', 'MP3'],
  avi: ['MP4', 'GIF', 'MP3'],
  mp3: ['MP3', 'WAV'],
  wav: ['MP3', 'WAV'],
  flac: ['MP3', 'WAV'],
  m4a: ['MP3', 'WAV'],
  txt: ['PDF'],
  md: ['PDF'],
}

/** Intersection across a batch, so a mixed drop cannot promise one target for all. */
export function conversionTargets(
  names: readonly string[],
  limit = 4,
): string[] {
  if (!names.length) return []
  let shared: readonly string[] | undefined
  for (const name of names) {
    const own = conversionMap[extensionOf(name)]
    if (!own) return []
    shared = shared
      ? shared.filter((target) => own.includes(target))
      : [...own]
    if (!shared.length) return []
  }
  return (shared ?? []).slice(0, limit)
}
