import { describe, expect, test } from 'vitest'
import {
  agentImageModels,
  agentModels,
  agentModelBrand,
  agentTextModels,
  isGenerationModel,
  isTextModel,
  integratedVolcanoModels,
  modelInfo,
  volcanoModelListed,
} from '../../src/shared/agent-models'

describe('agent model catalog', () => {
  test('uses the model brand independently of its hosting provider', () => {
    for (const [id, brand] of [
      ['kimi-k3-1-pro-261024', 'kimi'],
      ['glm-5-3-flash-260828', 'zhipu'],
      ['glm-5-2-260617', 'zhipu'],
      ['deepseek-v4-1-flash-261017', 'deepseek'],
      ['deepseek-v4-pro-ga-260813', 'deepseek'],
      ['deepseek-v4-pro', 'deepseek'],
      ['doubao-seed-2-1-pro-260915', 'doubao'],
      ['Doubao-Seedream-5.5', 'doubao'],
      ['MiniMax-M3', 'minimax'],
      ['speech-2.8-hd', 'minimax'],
    ] as const) {
      expect(agentModelBrand(modelInfo(id)!)).toBe(brand)
    }
    expect(agentModelBrand({ id: 'future-model', label: 'Future', provider: 'volcano', kind: 'text', reasoning: false })).toBe('generic')
  })
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
      'doubao-seed-2-0-lite-260428',
      'doubao-seed-2-0-mini-260428',
      'kimi-k3-1-pro-261024',
      'deepseek-v4-1-flash-economy-261017',
      'deepseek-v4-1-flash-261017',
      'glm-5-3-flash-260828',
      'deepseek-v4-pro-ga-260813',
      'deepseek-v4-flash-ga-260731',
      'glm-5-2-260617',
    ])
    for (const item of volcanoText) {
      expect(item.kind).toBe('text')
      expect(item.reasoning).toBe(true)
      expect(item.contextWindow).toBeGreaterThan(0)
    }
  })

  test('filters the Key preview to integrated Ark models returned by the server', () => {
    const ids = [
      'deepseek-v4-pro-260425', 'doubao-seed-2-0-code-preview-260215',
      'doubao-seed-2-0-pro-260215', 'unrelated-model',
      'kimi-k3-1-pro-261024', 'doubao-seedream-5-5-261028',
      'doubao-seedream-4-5-251128', 'deepseek-v4-pro',
    ]
    expect(integratedVolcanoModels(ids)).toEqual([
      { id: 'kimi-k3-1-pro-261024', label: 'Kimi-K3.1-Pro' },
      { id: 'doubao-seedream-5-5-261028', label: 'Doubao Seedream 5.5' },
    ])
    expect(modelInfo('deepseek-v4-pro')).toMatchObject({ provider: 'deepseek' })
    for (const id of ids.slice(0, 3)) expect(modelInfo(id)).toBeUndefined()
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
