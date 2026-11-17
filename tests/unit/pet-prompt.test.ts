import { describe, expect, test } from 'vitest'
import {
  maxPetPromptChars,
  normalizePetPrompt,
  petPromptLength,
} from '../../src/shared/pet-prompt'

describe('pet prompt', () => {
  test('trims text and caps it at the shared limit', () => {
    expect(normalizePetPrompt('  像朋友一样聊天  ')).toBe('像朋友一样聊天')
    expect(normalizePetPrompt('陪'.repeat(maxPetPromptChars + 50))).toBe(
      '陪'.repeat(maxPetPromptChars),
    )
  })

  test('counts characters by code point', () => {
    expect(petPromptLength('你好')).toBe(2)
    expect(petPromptLength('🐱')).toBe(1)
    expect(petPromptLength('🐱'.repeat(maxPetPromptChars + 1))).toBe(
      maxPetPromptChars + 1,
    )
  })
})
