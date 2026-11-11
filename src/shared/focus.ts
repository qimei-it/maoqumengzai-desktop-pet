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
