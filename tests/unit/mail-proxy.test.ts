import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  createProxySocket,
  mailProxyUrl,
  parseResolvedProxy,
  setMailProxySettings,
  setSystemMailProxy,
} from '../../src/main/mail-proxy'

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
  setMailProxySettings({ mode: 'auto', url: '' })
  setSystemMailProxy(undefined)
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

  test('uses the system proxy when the environment is empty', () => {
    setSystemMailProxy('http://127.0.0.1:6152')
    expect(mailProxyUrl()).toBe('http://127.0.0.1:6152')
  })

  test('manual settings override the environment and system proxy', () => {
    process.env.ALL_PROXY = 'socks5://127.0.0.1:9002'
    setSystemMailProxy('http://127.0.0.1:6152')
    setMailProxySettings({
      mode: 'manual',
      url: 'socks5://127.0.0.1:6153',
    })
    expect(mailProxyUrl()).toBe('socks5://127.0.0.1:6153')
  })

  test('direct mode ignores every configured proxy', () => {
    process.env.ALL_PROXY = 'socks5://127.0.0.1:9002'
    setSystemMailProxy('http://127.0.0.1:6152')
    setMailProxySettings({ mode: 'off', url: 'socks5://127.0.0.1:9001' })
    expect(mailProxyUrl()).toBeUndefined()
  })

  test('manual mode rejects an empty or malformed address', () => {
    setMailProxySettings({ mode: 'manual', url: '  ' })
    expect(() => mailProxyUrl()).toThrow('请填写 Gmail 代理地址。')
    setMailProxySettings({ mode: 'manual', url: 'not a proxy' })
    expect(() => mailProxyUrl()).toThrow('代理地址格式不正确。')
    setMailProxySettings({ mode: 'manual', url: 'ftp://127.0.0.1:21' })
    expect(() => mailProxyUrl()).toThrow('代理仅支持 HTTP 或 SOCKS。')
  })

  test('returns undefined without a proxy', () => {
    expect(mailProxyUrl()).toBeUndefined()
  })

  test('parses Chromium proxy resolution results', () => {
    expect(parseResolvedProxy('DIRECT')).toBeUndefined()
    expect(parseResolvedProxy('PROXY 127.0.0.1:6152')).toBe(
      'http://127.0.0.1:6152',
    )
    expect(parseResolvedProxy('SOCKS5 127.0.0.1:6153')).toBe(
      'socks5://127.0.0.1:6153',
    )
    expect(parseResolvedProxy('HTTPS proxy.local:8443')).toBe(
      'https://proxy.local:8443',
    )
    expect(
      parseResolvedProxy('PROXY 127.0.0.1:6152; DIRECT'),
    ).toBe('http://127.0.0.1:6152')
    expect(parseResolvedProxy('QUIC proxy.local:443; DIRECT')).toBeUndefined()
    expect(parseResolvedProxy('')).toBeUndefined()
  })

  test('rejects an invalid proxy URL', async () => {
    await expect(
      createProxySocket('not a url', 'imap.gmail.com', 993),
    ).rejects.toThrow('代理地址格式不正确。')
  })
})
