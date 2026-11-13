/** Read-only OpenAI Codex quota and DeepSeek balance clients. */
import { session } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  parseDeepSeekBalance,
  parseOpenAiUsage,
  type AiQuotaBalance,
  type AiQuotaWindow,
} from '../shared/ai-quota'

const openAiUsageUrl = 'https://chatgpt.com/backend-api/wham/usage'
const deepSeekBalanceUrl = 'https://api.deepseek.com/user/balance'
const timeoutMs = 15_000
let quotaSession: Electron.Session | undefined

function fetchQuota(url: string, init: RequestInit): Promise<Response> {
  quotaSession ??= session.fromPartition('mqmz-quota', { cache: false })
  return quotaSession.fetch(url, init)
}

type OpenAiAuth = {
  accessToken: string
  accountId?: string
  mtimeMs: number
}

function usageEndpoint(): string {
  return process.env.MQMZ_QUOTA_OPENAI_URL || openAiUsageUrl
}

function balanceEndpoint(): string {
  return process.env.MQMZ_QUOTA_DEEPSEEK_URL || deepSeekBalanceUrl
}

function networkError(provider: 'OpenAI' | 'DeepSeek', error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (/abort|timeout|timed out/i.test(message))
    return new Error(`${provider} 额度请求超时，请稍后重试。`)
  return new Error(
    `无法连接 ${provider} 额度服务，请检查网络或代理。`,
  )
}

function httpError(provider: 'OpenAI' | 'DeepSeek', status: number): Error {
  if (status === 401 || status === 403) {
    return new Error(
      provider === 'OpenAI'
        ? 'Codex 登录已失效，请在 Codex 中重新登录。'
        : 'DeepSeek API Key 无效，请在设置中更换。',
    )
  }
  if (status === 429)
    return new Error(`${provider} 额度请求过于频繁，请稍后重试。`)
  return new Error(`${provider} 额度服务暂不可用（${status}）。`)
}

function decodeJwtClaim(token: string): Record<string, unknown> | undefined {
  const part = token.split('.')[1]
  if (!part) return undefined
  try {
    return JSON.parse(
      Buffer.from(part, 'base64url').toString('utf8'),
    ) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function accountIdFromToken(token: string): string | undefined {
  const claims = decodeJwtClaim(token)
  if (!claims) return undefined
  const auth = claims['https://api.openai.com/auth']
  if (typeof auth !== 'object' || auth === null) return undefined
  const id = (auth as Record<string, unknown>).chatgpt_account_id
  return typeof id === 'string' && id ? id : undefined
}

export async function resolveOpenAiAuthPath(
  override = '',
): Promise<string | undefined> {
  const explicit = override.trim()
  if (explicit) {
    try {
      return (await stat(explicit)).isFile() ? explicit : undefined
    } catch {
      return undefined
    }
  }
  const codexHome = process.env.CODEX_HOME?.trim()
  const path = codexHome
    ? join(codexHome, 'auth.json')
    : join(homedir(), '.codex', 'auth.json')
  try {
    return (await stat(path)).isFile() ? path : undefined
  } catch {
    return undefined
  }
}

async function readOpenAiAuth(path: string): Promise<OpenAiAuth> {
  let raw: unknown
  let mtimeMs = 0
  try {
    const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    mtimeMs = info.mtimeMs
    raw = JSON.parse(text) as unknown
  } catch {
    throw new Error('无法读取 Codex 登录文件。')
  }
  const root =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {}
  const tokens =
    typeof root.tokens === 'object' && root.tokens !== null
      ? (root.tokens as Record<string, unknown>)
      : {}
  const accessToken =
    typeof tokens.access_token === 'string'
      ? tokens.access_token
      : typeof root.access_token === 'string'
        ? root.access_token
        : ''
  if (!accessToken)
    throw new Error('Codex 登录文件里没有可用的访问令牌。')
  const accountId =
    typeof tokens.account_id === 'string' && tokens.account_id
      ? tokens.account_id
      : typeof root.account_id === 'string' && root.account_id
        ? root.account_id
        : accountIdFromToken(accessToken)
  return {
    accessToken,
    ...(accountId ? { accountId } : {}),
    mtimeMs,
  }
}

export async function fetchOpenAiQuota(path: string): Promise<{
  plan?: string
  windows: AiQuotaWindow[]
}> {
  const auth = await readOpenAiAuth(path)
  let response: Response
  try {
    response = await fetchQuota(usageEndpoint(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth.accessToken}`,
        'User-Agent': 'codex-cli/mqmz',
        ...(auth.accountId ? { 'ChatGPT-Account-Id': auth.accountId } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw networkError('OpenAI', error)
  }
  if (!response.ok) throw httpError('OpenAI', response.status)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('OpenAI 额度服务返回了无效数据。')
  }
  try {
    const after = await stat(path)
    if (after.mtimeMs !== auth.mtimeMs)
      throw new Error('Codex 登录信息已变化，请重试。')
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Codex 登录信息已变化，请重试。'
    )
      throw error
    throw new Error('无法确认 Codex 登录文件状态。')
  }
  return parseOpenAiUsage(payload)
}

export async function fetchDeepSeekBalance(
  apiKey: string,
): Promise<AiQuotaBalance> {
  let response: Response
  try {
    response = await fetchQuota(balanceEndpoint(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw networkError('DeepSeek', error)
  }
  if (!response.ok) throw httpError('DeepSeek', response.status)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('DeepSeek 余额服务返回了无效数据。')
  }
  return parseDeepSeekBalance(payload)
}
