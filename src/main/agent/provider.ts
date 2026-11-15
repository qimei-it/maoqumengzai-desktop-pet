/**
 * Streaming DeepSeek Chat Completions client with function calling.
 * Runs in the main process so the API key never reaches a renderer.
 */

import type { DeepSeekModel } from '../../shared/deepseek'
import type { AgentReasoning } from '../../shared/agent'

export type ProviderToolCall = {
  id: string
  name: string
  arguments: string
}

export type ProviderAssistantMessage = {
  role: 'assistant'
  content: string | null
  /** Must be echoed back on later tool-enabled turns. */
  reasoning_content?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

export type ProviderTextBlock = { type: 'text'; text: string }
export type ProviderImageBlock = {
  type: 'image_url'
  image_url: { url: string; detail?: 'low' | 'high' | 'original' | 'auto' }
}
export type ProviderFileBlock = { type: 'file'; file_id: string }
export type ProviderContentBlock =
  | ProviderTextBlock
  | ProviderImageBlock
  | ProviderFileBlock

export type ProviderUserContent = string | ProviderContentBlock[]

export type ProviderMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: ProviderUserContent }
  | ProviderAssistantMessage
  | { role: 'tool'; tool_call_id: string; content: string }

export type ProviderToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type StreamResult = {
  text: string
  reasoning?: string
  toolCalls: ProviderToolCall[]
  usage?: { input: number; output: number }
  finishReason?: string
}

export type StreamOptions = {
  model: DeepSeekModel
  messages: ProviderMessage[]
  tools?: ProviderToolDefinition[]
  reasoning?: AgentReasoning
  maxTokens?: number
  temperature?: number
  signal: AbortSignal
  onText?: (delta: string) => void
}

const endpoint = 'https://api.deepseek.com/chat/completions'
const requestTimeoutMs = 120_000

function friendlyError(
  status: number,
  detail?: string,
): Error {
  if (status === 401 || status === 403)
    return new Error('API Key 无效，请在设置中更换。')
  if (status === 402) return new Error('DeepSeek 账户余额不足。')
  if (status === 429) return new Error('请求太频繁，请稍后再试。')
  if (status === 400 && detail) return new Error(`请求被拒绝：${detail}`)
  if (status >= 500)
    return new Error('DeepSeek 服务暂时不可用，请稍后重试。')
  return new Error(
    detail
      ? `DeepSeek 请求失败：${detail}`
      : `DeepSeek 请求失败（${status}）。`,
  )
}

type UsageChunk = {
  prompt_tokens?: number
  completion_tokens?: number
}

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
  usage?: UsageChunk | null
  error?: { message?: string }
  message?: string
}

/** Builds the DeepSeek Chat Completions payload for one streamed turn. */
export function chatRequestBody(
  options: StreamOptions,
): Record<string, unknown> {
  const reasoning = options.reasoning ?? 'high'
  const thinking = reasoning !== 'off'
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: true,
    stream_options: { include_usage: true },
    thinking: { type: thinking ? 'enabled' : 'disabled' },
    ...(thinking ? { reasoning_effort: reasoning } : {}),
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? (thinking ? 32_768 : 4096),
  }
  if (options.tools?.length) {
    body.tools = options.tools
    body.tool_choice = 'auto'
  }
  return body
}

/** Streams one assistant turn, including any tool calls it requests. */
export async function streamChat(
  apiKey: string,
  options: StreamOptions,
): Promise<StreamResult> {
  const body = chatRequestBody(options)

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
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (options.signal.aborted) throw error
    if (timeout.aborted)
      throw new Error('DeepSeek 响应超时，请稍后重试。')
    throw new Error('连接 DeepSeek 失败，请检查网络后重试。')
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
  if (!response.body) throw new Error('DeepSeek 没有返回内容流。')

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
