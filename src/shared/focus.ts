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

/** Water reminders run every hour, only between 09:00 and 22:00 local time. */
export function nextWaterAt(now: number): number {
  const next = now + 60 * 60 * 1000
  const date = new Date(next)
  if (date.getHours() >= 22 || date.getHours() < 9) {
    const morning = new Date(now)
    if (date.getHours() >= 22) morning.setDate(morning.getDate() + 1)
    morning.setHours(9, 0, 0, 0)
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
