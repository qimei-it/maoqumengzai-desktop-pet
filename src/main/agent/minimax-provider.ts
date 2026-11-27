/**
 * Streaming MiniMax Chat Completions client with function calling.
 * The OpenAI-compatible endpoint is used so tool calls share the agent format.
 */

import type { AgentModelId } from '../../shared/agent-models'
import type { AgentReasoning } from '../../shared/agent'
import { messagesForModel } from './provider'
import type {
  ProviderToolCall,
  StreamOptions,
  StreamResult,
} from './provider'

const endpoint = 'https://api.minimax.cn/v1/chat/completions'
const requestTimeoutMs = 120_000

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
    return new Error('API Key 无效')
  if (status === 402) return new Error('MiniMax 账户余额或套餐额度不足。')
  if (status === 429) return new Error('MiniMax 请求过于频繁，请稍后再试。')
  if (status === 422)
    return new Error(detail || 'MiniMax 拒绝了这次生成内容。')
  if (status >= 500)
    return new Error('MiniMax 服务暂时不可用，请稍后重试。')
  return new Error(
    detail
      ? `MiniMax 请求失败：${detail}`
      : `MiniMax 请求失败（${status}）。`,
  )
}

function reasoningEffort(
  reasoning: AgentReasoning,
): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  if (reasoning === 'max') return 'max'
  if (reasoning === 'high') return 'high'
  return 'low'
}

export function miniMaxRequestBody(
  options: StreamOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: messagesForModel(options.messages, options.model),
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: options.maxTokens ?? 32_768,
  }
  if (options.model === 'MiniMax-M3.1-Flash') {
    // Flash cannot disable thinking; the effort level controls its depth.
    body.reasoning_effort = reasoningEffort(options.reasoning ?? 'high')
    body.reasoning_split = true
  } else {
    // M3 can skip thinking when the user turns reasoning off.
    if (options.reasoning === 'off') body.thinking = { type: 'disabled' }
    else body.reasoning_split = true
  }
  if (options.tools?.length) {
    body.tools = options.tools
    body.tool_choice = 'auto'
  }
  return body
}

export async function streamMiniMaxChat(
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
      body: JSON.stringify(miniMaxRequestBody(options)),
      signal,
    })
  } catch (error) {
    if (options.signal.aborted) throw error
    if (timeout.aborted) throw new Error('MiniMax 响应超时，请稍后重试。')
    throw new Error('连接 MiniMax 失败，请检查网络后重试。')
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: { message?: string }; message?: string; base_resp?: { status_msg?: string } }
      | null
    throw friendlyError(
      response.status,
      data?.error?.message || data?.message || data?.base_resp?.status_msg,
    )
  }
  if (!response.body) throw new Error('MiniMax 没有返回内容流。')

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
