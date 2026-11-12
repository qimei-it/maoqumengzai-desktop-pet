import { describe, expect, test } from 'vitest'
import { detectClockJump } from '../../src/shared/scheduler'

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
