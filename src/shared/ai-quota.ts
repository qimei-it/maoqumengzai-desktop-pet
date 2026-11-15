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

export function formatQuotaClock(updatedAt: number | undefined): string {
  if (updatedAt === undefined || !Number.isFinite(updatedAt)) return '—'
  return new Date(updatedAt).toLocaleTimeString('zh-CN', {
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Coarse relative age for the quota tooltip; exact clock time stays next to it. */
export function formatQuotaFreshness(
  updatedAt: number | undefined,
  now = Date.now(),
): string {
  if (updatedAt === undefined || !Number.isFinite(updatedAt)) return '尚未更新'
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000))
  if (seconds < 10) return '刚刚'
  if (seconds < 60) return `${seconds} 秒前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

/**
 * A snapshot is outdated once it misses more than one and a half refresh
 * cycles, or after a failed request. The floor covers very short test cycles.
 */
export function isQuotaProviderOutdated(
  provider:
    | Pick<AiQuotaProviderState, 'configured' | 'status' | 'updatedAt'>
    | undefined,
  now: number,
  refreshMinutes: number,
): boolean {
  if (!provider?.configured) return false
  if (provider.status === 'stale' || provider.status === 'error') return true
  if (provider.updatedAt === undefined || !Number.isFinite(provider.updatedAt))
    return false
  const age = Math.max(0, now - provider.updatedAt)
  const cycle = Math.max(1, refreshMinutes) * 60_000
  return age > Math.max(60_000, cycle * 1.5)
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

/** The DeepSeek balance sits a fixed distance from the pill's right border. */
const quotaBalanceInset = 16
/** Widths mirror AiQuotaBar.vue; keep the two in sync. */
const quotaPillBorders = 2
const quotaPillPaddingLeft = 10
const quotaSinglePaddingLeft = 6
const quotaOpenAiWidth = 100
const quotaDividerWidth = 17
const quotaDeepSeekIconWidth = 20
const quotaDeepSeekGap = 8
/** 17px monospace advance per ASCII character plus CJK fallback width. */
const quotaMonoAdvance = 10.3
const quotaWideAdvance = 17
/** Keeps the pill steady while the balance is missing or very short. */
const quotaBalanceMinAdvanceCount = 6

function quotaBalanceTextWidth(text: string): number {
  let width = 0
  for (const char of text)
    width += /[\u3400-\u9fff]/.test(char)
      ? quotaWideAdvance
      : quotaMonoAdvance
  return width
}

export function quotaBarWidth(state: AiQuotaState): number {
  const openai = state.openai.configured
  const deepseek = state.deepseek.configured
  const balance = state.deepseek.balance
    ? formatQuotaMoney(state.deepseek.balance)
    : '—'
  const balanceWidth = Math.max(
    quotaBalanceMinAdvanceCount * quotaMonoAdvance,
    quotaBalanceTextWidth(balance),
  )
  const deepseekContent =
    quotaDeepSeekIconWidth + quotaDeepSeekGap + balanceWidth
  const deepseekSegment = Math.ceil(
    quotaPillBorders +
      quotaPillPaddingLeft +
      deepseekContent +
      quotaBalanceInset,
  )
  const dualWidth = Math.ceil(
    deepseekSegment + quotaOpenAiWidth + quotaDividerWidth,
  )
  const singleDeepSeek = Math.max(
    120,
    Math.ceil(
      quotaPillBorders +
        quotaSinglePaddingLeft +
        deepseekContent +
        quotaBalanceInset,
    ),
  )
  if (openai && deepseek) return dualWidth
  if (openai) return 120
  if (deepseek) return singleDeepSeek
  return 0
}

export function quotaProviderVisible(
  provider: AiQuotaProviderState,
): boolean {
  return provider.configured
}
