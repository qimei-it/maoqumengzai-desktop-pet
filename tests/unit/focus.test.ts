import { describe, expect, test } from 'vitest'
import {
  focusDurations,
  formatFocus,
  nextPhase,
  nextWaterAt,
  phaseSeconds,
} from '../../src/shared/focus'

describe('focus helpers', () => {
  test('default phases and formatting', () => {
    expect(phaseSeconds('focus')).toBe(25 * 60)
    expect(phaseSeconds('short')).toBe(5 * 60)
    expect(phaseSeconds('long')).toBe(15 * 60)
    expect(focusDurations.focus).toBe(1500)
    expect(formatFocus(1500)).toBe('25:00')
    expect(formatFocus(65)).toBe('01:05')
    expect(formatFocus(-1)).toBe('00:00')
  })

  test('every fourth focus leads to a long break', () => {
    expect(nextPhase('focus', 0)).toEqual({ phase: 'short', completed: 1 })
    expect(nextPhase('focus', 2)).toEqual({ phase: 'short', completed: 3 })
    expect(nextPhase('focus', 3)).toEqual({ phase: 'long', completed: 4 })
    expect(nextPhase('short', 4)).toEqual({ phase: 'focus', completed: 4 })
    expect(nextPhase('long', 4)).toEqual({ phase: 'focus', completed: 4 })
  })

  test('water reminders stay inside 09:00–22:00', () => {
    const inside = new Date(2026, 10, 11, 10, 30).getTime()
    expect(nextWaterAt(inside)).toBe(inside + 60 * 60 * 1000)
    const evening = new Date(2026, 10, 11, 21, 30).getTime()
    const tomorrow = new Date(nextWaterAt(evening))
    expect(tomorrow.getDate()).toBe(12)
    expect(tomorrow.getHours()).toBe(9)
    expect(tomorrow.getMinutes()).toBe(0)
    const early = new Date(2026, 10, 11, 8, 30).getTime()
    expect(new Date(nextWaterAt(early)).getHours()).toBe(9)
  })

  test('water interval and active hours are configurable', () => {
    const morning = new Date(2026, 10, 11, 10, 0).getTime()
    expect(nextWaterAt(morning, 30, 8, 21)).toBe(morning + 30 * 60 * 1000)
    const evening = new Date(2026, 10, 11, 20, 45).getTime()
    const tomorrow = new Date(nextWaterAt(evening, 30, 8, 21))
    expect(tomorrow.getDate()).toBe(12)
    expect(tomorrow.getHours()).toBe(8)
    const clamped = new Date(2026, 10, 11, 10, 0).getTime()
    expect(nextWaterAt(clamped, 1, 8, 21)).toBe(clamped + 5 * 60 * 1000)
    expect(nextWaterAt(clamped, 999, 8, 21)).toBe(clamped + 240 * 60 * 1000)
  })
})
