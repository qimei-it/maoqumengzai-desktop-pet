/**
 * Minimal DeepSeek Chat Completions client. Runs in the main process so the
 * user's API key never reaches a renderer. No SDK, no streaming for now.
 */
export type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const deepseekEndpoint = 'https://api.deepseek.com/chat/completions'

type RequestOptions = {
  endpoint?: string
  timeoutMs?: number
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
        model: 'deepseek-flash',
        messages,
        thinking: { type: 'disabled' },
        stream: false,
        max_tokens: 1600,
        temperature: 0.7,
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
