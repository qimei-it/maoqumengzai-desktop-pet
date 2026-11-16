/** Volcengine Ark model discovery and Seedream image generation. */

export const volcanoBaseUrl = 'https://ark.cn-beijing.volces.com/api/v3'
export const volcanoModelsEndpoint = `${volcanoBaseUrl}/models`
export const volcanoImagesEndpoint = `${volcanoBaseUrl}/images/generations`

/** Public model IDs used when the model list cannot be reached. */
export const volcanoSeedreamFlashModel = 'doubao-seedream-5-0-flash-260915'
export const volcanoSeedreamModel = 'doubao-seedream-5-5-261028'

type Options = { endpoint?: string; timeoutMs?: number }

function modelIds(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const data = (value as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  return data
    .map((item) =>
      item && typeof item === 'object' && 'id' in item
        ? String((item as { id?: unknown }).id ?? '')
        : '',
    )
    .filter(Boolean)
}

async function requestModels(
  apiKey: string,
  options: Options = {},
): Promise<string[]> {
  const endpoint =
    options.endpoint ??
    process.env.MQMZ_VOLCANO_MODELS_URL ??
    volcanoModelsEndpoint
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  }).catch(() => null)
  if (!response) throw new Error('连接火山方舟失败，请检查网络后重试。')
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error('火山方舟 API Key 无效，请重新添加。')
    if (response.status === 429)
      throw new Error('火山方舟请求过于频繁，请稍后再试。')
    if (response.status >= 500)
      throw new Error('火山方舟服务暂时不可用，请稍后重试。')
    throw new Error(`火山方舟模型请求失败（${response.status}）。`)
  }
  const ids = modelIds(await response.json().catch(() => null))
  if (!ids.length) throw new Error('火山方舟模型列表返回了无效数据。')
  return ids
}

export async function listVolcanoModels(
  apiKey: string,
  options: Options = {},
): Promise<string[]> {
  return requestModels(apiKey, options)
}

export async function testVolcanoConnection(
  apiKey: string,
  options: Options = {},
): Promise<number> {
  const started = performance.now()
  await requestModels(apiKey, options)
  return Math.max(0, Math.round(performance.now() - started))
}

export function isVolcanoImageModel(id: string): boolean {
  return /seedream/i.test(id)
}

/** Prefer Seedream 5.5 for native text/image RGBA, then 5.0 flash. */
export function resolveVolcanoImageModel(ids: string[]): string | undefined {
  const imageModels = ids.filter(isVolcanoImageModel)
  return (
    imageModels.find((id) => /seedream[-_ ]?5[-_.]?5/i.test(id)) ??
    imageModels.find((id) => /seedream[-_ ]?5[-_.]?0[-_.]?flash/i.test(id)) ??
    imageModels.find((id) => /seedream[-_ ]?5/i.test(id)) ??
    imageModels[0]
  )
}

export type VolcanoImageResult = {
  images: Array<{
    url?: string
    base64?: string
    size?: string
    format?: string
    background?: string
    error?: string
  }>
  model?: string
  background?: string
  usage?: Record<string, unknown>
}

export async function generateVolcanoImage(
  apiKey: string,
  request: {
    model: string
    prompt: string
    images?: string[]
    size?: '1K' | '1.5K' | '2K'
    background?: 'transparent' | 'opaque' | 'auto'
    outputFormat?: 'png' | 'jpeg'
    responseFormat?: 'url' | 'b64_json'
  },
  options: Options = {},
): Promise<VolcanoImageResult> {
  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    size: request.size ?? '1K',
    output_format: request.outputFormat ?? 'png',
    background: request.background ?? 'transparent',
    response_format: request.responseFormat ?? 'url',
    watermark: false,
  }
  if (request.images?.length)
    body.image = request.images.length === 1 ? request.images[0] : request.images
  const endpoint =
    options.endpoint ??
    process.env.MQMZ_VOLCANO_IMAGES_URL ??
    volcanoImagesEndpoint
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 600_000),
  }).catch(() => null)
  if (!response) throw new Error('连接火山方舟失败，请检查网络后重试。')
  const data = (await response.json().catch(() => null)) as {
    model?: string
    data?: Array<{
      url?: string
      b64_json?: string
      size?: string
      output_format?: string
      background?: string
      error?: { code?: string; message?: string }
    }>
    error?: { code?: string; message?: string }
    usage?: Record<string, unknown>
  } | null
  if (!response.ok) {
    const detail = data?.error?.message ?? ''
    if (response.status === 401 || response.status === 403)
      throw new Error('火山方舟 API Key 无效，请重新添加。')
    if (response.status === 402)
      throw new Error('火山方舟账户余额或套餐额度不足。')
    if (response.status === 429)
      throw new Error('火山方舟请求过于频繁，请稍后再试。')
    if (response.status === 422)
      throw new Error(detail || '火山方舟拒绝了这次生成内容。')
    if (response.status >= 500)
      throw new Error('火山方舟服务暂时不可用，请稍后重试。')
    throw new Error(
      detail
        ? `火山方舟请求失败：${detail}`
        : `火山方舟请求失败（${response.status}）。`,
    )
  }
  if (!data?.data?.length) throw new Error('火山方舟没有返回图片。')
  return {
    images: data.data.map((item) => ({
      ...(item.url ? { url: item.url } : {}),
      ...(item.b64_json ? { base64: item.b64_json } : {}),
      ...(item.size ? { size: item.size } : {}),
      ...(item.output_format ? { format: item.output_format } : {}),
      ...(item.background ? { background: item.background } : {}),
      ...(item.error?.message ? { error: item.error.message } : {}),
    })),
    ...(data.model ? { model: data.model } : {}),
    ...(data.usage ? { usage: data.usage } : {}),
  }
}
