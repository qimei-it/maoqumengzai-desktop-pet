import { describe, expect, test } from 'vitest'
import {
  dueTodosToNotify,
  endOfLocalDay,
  formatDueLabel,
  fromDateTimeLocalValue,
  isSameLocalDay,
  nextRepeatDueAt,
  startOfLocalDay,
  toDateTimeLocalValue,
} from '../../src/shared/todo-time'

const now = new Date(2026, 10, 13, 10, 0).getTime()
const due = new Date(2026, 10, 13, 13, 44).getTime()

describe('todo due dates', () => {
  test('compare and bound local days', () => {
    expect(isSameLocalDay(due, now)).toBe(true)
    expect(isSameLocalDay(due, new Date(2026, 10, 14, 0, 1).getTime())).toBe(
      false,
    )
    expect(startOfLocalDay(due)).toBe(new Date(2026, 10, 13).getTime())
    const end = new Date(endOfLocalDay(due))
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
  })

  test('format today, tomorrow and other dates', () => {
    expect(formatDueLabel(due, now)).toBe('今天 13:44')
    expect(
      formatDueLabel(new Date(2026, 10, 14, 13, 44).getTime(), now),
    ).toBe('明天 13:44')
    expect(
      formatDueLabel(new Date(2026, 10, 12, 13, 44).getTime(), now),
    ).toBe('昨天 13:44')
    expect(
      formatDueLabel(new Date(2026, 10, 20, 13, 44).getTime(), now),
    ).toBe('11月20日 13:44')
    expect(
      formatDueLabel(new Date(2027, 0, 2, 13, 44).getTime(), now),
    ).toBe('2027年1月2日 13:44')
  })

  test('round-trip datetime-local values', () => {
    const value = toDateTimeLocalValue(due)
    expect(value).toBe('2026-11-13T13:44')
    expect(fromDateTimeLocalValue(value)).toBe(due)
    expect(fromDateTimeLocalValue('')).toBeNull()
    expect(fromDateTimeLocalValue('not-a-date')).toBeNull()
  })

  test('repeating due dates advance on the local calendar', () => {
    const friday = new Date(2026, 10, 13, 13, 44).getTime()
    expect(nextRepeatDueAt(friday, 'daily')).toBe(
      new Date(2026, 10, 14, 13, 44).getTime(),
    )
    expect(nextRepeatDueAt(friday, 'weekdays')).toBe(
      new Date(2026, 10, 16, 13, 44).getTime(),
    )
    expect(nextRepeatDueAt(friday, 'weekly')).toBe(
      new Date(2026, 10, 20, 13, 44).getTime(),
    )
    const monthEnd = new Date(2026, 0, 31, 9, 0).getTime()
    expect(nextRepeatDueAt(monthEnd, 'monthly')).toBe(
      new Date(2026, 1, 28, 9, 0).getTime(),
    )
    const leapDay = new Date(2028, 1, 29, 9, 0).getTime()
    expect(nextRepeatDueAt(leapDay, 'yearly')).toBe(
      new Date(2029, 1, 28, 9, 0).getTime(),
    )
    expect(nextRepeatDueAt(null, 'none')).toBeNull()
    expect(nextRepeatDueAt(null, 'daily', friday)).toBe(
      new Date(2026, 10, 14, 23, 59, 59, 999).getTime(),
    )
    // Like Reminders, a late completion keeps the original cadence instead of
    // restarting from the completion time.
    const threeDaysAgo = new Date(2026, 10, 10, 9, 0).getTime()
    const completedLate = new Date(2026, 10, 13, 10, 0).getTime()
    expect(nextRepeatDueAt(threeDaysAgo, 'daily', completedLate)).toBe(
      new Date(2026, 10, 11, 9, 0).getTime(),
    )
  })

  test('due reminders only fire for newly crossed open deadlines', () => {
    const now = Date.now()
    const todo = (id: string, dueAt: number | null, done = false) => ({
      id,
      text: id,
      done,
      dueAt,
    })
    const due = dueTodosToNotify(
      [
        todo('recent', now - 1000),
        todo('old', now - 10 * 60 * 1000),
        todo('future', now + 1000),
        todo('done', now - 1000, true),
      ],
      now - 60 * 1000,
      now,
    )
    expect(due.map((item) => item.id)).toEqual(['recent'])
    expect(
      dueTodosToNotify(
        [todo('outside-grace', now - 8 * 60 * 1000)],
        now - 10 * 60 * 1000,
        now,
      ),
    ).toEqual([])
  })
})
