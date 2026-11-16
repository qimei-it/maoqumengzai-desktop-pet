/** MiniMax OpenAI-compatible connection test. */

export const minimaxBaseUrl = 'https://api.minimax.cn/v1'
export const minimaxModelsEndpoint = `${minimaxBaseUrl}/models`
export const minimaxModelIds = [
  'MiniMax-M3.1-Flash',
  'MiniMax-M3',
] as const
export type MiniMaxModel = (typeof minimaxModelIds)[number]
/** Models to show in settings; video/image/speech use separate APIs. */
export const minimaxModelCatalog = [
  'MiniMax-M3.1-Flash',
  'MiniMax-M3',
  'MiniMax-H3',
  'MiniMax-H3-Image',
  'speech-2.8-hd',
  'speech-2.8-turbo',
] as const

type Options = { endpoint?: string; timeoutMs?: number }

async function requestModels(
  apiKey: string,
  options: Options = {},
): Promise<string[]> {
  const endpoint =
    options.endpoint ??
    process.env.MQMZ_MINIMAX_MODELS_URL ??
    minimaxModelsEndpoint
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
  }).catch(() => null)
  if (!response) throw new Error('连接 MiniMax 失败，请检查网络后重试。')
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error('MiniMax API Key 无效，请重新添加。')
    if (response.status === 429)
      throw new Error('MiniMax 请求过于频繁，请稍后再试。')
    if (response.status >= 500)
      throw new Error('MiniMax 服务暂时不可用，请稍后重试。')
    throw new Error(`MiniMax 连接测试请求失败（${response.status}）。`)
  }
  const data = (await response.json().catch(() => null)) as {
    data?: unknown
  } | null
  if (!data || !Array.isArray(data.data))
    throw new Error('MiniMax 连接测试返回了无效数据。')
  return data.data
    .map((item) =>
      item && typeof item === 'object' && 'id' in item
        ? String((item as { id?: unknown }).id ?? '')
        : '',
    )
    .filter(Boolean)
}

export async function testMiniMaxConnection(
  apiKey: string,
  options: Options = {},
): Promise<number> {
  const started = performance.now()
  await requestModels(apiKey, options)
  return Math.max(0, Math.round(performance.now() - started))
}
