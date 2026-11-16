import { describe, expect, test } from 'vitest'
import {
  evaluateAiQuotaAlerts,
  pruneAiQuotaAlertKeys,
} from '../../src/shared/ai-quota-alert'
import {
  emptyAiQuotaProvider,
  type AiQuotaProviderState,
  type AiQuotaWindow,
} from '../../src/shared/ai-quota'

const now = new Date(2026, 10, 16, 10, 0).getTime()
const day = 24 * 60 * 60 * 1000

function openai(
  windows: AiQuotaWindow[],
  patch: Partial<AiQuotaProviderState> = {},
): AiQuotaProviderState {
  return {
    configured: true,
    status: 'ready',
    windows,
    updatedAt: now,
    ...patch,
  }
}

function deepseek(
  total: number,
  available = true,
  patch: Partial<AiQuotaProviderState> = {},
): AiQuotaProviderState {
  return {
    configured: true,
    status: 'ready',
    windows: [],
    balance: {
      currency: 'CNY',
      total,
      granted: 0,
      toppedUp: total,
      available,
    },
    updatedAt: now,
    ...patch,
  }
}

function state(
  openaiProvider = emptyAiQuotaProvider(),
  deepseekProvider = emptyAiQuotaProvider(),
) {
  return { openai: openaiProvider, deepseek: deepseekProvider }
}

const fiveHour = (remaining: number, resetAt = now + 3_600_000): AiQuotaWindow => ({
  key: 'fiveHour',
  label: '5 小时',
  remaining,
  resetAt,
})

const week = (remaining: number, resetAt = now + day): AiQuotaWindow => ({
  key: 'week',
  label: '本周',
  remaining,
  resetAt,
})

describe('ai quota alerts', () => {
  test('a low OpenAI window alerts once per reset', () => {
    const snapshot = state(openai([fiveHour(18), week(50)]))
    const first = evaluateAiQuotaAlerts(snapshot, {}, { now })
    expect(first.alerts).toHaveLength(1)
    expect(first.alerts[0].kind).toBe('quotaLow')
    expect(first.alerts[0].title).toBe('额度提醒')
    expect(first.alerts[0].left).toBe('18%')
    expect(evaluateAiQuotaAlerts(snapshot, first.keys, { now }).alerts).toHaveLength(
      0,
    )

    const nextWindow = state(openai([fiveHour(18, now + 6 * 3_600_000), week(50)]))
    const reset = evaluateAiQuotaAlerts(nextWindow, first.keys, { now })
    expect(reset.alerts).toHaveLength(1)
  })

  test('both low windows collapse into one alert but mark both keys', () => {
    const snapshot = state(openai([fiveHour(8), week(4)]))
    const first = evaluateAiQuotaAlerts(snapshot, {}, { now })
    expect(first.alerts).toHaveLength(1)
    expect(first.alerts[0].left).toBe('4%')
    expect(first.alerts[0].keys).toHaveLength(2)
    expect(evaluateAiQuotaAlerts(snapshot, first.keys, { now }).alerts).toHaveLength(
      0,
    )
  })

  test('thresholds stay strict above the limit', () => {
    const snapshot = state(openai([fiveHour(21), week(11)]))
    expect(evaluateAiQuotaAlerts(snapshot, {}, { now }).alerts).toHaveLength(0)
  })

  test('DeepSeek low balance alerts once per local day', () => {
    const snapshot = state(undefined, deepseek(3))
    const first = evaluateAiQuotaAlerts(snapshot, {}, { now })
    expect(first.alerts).toHaveLength(1)
    expect(first.alerts[0].kind).toBe('balanceLow')
    expect(first.alerts[0].title).toBe('余额提醒')
    expect(first.alerts[0].left).toBe('¥3.00')
    expect(evaluateAiQuotaAlerts(snapshot, first.keys, { now }).alerts).toHaveLength(
      0,
    )
    expect(
      evaluateAiQuotaAlerts(snapshot, first.keys, { now: now + day }).alerts,
    ).toHaveLength(1)
  })

  test('a critical balance wins and suppresses the plain low alert', () => {
    const critical = state(undefined, deepseek(0.5))
    const first = evaluateAiQuotaAlerts(critical, {}, { now })
    expect(first.alerts).toHaveLength(1)
    expect(first.alerts[0].keys).toHaveLength(2)
    const recovered = state(undefined, deepseek(3))
    expect(
      evaluateAiQuotaAlerts(recovered, first.keys, { now }).alerts,
    ).toHaveLength(0)
  })

  test('an unavailable account counts as critical', () => {
    const snapshot = state(undefined, deepseek(20, false))
    const result = evaluateAiQuotaAlerts(snapshot, {}, { now })
    expect(result.alerts).toHaveLength(1)
    expect(result.alerts[0].left).toBe('¥20.00')
  })

  test('a failed refresh with data alerts once per day', () => {
    const snapshot = state(openai([fiveHour(60)], { status: 'stale' }))
    const first = evaluateAiQuotaAlerts(snapshot, {}, { now })
    expect(first.alerts).toHaveLength(1)
    expect(first.alerts[0].kind).toBe('quotaError')
    expect(first.alerts[0].service).toBe('OpenAI 额度')
    expect(
      evaluateAiQuotaAlerts(snapshot, first.keys, { now: now + 3_600_000 }).alerts,
    ).toHaveLength(0)
    expect(
      evaluateAiQuotaAlerts(snapshot, first.keys, { now: now + day }).alerts,
    ).toHaveLength(1)
  })

  test('a failed DeepSeek refresh names the balance service', () => {
    const snapshot = state(undefined, deepseek(30, true, { status: 'stale' }))
    const first = evaluateAiQuotaAlerts(snapshot, {}, { now })
    expect(first.alerts).toHaveLength(1)
    expect(first.alerts[0].kind).toBe('quotaError')
    expect(first.alerts[0].service).toBe('DeepSeek 余额')
  })

  test('a first-time failure without data stays quiet', () => {
    const snapshot = state(openai([], { status: 'error', updatedAt: undefined }))
    expect(evaluateAiQuotaAlerts(snapshot, {}, { now }).alerts).toHaveLength(0)
  })

  test('unconfigured providers never alert', () => {
    expect(
      evaluateAiQuotaAlerts(
        state(emptyAiQuotaProvider(), emptyAiQuotaProvider()),
        {},
        { now },
      ).alerts,
    ).toHaveLength(0)
  })

  test('old keys are pruned', () => {
    const kept = pruneAiQuotaAlertKeys(
      { recent: now, old: now - 40 * day },
      now,
    )
    expect(kept).toEqual({ recent: now })
  })
})
