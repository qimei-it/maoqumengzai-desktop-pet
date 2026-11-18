import { describe, expect, test } from 'vitest'
import { detectClockJump, nextWakeDelay } from '../../src/shared/scheduler'

const base = {
  now: 1_000_000,
  running: false,
  runningMs: 1_000,
  idleMs: 15_000,
  retryMs: 250,
  dueAt: [] as (number | null | undefined)[],
}

describe('scheduler clock checks', () => {
  test('ignores normal tick drift', () => {
    expect(detectClockJump(1_000, 500, 2_000, 1_500)).toBe('none')
    expect(detectClockJump(1_000, 500, 1_090, 590)).toBe('none')
  })

  test('detects forward and backward wall-clock jumps', () => {
    expect(detectClockJump(1_000, 500, 601_000, 1_500)).toBe('forward')
    expect(detectClockJump(601_000, 1_500, 1_000, 2_500)).toBe('backward')
  })

  test('skips the first sample', () => {
    expect(detectClockJump(0, 0, 10_000_000, 1_000)).toBe('none')
  })
})

describe('scheduler wake-up', () => {
  test('refreshes a running countdown every second', () => {
    expect(
      nextWakeDelay({
        ...base,
        running: true,
        dueAt: [base.now + 900_000],
      }),
    ).toBe(1_000)
  })

  test('sleeps to the idle cap when nothing is due', () => {
    expect(nextWakeDelay(base)).toBe(15_000)
    expect(nextWakeDelay({ ...base, dueAt: [null, undefined] })).toBe(15_000)
  })

  test('wakes exactly at the nearest due time', () => {
    expect(
      nextWakeDelay({
        ...base,
        dueAt: [base.now + 40_000, base.now + 3_000, base.now + 9_000],
      }),
    ).toBe(3_000)
  })

  test('retries overdue reminders and otherwise waits for the cap', () => {
    expect(
      nextWakeDelay({ ...base, dueAt: [base.now - 1, base.now + 60_000] }),
    ).toBe(250)
    expect(nextWakeDelay({ ...base, dueAt: [base.now + 60_000] })).toBe(15_000)
  })

  test('retries a deferred notification before the idle cap', () => {
    expect(nextWakeDelay({ ...base, retry: true })).toBe(250)
  })
})
