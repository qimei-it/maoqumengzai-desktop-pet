/**
 * MiniMax API client for text, image, video, speech and file upload.
 * Runs in the main process so the API key never reaches a renderer.
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const apiBase = 'https://api.minimax.cn'
const imageEndpoint = `${apiBase}/v1/images/generations`
const videoCreateEndpoint = `${apiBase}/v2/video_generation`
const videoQueryEndpoint = `${apiBase}/v2/query/video_generation`
const speechEndpoint = `${apiBase}/v1/t2a_v2`
const fileUploadEndpoint = `${apiBase}/v1/files/upload`
const chatEndpoint = `${apiBase}/v1/chat/completions`

type RequestOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

async function apiRequest(
  endpoint: string,
  apiKey: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<Response> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 60_000)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout
  let response: Response
  try {
    response = await fetch(endpoint, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(init.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(init.headers ?? {}),
      },
      signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (timeout.aborted) throw new Error('MiniMax 请求超时，请稍后重试。')
    throw new Error('连接 MiniMax 失败，请检查网络后重试。')
  }
  if (response.ok) return response
  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string }; message?: string; base_resp?: { status_msg?: string } }
    | null
  const detail =
    data?.error?.message || data?.message || data?.base_resp?.status_msg || ''
  if (response.status === 401 || response.status === 403)
    throw new Error('MiniMax API Key 无效，请重新添加。')
  if (response.status === 402)
    throw new Error('MiniMax 账户余额或套餐额度不足。')
  if (response.status === 422)
    throw new Error(detail || 'MiniMax 拒绝了这次生成内容。')
  if (response.status === 429)
    throw new Error('MiniMax 请求过于频繁，请稍后再试。')
  if (response.status >= 500)
    throw new Error('MiniMax 服务暂时不可用，请稍后重试。')
  throw new Error(
    detail
      ? `MiniMax 请求失败：${detail}`
      : `MiniMax 请求失败（${response.status}）。`,
  )
}

async function json<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as T | null
  if (!data) throw new Error('MiniMax 返回了无效数据。')
  return data
}

export type MiniMaxChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type MiniMaxChatResult = {
  text: string
  reasoning?: string
  usage?: { input: number; output: number }
}

export async function minimaxChat(
  apiKey: string,
  request: {
    model: 'MiniMax-M3.1-Flash' | 'MiniMax-M3'
    messages: MiniMaxChatMessage[]
    reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    maxTokens?: number
  },
  options: RequestOptions = {},
): Promise<MiniMaxChatResult> {
  const response = await apiRequest(
    chatEndpoint,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        ...(request.model === 'MiniMax-M3.1-Flash' &&
        request.reasoning_effort
          ? { reasoning_effort: request.reasoning_effort }
          : {}),
        ...(request.maxTokens
          ? { max_completion_tokens: request.maxTokens }
          : {}),
      }),
    },
    { ...options, timeoutMs: options.timeoutMs ?? 120_000 },
  )
  const data = await json<{
    choices?: Array<{
      message?: { content?: string; reasoning_content?: string }
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }>(response)
  return {
    text: data.choices?.[0]?.message?.content?.trim() ?? '',
    ...(data.choices?.[0]?.message?.reasoning_content
      ? { reasoning: data.choices[0].message.reasoning_content }
      : {}),
    ...(data.usage
      ? {
          usage: {
            input: data.usage.prompt_tokens ?? 0,
            output: data.usage.completion_tokens ?? 0,
          },
        }
      : {}),
  }
}

export type MiniMaxImageResult = {
  images: Array<{
    url?: string
    base64?: string
    size?: string
    revisedPrompt?: string
    error?: string
  }>
  requestId?: string
  usage?: Record<string, unknown>
}

export async function generateMiniMaxImage(
  apiKey: string,
  request: {
    prompt: string
    model?: 'MiniMax-H3-Image' | 'MiniMax-H3-Image-Highspeed'
    count?: number
    size?: string
    aspectRatio?: string
    area?: '1K' | '2K' | '4K'
    outputFormat?: 'png' | 'jpeg' | 'webp'
    responseFormat?: 'url' | 'b64_json'
  },
  options: RequestOptions = {},
): Promise<MiniMaxImageResult> {
  const body: Record<string, unknown> = {
    model: request.model ?? 'MiniMax-H3-Image',
    prompt: request.prompt,
    n: Math.min(Math.max(request.count ?? 1, 1), 10),
    response_format: request.responseFormat ?? 'url',
    output_format: request.outputFormat ?? 'jpeg',
  }
  if (request.size) body.size = request.size
  else {
    if (request.aspectRatio) body.aspect_ratio = request.aspectRatio
    if (request.area) body.area = request.area
  }
  const response = await apiRequest(
    imageEndpoint,
    apiKey,
    { method: 'POST', body: JSON.stringify(body) },
    { ...options, timeoutMs: options.timeoutMs ?? 600_000 },
  )
  const data = await json<{
    data?: Array<{
      url?: string
      b64_json?: string
      size?: string
      revised_prompt?: string
      error?: { message?: string }
    }>
    usage?: Record<string, unknown>
    request_id?: string
  }>(response)
  return {
    images: (data.data ?? []).map((item) => ({
      ...(item.url ? { url: item.url } : {}),
      ...(item.b64_json ? { base64: item.b64_json } : {}),
      ...(item.size ? { size: item.size } : {}),
      ...(item.revised_prompt ? { revisedPrompt: item.revised_prompt } : {}),
      ...(item.error?.message ? { error: item.error.message } : {}),
    })),
    ...(data.usage ? { usage: data.usage } : {}),
    ...(data.request_id ? { requestId: data.request_id } : {}),
  }
}

export type MiniMaxVideoContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role?: string }
  | { type: 'video_url'; video_url: { url: string }; role?: string }
  | { type: 'audio_url'; audio_url: { url: string }; role?: string }

export type MiniMaxVideoTask = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  model?: string
  url?: string
  prompt?: string
  error?: string
  duration?: number
  resolution?: string
  ratio?: string
  usage?: Record<string, unknown>
}

export async function createMiniMaxVideo(
  apiKey: string,
  request: {
    model?: 'MiniMax-H3' | 'MiniMax-H3-Highspeed' | 'MiniMax-H3-Lite' | 'MiniMax-H3-Max'
    prompt: string
    resolution?: '480P' | '768P' | '2K'
    duration?: number
    ratio?: 'adaptive' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
    firstFrameUrl?: string
    lastFrameUrl?: string
    referenceImageUrls?: string[]
    referenceVideoUrl?: string
    referenceAudioUrl?: string
  },
  options: RequestOptions = {},
): Promise<{ taskId: string }> {
  const content: MiniMaxVideoContent[] = [
    { type: 'text', text: request.prompt },
  ]
  if (request.firstFrameUrl)
    content.push({
      type: 'image_url',
      image_url: { url: request.firstFrameUrl },
      role: 'first_frame',
    })
  if (request.lastFrameUrl)
    content.push({
      type: 'image_url',
      image_url: { url: request.lastFrameUrl },
      role: 'last_frame',
    })
  for (const url of request.referenceImageUrls ?? [])
    content.push({
      type: 'image_url',
      image_url: { url },
      role: 'reference_image',
    })
  if (request.referenceVideoUrl)
    content.push({
      type: 'video_url',
      video_url: { url: request.referenceVideoUrl },
      role: 'reference_video',
    })
  if (request.referenceAudioUrl)
    content.push({
      type: 'audio_url',
      audio_url: { url: request.referenceAudioUrl },
      role: 'reference_audio',
    })
  const response = await apiRequest(
    videoCreateEndpoint,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        model: request.model ?? 'MiniMax-H3',
        content,
        resolution: request.resolution ?? '768P',
        duration: Math.min(Math.max(request.duration ?? 5, 4), 15),
        ratio: request.ratio ?? '16:9',
      }),
    },
    options,
  )
  const data = await json<{ task_id?: string; task?: { id?: string } }>(
    response,
  )
  const taskId = data.task_id ?? data.task?.id
  if (!taskId) throw new Error('MiniMax 没有返回视频任务 ID。')
  return { taskId }
}

export async function queryMiniMaxVideo(
  apiKey: string,
  taskId: string,
  options: RequestOptions = {},
): Promise<MiniMaxVideoTask> {
  const response = await apiRequest(
    `${videoQueryEndpoint}/${encodeURIComponent(taskId)}`,
    apiKey,
    { method: 'GET' },
    options,
  )
  const data = await json<{
    task?: {
      id?: string
      status?: MiniMaxVideoTask['status']
      model?: string
      content?: { url?: string; prompt?: string }
      error?: { message?: string }
      duration?: number
      resolution?: string
      ratio?: string
      usage?: Record<string, unknown>
    }
    id?: string
    status?: MiniMaxVideoTask['status']
    model?: string
    content?: { url?: string; prompt?: string }
    error?: { message?: string }
    duration?: number
    resolution?: string
    ratio?: string
    usage?: Record<string, unknown>
  }>(response)
  const task = data.task ?? data
  if (!task.id || !task.status)
    throw new Error('MiniMax 返回了无效的视频任务。')
  return {
    id: task.id,
    status: task.status,
    ...(task.model ? { model: task.model } : {}),
    ...(task.content?.url ? { url: task.content.url } : {}),
    ...(task.content?.prompt ? { prompt: task.content.prompt } : {}),
    ...(task.error?.message ? { error: task.error.message } : {}),
    ...(task.duration ? { duration: task.duration } : {}),
    ...(task.resolution ? { resolution: task.resolution } : {}),
    ...(task.ratio ? { ratio: task.ratio } : {}),
    ...(task.usage ? { usage: task.usage } : {}),
  }
}

export async function waitForMiniMaxVideo(
  apiKey: string,
  taskId: string,
  options: RequestOptions & {
    intervalMs?: number
    maxWaitMs?: number
    onProgress?: (task: MiniMaxVideoTask) => void
  } = {},
): Promise<MiniMaxVideoTask> {
  const interval = options.intervalMs ?? 5_000
  const deadline = Date.now() + (options.maxWaitMs ?? 15 * 60_000)
  let last: MiniMaxVideoTask | undefined
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new Error('已取消。')
    const task = await queryMiniMaxVideo(apiKey, taskId, options)
    last = task
    options.onProgress?.(task)
    if (task.status === 'succeeded') return task
    if (task.status === 'failed' || task.status === 'cancelled')
      throw new Error(task.error || 'MiniMax 视频生成失败。')
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  throw new Error(
    last?.status === 'running' || last?.status === 'queued'
      ? 'MiniMax 视频生成仍在进行，请稍后用任务 ID 查询。'
      : 'MiniMax 视频生成超时。',
  )
}

export type MiniMaxSpeechResult = {
  audio?: Buffer
  audioUrl?: string
  format: string
  durationMs?: number
  traceId?: string
}

export async function generateMiniMaxSpeech(
  apiKey: string,
  request: {
    text: string
    model?: 'speech-2.8-hd' | 'speech-2.8-turbo'
    voiceId?: string
    speed?: number
    volume?: number
    pitch?: number
    emotion?: string
    format?: 'mp3' | 'wav' | 'flac' | 'pcm'
    sampleRate?: number
    bitrate?: number
    outputFormat?: 'hex' | 'url'
  },
  options: RequestOptions = {},
): Promise<MiniMaxSpeechResult> {
  const format = request.format ?? 'mp3'
  const response = await apiRequest(
    speechEndpoint,
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        model: request.model ?? 'speech-2.8-hd',
        text: request.text,
        stream: false,
        voice_setting: {
          voice_id: request.voiceId ?? 'male-qn-qingse',
          speed: request.speed ?? 1,
          vol: request.volume ?? 1,
          pitch: request.pitch ?? 0,
          ...(request.emotion ? { emotion: request.emotion } : {}),
        },
        audio_setting: {
          sample_rate: request.sampleRate ?? 32000,
          bitrate: request.bitrate ?? 128000,
          format,
          channel: 1,
        },
        output_format: request.outputFormat ?? 'hex',
        subtitle_enable: false,
      }),
    },
    { ...options, timeoutMs: options.timeoutMs ?? 180_000 },
  )
  const data = await json<{
    data?: { audio?: string; status?: number }
    extra_info?: { audio_length?: number; audio_format?: string }
    trace_id?: string
    base_resp?: { status_code?: number; status_msg?: string }
  }>(response)
  if (data.base_resp?.status_code && data.base_resp.status_code !== 0)
    throw new Error(data.base_resp.status_msg || 'MiniMax 语音合成失败。')
  const audioHex = data.data?.audio
  if (!audioHex) throw new Error('MiniMax 没有返回音频数据。')
  return {
    ...(request.outputFormat === 'url'
      ? { audioUrl: audioHex }
      : { audio: Buffer.from(audioHex, 'hex') }),
    format: data.extra_info?.audio_format ?? format,
    ...(data.extra_info?.audio_length
      ? { durationMs: data.extra_info.audio_length }
      : {}),
    ...(data.trace_id ? { traceId: data.trace_id } : {}),
  }
}

export async function uploadMiniMaxFile(
  apiKey: string,
  request: {
    path: string
    purpose:
      | 'voice_clone'
      | 'prompt_audio'
      | 't2a_async_input'
      | 'video_understanding'
      | 'video_generation_input'
      | 'image_generation_input'
  },
  options: RequestOptions = {},
): Promise<{ fileId: string }> {
  const bytes = await readFile(request.path)
  const form = new FormData()
  form.append('purpose', request.purpose)
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)]),
    basename(request.path),
  )
  const response = await apiRequest(
    fileUploadEndpoint,
    apiKey,
    { method: 'POST', body: form },
    { ...options, timeoutMs: options.timeoutMs ?? 180_000 },
  )
  const data = await json<{
    file?: { file_id?: number | string }
    base_resp?: { status_code?: number; status_msg?: string }
  }>(response)
  if (data.base_resp?.status_code && data.base_resp.status_code !== 0)
    throw new Error(data.base_resp.status_msg || 'MiniMax 文件上传失败。')
  if (data.file?.file_id === undefined)
    throw new Error('MiniMax 没有返回文件 ID。')
  return { fileId: String(data.file.file_id) }
}
