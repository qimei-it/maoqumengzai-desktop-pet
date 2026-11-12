import { describe, expect, test } from 'vitest'
import {
  countToday,
  focusCycleDone,
  focusDurations,
  focusStats,
  formatCalendarDate,
  formatClockTime,
  formatFocus,
  groupByDay,
  nextBreakAt,
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

  test('cycle progress resets after the long break', () => {
    expect(focusCycleDone(0, 'focus')).toBe(0)
    expect(focusCycleDone(1, 'short')).toBe(1)
    expect(focusCycleDone(3, 'long')).toBe(3)
    expect(focusCycleDone(4, 'long')).toBe(4)
    expect(focusCycleDone(4, 'focus')).toBe(0)
    expect(focusCycleDone(5, 'focus')).toBe(1)
    expect(focusCycleDone(8, 'short')).toBe(4)
  })

  test('break reminders skip the quiet window', () => {
    const morning = new Date(2026, 10, 13, 10, 0).getTime()
    expect(nextBreakAt(morning, 45)).toBe(
      new Date(2026, 10, 13, 10, 45).getTime(),
    )
    const beforeQuiet = new Date(2026, 10, 13, 21, 30).getTime()
    expect(nextBreakAt(beforeQuiet, 45)).toBe(
      new Date(2026, 10, 14, 8, 0).getTime(),
    )
    const earlyMorning = new Date(2026, 10, 13, 3, 0).getTime()
    expect(nextBreakAt(earlyMorning, 45)).toBe(
      new Date(2026, 10, 13, 8, 0).getTime(),
    )
    expect(nextBreakAt(beforeQuiet, 45, false)).toBe(
      new Date(2026, 10, 13, 22, 15).getTime(),
    )
    const lunch = new Date(2026, 10, 13, 13, 0).getTime()
    expect(nextBreakAt(lunch, 30, true, 12, 14)).toBe(
      new Date(2026, 10, 13, 14, 0).getTime(),
    )
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

  test('week and month summaries aggregate focus sessions', () => {
    const now = new Date(2026, 10, 11, 15, 0).getTime()
    const at = (month: number, day: number, hour = 9) =>
      new Date(2026, month, day, hour).getTime()
    const sessions = [
      { endedAt: at(10, 9, 10), minutes: 25 },
      { endedAt: at(10, 11, 11), minutes: 50 },
      { endedAt: at(10, 15, 12), minutes: 25 },
      { endedAt: at(10, 1, 8), minutes: 30 },
      { endedAt: at(9, 31, 9), minutes: 60 },
    ]
    const week = focusStats(sessions, now, 'week')
    expect(week.count).toBe(3)
    expect(week.minutes).toBe(100)
    expect(week.buckets.map((bucket) => bucket.label)).toEqual([
      '一',
      '二',
      '三',
      '四',
      '五',
      '六',
      '日',
    ])
    expect(week.buckets.map((bucket) => bucket.minutes)).toEqual([
      25, 0, 50, 0, 0, 0, 25,
    ])

    const month = focusStats(sessions, now, 'month')
    expect(month.count).toBe(4)
    expect(month.minutes).toBe(130)
    expect(month.buckets.map((bucket) => bucket.title)).toEqual([
      '1–7 日',
      '8–14 日',
      '15–21 日',
      '22–28 日',
      '29–30 日',
    ])
    expect(month.buckets.map((bucket) => bucket.minutes)).toEqual([
      30, 75, 25, 0, 0,
    ])
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
