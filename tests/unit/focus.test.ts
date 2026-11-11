import { describe, expect, test } from 'vitest'
import {
  countToday,
  focusDurations,
  formatCalendarDate,
  formatClockTime,
  formatFocus,
  groupByDay,
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

  test('history groups by day, newest first', () => {
    const now = new Date(2026, 10, 11, 15, 0).getTime()
    const at = (day: number, hour: number) =>
      new Date(2026, 10, day, hour, 0).getTime()
    const entries = [
      { id: 'a', at: at(9, 9) },
      { id: 'b', at: at(11, 8) },
      { id: 'c', at: at(11, 14) },
      { id: 'd', at: at(10, 7) },
    ]
    const groups = groupByDay(entries, (entry) => entry.at, now)
    expect(groups.map((group) => group.label)).toEqual(['今天', '昨天', '11月9日'])
    expect(groups[0].items.map((entry) => entry.id)).toEqual(['c', 'b'])
    expect(groups[0].count).toBe(2)
  })

  test('history skips entries older than the window and counts today', () => {
    const now = new Date(2026, 10, 11, 12, 0).getTime()
    const at = (day: number) => new Date(2026, 10, day, 9, 0).getTime()
    const entries = [
      { id: 'today', at: at(11) },
      { id: 'week', at: at(7) },
      { id: 'old', at: at(2) },
    ]
    expect(groupByDay(entries, (entry) => entry.at, now)).toHaveLength(2)
    expect(countToday(entries, (entry) => entry.at, now)).toBe(1)
  })

  test('calendar and clock labels use local padded values', () => {
    const stamp = new Date(2026, 2, 4, 7, 5).getTime()
    expect(formatCalendarDate(stamp)).toBe('2026年03月04日')
    expect(formatClockTime(stamp)).toBe('07:05')
  })
})
