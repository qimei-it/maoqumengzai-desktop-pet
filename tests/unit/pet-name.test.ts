import { describe, expect, test } from 'vitest'
import {
  maxPetNameChars,
  normalizePetName,
  petNameConflict,
  petNameConflictError,
  petNameLength,
} from '../../src/shared/pet-name'

describe('pet name validation', () => {
  test('normalizes spaces, width and case', () => {
    expect(normalizePetName('  橘子  ')).toBe('橘子')
    expect(normalizePetName('Cat')).toBe('cat')
    expect(normalizePetName('ＣＡＴ')).toBe('cat')
  })

  test('detects duplicate names across saved pets', () => {
    expect(petNameConflict('  cat ', ['Cat', '橘子'])).toBe(true)
    expect(petNameConflict('橘子', ['团子', '小白'])).toBe(false)
    expect(petNameConflict('', ['团子'])).toBe(false)
  })

  test('counts characters by code point', () => {
    expect(petNameLength('团子')).toBe(2)
    expect(petNameLength('🐱')).toBe(1)
    expect(petNameLength('🐱'.repeat(maxPetNameChars + 1))).toBe(
      maxPetNameChars + 1,
    )
  })

  test('exposes one shared error message', () => {
    expect(petNameConflictError).toBe('已经有同名桌宠，请换一个。')
  })
})
