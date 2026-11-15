import { describe, expect, test } from 'vitest'
import {
  cleanSessionTitle,
  generateSessionTitle,
  nameLength,
} from '../../src/main/agent/title'

describe('session titles', () => {
  test('removes punctuation and keeps one line', () => {
    expect(cleanSessionTitle('标题：日报，整理。')).toBe('日报整理')
    expect(cleanSessionTitle('“Mermaid” 图表\n示例！')).toBe('Mermaid 图表示例')
    expect(cleanSessionTitle('```ts\nconst a = 1\n```')).toBe('const a = 1')
  })

  test('limits titles to 16 characters', () => {
    const title = cleanSessionTitle('一'.repeat(30))
    expect(nameLength(title)).toBe(16)
    expect(title).toBe('一'.repeat(16))
  })

  test('keeps punctuation in manual names when only counting', () => {
    expect(nameLength('一二三四五六七八九十一二三四五，')).toBe(16)
  })

  test('generates through the provided stream', async () => {
    const seen: string[] = []
    const title = await generateSessionTitle({
      key: 'test-key',
      prompt: '帮我整理日报',
      signal: new AbortController().signal,
      stream: async (_key, options) => {
        seen.push(String(options.messages.at(-1)?.content ?? ''))
        expect(options.model).toBe('deepseek-flash')
        expect(options.reasoning).toBe('off')
        return { text: '日报整理！', toolCalls: [] }
      },
    })
    expect(seen[0]).toBe('帮我整理日报')
    expect(title).toBe('日报整理')
  })
})
