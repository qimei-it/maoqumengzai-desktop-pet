import { describe, expect, test } from 'vitest'
import { resolveTextModel } from '../../src/shared/music-ai-model'

describe('文本模型解析', () => {
  test('默认对话模型有对应 Key 时直接使用', () => {
    const choice = resolveTextModel('deepseek-flash', { deepseek: 'sk-ds' })
    expect(choice).toEqual({
      provider: 'deepseek',
      model: 'deepseek-flash',
      key: 'sk-ds',
    })
  })

  test('默认模型的供应商没有 Key 时回退到已配置的文本模型', () => {
    const choice = resolveTextModel('deepseek-flash', { minimax: 'mm-key' })
    expect(choice?.provider).toBe('minimax')
    expect(choice?.key).toBe('mm-key')
    expect(choice?.model.startsWith('MiniMax')).toBe(true)
  })

  test('默认模型本身属于已配置的供应商时保留用户选择', () => {
    const choice = resolveTextModel('MiniMax-M3', { minimax: 'mm-key' })
    expect(choice?.model).toBe('MiniMax-M3')
  })

  test('按注册表顺序回退：DeepSeek 优先于火山方舟', () => {
    const choice = resolveTextModel('', { volcano: 'ark-key', deepseek: 'sk' })
    expect(choice?.provider).toBe('deepseek')
  })

  test('只配置火山方舟时回退到火山文本模型', () => {
    const choice = resolveTextModel('', { volcano: 'ark-key' })
    expect(choice?.provider).toBe('volcano')
    expect(choice?.model.startsWith('doubao-seed')).toBe(true)
  })

  test('默认模型是生成类模型时跳过它', () => {
    const choice = resolveTextModel('MiniMax-H3', { minimax: 'mm-key' })
    expect(choice?.provider).toBe('minimax')
    expect(choice?.model).not.toBe('MiniMax-H3')
  })

  test('没有任何 Key 时返回 undefined', () => {
    expect(resolveTextModel('deepseek-flash', {})).toBeUndefined()
  })
})
