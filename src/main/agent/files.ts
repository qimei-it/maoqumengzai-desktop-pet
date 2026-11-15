/** DeepSeek Files API uploads and speech recognition for agent attachments. */

import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

export const deepseekFilesEndpoint = 'https://api.deepseek.com/files'
export const deepseekAsrEndpoint = 'https://api.deepseek.com/v1/tools/asr'
export const agentFileLifetimeSeconds = 30 * 24 * 60 * 60
export const agentAsrFileBytes = 8 * 1024 * 1024

export type AgentFilePurpose =
  | 'user_data'
  | 'text_recognition'
  | 'rich_layout_recognition'

export type UploadedAgentFile = {
  id: string
  expiresAt: number | null
}

export type UploadOptions = {
  endpoint?: string
  signal?: AbortSignal
  /** Injectable for tests. */
  fetch?: typeof fetch
}

function friendlyFileError(status: number, detail?: string): Error {
  if (status === 401 || status === 403)
    return new Error('API Key 无效，请在设置中更换。')
  if (status === 402) return new Error('DeepSeek 账户余额不足。')
  if (status === 408) return new Error('附件上传超时，请换更小的文件。')
  if (status === 413) return new Error('附件超过 DeepSeek 的大小限制。')
  if (status === 429) return new Error('附件处理任务过多，请稍后再试。')
  if (status === 503) return new Error('DeepSeek 服务繁忙，请稍后重试。')
  if (status === 504) return new Error('附件解析超时，请换更小的文件。')
  if (status === 400 && detail) return new Error(`附件无法解析：${detail}`)
  if (status >= 500) return new Error('DeepSeek 服务暂时不可用，请稍后重试。')
  return new Error(
    detail ? `附件请求失败：${detail}` : `附件请求失败（${status}）。`,
  )
}

async function responseDetail(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string }; message?: string }
    | null
  return data?.error?.message || data?.message
}

/**
 * Uploads one file for either vision, text parsing or rich-layout parsing.
 * Files expire after 30 days so they do not accumulate in the account.
 */
export async function uploadAgentFile(
  apiKey: string,
  path: string,
  purpose: AgentFilePurpose,
  options: UploadOptions = {},
): Promise<UploadedAgentFile> {
  const info = await stat(path)
  if (!info.isFile() || info.size === 0)
    throw new Error('附件已经不可用。')
  const bytes = await readFile(path)
  const form = new FormData()
  // DeepSeek requires purpose before the file field for documents.
  form.append('purpose', purpose)
  form.append('expires_after[anchor]', 'created_at')
  form.append('expires_after[seconds]', String(agentFileLifetimeSeconds))
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)]),
    basename(path) || 'attachment',
  )

  const timeout = AbortSignal.timeout(180_000)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout
  const request = options.fetch ?? fetch
  let response: Response
  try {
    response = await request(options.endpoint ?? deepseekFilesEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (timeout.aborted) throw new Error('附件上传超时，请稍后重试。')
    throw new Error('连接 DeepSeek 失败，请检查网络后重试。')
  }
  if (!response.ok)
    throw friendlyFileError(response.status, await responseDetail(response))

  const data = (await response.json().catch(() => null)) as
    | { id?: string; expires_at?: number }
    | null
  if (!data?.id || typeof data.id !== 'string')
    throw new Error('DeepSeek 没有返回有效的文件标识。')
  return {
    id: data.id,
    expiresAt:
      typeof data.expires_at === 'number'
        ? data.expires_at * 1000
        : Date.now() + agentFileLifetimeSeconds * 1000,
  }
}

/** Transcribes one 16-bit PCM WAV or Ogg Opus file. */
export async function transcribeAgentAudio(
  apiKey: string,
  path: string,
  options: UploadOptions = {},
): Promise<string> {
  const info = await stat(path)
  if (!info.isFile() || info.size === 0)
    throw new Error('音频已经不可用。')
  if (info.size > agentAsrFileBytes)
    throw new Error('单段音频超过 8 MB，无法转写。')
  const bytes = await readFile(path)
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }),
    basename(path) || 'audio.wav',
  )

  const timeout = AbortSignal.timeout(300_000)
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout
  const request = options.fetch ?? fetch
  let response: Response
  try {
    response = await request(options.endpoint ?? deepseekAsrEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (timeout.aborted) throw new Error('语音转写超时，请稍后重试。')
    throw new Error('连接 DeepSeek 失败，请检查网络后重试。')
  }
  if (!response.ok)
    throw friendlyFileError(response.status, await responseDetail(response))
  const data = (await response.json().catch(() => null)) as
    | { text?: string }
    | null
  const text = data?.text?.trim()
  if (!text) throw new Error('没有识别到语音内容。')
  return text
}

/** Deletes one uploaded file; used when a session is removed. */
export async function deleteAgentFile(
  apiKey: string,
  id: string,
  options: UploadOptions = {},
): Promise<void> {
  const request = options.fetch ?? fetch
  const response = await request(
    `${options.endpoint ?? deepseekFilesEndpoint}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: options.signal ?? AbortSignal.timeout(30_000),
    },
  ).catch(() => null)
  if (!response?.ok && response?.status !== 404)
    throw new Error('删除云端附件失败。')
}
