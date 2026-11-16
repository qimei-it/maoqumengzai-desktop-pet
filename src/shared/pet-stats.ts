/** Local companion facts. Growth and levels stay out until a later version. */

export const petStatsMaxDays = 180

export const petStatsInteractions = ['poke', 'focus', 'water', 'todo'] as const

export type PetStatsInteraction = (typeof petStatsInteractions)[number]

export type PetInteractions = Record<PetStatsInteraction, number>

export type PetStats = {
  version: 1
  firstSeenAt: number
  lastSeenAt: number
  days: string[]
  interactions: PetInteractions
}

export type PetStatsView = {
  daysTogether: number
  interactions: PetInteractions
}

const dayPattern = /^\d{4}-\d{2}-\d{2}$/

/** Local calendar day, so a day counts once even across midnight. */
export function localDayKey(at: number): string {
  const date = new Date(at)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function normalizePetDays(days: readonly string[]): string[] {
  const unique = [...new Set(days.filter((day) => dayPattern.test(day)))]
  return unique.sort().slice(-petStatsMaxDays)
}

export function defaultPetStats(now: number): PetStats {
  return {
    version: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    days: [localDayKey(now)],
    interactions: { poke: 0, focus: 0, water: 0, todo: 0 },
  }
}

/** Adds the current local day and keeps the earliest first-seen time. */
export function recordPetDay(stats: PetStats, now: number): PetStats {
  const day = localDayKey(now)
  return {
    ...stats,
    firstSeenAt: Math.min(stats.firstSeenAt, now),
    lastSeenAt: Math.max(stats.lastSeenAt, now),
    days: normalizePetDays([...stats.days, day]),
  }
}

export function bumpPetInteraction(
  stats: PetStats,
  kind: PetStatsInteraction,
  now: number,
  amount = 1,
): PetStats {
  const step = Math.max(0, Math.trunc(amount))
  return {
    ...stats,
    lastSeenAt: Math.max(stats.lastSeenAt, now),
    interactions: {
      ...stats.interactions,
      [kind]: stats.interactions[kind] + step,
    },
  }
}

export function petStatsView(stats: PetStats): PetStatsView {
  return { daysTogether: stats.days.length, interactions: stats.interactions }
}
