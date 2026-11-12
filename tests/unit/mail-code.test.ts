import { describe, expect, test } from 'vitest'
import { detectVerificationCode } from '../../src/shared/mail-code'

const receivedAt = Date.UTC(2026, 0, 1, 8, 0, 0)
const minute = 60_000

describe('verification code detection', () => {
  test('reads a code and validity after the keyword', () => {
    expect(
      detectVerificationCode(
        '登录验证码',
        '您的验证码是 123456，5 分钟内有效。',
        receivedAt,
      ),
    ).toEqual({ code: '123456', expiresAt: receivedAt + 5 * minute })
  })

  test('reads a code placed before the keyword', () => {
    expect(
      detectVerificationCode('', '123456 是您的验证码，请勿泄露。', receivedAt),
    ).toEqual({ code: '123456' })
  })

  test('supports spaced and hyphenated codes', () => {
    expect(
      detectVerificationCode('', '验证码：12 34 56', receivedAt)?.code,
    ).toBe('123456')
    expect(
      detectVerificationCode('', '验证码：1234-5678', receivedAt)?.code,
    ).toBe('12345678')
  })

  test('supports English OTP text and expiry', () => {
    expect(
      detectVerificationCode(
        'Security code',
        'Your verification code is 738291. It expires in 10 minutes.',
        receivedAt,
      ),
    ).toEqual({ code: '738291', expiresAt: receivedAt + 10 * minute })
  })

  test('ignores order numbers, phone numbers and amounts', () => {
    expect(
      detectVerificationCode(
        '订单确认',
        '订单号 1234567890，金额 123.00，手机号 13800138000。',
        receivedAt,
      ),
    ).toBeUndefined()
  })

  test('keeps the real code when an order number is nearby', () => {
    expect(
      detectVerificationCode(
        '订单验证码',
        '订单号 987654321，验证码 654321，10 分钟内有效。',
        receivedAt,
      ),
    ).toEqual({ code: '654321', expiresAt: receivedAt + 10 * minute })
  })

  test('ignores validity numbers without a code', () => {
    expect(
      detectVerificationCode('', '验证码已发送，有效期 10 分钟。', receivedAt),
    ).toBeUndefined()
  })

  test('reads a validity window before the code', () => {
    expect(
      detectVerificationCode(
        '验证码',
        '验证码有效期 30 分钟，您的验证码为 482913。',
        receivedAt,
      ),
    ).toEqual({ code: '482913', expiresAt: receivedAt + 30 * minute })
  })

  test('prefers the code after the keyword over an earlier number', () => {
    expect(
      detectVerificationCode('2026 验证码', '123456 是您的验证码。', receivedAt)?.code,
    ).toBe('123456')
    expect(
      detectVerificationCode('2026 验证码', '验证码 654321', receivedAt)?.code,
    ).toBe('654321')
  })

  test('does not guess when no code context exists', () => {
    expect(
      detectVerificationCode('会议通知', '会议时间 2026-01-01 08:00。', receivedAt),
    ).toBeUndefined()
  })
})
