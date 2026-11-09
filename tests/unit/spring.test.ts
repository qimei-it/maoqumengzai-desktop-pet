import { describe, expect, test } from 'vitest'
import {
  createChannel,
  isSettled,
  stepSpring,
  windowSpring,
} from '../../src/shared/spring'

function advance(
  channel: ReturnType<typeof createChannel>,
  target: number,
  frames: number,
  delta = 1 / 60,
) {
  let current = channel
  for (let frame = 0; frame < frames; frame += 1) {
    current = stepSpring(current, target, windowSpring, delta)
  }
  return current
}

describe('spring motion', () => {
  test('a window channel settles on its target without overshooting', () => {
    let channel = createChannel(180)
    let peak = 180
    for (let frame = 0; frame < 120; frame += 1) {
      channel = stepSpring(channel, 348, windowSpring, 1 / 60)
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
    channel = stepSpring(channel, 100, windowSpring, 5)
    expect(channel.value).toBeLessThan(100)
    expect(Number.isFinite(channel.velocity)).toBe(true)
  })
})
