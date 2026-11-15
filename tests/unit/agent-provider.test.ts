import { describe, expect, test } from 'vitest'
import { chatRequestBody } from '../../src/main/agent/provider'
import type { StreamOptions } from '../../src/main/agent/provider'

const base: StreamOptions = {
  model: 'deepseek-flash',
  messages: [{ role: 'user', content: '你好' }],
  signal: new AbortController().signal,
}

describe('DeepSeek chat request body', () => {
  test('enables thinking with high effort by default', () => {
    const body = chatRequestBody(base)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('high')
    expect(body.max_tokens).toBe(32_768)
  })

  test('disables thinking and omits effort when effort is off', () => {
    const body = chatRequestBody({ ...base, reasoning: 'off' })
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect('reasoning_effort' in body).toBe(false)
    expect(body.max_tokens).toBe(4096)
  })

  test('forwards max effort and tool definitions', () => {
    const body = chatRequestBody({
      ...base,
      reasoning: 'max',
      tools: [
        {
          type: 'function',
          function: {
            name: 'shelf_list',
            description: '列出置物架文件',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    })
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('max')
    expect(body.tool_choice).toBe('auto')
    expect(Array.isArray(body.tools)).toBe(true)
  })
})
