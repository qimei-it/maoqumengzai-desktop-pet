/** AI subscription quota and API balance shared by main and renderer. */

export type AiQuotaStatus =
  | 'missing'
  | 'loading'
  | 'ready'
  | 'stale'
  | 'error'
export type AiQuotaWindowKey = 'fiveHour' | 'week'
export type AiQuotaWindow = {
  key: AiQuotaWindowKey
  label: string
  remaining: number
  resetAt?: number
}
export type AiQuotaBalance = {
  currency: string
  total: number
  granted: number
  toppedUp: number
  available: boolean
}
export type AiQuotaProviderState = {
  configured: boolean
  status: AiQuotaStatus
  windows: AiQuotaWindow[]
  balance?: AiQuotaBalance
  plan?: string
  error?: string
  updatedAt?: number
}
export type AiQuotaState = {
  visible: boolean
  loading: boolean
  openai: AiQuotaProviderState
  deepseek: AiQuotaProviderState
}

export function emptyAiQuotaProvider(): AiQuotaProviderState {
  return { configured: false, status: 'missing', windows: [] }
}

export function emptyAiQuotaState(): AiQuotaState {
  return {
    visible: false,
    loading: false,
    openai: emptyAiQuotaProvider(),
    deepseek: emptyAiQuotaProvider(),
  }
}

function finiteNumber(value: unknown): number | undefined {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
  return Number.isFinite(number) ? number : undefined
}

function resetTimestamp(value: unknown): number | undefined {
  const numeric = finiteNumber(value)
  if (numeric !== undefined && numeric > 0)
    return numeric > 10_000_000_000 ? numeric : numeric * 1000
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

type CodexWindow = {
  used_percent?: unknown
  limit_window_seconds?: unknown
  reset_at?: unknown
}

function codexWindows(value: unknown): AiQuotaWindow[] {
  const root =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const rate =
    typeof root.rate_limit === 'object' && root.rate_limit !== null
      ? (root.rate_limit as Record<string, unknown>)
      : {}
  const windows: AiQuotaWindow[] = []
  const seen = new Set<AiQuotaWindowKey>()
  for (const field of ['primary_window', 'secondary_window']) {
    const raw = rate[field]
    if (typeof raw !== 'object' || raw === null) continue
    const window = raw as CodexWindow
    const seconds = finiteNumber(window.limit_window_seconds)
    const used = finiteNumber(window.used_percent)
    if (seconds === undefined || used === undefined) continue
    const key: AiQuotaWindowKey | undefined =
      seconds === 18_000
        ? 'fiveHour'
        : seconds === 604_800
          ? 'week'
          : seconds > 0 && seconds % 604_800 === 0
            ? 'week'
            : seconds > 0 && seconds % 18_000 === 0
              ? 'fiveHour'
              : undefined
    if (!key || seen.has(key)) continue
    seen.add(key)
    const resetAt = resetTimestamp(window.reset_at)
    windows.push({
      key,
      label: key === 'fiveHour' ? '5 小时' : '本周',
      remaining: clampPercent(100 - used),
      ...(resetAt ? { resetAt } : {}),
    })
  }
  return windows.sort((left, right) =>
    left.key === 'fiveHour' ? -1 : right.key === 'fiveHour' ? 1 : 0,
  )
}

export function parseOpenAiUsage(value: unknown): {
  plan?: string
  windows: AiQuotaWindow[]
} {
  const windows = codexWindows(value)
  if (!windows.length)
    throw new Error('OpenAI 没有返回 5 小时或本周额度。')
  const root =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}
  return {
    ...(typeof root.plan_type === 'string' && root.plan_type
      ? { plan: root.plan_type }
      : {}),
    windows,
  }
}

export function parseDeepSeekBalance(value: unknown): AiQuotaBalance {
  const root =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}
  if (typeof root.is_available !== 'boolean')
    throw new Error('DeepSeek 余额响应缺少账户状态。')
  const rows = Array.isArray(root.balance_infos) ? root.balance_infos : []
  if (!rows.length) throw new Error('DeepSeek 没有返回余额。')
  const balances = rows
    .map((row) => {
      if (typeof row !== 'object' || row === null) return undefined
      const item = row as Record<string, unknown>
      const currency =
        typeof item.currency === 'string' ? item.currency.toUpperCase() : ''
      const total = finiteNumber(item.total_balance)
      const granted = finiteNumber(item.granted_balance) ?? 0
      const toppedUp = finiteNumber(item.topped_up_balance) ?? 0
      if (!currency || total === undefined || total < 0) return undefined
      return {
        currency,
        total,
        granted: Math.max(0, granted),
        toppedUp: Math.max(0, toppedUp),
        available: root.is_available as boolean,
      }
    })
    .filter((item): item is AiQuotaBalance => Boolean(item))
  const balance =
    balances.find((item) => item.currency === 'CNY') ?? balances[0]
  if (!balance) throw new Error('DeepSeek 余额字段无效。')
  return balance
}

export function formatOpenAiAccountStatus(
  provider: Pick<AiQuotaProviderState, 'configured' | 'plan'> | undefined,
): string {
  if (!provider?.configured) return '未登录'
  if (!provider.plan) return '已登录'
  const plan = provider.plan.charAt(0).toUpperCase() + provider.plan.slice(1)
  return `已登录 ${plan} 帐户`
}

export function formatQuotaMoney(balance: AiQuotaBalance): string {
  const symbol = balance.currency === 'CNY' ? '¥' : '$'
  const value = Math.abs(balance.total)
  if (value >= 100_000_000)
    return `${symbol}${(value / 100_000_000).toFixed(2).replace(/\.?0+$/, '')}亿`
  if (value >= 10_000)
    return `${symbol}${(value / 10_000).toFixed(2).replace(/\.?0+$/, '')}万`
  return `${symbol}${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatQuotaPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return `${Math.round(clampPercent(value))}%`
}

export function ringMetrics(
  remaining: number | undefined,
  radius: number,
): { circumference: number; offset: number } {
  const circumference = 2 * Math.PI * radius
  const progress =
    remaining === undefined || !Number.isFinite(remaining)
      ? 0
      : clampPercent(remaining) / 100
  return { circumference, offset: circumference * (1 - progress) }
}

/** Segments are omitted entirely when a provider is not configured. */
export const quotaBarHeight = 60

export function quotaBarWidth(state: AiQuotaState): number {
  const openai = state.openai.configured
  const deepseek = state.deepseek.configured
  const deepseekDigits = state.deepseek.balance
    ? String(Math.max(0, Math.floor(state.deepseek.balance.total))).length
    : 2
  const deepseekExtra = deepseek
    ? Math.min(30, Math.max(0, deepseekDigits - 2) * 10)
    : 0
  const single = 120 + (openai ? 0 : deepseekExtra)
  if (openai && deepseek) return (120 + deepseekExtra) * 2
  if (openai) return 120
  if (deepseek) return single
  return 0
}

export function quotaProviderVisible(
  provider: AiQuotaProviderState,
): boolean {
  return provider.configured
}
