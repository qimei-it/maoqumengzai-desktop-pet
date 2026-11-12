import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchOne: vi.fn(async () => ({ source: Buffer.from('mail') })),
  flagsAdd: vi.fn(async () => true),
  parse: vi.fn(async () => ({
    subject: '登录验证码',
    from: { value: [{ name: 'Example', address: 'security@example.com' }] },
    date: new Date('2026-01-01T08:00:00Z'),
    text: '您的验证码是 123456，5 分钟内有效。',
    html: undefined,
    attachments: [],
  })),
}))

vi.mock('imapflow', () => ({
  ImapFlow: class {
    connect = vi.fn(async () => {})
    mailboxOpen = vi.fn(async () => ({ exists: 1, unseen: 0 }))
    fetchOne = mocks.fetchOne
    messageFlagsAdd = mocks.flagsAdd
    logout = vi.fn(async () => {})
  },
}))

vi.mock('mailparser', () => ({
  simpleParser: mocks.parse,
}))

import { fetchMailDetail } from '../../src/main/mail-sync'

describe('mail detail fetch', () => {
  beforeEach(() => {
    mocks.fetchOne.mockClear()
    mocks.flagsAdd.mockClear()
    mocks.parse.mockClear()
  })

  test('fetches and marks the selected message by UID', async () => {
    const detail = await fetchMailDetail(
      'qq',
      'demo@qq.com',
      'auth-code',
      3013,
    )
    expect(mocks.fetchOne).toHaveBeenCalledWith(
      '3013',
      { source: true },
      { uid: true },
    )
    expect(mocks.flagsAdd).toHaveBeenCalledWith(
      '3013',
      ['\\Seen'],
      { uid: true },
    )
    expect(detail.code).toBe('123456')
    expect(detail.codeExpiresAt).toBe(
      new Date('2026-01-01T08:00:00Z').getTime() + 5 * 60_000,
    )
  })
})
