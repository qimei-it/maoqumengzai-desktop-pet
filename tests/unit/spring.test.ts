import { describe, expect, test } from 'vitest'
import { createChannel, isSettled, stepSpring } from '../../src/shared/spring'

const config = { stiffness: 380, damping: 39, mass: 1 }

function advance(
  channel: ReturnType<typeof createChannel>,
  target: number,
  frames: number,
  delta = 1 / 60,
) {
  let current = channel
  for (let frame = 0; frame < frames; frame += 1) {
    current = stepSpring(current, target, config, delta)
  }
  return current
}

describe('spring motion', () => {
  test('a critically damped channel settles without overshooting', () => {
    let channel = createChannel(180)
    let peak = 180
    for (let frame = 0; frame < 120; frame += 1) {
      channel = stepSpring(channel, 348, config, 1 / 60)
      peak = Math.max(peak, channel.value)
    }
    expect(channel.value).toBeCloseTo(348, 1)
    expect(peak).toBeLessThanOrEqual(348.01)
    expect(isSettled(channel, 348)).toBe(true)
  })

  test('the first frames move fast and then decelerate', () => {
    const early = advance(createChannel(0), 100, 3)
    const late = advance(createChannel(0), 100, 30)
    const lateStep = late.value - advance(createChannel(0), 100, 29).value
    expect(early.value).toBeGreaterThan(lateStep * 4)
    expect(late.value).toBeLessThanOrEqual(100)
  })

  test('a long frame is clamped instead of exploding', () => {
    let channel = createChannel(0)
    channel = stepSpring(channel, 100, config, 5)
    expect(channel.value).toBeLessThan(100)
    expect(Number.isFinite(channel.velocity)).toBe(true)
  })
})
