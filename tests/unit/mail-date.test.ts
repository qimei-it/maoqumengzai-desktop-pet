import { describe, expect, test } from 'vitest'
import {
  formatMailDateTime,
  formatMailListDate,
} from '../../src/shared/mail-date'

const now = new Date(2026, 10, 13, 12, 0).getTime()
const today = new Date(2026, 10, 13, 8, 30).getTime()
const thisYear = new Date(2026, 2, 5, 8, 30).getTime()
const lastYear = new Date(2025, 11, 31, 8, 30).getTime()

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
