import { describe, expect, test } from 'vitest'
import {
  emptyAiQuotaState,
  formatQuotaMoney,
  formatQuotaPercent,
  parseDeepSeekBalance,
  parseOpenAiUsage,
  quotaBarWidth,
  ringMetrics,
} from '../../src/shared/ai-quota'

describe('OpenAI quota parsing', () => {
  test('reads five-hour and weekly windows', () => {
    const result = parseOpenAiUsage({
      plan_type: 'pro',
      rate_limit: {
        primary_window: {
          used_percent: 25,
          limit_window_seconds: 18_000,
          reset_at: 1_800_000_000,
        },
        secondary_window: {
          used_percent: 60,
          limit_window_seconds: 604_800,
          reset_at: '2030-01-01T00:00:00Z',
        },
      },
    })
    expect(result.plan).toBe('pro')
    expect(result.windows.map((item) => [item.key, item.remaining])).toEqual([
      ['fiveHour', 75],
      ['week', 40],
    ])
    expect(result.windows[0].resetAt).toBe(1_800_000_000_000)
  })

  test('keeps a single real window and rejects empty quota', () => {
    const weekly = parseOpenAiUsage({
      rate_limit: {
        secondary_window: {
          used_percent: 20,
          limit_window_seconds: 604_800,
        },
      },
    })
    expect(weekly.windows).toHaveLength(1)
    expect(weekly.windows[0]).toMatchObject({ key: 'week', remaining: 80 })
    expect(() =>
      parseOpenAiUsage({ rate_limit: { primary_window: {} } }),
    ).toThrow('OpenAI')
  })
})

describe('DeepSeek balance parsing', () => {
  test('prefers CNY and keeps all balance fields', () => {
    const balance = parseDeepSeekBalance({
      is_available: true,
      balance_infos: [
        {
          currency: 'USD',
          total_balance: '1.23',
          granted_balance: '0',
          topped_up_balance: '1.23',
        },
        {
          currency: 'CNY',
          total_balance: '28.60',
          granted_balance: '5',
          topped_up_balance: '23.60',
        },
      ],
    })
    expect(balance).toMatchObject({
      currency: 'CNY',
      total: 28.6,
      granted: 5,
      toppedUp: 23.6,
      available: true,
    })
    expect(formatQuotaMoney(balance)).toBe('¥28.60')
  })

  test('rejects unavailable data and invalid amounts', () => {
    expect(() =>
      parseDeepSeekBalance({ is_available: true, balance_infos: [] }),
    ).toThrow('DeepSeek')
    expect(() =>
      parseDeepSeekBalance({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: 'NaN' }],
      }),
    ).toThrow('DeepSeek')
  })
})

describe('quota presentation helpers', () => {
  test('formats large balances and percentages', () => {
    expect(
      formatQuotaMoney({
        currency: 'CNY',
        total: 12_800,
        granted: 0,
        toppedUp: 12_800,
        available: true,
      }),
    ).toBe('¥1.28万')
    expect(formatQuotaPercent(72.4)).toBe('72%')
    expect(formatQuotaPercent(undefined)).toBe('—')
  })

  test('ring progress is bounded and dynamic width follows configured providers', () => {
    expect(ringMetrics(0, 10).offset).toBeCloseTo(2 * Math.PI * 10)
    expect(ringMetrics(100, 10).offset).toBeCloseTo(0)
    expect(ringMetrics(50, 10).offset).toBeCloseTo(Math.PI * 10)
    const state = emptyAiQuotaState()
    expect(quotaBarWidth(state)).toBe(0)
    state.openai.configured = true
    expect(quotaBarWidth(state)).toBe(120)
    state.deepseek.configured = true
    expect(quotaBarWidth(state)).toBe(240)
    state.deepseek.balance = {
      currency: 'CNY',
      total: 123.45,
      granted: 0,
      toppedUp: 123.45,
      available: true,
    }
    expect(quotaBarWidth(state)).toBe(260)
  })
})
