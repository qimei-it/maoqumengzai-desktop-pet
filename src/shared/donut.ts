/**
 * Donut menu geometry, ported from Filee (MIT, KnifeLemon/Filee):
 * src/Filee.App/Controls/DonutGeometry.cs and DonutMenu.cs.
 * See THIRD-PARTY-NOTICES.md and resources/licenses/filee-MIT.txt.
 *
 * Angles are measured clockwise from 12 o'clock. Slice i is centred on
 * i * span, so the first action sits at the top and the rest follow clockwise.
 * Slices are separated by a constant gap and have rounded corners, exactly like
 * Filee's Wedge outline.
 */

export type Point = { x: number; y: number }

export type DonutHit =
  | { kind: 'outside' | 'center' }
  | { kind: 'segment'; index: number }

export const TAU = Math.PI * 2

/** Ten equal slices; the pet stands in the hole and is never a drop target. */
export const sliceCount = 10
/** Filee's GapPixels: the gap is measured along the slice edge, not in degrees. */
export const sliceGap = 3
/** Filee's SliceCornerRadius for the default softness. */
export const sliceCornerRadius = 6
/** Filee's PopOut: how far a hovered slice slides outward. */
export const popOut = 7

/**
 * Users choose which actions each wheel shows. Four is the smallest count that
 * still reads as quadrants rather than large, hard-to-aim wedges; ten is the
 * most that keeps the two-column Chinese labels legible at the current ring
 * thickness.
 */
export const minWheelActions = 4
export const maxWheelActions = 10

/** Every action the file wheel can offer, in the default ring order. */
export const sliceActions = [
  'ask',
  'stash',
  'archive',
  'extract',
  'shrink',
  'eat',
  'copy',
  'mail',
  'convert',
  'rename',
] as const
export type DropAction = (typeof sliceActions)[number]
/** Every action the hover wheel can offer, in the default ring order. */
export const hoverActions = [
  'agent',
  'clipboard',
  'shelf',
  'profile',
  'break',
  'todo',
  'water',
  'focus',
  'mail',
  'settings',
] as const
export type HoverAction = (typeof hoverActions)[number]

/**
 * Labels follow the hover wheel's curved layout: up to three characters stay
 * on one line, four characters split into two rows of two along the words.
 */
export const sliceLabelColumns: Record<DropAction, string[]> = {
  stash: ['置物架'],
  convert: ['格式', '转换'],
  archive: ['打包', '归档'],
  extract: ['解压缩'],
  shrink: ['压缩', '大小'],
  eat: ['吃掉'],
  copy: ['另存', '副本'],
  mail: ['发送', '邮件'],
  rename: ['重命名'],
  ask: ['智能体'],
}

export const sliceLabels: Record<DropAction, string> = {
  stash: '置物架',
  convert: '格式转换',
  archive: '打包归档',
  extract: '解压缩',
  shrink: '压缩大小',
  eat: '吃掉',
  copy: '另存副本',
  mail: '发送邮件',
  rename: '重命名',
  ask: '智能体',
}

/** The sprite box drawn inside the hole; the final full-body art replaces it. */
export const petSprite = { width: 112, height: 112 }
/** Transparent window around the sprite: room for the caption and idle motion. */
export const basePetSize = { width: 132, height: 156 }

export type DonutMetrics = {
  inner: number
  outer: number
  mid: number
  thickness: number
  /** Transparent window that can host the ring and its shadow. */
  window: number
}

/**
 * Hole 136, ring 58 thick, outline 252 across: smaller than the old two-half
 * wheel while still giving a full-body pet room to stand in the centre.
 */
export function donutMetrics(scale: number): DonutMetrics {
  const inner = Math.round(68 * scale)
  const thickness = Math.round(58 * scale)
  const outer = inner + thickness
  return {
    inner,
    outer,
    mid: (inner + outer) / 2,
    thickness,
    window: 2 * (outer + 30),
  }
}

export function donutWindowSize(scale: number): { width: number; height: number } {
  const { window } = donutMetrics(scale)
  return {
    width: Math.max(Math.round(basePetSize.width * scale), window),
    height: Math.max(Math.round(basePetSize.height * scale), window),
  }
}

/** A slice of `<count>` slices covers this angle. */
export function span(count: number): number {
  return count <= 0 ? TAU : TAU / count
}

export function midAngle(index: number, count: number): number {
  return index * span(count)
}

/** Converts a clockwise-from-top angle and radius into a point around the origin. */
export function pointAt(radius: number, angle: number): Point {
  return {
    x: radius * Math.sin(angle),
    y: -radius * Math.cos(angle),
  }
}

/** Clockwise-from-top angle (0..2π) of a point around the origin. */
export function angleOf(x: number, y: number): number {
  const angle = Math.atan2(x, -y)
  return angle < 0 ? angle + TAU : angle
}

export function indexAt(angle: number, count: number): number {
  if (count <= 0) return -1
  const step = span(count)
  return Math.floor((angle + step / 2) / step) % count
}

export function hitTest(
  x: number,
  y: number,
  innerRadius: number,
  outerRadius: number,
  count: number,
  slack = 0,
): DonutHit {
  const distance = Math.hypot(x, y)
  if (distance < innerRadius) return { kind: 'center' }
  if (distance > outerRadius + slack) return { kind: 'outside' }
  if (count <= 0) return { kind: 'outside' }
  return { kind: 'segment', index: indexAt(angleOf(x, y), count) }
}

/** The action under a client point measured from the donut centre. */
export function actionAt<T extends string>(
  x: number,
  y: number,
  scale: number,
  actions?: readonly T[],
): T | null {
  const list = actions ?? (sliceActions as unknown as readonly T[])
  const metrics = donutMetrics(scale)
  const hit = hitTest(
    x,
    y,
    metrics.inner,
    metrics.outer,
    list.length,
    Math.round(popOut * scale),
  )
  return hit.kind === 'segment' ? (list[hit.index] ?? null) : null
}

export type OutlineStep =
  | { kind: 'line'; to: Point }
  | {
      kind: 'arc'
      to: Point
      radius: number
      largeArc: boolean
      clockwise: boolean
    }

/** A closed slice outline; Filee's WedgeOutline. */
export type WedgeOutline = {
  start: Point
  steps: OutlineStep[]
  cornerRadius: number
}

/** Rounding below this is not visible: the slice stays sharp (Filee). */
const minCornerRadius = 0.25

/**
 * Outline of a slice between `innerRadius` and `outerRadius`, centred on `mid`,
 * with a constant `gap` to its neighbours and corners rounded by
 * `cornerRadius`. Ported line for line from Filee's DonutGeometry.Wedge.
 */
export function wedge(
  innerRadius: number,
  outerRadius: number,
  mid: number,
  sliceSpan: number,
  gap: number,
  cornerRadius = 0,
): WedgeOutline {
  const outerHalf = Math.max(0.001, sliceSpan / 2 - gap / 2 / outerRadius)
  const innerHalf = Math.max(0.001, sliceSpan / 2 - gap / 2 / innerRadius)
  const outerStart = pointAt(outerRadius, mid - outerHalf)
  const innerStart = pointAt(innerRadius, mid - innerHalf)

  const radius = Math.min(cornerRadius, (outerRadius - innerRadius) / 2)
  if (radius > minCornerRadius) {
    const fits = rounded(
      innerRadius,
      outerRadius,
      mid,
      outerHalf,
      innerHalf,
      radius,
    )
    if (fits) return fits
    // Too thin or short for the wanted rounding: largest that fits, found by
    // halving, so the slice still looks soft instead of jumping to sharp.
    let best: WedgeOutline | null = null
    let low = 0
    let high = radius
    for (let step = 0; step < 14; step += 1) {
      const candidate = (low + high) / 2
      const attempt = rounded(
        innerRadius,
        outerRadius,
        mid,
        outerHalf,
        innerHalf,
        candidate,
      )
      if (attempt) {
        best = attempt
        low = candidate
      } else {
        high = candidate
      }
    }
    if (best && low > minCornerRadius) return best
  }

  return {
    start: outerStart,
    steps: [
      {
        kind: 'arc',
        to: pointAt(outerRadius, mid + outerHalf),
        radius: outerRadius,
        largeArc: outerHalf * 2 > Math.PI,
        clockwise: true,
      },
      { kind: 'line', to: pointAt(innerRadius, mid + innerHalf) },
      {
        kind: 'arc',
        to: innerStart,
        radius: innerRadius,
        largeArc: innerHalf * 2 > Math.PI,
        clockwise: false,
      },
    ],
    cornerRadius: 0,
  }
}

/** The slice with corners of `radius`, or null when they do not fit (Filee). */
function rounded(
  innerRadius: number,
  outerRadius: number,
  mid: number,
  outerHalf: number,
  innerHalf: number,
  radius: number,
): WedgeOutline | null {
  const outerSide = pointAt(outerRadius, mid - outerHalf)
  const innerSide = pointAt(innerRadius, mid - innerHalf)
  const outer = corner(outerSide, innerSide, outerRadius, radius, true)
  const inner = corner(outerSide, innerSide, innerRadius, radius, false)
  if (!outer || !inner) return null
  if (
    outer.along >= inner.along ||
    offsetOf(outer.center, mid) >= 0 ||
    offsetOf(inner.center, mid) >= 0
  )
    return null

  const mirror = (point: Point): Point =>
    pointAt(
      Math.hypot(point.x, point.y),
      2 * mid - angleOf(point.x, point.y),
    )
  const outerArc = -offsetOf(outer.center, mid)
  const innerArc = -offsetOf(inner.center, mid)
  return {
    start: outer.onArc,
    steps: [
      {
        kind: 'arc',
        to: mirror(outer.onArc),
        radius: outerRadius,
        largeArc: outerArc > Math.PI / 2,
        clockwise: true,
      },
      {
        kind: 'arc',
        to: mirror(outer.onLine),
        radius,
        largeArc: false,
        clockwise: true,
      },
      { kind: 'line', to: mirror(inner.onLine) },
      {
        kind: 'arc',
        to: mirror(inner.onArc),
        radius,
        largeArc: false,
        clockwise: true,
      },
      {
        kind: 'arc',
        to: inner.onArc,
        radius: innerRadius,
        largeArc: innerArc > Math.PI / 2,
        clockwise: false,
      },
      {
        kind: 'arc',
        to: inner.onLine,
        radius,
        largeArc: false,
        clockwise: true,
      },
      { kind: 'line', to: outer.onLine },
      {
        kind: 'arc',
        to: outer.onArc,
        radius,
        largeArc: false,
        clockwise: true,
      },
    ],
    cornerRadius: radius,
  }
}

type Corner = {
  center: Point
  onArc: Point
  onLine: Point
  /** Distance along the start side, from the outer corner. */
  along: number
}

/**
 * The rounded corner where the slice's start side meets the circle of
 * `circle`: the arc's centre, where it touches the circle and the side, and
 * how far along the side it touches it (Filee's Corner).
 */
function corner(
  outerSide: Point,
  innerSide: Point,
  circle: number,
  radius: number,
  outer: boolean,
): Corner | null {
  const length = Math.hypot(innerSide.x - outerSide.x, innerSide.y - outerSide.y)
  if (length <= 0) return null
  const u = {
    x: (innerSide.x - outerSide.x) / length,
    y: (innerSide.y - outerSide.y) / length,
  }
  // Into the slice: the start side's normal on the clockwise side.
  const tangent = {
    x: Math.cos(angleOf(outerSide.x, outerSide.y)),
    y: Math.sin(angleOf(outerSide.x, outerSide.y)),
  }
  let normal = { x: -u.y, y: u.x }
  if (normal.x * tangent.x + normal.y * tangent.y < 0)
    normal = { x: -normal.x, y: -normal.y }

  // The arc's centre lies `radius` inside the side and touches the circle.
  const distance = outer ? circle - radius : circle + radius
  const w = {
    x: outerSide.x + normal.x * radius,
    y: outerSide.y + normal.y * radius,
  }
  const b = w.x * u.x + w.y * u.y
  const discriminant = b * b - (w.x * w.x + w.y * w.y - distance * distance)
  if (discriminant < 0) return null
  const t = -b - Math.sqrt(discriminant)
  if (t < 0 || t > length) return null
  const c = {
    x: outerSide.x + normal.x * radius + u.x * t,
    y: outerSide.y + normal.y * radius + u.y * t,
  }
  const toCenter = { x: c.x, y: c.y }
  const lengthToCenter = Math.hypot(toCenter.x, toCenter.y)
  if (lengthToCenter <= 0) return null
  const onArc = {
    x: (toCenter.x / lengthToCenter) * circle,
    y: (toCenter.y / lengthToCenter) * circle,
  }
  return {
    center: c,
    onArc,
    onLine: { x: outerSide.x + u.x * t, y: outerSide.y + u.y * t },
    along: t,
  }
}

/** Signed angle of `point` from `mid`, -π..π (negative before it). */
function offsetOf(point: Point, mid: number): number {
  const delta = angleOf(point.x, point.y) - mid
  return delta - TAU * Math.round(delta / TAU)
}

/** SVG path data for a slice outline. */
export function outlinePath(outline: WedgeOutline): string {
  const parts = [
    `M ${outline.start.x.toFixed(2)} ${outline.start.y.toFixed(2)}`,
  ]
  for (const step of outline.steps) {
    if (step.kind === 'line') {
      parts.push(`L ${step.to.x.toFixed(2)} ${step.to.y.toFixed(2)}`)
    } else {
      const large = step.largeArc ? 1 : 0
      const sweep = step.clockwise ? 1 : 0
      parts.push(
        `A ${step.radius.toFixed(2)} ${step.radius.toFixed(2)} 0 ${large} ${sweep} ${step.to.x.toFixed(2)} ${step.to.y.toFixed(2)}`,
      )
    }
  }
  parts.push('Z')
  return parts.join(' ')
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

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1).toLowerCase() : ''
}

const conversionMap: Record<string, readonly string[]> = {
  png: ['JPG', 'PNG', 'WEBP', 'PDF'],
  jpg: ['JPG', 'PNG', 'WEBP', 'PDF'],
  jpeg: ['JPG', 'PNG', 'WEBP', 'PDF'],
  webp: ['JPG', 'PNG', 'WEBP', 'PDF'],
  heic: ['JPG', 'PNG', 'WEBP', 'PDF'],
  heif: ['JPG', 'PNG', 'WEBP', 'PDF'],
  bmp: ['JPG', 'PNG', 'WEBP', 'PDF'],
  tiff: ['JPG', 'PNG', 'WEBP', 'PDF'],
  tif: ['JPG', 'PNG', 'WEBP', 'PDF'],
  gif: ['JPG', 'PNG', 'WEBP', 'PDF'],
  pdf: ['PNG', 'JPG', 'TXT'],
  ofd: ['PDF', 'PNG', 'JPG'],
  doc: ['PDF', 'DOCX'],
  docx: ['PDF'],
  xls: ['PDF', 'XLSX'],
  xlsx: ['PDF'],
  csv: ['PDF', 'XLSX'],
  ppt: ['PDF', 'PPTX'],
  pptx: ['PDF'],
  flv: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  wmv: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  mpg: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  mpeg: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  ts: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  '3gp': ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  mp4: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  mov: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  mkv: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  webm: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  avi: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  m4v: ['MP4', 'MOV', 'MKV', 'WEBM', 'GIF', 'WEBP', 'MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  mp3: ['MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  wav: ['MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  flac: ['MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  m4a: ['MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  aac: ['MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  ogg: ['MP3', 'WAV', 'M4A', 'OGG', 'FLAC'],
  txt: ['PDF'],
  md: ['PDF'],
  markdown: ['PDF'],
  html: ['PDF'],
  htm: ['PDF'],
}

/** Intersection of planned targets so a mixed batch never promises one result. */
export function conversionTargets(
  names: readonly string[],
  limit = 12,
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

export const hoverLabels: Record<HoverAction, readonly string[]> = {
  agent: ['智能体'],
  profile: ['宠物', '档案'],
  clipboard: ['剪贴板'],
  todo: ['待办', '清单'],
  break: ['休息', '提醒'],
  water: ['喝水', '提醒'],
  focus: ['番茄', '时钟'],
  shelf: ['置物架'],
  mail: ['邮件'],
  settings: ['设置'],
}

/** One-line names for the settings editor. */
export const hoverActionLabels: Record<HoverAction, string> = {
  agent: '智能体',
  clipboard: '剪贴板',
  profile: '宠物档案',
  todo: '待办清单',
  break: '休息提醒',
  water: '喝水提醒',
  focus: '番茄时钟',
  shelf: '置物架',
  mail: '邮件',
  settings: '设置',
}

/**
 * Keeps a persisted or incoming list usable: unknown and duplicate ids are
 * dropped, and an out-of-range or empty list falls back to the catalog.
 */
export function normalizeWheelActions<T extends string>(
  value: unknown,
  catalog: readonly T[],
  fallback: readonly T[] = catalog,
  min = minWheelActions,
  max = maxWheelActions,
): T[] {
  if (!Array.isArray(value)) return [...fallback]
  const allowed = new Set<string>(catalog)
  const seen = new Set<T>()
  const actions: T[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) continue
    const action = item as T
    if (seen.has(action)) continue
    seen.add(action)
    actions.push(action)
  }
  if (actions.length < min || actions.length > max) return [...fallback]
  return actions
}
