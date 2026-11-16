import { describe, expect, test } from 'vitest'
import {
  isPetSpecies,
  petSpeciesGroups,
  petSpeciesOptions,
} from '../../src/shared/pet-species'

describe('pet species catalog', () => {
  test('groups cover every option once', () => {
    expect(new Set(petSpeciesOptions).size).toBe(petSpeciesOptions.length)
    const grouped = petSpeciesGroups.flatMap((group) => [...group.options])
    expect(new Set(grouped).size).toBe(grouped.length)
    expect([...grouped].sort()).toEqual([...petSpeciesOptions].sort())
  })

  test('accepts common and exotic species', () => {
    for (const value of [
      '猫',
      '龙猫',
      '蜜袋鼯',
      '柯尔鸭',
      '守宫',
      '蜘蛛',
      '羊驼',
      '其他',
    ])
      expect(isPetSpecies(value)).toBe(true)
    expect(isPetSpecies('恐龙')).toBe(false)
    expect(isPetSpecies('')).toBe(false)
  })
})
