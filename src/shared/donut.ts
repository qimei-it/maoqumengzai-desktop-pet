/**
 * Donut menu geometry, ported from Filee (MIT, KnifeLemon/Filee):
 * src/Filee.App/Controls/DonutGeometry.cs.
 * See THIRD-PARTY-NOTICES.md and resources/licenses/filee-MIT.txt.
 *
 * Angles are measured clockwise from 12 o'clock; the first slice is centred on
 * the top. We keep two half slices (left = convert, right = eat) and a centre
 * hole (stash), so the ring is the same model with `count = 2`.
 */

export type DonutHit =
  | { kind: 'outside' | 'center' }
  | { kind: 'segment'; index: number }

export type Point = { x: number; y: number }

export const TAU = Math.PI * 2

/** Filee's hole ratio is 0.42 at outer radius 150. */
export const holeRatio = 0.4286

export function span(count: number): number {
  return count <= 0 ? TAU : TAU / count
}

export function midAngle(index: number, count: number): number {
  return index * span(count)
}

/** Converts a clockwise-from-top angle and radius into a point relative to the centre. */
export function pointAt(radius: number, angle: number): Point {
  return {
    x: radius * Math.sin(angle),
    y: -radius * Math.cos(angle),
  }
}

/** Clockwise-from-top angle (0..2π) of a point around the centre. */
export function angleOf(x: number, y: number): number {
  const angle = Math.atan2(x, -y)
  return angle < 0 ? angle + TAU : angle
}

export function indexAt(angle: number, count: number): number {
  if (count <= 0) return -1
  const step = span(count)
  return Math.floor((angle + step / 2) / step) % count
}

/**
 * Which region a client point hits, relative to the donut centre.
 * `rotation` turns the slice grid; π/2 puts slice 0 on the right half and
 * slice 1 on the left half, which is how our two actions are drawn.
 */
export function hitTest(
  x: number,
  y: number,
  innerRadius: number,
  outerRadius: number,
  count: number,
  slack = 0,
  rotation = 0,
): DonutHit {
  const distance = Math.hypot(x, y)
  if (distance < innerRadius) return { kind: 'center' }
  if (distance > outerRadius + slack) return { kind: 'outside' }
  if (count === 0) return { kind: 'outside' }
  return { kind: 'segment', index: indexAt(angleOf(x, y) - rotation, count) }
}

/** How far a group's fan reaches into each neighbour slice (Filee). */
export const subOverhang = 0.25
/** Narrowest a fan slice gets at its middle (Filee). */
export const minSubWidth = 44

export function subSpan(
  parentSpan: number,
  count: number,
  midRadius = 0,
): number {
  if (count <= 0) return 0
  let value = (parentSpan * (1 + 2 * subOverhang)) / count
  if (midRadius > 0) value = Math.max(value, minSubWidth / midRadius)
  return Math.min(value, TAU / count)
}

export function subMidAngle(
  parentMid: number,
  sub: number,
  count: number,
  step: number,
): number {
  return parentMid + (sub - (count - 1) / 2) * step
}

/** Which fan slice holds the point, or -1 (Filee's SubIndexAt). */
export function subIndexAt(
  x: number,
  y: number,
  innerRadius: number,
  outerRadius: number,
  parentMid: number,
  count: number,
  step: number,
): number {
  if (count <= 0) return -1
  const distance = Math.hypot(x, y)
  if (distance < innerRadius || distance > outerRadius) return -1
  let delta = angleOf(x, y) - parentMid
  delta = delta - TAU * Math.round(delta / TAU)
  const sub = Math.floor(delta / step + count / 2)
  return sub >= 0 && sub < count ? sub : -1
}

/** SVG arc path for one edge, centred on (0, 0). */
export function arcPath(
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = pointAt(radius, startAngle)
  const end = pointAt(radius, endAngle)
  const large = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0
  const sweep = endAngle > startAngle ? 1 : 0
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

/**
 * Filled annulus sector, the shape Filee draws for a slice. A same-colour
 * stroke with round joins (applied in CSS) softens its four corners.
 */
export function wedgePath(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = pointAt(outerRadius, startAngle)
  const outerEnd = pointAt(outerRadius, endAngle)
  const innerStart = pointAt(innerRadius, startAngle)
  const innerEnd = pointAt(innerRadius, endAngle)
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${large} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

/** Gap between the two halves at 12 and 6 o'clock, in degrees. */
export const halfGap = 2

export type DonutMetrics = {
  inner: number
  outer: number
  mid: number
  thickness: number
  subInner: number
  subOuter: number
  subThickness: number
  /** Transparent window that can host the ring and its fan. */
  window: number
}

/** Ring sizes follow the pet scale but keep a usable hole for the sprite. */
export function donutMetrics(scale: number): DonutMetrics {
  const inner = Math.min(92, Math.max(70, Math.round(64 * scale + 6)))
  const thickness = 96
  const outer = inner + thickness
  const subInner = outer + 6
  const subThickness = 36
  const subOuter = subInner + subThickness
  return {
    inner,
    outer,
    mid: (inner + outer) / 2,
    thickness,
    subInner,
    subOuter,
    subThickness,
    window: 2 * (subOuter + 26),
  }
}

export function donutWindowSize(scale: number): {
  width: number
  height: number
} {
  const { window } = donutMetrics(scale)
  return {
    width: Math.max(Math.round(232 * scale), window),
    height: Math.max(Math.round(240 * scale), window),
  }
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1).toLowerCase() : ''
}

/** Human summary for the hint line; never includes a full path. */
export function summarizeBatch(files: readonly { name: string }[]): string {
  if (!files.length) return '把文件放在桌宠上'
  const extensions = [
    ...new Set(files.map((file) => extensionOf(file.name)).filter(Boolean)),
  ]
  const listed = extensions
    .slice(0, 3)
    .map((extension) => extension.toUpperCase())
    .join('、')
  const more = extensions.length > 3 ? ` 等 ${extensions.length} 种` : ''
  return `${files.length} 个文件${listed ? ` · ${listed}${more}` : ''}`
}

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

/** Intersection of planned targets so a mixed batch never promises one result. */
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
