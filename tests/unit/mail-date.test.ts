import { describe, expect, test } from 'vitest'
import {
  formatMailDateTime,
  formatMailListDate,
} from '../../src/shared/mail-date'

const now = new Date('2026-11-13T12:00:00+08:00').getTime()
const today = new Date('2026-11-13T08:30:00+08:00').getTime()
const thisYear = new Date('2026-03-05T08:30:00+08:00').getTime()
const lastYear = new Date('2025-12-31T08:30:00+08:00').getTime()

describe('mail date labels', () => {
  test('list dates hide the year for the current year', () => {
    expect(formatMailListDate(thisYear, now)).toBe('03/05')
    expect(formatMailListDate(today, now)).toBe('11/13')
    expect(formatMailListDate(lastYear, now)).toBe('2025/12/31')
  })

  test('reader dates show time today and year only when needed', () => {
    expect(formatMailDateTime(today, now)).toMatch(/08:30/)
    expect(formatMailDateTime(thisYear, now)).toBe('03/05')
    expect(formatMailDateTime(lastYear, now)).toBe('2025/12/31')
    expect(formatMailDateTime(undefined, now)).toBe('')
  })
})
