import { describe, expect, test } from 'vitest'
import {
  agentImageModels,
  agentModels,
  agentTextModels,
  isGenerationModel,
  isTextModel,
  modelInfo,
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

  test('classifies text and generation models', () => {
    expect(isTextModel('MiniMax-M3.1-Flash')).toBe(true)
    expect(isTextModel('Doubao-Seedream-5.5')).toBe(false)
    expect(isGenerationModel('Doubao-Seedream-5.5')).toBe(true)
    expect(isGenerationModel('MiniMax-M3.1-Flash')).toBe(false)
  })
})
