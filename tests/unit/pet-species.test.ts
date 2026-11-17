import { describe, expect, test } from 'vitest'
import {
  isPetSpecies,
  isPetSpeciesGroup,
  petSpeciesGroup,
  petSpeciesGroupIds,
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

describe('pet species art groups', () => {
  test('maps every species to a known group', () => {
    for (const species of petSpeciesOptions) {
      const group = petSpeciesGroup(species)
      expect(isPetSpeciesGroup(group)).toBe(true)
    }
  })

  test('routes furred species to the mammal group', () => {
    for (const species of ['猫', '狗', '兔子', '仓鼠', '龙猫', '雪貂', '羊驼'])
      expect(petSpeciesGroup(species)).toBe('mammal')
  })

  test('routes birds, reptiles, arthropods and fish to their own groups', () => {
    expect(petSpeciesGroup('鹦鹉')).toBe('bird')
    expect(petSpeciesGroup('柯尔鸭')).toBe('bird')
    expect(petSpeciesGroup('蛇')).toBe('reptile')
    expect(petSpeciesGroup('守宫')).toBe('reptile')
    expect(petSpeciesGroup('蜘蛛')).toBe('arthropod')
    expect(petSpeciesGroup('虾')).toBe('arthropod')
    expect(petSpeciesGroup('蟹')).toBe('arthropod')
    expect(petSpeciesGroup('鱼')).toBe('aquatic')
  })

  test('falls back to the neutral group for empty or unknown species', () => {
    expect(petSpeciesGroup('')).toBe('other')
    expect(petSpeciesGroup(undefined)).toBe('other')
    expect(petSpeciesGroup('其他')).toBe('other')
    expect(petSpeciesGroup('恐龙')).toBe('other')
    expect(petSpeciesGroupIds).toHaveLength(6)
  })
})
