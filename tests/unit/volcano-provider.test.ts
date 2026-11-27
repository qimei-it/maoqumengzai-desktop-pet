import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  streamVolcanoChat,
  volcanoRequestBody,
} from '../../src/main/agent/volcano-provider'
import type { StreamOptions } from '../../src/main/agent/provider'
import { agentTextModels } from '../../src/shared/agent-models'
import { chatRequestBody } from '../../src/main/agent/provider'
import { miniMaxRequestBody } from '../../src/main/agent/minimax-provider'

const base: StreamOptions = {
  model: 'doubao-seed-2-1-pro-260915',
  messages: [{ role: 'user', content: '你好' }],
  signal: new AbortController().signal,
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Volcano Ark chat request body', () => {
  test('enables thinking with high effort by default', () => {
    const body = volcanoRequestBody(base)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('high')
    expect(body.stream).toBe(true)
    expect(body.max_tokens).toBe(32_768)
  })

  test('disables thinking and omits effort when reasoning is off', () => {
    const body = volcanoRequestBody({ ...base, reasoning: 'off' })
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect('reasoning_effort' in body).toBe(false)
  })

  test('forwards max effort and tool definitions', () => {
    const body = volcanoRequestBody({
      ...base,
      reasoning: 'max',
      tools: [
        {
          type: 'function',
          function: {
            name: 'ui_open',
            description: '打开应用内面板',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    })
    expect(body.reasoning_effort).toBe('max')
    expect(body.tool_choice).toBe('auto')
    expect(Array.isArray(body.tools)).toBe(true)
  })

  test('constructs requests for every registered Ark text model', () => {
    const models = agentTextModels.filter((model) => model.provider === 'volcano')
    expect(models).toHaveLength(13)
    for (const model of models) {
      const body = volcanoRequestBody({ ...base, model: model.id, reasoning: 'off' })
      expect(body.model).toBe(model.id)
      if (model.id === 'kimi-k3-1-pro-261024') {
        expect(body).not.toHaveProperty('thinking')
        expect(body.reasoning_effort).toBe('low')
      } else if (model.id === 'glm-5-3-flash-260828') {
        expect(body.thinking).toEqual({ type: 'enabled' })
        expect(body.reasoning_effort).toBe('low')
      } else {
        expect(body.thinking).toEqual({ type: 'disabled' })
      }
    }
  })

  test('returns encrypted thinking only to the model that produced it', () => {
    const messages: StreamOptions['messages'] = [
      { role: 'assistant', content: '结果', reasoning_content: '摘要', encrypted_content: 'cipher', reasoning_model: 'doubao-seed-2-1-pro-260915' },
    ]
    const same = volcanoRequestBody({ ...base, messages })
    expect(same.messages).toEqual([{ role: 'assistant', content: '结果', reasoning_content: '摘要', encrypted_content: 'cipher' }])
    const switched = volcanoRequestBody({ ...base, model: 'glm-5-3-flash-260828', messages })
    expect(switched.messages).toEqual([{ role: 'assistant', content: '结果' }])
    expect(chatRequestBody({ ...base, model: 'deepseek-flash', messages }).messages).toEqual([{ role: 'assistant', content: '结果' }])
    expect(miniMaxRequestBody({ ...base, model: 'MiniMax-M3', messages }).messages).toEqual([{ role: 'assistant', content: '结果' }])
  })
})

describe('Volcano Ark streaming', () => {
  test('parses text, reasoning, tool calls and usage', async () => {
    let authorization = ''
    vi.stubGlobal(
      'fetch',
      async (_url: string, init: RequestInit) => {
        authorization = String(
          (init.headers as Record<string, string>).Authorization,
        )
        return streamResponse([
          'data: {"choices":[{"delta":{"reasoning_content":"想一想"}}]}\n\n',
          'data: {"choices":[{"delta":{"encrypted_content":"encrypted-blob"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"ui_open","arguments":"{\\"panel\\":\\"todo\\"}"}}]}}]}\n\n',
          'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
          'data: [DONE]\n\n',
        ])
      },
    )
    const onText = vi.fn()
    const result = await streamVolcanoChat('ark-key', { ...base, onText })
    expect(authorization).toBe('Bearer ark-key')
    expect(result.text).toBe('你好')
    expect(result.reasoning).toBe('想一想')
    expect(result.encryptedContent).toBe('encrypted-blob')
    expect(result.toolCalls).toEqual([
      { id: 'call_1', name: 'ui_open', arguments: '{"panel":"todo"}' },
    ])
    expect(result.usage).toEqual({ input: 10, output: 5 })
    expect(result.finishReason).toBe('tool_calls')
    expect(onText).toHaveBeenCalledWith('你好')
  })
})
