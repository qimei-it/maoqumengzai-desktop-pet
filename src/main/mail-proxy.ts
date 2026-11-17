import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { SocksClient } from 'socks'
import {
  mailProxyUrlError,
  type MailProxyMode,
} from '../shared/mail'

const proxyTimeoutMs = 20_000

type MailProxySettings = {
  mode: MailProxyMode
  url: string
}

/**
 * Manual settings win over the environment, which in turn wins over the
 * macOS system proxy. QQ and 163 never read this, so they stay direct.
 */
let proxySettings: MailProxySettings = { mode: 'auto', url: '' }
let systemProxyUrl: string | undefined

export function setMailProxySettings(settings: MailProxySettings): void {
  proxySettings = { mode: settings.mode, url: settings.url }
}

export function setSystemMailProxy(value: string | undefined): void {
  systemProxyUrl = value
}

function envProxyUrl(): string | undefined {
  const candidates = [
    process.env.MQMZ_MAIL_PROXY,
    process.env.ALL_PROXY,
    process.env.all_proxy,
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
  ]
  return candidates
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value))
}

/** Returns the Gmail proxy URL, or throws for a broken manual setting. */
export function mailProxyUrl(): string | undefined {
  if (proxySettings.mode === 'off') return undefined
  if (proxySettings.mode === 'manual') {
    const url = proxySettings.url.trim()
    if (!url) throw new Error('请填写 Gmail 代理地址。')
    const error = mailProxyUrlError(url)
    if (error) throw new Error(error)
    return url
  }
  return envProxyUrl() ?? systemProxyUrl
}

/**
 * Chromium answers with entries such as `PROXY 127.0.0.1:7890; DIRECT`.
 * The first usable entry becomes the tunnel target.
 */
export function parseResolvedProxy(value: string): string | undefined {
  for (const entry of value.split(';')) {
    const [kind, target] = entry.trim().split(/\s+/)
    if (!kind || !target) continue
    const normalized = kind.toUpperCase()
    const scheme =
      normalized === 'PROXY'
        ? 'http'
        : normalized === 'HTTPS'
          ? 'https'
          : normalized.startsWith('SOCKS')
            ? normalized.toLowerCase().replace(/^socks$/, 'socks5')
            : undefined
    if (!scheme) continue
    try {
      const url = new URL(`${scheme}://${target}`)
      if (!url.hostname || !url.port) continue
      return `${scheme}://${target}`
    } catch {
      continue
    }
  }
  return undefined
}

function proxyHost(proxy: URL): string {
  return proxy.hostname.replace(/^\[|\]$/g, '')
}

function proxyAuth(proxy: URL): { userId?: string; password?: string } {
  if (!proxy.username) return {}
  return {
    userId: decodeURIComponent(proxy.username),
    password: decodeURIComponent(proxy.password),
  }
}

async function connectSocks(
  proxy: URL,
  host: string,
  port: number,
): Promise<Socket> {
  const { socket } = await SocksClient.createConnection({
    proxy: {
      host: proxyHost(proxy),
      port: Number(proxy.port || 1080),
      type: proxy.protocol.startsWith('socks4') ? 4 : 5,
      ...proxyAuth(proxy),
    },
    command: 'connect',
    destination: { host, port },
    timeout: proxyTimeoutMs,
  })
  return socket
}

function connectHttpProxy(
  proxy: URL,
  host: string,
  port: number,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const proxyPort = Number(proxy.port || (proxy.protocol === 'https:' ? 443 : 80))
    const socket =
      proxy.protocol === 'https:'
        ? tlsConnect({
            host: proxyHost(proxy),
            port: proxyPort,
            servername: proxyHost(proxy),
          })
        : netConnect({ host: proxyHost(proxy), port: proxyPort })
    let settled = false
    let buffer = ''
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(error)
    }
    const timer = setTimeout(
      () => fail(new Error('代理连接超时。')),
      proxyTimeoutMs,
    )
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('error', fail)
      resolve(socket)
    }
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('latin1')
      const end = buffer.indexOf('\r\n\r\n')
      if (end < 0) return
      const status = buffer.slice(0, buffer.indexOf('\r\n'))
      if (!/^HTTP\/\d\.\d 200\b/.test(status)) {
        fail(new Error(`代理拒绝连接：${status}`))
        return
      }
      finish()
    }
    socket.on('connect', () => {
      if (settled) return
      const auth = proxy.username
        ? `Proxy-Authorization: Basic ${Buffer.from(
            `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
          ).toString('base64')}\r\n`
        : ''
      socket.write(
        `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`,
      )
    })
    socket.on('data', onData)
    socket.once('error', (error) => fail(error))
  })
}

/** Opens a plain tunnel to the mail server through an HTTP/SOCKS proxy. */
export function createProxySocket(
  proxyUrl: string,
  host: string,
  port: number,
): Promise<Socket> {
  let proxy: URL
  try {
    proxy = new URL(proxyUrl)
  } catch {
    return Promise.reject(new Error('代理地址格式不正确。'))
  }
  return proxy.protocol.startsWith('socks')
    ? connectSocks(proxy, host, port)
    : connectHttpProxy(proxy, host, port)
}

/** Opens a TLS connection to the mail server through an HTTP/SOCKS proxy. */
export function createSecureProxySocket(
  proxyUrl: string,
  host: string,
  port: number,
): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    createProxySocket(proxyUrl, host, port)
      .then((socket) => {
        const secure = tlsConnect({ socket, servername: host })
        let settled = false
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          secure.destroy()
          reject(new Error('TLS 连接超时。'))
        }, proxyTimeoutMs)
        secure.once('secureConnect', () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          secure.setTimeout(0)
          resolve(secure)
        })
        secure.once('error', (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(error)
        })
      })
      .catch(reject)
  })
}
