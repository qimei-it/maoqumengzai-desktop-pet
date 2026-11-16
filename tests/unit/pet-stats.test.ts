import { describe, expect, test } from 'vitest'
import {
  bumpPetInteraction,
  defaultPetStats,
  localDayKey,
  normalizePetDays,
  petStatsMaxDays,
  petStatsView,
  recordPetDay,
} from '../../src/shared/pet-stats'
import { parsePetStats } from '../../src/main/pet-stats-store'

const noon = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12, 0, 0).getTime()

describe('pet stats', () => {
  test('starts with today already counted', () => {
    const stats = defaultPetStats(noon(2026, 11, 16))
    expect(stats.days).toEqual(['2026-11-16'])
    expect(petStatsView(stats).daysTogether).toBe(1)
    expect(stats.interactions).toEqual({ poke: 0, focus: 0, water: 0, todo: 0 })
  })

  test('counts one day per local date and keeps the earliest first seen', () => {
    let stats = defaultPetStats(noon(2026, 11, 16))
    stats = recordPetDay(stats, noon(2026, 11, 16))
    expect(stats.days).toEqual(['2026-11-16'])
    const next = recordPetDay(stats, noon(2026, 11, 17))
    expect(next.days).toEqual(['2026-11-16', '2026-11-17'])
    expect(petStatsView(next).daysTogether).toBe(2)
    expect(next.firstSeenAt).toBe(stats.firstSeenAt)
  })

  test('local day keys use the local calendar date', () => {
    expect(localDayKey(noon(2026, 1, 2))).toBe('2026-01-02')
    expect(localDayKey(noon(2026, 12, 31))).toBe('2026-12-31')
  })

  test('keeps the most recent days when trimming', () => {
    const days = Array.from({ length: petStatsMaxDays + 5 }, (_, index) => {
      const date = new Date(2026, 0, 1 + index)
      return localDayKey(date.getTime())
    })
    const trimmed = normalizePetDays([...days, days[0]!])
    expect(trimmed).toHaveLength(petStatsMaxDays)
    expect(trimmed[0]).toBe(days[5])
    expect(trimmed.at(-1)).toBe(days.at(-1))
  })

  test('ignores malformed day keys', () => {
    expect(normalizePetDays(['2026-11-16', '16-11-2026', '2026-1-1'])).toEqual([
      '2026-11-16',
    ])
  })

  test('bumps a single interaction counter', () => {
    const stats = defaultPetStats(noon(2026, 11, 16))
    const poked = bumpPetInteraction(stats, 'poke', noon(2026, 11, 16), 3)
    expect(poked.interactions.poke).toBe(3)
    expect(poked.interactions.focus).toBe(0)
    expect(stats.interactions.poke).toBe(0)
  })

  test('rejects corrupted or unknown records', () => {
    const now = noon(2026, 11, 16)
    const valid = defaultPetStats(now)
    expect(parsePetStats(valid)).toEqual(valid)
    expect(parsePetStats({ ...valid, version: 2 })).toBeUndefined()
    expect(parsePetStats({ ...valid, days: ['today'] })).toBeUndefined()
    expect(
      parsePetStats({ ...valid, interactions: { ...valid.interactions, x: 1 } }),
    ).toBeUndefined()
    expect(parsePetStats(null)).toBeUndefined()
  })
})
