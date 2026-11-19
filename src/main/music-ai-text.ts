/**
 * 音乐互动专用的一次性文本补全：非流式、可选供应商内置联网。
 *
 * 三家供应商的差异：
 * - DeepSeek：联网是独立接口，调用方先用 searchWeb 取资料，这里只做补全。
 * - 火山方舟：Chat API 顶层传 `web_search_options: {}`，模型自己决定是否搜索。
 * - MiniMax：`web_search` 只在 Responses API（/v1/responses）提供，
 *   普通补全仍走 OpenAI 兼容的 chat/completions。
 */

import type { AgentModelId, AgentProvider } from '../shared/agent-models'
import { requestCompletion } from '../shared/deepseek'
import { volcanoBaseUrl } from '../shared/volcano'

const minimaxChatEndpoint = 'https://api.minimax.cn/v1/chat/completions'
const minimaxResponsesEndpoint = 'https://api.minimax.cn/v1/responses'
const defaultTimeoutMs = 60_000

export type MusicAiSource = { title: string; url: string; site?: string }

export type MusicAiReply = {
  text: string
  sources: MusicAiSource[]
  /** 本次请求是否按供应商能力启用了联网。 */
  searched: boolean
}

export type MusicAiTextRequest = {
  provider: AgentProvider
  model: AgentModelId
  apiKey: string
  system: string
  user: string
  json: boolean
  search: boolean
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

function providerName(provider: AgentProvider): string {
  if (provider === 'minimax') return 'MiniMax'
  if (provider === 'volcano') return '火山方舟'
  return 'DeepSeek'
}

function friendlyError(
  provider: AgentProvider,
  status: number,
  detail?: string,
): Error {
  const name = providerName(provider)
  if (status === 401 || status === 403) return new Error('API Key 无效')
  if (status === 402) return new Error(`${name}账户余额或套餐额度不足。`)
  if (status === 429) return new Error(`${name}请求过于频繁，请稍后再试。`)
  if (status >= 500) return new Error(`${name}服务暂时不可用，请稍后重试。`)
  return new Error(
    detail ? `${name}请求失败：${detail}` : `${name}请求失败（${status}）。`,
  )
}

function responseText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part)
          return String((part as { text?: unknown }).text ?? '')
        return ''
      })
      .join('')
  }
  return ''
}

function chatReplyText(data: unknown): string {
  const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices
  if (!Array.isArray(choices) || !choices.length) return ''
  return responseText(choices[0]?.message?.content)
}

function errorDetail(data: unknown): string | undefined {
  const record = data as {
    error?: { message?: string }
    message?: string
    base_resp?: { status_msg?: string }
    detail?: string
  }
  return (
    record?.error?.message ||
    record?.message ||
    record?.base_resp?.status_msg ||
    record?.detail
  )
}

async function postJson(
  provider: AgentProvider,
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new Error(`连接${providerName(provider)}失败，请检查网络后重试。`)
  }
  const data = (await response.json().catch(() => null)) as unknown
  if (!response.ok)
    throw friendlyError(provider, response.status, errorDetail(data))
  if (!data) throw new Error(`${providerName(provider)}没有返回内容。`)
  return data
}

function collectAnnotations(output: unknown): MusicAiSource[] {
  const sources: MusicAiSource[] = []
  const seen = new Set<string>()
  const items = Array.isArray(output) ? output : []
  for (const item of items) {
    const content = (item as { content?: unknown })?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      const annotations = (block as { annotations?: unknown })?.annotations
      if (!Array.isArray(annotations)) continue
      for (const annotation of annotations) {
        const url = (annotation as { url?: unknown })?.url
        if (typeof url !== 'string' || !url || seen.has(url)) continue
        seen.add(url)
        const title = (annotation as { title?: unknown })?.title
        sources.push({
          title:
            typeof title === 'string' && title.trim() ? title.trim() : url,
          url,
        })
      }
    }
  }
  return sources.slice(0, 4)
}

async function minimaxReply(
  request: MusicAiTextRequest,
): Promise<MusicAiReply> {
  const timeoutMs = request.timeoutMs ?? defaultTimeoutMs
  if (request.search) {
    const data = await postJson(
      'minimax',
      minimaxResponsesEndpoint,
      request.apiKey,
      {
        model: request.model,
        input: `${request.system}\n\n${request.user}`,
        tools: [{ type: 'web_search' }],
        ...(request.maxTokens ? { max_output_tokens: request.maxTokens } : {}),
      },
      timeoutMs,
    )
    const record = data as { output_text?: unknown; output?: unknown }
    return {
      text: responseText(record.output_text),
      sources: collectAnnotations(record.output),
      searched: true,
    }
  }
  const data = await postJson(
    'minimax',
    minimaxChatEndpoint,
    request.apiKey,
    {
      model: request.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      stream: false,
      temperature: request.temperature ?? 0.9,
      max_completion_tokens: request.maxTokens ?? 2400,
    },
    timeoutMs,
  )
  return { text: chatReplyText(data), sources: [], searched: false }
}

async function volcanoReply(request: MusicAiTextRequest): Promise<MusicAiReply> {
  const data = await postJson(
    'volcano',
    `${volcanoBaseUrl}/chat/completions`,
    request.apiKey,
    {
      model: request.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      stream: false,
      temperature: request.temperature ?? 0.9,
      max_tokens: request.maxTokens ?? 2400,
      thinking: { type: 'disabled' },
      ...(request.json ? { response_format: { type: 'json_object' } } : {}),
      ...(request.search ? { web_search_options: {} } : {}),
    },
    request.timeoutMs ?? defaultTimeoutMs,
  )
  return { text: chatReplyText(data), sources: [], searched: request.search }
}

async function deepseekReply(
  request: MusicAiTextRequest,
): Promise<MusicAiReply> {
  const text = await requestCompletion(
    request.apiKey,
    [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    {
      model: request.model,
      temperature: request.temperature ?? 0.9,
      maxTokens: request.maxTokens ?? 2400,
      json: request.json,
      timeoutMs: request.timeoutMs ?? defaultTimeoutMs,
    },
  )
  return { text, sources: [], searched: false }
}

export async function requestMusicAiReply(
  request: MusicAiTextRequest,
): Promise<MusicAiReply> {
  if (request.provider === 'minimax') return minimaxReply(request)
  if (request.provider === 'volcano') return volcanoReply(request)
  return deepseekReply(request)
}
