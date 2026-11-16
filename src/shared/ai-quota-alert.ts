/**
 * Threshold alerts for AI subscription quota and API balance. Pure local logic:
 * the caller supplies the current snapshot and the keys already alerted, so
 * nothing here touches the network, the clock or disk.
 */
import {
  formatQuotaMoney,
  formatQuotaPercent,
  type AiQuotaProviderState,
  type AiQuotaState,
} from './ai-quota'
import type { ReminderKind } from './reminder-lines'

export const aiQuotaAlertThresholds = {
  /** OpenAI 5-hour window remaining percent. */
  openaiFiveHour: 20,
  /** OpenAI weekly window remaining percent. */
  openaiWeek: 10,
  /** DeepSeek balance in CNY. */
  deepseekLow: 5,
  deepseekCritical: 1,
  /** Read failures alert at most once per day per provider. */
  errorCooldownMs: 24 * 60 * 60 * 1000,
  /** Alert keys older than this are dropped when the store is saved. */
  retainMs: 30 * 24 * 60 * 60 * 1000,
} as const

export type AiQuotaAlertKind = Extract<
  ReminderKind,
  'quotaLow' | 'balanceLow' | 'quotaError'
>

export type AiQuotaAlert = {
  kind: AiQuotaAlertKind
  title: string
  /** Alert keys to mark once this alert is delivered. */
  keys: string[]
  /** Remaining percentage or formatted money, filled into the copy. */
  left?: string
  /** Provider label filled into error copy, e.g. 「OpenAI 额度」. */
  service?: string
}

export type AiQuotaAlertOptions = {
  now?: number
}

export type AiQuotaAlertResult = {
  alerts: AiQuotaAlert[]
  keys: Record<string, number>
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

function localDay(now: number): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

function windowKey(
  window: { key: string; resetAt?: number },
  now: number,
): string {
  return `openai:${window.key}:${window.resetAt ?? localDay(now)}`
}

function thresholdForWindow(window: string): number {
  return window === 'fiveHour'
    ? aiQuotaAlertThresholds.openaiFiveHour
    : aiQuotaAlertThresholds.openaiWeek
}

function openaiAlert(
  provider: AiQuotaProviderState,
  sent: Record<string, number>,
  now: number,
): AiQuotaAlert | undefined {
  if (!provider.configured || provider.status !== 'ready') return undefined
  const qualifying = provider.windows.filter(
    (window) => window.remaining <= thresholdForWindow(window.key),
  )
  if (!qualifying.length) return undefined
  const fresh = qualifying.filter(
    (window) => sent[windowKey(window, now)] === undefined,
  )
  if (!fresh.length) return undefined
  const worst = [...fresh].sort(
    (left, right) => left.remaining - right.remaining,
  )[0]
  return {
    kind: 'quotaLow',
    title: '额度提醒',
    left: formatQuotaPercent(worst.remaining),
    keys: qualifying.map((window) => windowKey(window, now)),
  }
}

function deepseekAlert(
  provider: AiQuotaProviderState,
  sent: Record<string, number>,
  now: number,
): AiQuotaAlert | undefined {
  if (!provider.configured || provider.status !== 'ready') return undefined
  const balance = provider.balance
  if (!balance) return undefined
  const day = localDay(now)
  const lowKey = `deepseek:low:${day}`
  const criticalKey = `deepseek:critical:${day}`
  const critical =
    !balance.available ||
    balance.total <= aiQuotaAlertThresholds.deepseekCritical
  if (critical) {
    if (sent[criticalKey] !== undefined) return undefined
    return {
      kind: 'balanceLow',
      title: '余额提醒',
      left: formatQuotaMoney(balance),
      keys: [criticalKey, lowKey],
    }
  }
  if (balance.total > aiQuotaAlertThresholds.deepseekLow) return undefined
  if (sent[lowKey] !== undefined) return undefined
  return {
    kind: 'balanceLow',
    title: '余额提醒',
    left: formatQuotaMoney(balance),
    keys: [lowKey],
  }
}

function errorAlert(
  name: 'openai' | 'deepseek',
  provider: AiQuotaProviderState,
  sent: Record<string, number>,
  now: number,
): AiQuotaAlert | undefined {
  if (!provider.configured) return undefined
  if (provider.status !== 'stale' && provider.status !== 'error')
    return undefined
  const hasData = provider.windows.length > 0 || Boolean(provider.balance)
  if (!hasData) return undefined
  const key = `error:${name}`
  const last = sent[key]
  if (last !== undefined && now - last < aiQuotaAlertThresholds.errorCooldownMs)
    return undefined
  return {
    kind: 'quotaError',
    title: '额度提醒',
    keys: [key],
    service: name === 'openai' ? 'OpenAI 额度' : 'DeepSeek 余额',
  }
}

/**
 * One alert per provider per check: OpenAI reports its tightest qualifying
 * window, and every qualifying window key is marked so the same window does
 * not remind twice.
 */
export function evaluateAiQuotaAlerts(
  state: Pick<AiQuotaState, 'openai' | 'deepseek'>,
  sent: Readonly<Record<string, number>>,
  options: AiQuotaAlertOptions = {},
): AiQuotaAlertResult {
  const now = options.now ?? Date.now()
  const keys: Record<string, number> = { ...sent }
  const alerts = [
    openaiAlert(state.openai, keys, now),
    deepseekAlert(state.deepseek, keys, now),
    errorAlert('openai', state.openai, keys, now),
    errorAlert('deepseek', state.deepseek, keys, now),
  ].filter((alert): alert is AiQuotaAlert => Boolean(alert))
  for (const alert of alerts) {
    for (const key of alert.keys) keys[key] = now
  }
  return { alerts, keys }
}

/** Drops keys that can no longer matter, so the store stays small. */
export function pruneAiQuotaAlertKeys(
  sent: Readonly<Record<string, number>>,
  now = Date.now(),
): Record<string, number> {
  const cutoff = now - aiQuotaAlertThresholds.retainMs
  return Object.fromEntries(
    Object.entries(sent).filter(([, at]) => Number.isFinite(at) && at >= cutoff),
  )
}
