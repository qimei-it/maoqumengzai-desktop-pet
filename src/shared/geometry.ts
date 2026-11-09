import type { HitMask, Rect } from './protocol'

export function intersectionArea(a: Rect, b: Rect): number {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  )
}

/** Coordinates stay in Electron DIP; negative monitor origins are valid. */
export function fitToDisplays(rect: Rect, workAreas: Rect[]): Rect {
  if (!workAreas.length) return rect
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const sorted = [...workAreas].sort((a, b) => {
    const overlap = intersectionArea(rect, b) - intersectionArea(rect, a)
    if (overlap) return overlap
    const distance = (r: Rect) =>
      (center.x - Math.max(r.x, Math.min(center.x, r.x + r.width))) ** 2 +
      (center.y - Math.max(r.y, Math.min(center.y, r.y + r.height))) ** 2
    return distance(a) - distance(b)
  })
  const area = sorted[0]
  const width = Math.min(rect.width, area.width)
  const height = Math.min(rect.height, area.height)
  return {
    x: Math.round(
      Math.max(area.x, Math.min(rect.x, area.x + area.width - width)),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(rect.y, area.y + area.height - height)),
    ),
    width: Math.round(width),
    height: Math.round(height),
  }
}

export function hitOpaquePixel(
  mask: HitMask | undefined,
  x: number,
  y: number,
): boolean {
  // Missing/failed masks keep the marker recoverable rather than permanently click-through.
  if (!mask) return true
  const r = mask.rect
  if (x < r.x || y < r.y || x >= r.x + r.width || y >= r.y + r.height)
    return false
  const px = Math.floor(((x - r.x) * mask.width) / r.width)
  const py = Math.floor(((y - r.y) * mask.height) / r.height)
  return mask.alpha[py * mask.width + px] >= 32
}

export function movedBeyondThreshold(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) >= 6
}
