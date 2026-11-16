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

/**
 * Progress shown on the focus tab. The fourth focus keeps 4/4 during its long
 * break, and the next focus starts a fresh round at 0/4.
 */
export function focusCycleDone(
  completed: number,
  phase: FocusPhaseKey,
): number {
  const inRound = completed % 4
  if (inRound !== 0) return inRound
  if (completed === 0) return 0
  return phase === 'focus' ? 0 : 4
}

/**
 * Next break reminder after `intervalMinutes`, shifted past the daily quiet
 * window. Quiet hours may cross midnight (22:00–08:00 by default).
 */
export function nextBreakAt(
  now: number,
  intervalMinutes: number,
  dndEnabled = true,
  dndStart = 22,
  dndEnd = 8,
): number {
  const interval = Math.min(240, Math.max(5, Math.round(intervalMinutes)))
  const candidate = now + interval * 60 * 1000
  if (!dndEnabled || dndStart === dndEnd) return candidate
  const date = new Date(candidate)
  const hour =
    date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  const quiet =
    dndStart < dndEnd
      ? hour >= dndStart && hour < dndEnd
      : hour >= dndStart || hour < dndEnd
  if (!quiet) return candidate
  const resume = new Date(candidate)
  if (resume.getHours() >= dndEnd) resume.setDate(resume.getDate() + 1)
  resume.setHours(dndEnd, 0, 0, 0)
  return resume.getTime()
}

/** True while local time sits inside the daily quiet window (may cross midnight). */
export function inQuietHours(
  now: number,
  dndStart = 22,
  dndEnd = 8,
): boolean {
  if (dndStart === dndEnd) return false
  const date = new Date(now)
  const hour =
    date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  return dndStart < dndEnd
    ? hour >= dndStart && hour < dndEnd
    : hour >= dndStart || hour < dndEnd
}

export type FocusStatsPeriod = 'week' | 'month'
export type FocusStatsBucket = {
  key: string
  label: string
  title: string
  minutes: number
  count: number
}
export type FocusStats = {
  period: FocusStatsPeriod
  count: number
  minutes: number
  buckets: FocusStatsBucket[]
}

/** Week and month aggregates for the focus history card. */
export function focusStats(
  sessions: readonly { endedAt: number; minutes: number }[],
  now: number,
  period: FocusStatsPeriod,
): FocusStats {
  const date = new Date(now)
  let buckets: (FocusStatsBucket & { start: number; end: number })[]
  if (period === 'week') {
    const monday = new Date(now)
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const labels = ['一', '二', '三', '四', '五', '六', '日']
    buckets = labels.map((label, index) => {
      const start = new Date(monday)
      start.setDate(monday.getDate() + index)
      const end = new Date(monday)
      end.setDate(monday.getDate() + index + 1)
      return {
        key: `week-${index}`,
        label,
        title: `周${label}`,
        start: start.getTime(),
        end: end.getTime(),
        minutes: 0,
        count: 0,
      }
    })
  } else {
    const year = date.getFullYear()
    const month = date.getMonth()
    const lastDay = new Date(year, month + 1, 0).getDate()
    const starts = [1, 8, 15, 22, 29].filter((day) => day <= lastDay)
    buckets = starts.map((day, index) => {
      const start = new Date(year, month, day)
      const next = starts[index + 1]
      const end = next
        ? new Date(year, month, next)
        : new Date(year, month + 1, 1)
      const endDay = new Date(end.getTime() - 1).getDate()
      return {
        key: `month-${index}`,
        label: `${day}–${endDay}`,
        title: `${day}–${endDay} 日`,
        start: start.getTime(),
        end: end.getTime(),
        minutes: 0,
        count: 0,
      }
    })
  }
  const start = buckets[0]?.start ?? now
  const end = buckets[buckets.length - 1]?.end ?? now
  const inPeriod = sessions.filter(
    (session) => session.endedAt >= start && session.endedAt < end,
  )
  for (const session of inPeriod) {
    const bucket = buckets.find(
      (item) => session.endedAt >= item.start && session.endedAt < item.end,
    )
    if (bucket) {
      bucket.minutes += Math.max(0, Math.round(session.minutes))
      bucket.count += 1
    }
  }
  return {
    period,
    count: inPeriod.length,
    minutes: inPeriod.reduce(
      (total, session) => total + Math.max(0, Math.round(session.minutes)),
      0,
    ),
    buckets: buckets.map(({ key, label, title, minutes, count }) => ({
      key,
      label,
      title,
      minutes,
      count,
    })),
  }
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
    morning.setHours(startHour, 0, 0, 0)
    if (morning.getTime() <= now) morning.setDate(morning.getDate() + 1)
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
