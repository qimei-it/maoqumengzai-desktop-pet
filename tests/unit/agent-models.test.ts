import { describe, expect, test } from 'vitest'
import {
  agentImageModels,
  agentModels,
  agentTextModels,
  isGenerationModel,
  isTextModel,
  modelInfo,
  volcanoModelListed,
} from '../../src/shared/agent-models'

describe('agent model catalog', () => {
  test('exposes Volcano Seedream as an image model', () => {
    const model = modelInfo('Doubao-Seedream-5.5')
    expect(model).toMatchObject({
      label: 'Doubao Seedream 5.5',
      provider: 'volcano',
      kind: 'image',
    })
    expect(agentImageModels.map((item) => item.id)).toEqual([
      'MiniMax-H3-Image',
      'Doubao-Seedream-5.5',
    ])
  })

  test('keeps the composer dialogue models text-only', () => {
    expect(agentTextModels.length).toBeGreaterThan(0)
    expect(agentTextModels.every((item) => item.kind === 'text')).toBe(true)
    expect(agentTextModels.some((item) => item.id === 'Doubao-Seedream-5.5')).toBe(
      false,
    )
    expect(agentModels.filter((item) => item.kind === 'text')).toEqual(
      agentTextModels,
    )
  })

  test('exposes the Volcano text model family', () => {
    const volcanoText = agentTextModels.filter(
      (item) => item.provider === 'volcano',
    )
    expect(volcanoText.map((item) => item.id)).toEqual([
      'doubao-seed-2-1-pro-260915',
      'doubao-seed-2-1-lite-260915',
      'doubao-seed-2-1-turbo-260628',
      'doubao-seed-evolving',
      'doubao-seed-2-0-pro-260215',
      'doubao-seed-2-0-lite-260428',
      'doubao-seed-2-0-mini-260428',
    ])
    for (const item of volcanoText) {
      expect(item.kind).toBe('text')
      expect(item.reasoning).toBe(true)
      expect(item.contextWindow).toBeGreaterThan(0)
    }
  })

  test('classifies text and generation models', () => {
    expect(isTextModel('MiniMax-M3.1-Flash')).toBe(true)
    expect(isTextModel('doubao-seed-2-1-pro-260915')).toBe(true)
    expect(isTextModel('Doubao-Seedream-5.5')).toBe(false)
    expect(isGenerationModel('Doubao-Seedream-5.5')).toBe(true)
    expect(isGenerationModel('doubao-seed-2-1-pro-260915')).toBe(false)
    expect(modelInfo('doubao-seed-2-1-pro-260915')).toMatchObject({
      label: 'Doubao Seed 2.1 Pro',
      provider: 'volcano',
      kind: 'text',
      reasoning: true,
      contextWindow: 1_048_576,
    })
  })

  test('matches supported Volcano models against the listed IDs', () => {
    const text = modelInfo('doubao-seed-2-1-lite-260915')!
    const image = modelInfo('Doubao-Seedream-5.5')!
    const deepseek = modelInfo('deepseek-flash')!
    expect(
      volcanoModelListed(text, [
        'doubao-seed-2-1-pro-260915',
        'doubao-seed-2-1-lite-260915',
        'doubao-seedream-5-5-261028',
      ]),
    ).toBe(true)
    expect(
      volcanoModelListed(text, ['doubao-seed-2-1-pro-260915']),
    ).toBe(false)
    expect(
      volcanoModelListed(image, ['doubao-seedream-5-0-flash-20260101']),
    ).toBe(true)
    expect(volcanoModelListed(image, ['doubao-seed-2-1-pro-260915'])).toBe(
      false,
    )
    expect(volcanoModelListed(deepseek, ['doubao-seed-2-1-pro-260915'])).toBe(
      false,
    )
  })
})
