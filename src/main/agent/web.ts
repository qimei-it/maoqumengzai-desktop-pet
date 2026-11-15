/** Fetches and flattens one http(s) page for the read_url agent tool. */

export type WebPage = {
  url: string
  title: string
  text: string
}

export type ReadWebOptions = {
  fetch?: typeof fetch
  maxBytes?: number
}

function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    host === '0.0.0.0'
  )
    return true
  if (/^(fc|fd|fe80)/.test(host)) return true
  const parts = host.split('.')
  if (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part))
  ) {
    const [first, second] = parts.map(Number)
    if (first === 0 || first === 127) return true
    if (first === 10) return true
    if (first === 169 && second === 254) return true
    if (first === 192 && second === 168) return true
    if (first === 172 && second >= 16 && second <= 31) return true
  }
  return false
}

function validUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('网址格式不正确。')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('只支持 http 或 https 网页。')
  if (url.username || url.password) throw new Error('网址不能包含账号信息。')
  if (privateHost(url.hostname)) throw new Error('不能读取本机或内网地址。')
  return url
}

function decode(value: string): string {
  const named: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    hellip: '…',
    mdash: '—',
    ndash: '–',
  }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    const lower = code.toLowerCase()
    if (lower.startsWith('#')) {
      const point =
        lower[1] === 'x'
          ? Number.parseInt(lower.slice(2), 16)
          : Number.parseInt(lower.slice(1), 10)
      if (Number.isFinite(point) && point > 0 && point <= 0x10ffff)
        return String.fromCodePoint(point)
      return entity
    }
    return named[lower] ?? entity
  })
}

export function htmlToPage(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = decode(titleMatch?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  const cleaned = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const text = decode(cleaned)
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { title, text }
}

/** Reads one page as plain text; rejects localhost and private networks. */
export async function readWebPage(
  value: string,
  options: ReadWebOptions = {},
): Promise<WebPage> {
  const url = validUrl(value.trim())
  const request = options.fetch ?? fetch
  let response: Response
  try {
    response = await request(url.href, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('打开网页失败，请检查网络或换一个链接。')
  }
  if (!response.ok)
    throw new Error(`网页返回 ${response.status}，暂时无法读取。`)
  const finalUrl = validUrl(response.url || url.href)
  const limit = options.maxBytes ?? 3 * 1024 * 1024
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > limit)
    throw new Error('网页内容过大，无法读取。')
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > limit) throw new Error('网页内容过大，无法读取。')
  const type = response.headers.get('content-type') ?? ''
  const html = new TextDecoder('utf-8').decode(buffer)
  const page = htmlToPage(html)
  const text =
    type.includes('text/plain') && !page.text
      ? html.trim().slice(0, 20_000)
      : page.text
  if (!text) throw new Error('这个网页没有可读取的文字。')
  return {
    url: finalUrl.href,
    title: page.title || finalUrl.hostname,
    text:
      text.length > 20_000
        ? `${text.slice(0, 20_000)}\n（内容过长，已截断）`
        : text,
  }
}
