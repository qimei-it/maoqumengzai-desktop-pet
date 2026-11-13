import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { SocksClient } from 'socks'

const proxyTimeoutMs = 20_000

/**
 * Mail proxies are opt-in through the environment. Gmail is the provider that
 * commonly needs one on networks where imap.gmail.com is not reachable
 * directly; QQ and 163 continue to connect directly.
 */
export function mailProxyUrl(): string | undefined {
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
      host: proxy.hostname,
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
            host: proxy.hostname,
            port: proxyPort,
            servername: proxy.hostname,
          })
        : netConnect({ host: proxy.hostname, port: proxyPort })
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
