import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createProxySocket, mailProxyUrl } from '../../src/main/mail-proxy'

const keys = [
  'MQMZ_MAIL_PROXY',
  'ALL_PROXY',
  'all_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
] as const
let original: Record<string, string | undefined> = {}

beforeEach(() => {
  original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) delete process.env[key]
})

afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

describe('mail proxy selection', () => {
  test('explicit mail proxy wins', () => {
    process.env.MQMZ_MAIL_PROXY = 'socks5://127.0.0.1:9001'
    process.env.ALL_PROXY = 'socks5://127.0.0.1:9002'
    expect(mailProxyUrl()).toBe('socks5://127.0.0.1:9001')
  })

  test('falls back through the standard proxy variables', () => {
    process.env.all_proxy = 'socks5://127.0.0.1:9002'
    process.env.HTTPS_PROXY = 'http://127.0.0.1:9003'
    expect(mailProxyUrl()).toBe('socks5://127.0.0.1:9002')
    delete process.env.all_proxy
    expect(mailProxyUrl()).toBe('http://127.0.0.1:9003')
  })

  test('returns undefined without a proxy', () => {
    expect(mailProxyUrl()).toBeUndefined()
  })

  test('rejects an invalid proxy URL', async () => {
    await expect(
      createProxySocket('not a url', 'imap.gmail.com', 993),
    ).rejects.toThrow('代理地址格式不正确。')
  })
})
