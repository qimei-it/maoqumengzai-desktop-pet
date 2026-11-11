/** Pomodoro defaults and pure transition helpers. */

export const focusPhaseLabels = {
  focus: '专注',
  short: '短休',
  long: '长休',
} as const

export const focusDurations = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
} as const

export type FocusPhaseKey = keyof typeof focusDurations

export function phaseSeconds(phase: FocusPhaseKey): number {
  return focusDurations[phase]
}

/** A focus session advances the counter; every fourth one earns a long break. */
export function nextPhase(
  phase: FocusPhaseKey,
  completed: number,
): { phase: FocusPhaseKey; completed: number } {
  if (phase !== 'focus') return { phase: 'focus', completed }
  const count = completed + 1
  return { phase: count % 4 === 0 ? 'long' : 'short', completed: count }
}

/** Water reminders repeat inside the configured hours, 60 minutes and 09:00–22:00 by default. */
export function nextWaterAt(
  now: number,
  intervalMinutes = 60,
  startHour = 9,
  endHour = 22,
): number {
  const interval = Math.min(240, Math.max(5, Math.round(intervalMinutes)))
  const next = now + interval * 60 * 1000
  const date = new Date(next)
  if (date.getHours() >= endHour || date.getHours() < startHour) {
    const morning = new Date(now)
    if (date.getHours() >= endHour) morning.setDate(morning.getDate() + 1)
    morning.setHours(startHour, 0, 0, 0)
    return morning.getTime()
  }
  return next
}

export function formatFocus(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export type FocusSession = { id: string; endedAt: number; minutes: number }
export type WaterEntry = { id: string; at: number }

export type DayGroup<T> = {
  key: number
  label: string
  count: number
  items: T[]
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function shiftDays(dayStart: number, days: number): number {
  const date = new Date(dayStart)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

/** `2026年11月09日` for the date row above the timer. */
export function formatCalendarDate(now = Date.now()): string {
  const date = new Date(now)
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(
    date.getDate(),
  ).padStart(2, '0')}日`
}

/** Today, yesterday, then a short month/day label (year added across years). */
export function dayLabel(dayStart: number, now = Date.now()): string {
  const today = startOfDay(now)
  if (dayStart === today) return '今天'
  if (dayStart === shiftDays(today, -1)) return '昨天'
  const date = new Date(dayStart)
  const sameYear = new Date(today).getFullYear() === date.getFullYear()
  const month = date.getMonth() + 1
  return sameYear
    ? `${month}月${date.getDate()}日`
    : `${date.getFullYear()}年${month}月${date.getDate()}日`
}

/** Newest day first, newest entry first inside a day, limited to the last `days`. */
export function groupByDay<T>(
  items: readonly T[],
  at: (item: T) => number,
  now = Date.now(),
  days = 7,
): DayGroup<T>[] {
  const oldest = shiftDays(startOfDay(now), -(days - 1))
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const time = at(item)
    if (!Number.isFinite(time) || time < oldest) continue
    const key = startOfDay(time)
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }
  return [...groups.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([key, list]) => ({
      key,
      label: dayLabel(key, now),
      count: list.length,
      items: [...list].sort((left, right) => at(right) - at(left)),
    }))
}

export function countToday<T>(
  items: readonly T[],
  at: (item: T) => number,
  now = Date.now(),
): number {
  const today = startOfDay(now)
  const tomorrow = shiftDays(today, 1)
  return items.filter((item) => {
    const time = at(item)
    return time >= today && time < tomorrow
  }).length
}

export function formatClockTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
}
