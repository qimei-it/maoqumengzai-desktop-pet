/**
 * Minimal damped-spring integrator shared by the window tween and the ring
 * motion. Values are integrated with semi-implicit Euler on sub-steps so a
 * dropped frame cannot make the animation explode.
 */
export interface SpringConfig {
  /** Higher pulls faster toward the target. */
  stiffness: number
  /** Higher settles sooner with less bounce. */
  damping: number
  mass?: number
}

export interface SpringChannel {
  value: number
  velocity: number
}

export const windowSpring: SpringConfig = {
  stiffness: 380,
  damping: 39,
  mass: 1,
}

export function createChannel(value = 0): SpringChannel {
  return { value, velocity: 0 }
}

const MAX_STEP = 1 / 120

export function stepSpring(
  channel: SpringChannel,
  target: number,
  config: SpringConfig,
  deltaSeconds: number,
): SpringChannel {
  const mass = config.mass ?? 1
  let remaining = Math.min(Math.max(deltaSeconds, 0), 1 / 20)
  let { value, velocity } = channel
  while (remaining > 0) {
    const step = Math.min(remaining, MAX_STEP)
    remaining -= step
    const force = -config.stiffness * (value - target) - config.damping * velocity
    velocity += (force / mass) * step
    value += velocity * step
  }
  return { value, velocity }
}

export function isSettled(
  channel: SpringChannel,
  target: number,
  epsilon = 0.5,
): boolean {
  return Math.abs(channel.value - target) < epsilon && Math.abs(channel.velocity) < epsilon
}
