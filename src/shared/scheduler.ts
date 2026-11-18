/** Wall-clock vs monotonic drift detection for timer reconciliation. */
export type ClockJump = 'none' | 'forward' | 'backward'

/**
 * Compares how much wall time moved against how much monotonic time moved.
 * A large difference means the system clock or timezone was changed, or the
 * process was suspended without a resume event.
 */
export function detectClockJump(
  lastWall: number,
  lastMonotonic: number,
  wall: number,
  monotonic: number,
  thresholdMs = 120_000,
): ClockJump {
  if (!lastWall || !lastMonotonic) return 'none'
  const drift = wall - lastWall - (monotonic - lastMonotonic)
  if (drift > thresholdMs) return 'forward'
  if (drift < -thresholdMs) return 'backward'
  return 'none'
}

export type WakeSchedule = {
  now: number
  running: boolean
  runningMs: number
  idleMs: number
  retryMs: number
  /** Due times that a tick will resolve, including ones already overdue. */
  dueAt: readonly (number | null | undefined)[]
  /** A deferred notification must be retried before the idle cap. */
  retry?: boolean
}

/**
 * Picks the next timer wake-up: a running countdown keeps its own cadence,
 * otherwise the loop sleeps until the nearest due time. Overdue work and
 * deferred notifications retry almost immediately.
 */
export function nextWakeDelay(schedule: WakeSchedule): number {
  if (schedule.running) return schedule.runningMs
  const { now, retryMs } = schedule
  let wakeAt = now + schedule.idleMs
  let overdue = false
  for (const at of schedule.dueAt) {
    if (at === null || at === undefined) continue
    if (at <= now) overdue = true
    else if (at < wakeAt) wakeAt = at
  }
  if (overdue || schedule.retry) return retryMs
  return Math.max(retryMs, wakeAt - now)
}
