/**
 * Streaming Volcengine Ark Chat Completions client with function calling.
 * Ark exposes an OpenAI-compatible endpoint, so tool calls share the agent
 * format used by DeepSeek and MiniMax.
 */

import type { AgentModelId } from '../../shared/agent-models'
import type { AgentReasoning } from '../../shared/agent'
import { volcanoBaseUrl } from '../../shared/volcano'
import type {
  ProviderToolCall,
  StreamOptions,
  StreamResult,
} from './provider'

const endpoint = `${volcanoBaseUrl}/chat/completions`
const requestTimeoutMs = 180_000

type StreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
}

function friendlyError(status: number, detail?: string): Error {
  if (status === 401 || status === 403)
    return new Error('火山方舟 API Key 无效，请重新添加。')
  if (status === 402) return new Error('火山方舟账户余额或套餐额度不足。')
  if (status === 429) return new Error('火山方舟请求过于频繁，请稍后再试。')
  if (status === 422)
    return new Error(detail || '火山方舟拒绝了这次生成内容。')
  if (status === 404)
    return new Error(
      detail
        ? `火山方舟模型不可用：${detail}`
        : '火山方舟未开通该模型，请到控制台开通 Doubao Seed 2.1 Pro。',
    )
  if (status >= 500)
    return new Error('火山方舟服务暂时不可用，请稍后重试。')
  return new Error(
    detail
      ? `火山方舟请求失败：${detail}`
      : `火山方舟请求失败（${status}）。`,
  )
}

function reasoningEffort(
  reasoning: AgentReasoning,
): 'low' | 'high' | 'max' {
  if (reasoning === 'max') return 'max'
  if (reasoning === 'high') return 'high'
  return 'low'
}

export function volcanoRequestBody(
  options: StreamOptions,
): Record<string, unknown> {
  const reasoning = options.reasoning ?? 'high'
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: options.maxTokens ?? 32_768,
    thinking: { type: reasoning === 'off' ? 'disabled' : 'enabled' },
  }
  if (reasoning !== 'off') body.reasoning_effort = reasoningEffort(reasoning)
  if (options.tools?.length) {
    body.tools = options.tools
    body.tool_choice = 'auto'
  }
  return body
}

export async function streamVolcanoChat(
  apiKey: string,
  options: StreamOptions,
): Promise<StreamResult> {
  const timeout = AbortSignal.timeout(requestTimeoutMs)
  const signal = AbortSignal.any([options.signal, timeout])
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(volcanoRequestBody(options)),
      signal,
    })
  } catch (error) {
    if (options.signal.aborted) throw error
    if (timeout.aborted) throw new Error('火山方舟响应超时，请稍后重试。')
    throw new Error('连接火山方舟失败，请检查网络后重试。')
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: { message?: string }; message?: string }
      | null
    throw friendlyError(
      response.status,
      data?.error?.message || data?.message,
    )
  }
  if (!response.body) throw new Error('火山方舟没有返回内容流。')

  let text = ''
  let reasoning = ''
  let finishReason: string | undefined
  let usage: StreamResult['usage']
  const calls: ProviderToolCall[] = []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const consume = (line: string): void => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    let chunk: StreamChunk
    try {
      chunk = JSON.parse(payload) as StreamChunk
    } catch {
      return
    }
    if (chunk.usage) {
      usage = {
        input: chunk.usage.prompt_tokens ?? 0,
        output: chunk.usage.completion_tokens ?? 0,
      }
    }
    const choice = chunk.choices?.[0]
    if (!choice) return
    if (choice.finish_reason) finishReason = choice.finish_reason
    const delta = choice.delta
    if (!delta) return
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
      reasoning += delta.reasoning_content
      options.onReasoning?.(delta.reasoning_content)
    }
    if (typeof delta.content === 'string' && delta.content) {
      text += delta.content
      options.onText?.(delta.content)
    }
    for (const item of delta.tool_calls ?? []) {
      const index = item.index ?? 0
      const slot = (calls[index] ??= { id: '', name: '', arguments: '' })
      if (item.id) slot.id = item.id
      if (item.function?.name) slot.name += item.function.name
      if (item.function?.arguments) slot.arguments += item.function.arguments
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const index = buffer.indexOf('\n')
        if (index < 0) break
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        consume(line)
      }
    }
    if (buffer.trim()) consume(buffer.trim())
  } finally {
    reader.releaseLock()
  }
  return {
    text,
    ...(reasoning ? { reasoning } : {}),
    toolCalls: calls.filter((call) => call.name),
    ...(usage ? { usage } : {}),
    ...(finishReason ? { finishReason } : {}),
  }
}

export type { AgentModelId }
