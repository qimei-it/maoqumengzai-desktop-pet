/**
 * Minimal DeepSeek Chat Completions client. Runs in the main process so the
 * user's API key never reaches a renderer. No SDK, no streaming for now.
 */
export type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const deepseekEndpoint = 'https://api.deepseek.com/chat/completions'
export const deepseekModelsEndpoint = 'https://api.deepseek.com/models'
export const deepseekSearchEndpoint = 'https://api.deepseek.com/v1/tools/search'
export const deepseekModelIds = ['deepseek-flash', 'deepseek-v4-pro'] as const
export type DeepSeekModel = (typeof deepseekModelIds)[number]
export const deepseekModelLabels: Record<DeepSeekModel, string> = {
  'deepseek-flash': 'DeepSeek-V4.1-Flash',
  'deepseek-v4-pro': 'DeepSeek-V4-Pro',
}

type RequestOptions = {
  endpoint?: string
  timeoutMs?: number
  model?: DeepSeekModel
  temperature?: number
  maxTokens?: number
  json?: boolean
}

export type DeepSeekSearchResult = {
  title: string
  url: string
  snippet: string
  summary: string
  content?: string
  site_name?: string | null
  date?: string | null
  authority?: number
  rerank_score?: number
}

function friendlySearchError(status: number, detail?: string): Error {
  if (status === 401 || status === 403)
    return new Error('API Key 无效，请在设置中更换。')
  if (status === 402) return new Error('DeepSeek 账户余额不足。')
  if (status === 429) return new Error('搜索请求太频繁，请稍后再试。')
  if (status >= 500) return new Error('DeepSeek 服务暂时不可用，请稍后重试。')
  return new Error(
    detail ? `DeepSeek 搜索失败：${detail}` : `DeepSeek 搜索失败（${status}）。`,
  )
}

/** Web search through DeepSeek's read-only Search tool. */
export async function searchWeb(
  apiKey: string,
  query: string,
  options: { count?: number; timeoutMs?: number; oriQuestion?: string } = {},
): Promise<DeepSeekSearchResult[]> {
  const trimmed = query.trim().slice(0, 128)
  if (!trimmed) return []
  let response: Response
  try {
    response = await fetch(deepseekSearchEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: trimmed,
        count: Math.min(Math.max(options.count ?? 5, 1), 50),
        ori_question: options.oriQuestion?.trim().slice(0, 128),
        need_content: false,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    })
  } catch {
    throw new Error('连接 DeepSeek 搜索失败，请检查网络后重试。')
  }

  const data = (await response.json().catch(() => null)) as
    | {
        results?: DeepSeekSearchResult[]
        error?: { message?: string }
        message?: string
      }
    | null

  if (!response.ok) {
    throw friendlySearchError(
      response.status,
      data?.error?.message || data?.message,
    )
  }
  if (!Array.isArray(data?.results)) return []
  return data.results.filter(
    (result) =>
      typeof result?.title === 'string' &&
      typeof result?.url === 'string' &&
      typeof result?.summary === 'string',
  )
}

export async function requestCompletion(
  apiKey: string,
  messages: DeepSeekMessage[],
  options: RequestOptions = {},
): Promise<string> {
  const endpoint = options.endpoint ?? deepseekEndpoint
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? 'deepseek-flash',
        messages,
        thinking: { type: 'disabled' },
        stream: false,
        max_tokens: options.maxTokens ?? 1600,
        temperature: options.temperature ?? 0.7,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    })
  } catch {
    throw new Error('连接 DeepSeek 失败，请检查网络后重试。')
  }

  const data = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{ message?: { content?: string | null } }>
        error?: { message?: string }
        message?: string
      }
    | null

  if (!response.ok) {
    const detail = data?.error?.message || data?.message
    if (response.status === 401)
      throw new Error('API Key 无效，请在设置中更换。')
    if (response.status === 402) throw new Error('DeepSeek 账户余额不足。')
    if (response.status === 429)
      throw new Error('请求太频繁，请稍后再试。')
    if (response.status === 400 && detail)
      throw new Error(`请求被拒绝：${detail}`)
    if (response.status >= 500)
      throw new Error('DeepSeek 服务暂时不可用，请稍后重试。')
    throw new Error(
      detail
        ? `DeepSeek 请求失败：${detail}`
        : `DeepSeek 请求失败（${response.status}）。`,
    )
  }

  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('模型没有返回内容，请换个问法。')
  return content
}

/** Reads the model IDs available to this API key. */
export async function listDeepSeekModels(
  apiKey: string,
  options: Pick<RequestOptions, 'endpoint' | 'timeoutMs'> = {},
): Promise<string[]> {
  const endpoint =
    options.endpoint ??
    process.env.MQMZ_DEEPSEEK_MODELS_URL ??
    deepseekModelsEndpoint
  let response: Response
  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    })
  } catch {
    throw new Error('连接 DeepSeek 失败，请检查网络后重试。')
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error('API Key 无效，请重新添加。')
    if (response.status === 429)
      throw new Error('拉取模型过于频繁，请稍后再试。')
    if (response.status >= 500)
      throw new Error('DeepSeek 服务暂时不可用，请稍后重试。')
    throw new Error(`拉取模型失败（${response.status}）。`)
  }
  const data = (await response.json().catch(() => null)) as
    | { data?: unknown }
    | null
  if (!data || !Array.isArray(data.data))
    throw new Error('DeepSeek 模型列表返回了无效数据。')
  return data.data
    .map((item) =>
      item && typeof item === 'object' && 'id' in item
        ? String((item as { id?: unknown }).id ?? '')
        : '',
    )
    .filter(Boolean)
}

/** Measures a real round-trip to the DeepSeek models endpoint. */
export async function testDeepSeekConnection(
  apiKey: string,
  options: Pick<RequestOptions, 'endpoint' | 'timeoutMs'> = {},
): Promise<number> {
  const endpoint =
    options.endpoint ??
    process.env.MQMZ_DEEPSEEK_MODELS_URL ??
    deepseekModelsEndpoint
  const started = performance.now()
  let response: Response
  try {
    response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    })
  } catch {
    throw new Error('连接 DeepSeek 失败，请检查网络后重试。')
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error('API Key 无效，请重新添加。')
    if (response.status === 429)
      throw new Error('测试请求过于频繁，请稍后再试。')
    if (response.status >= 500)
      throw new Error('DeepSeek 服务暂时不可用，请稍后重试。')
    throw new Error(`DeepSeek 连接测试失败（${response.status}）。`)
  }
  const data = (await response.json().catch(() => null)) as
    | { data?: unknown }
    | null
  if (!data || !Array.isArray(data.data))
    throw new Error('DeepSeek 模型列表返回了无效数据。')
  return Math.max(0, Math.round(performance.now() - started))
}
