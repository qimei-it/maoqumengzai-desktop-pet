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
