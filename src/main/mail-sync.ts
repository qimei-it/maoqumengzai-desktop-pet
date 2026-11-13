/** IMAP connection probe and inbox unread sync. */
import { ImapFlow, type FetchMessageObject } from 'imapflow'
import { simpleParser } from 'mailparser'
import sanitizeHtml from 'sanitize-html'
import { detectVerificationCode } from '../shared/mail-code'
import {
  mailProviderHosts,
  type MailAttachmentInfo,
  type MailMessageSummary,
  type MailProvider,
} from '../shared/mail'

export type MailProbe = { unread: number }
export type MailInboxSync = MailProbe & {
  messages: MailMessageSummary[]
  total: number
}
export type MailOlderSync = {
  messages: MailMessageSummary[]
  hasMore: boolean
}
export type MailFetchedDetail = {
  subject: string
  fromName?: string
  fromAddress?: string
  date?: number
  unread: boolean
  bodyText?: string
  bodyHtml?: string
  snippet?: string
  code?: string
  codeExpiresAt?: number
  attachments: Array<MailAttachmentInfo & { data: Buffer }>
}

const mailClientInfo = {
  name: 'MaoquMengzai',
  version: '0.0.1',
  vendor: 'mqmz',
} as const

function providerClient(
  provider: MailProvider,
  email: string,
  secret: string,
): ImapFlow {
  const server = mailProviderHosts[provider]
  return new ImapFlow({
    host: server.host,
    port: server.port,
    secure: true,
    auth: { user: email, pass: secret },
    logger: false,
    socketTimeout: 20_000,
    ...(provider === '163' ? { clientInfo: mailClientInfo } : {}),
  })
}

/**
 * 163/126 only trusts an ID command sent after authentication. ImapFlow sends
 * ID before LOGIN and skips the post-login repeat when the server already
 * answered, so force it again before selecting a mailbox.
 */
async function identifyClient(
  client: ImapFlow,
  provider: MailProvider,
): Promise<void> {
  if (provider !== '163') return
  const internal = client as unknown as {
    run: (command: string, ...args: unknown[]) => Promise<unknown>
  }
  if (typeof internal.run !== 'function') return
  await internal.run('ID', mailClientInfo)
}

function errorText(error: unknown): string {
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {}
  return [
    record.message,
    record.responseText,
    record.code,
    record.responseStatus,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .trim() || String(error)
}

function isTransientNetworkError(error: unknown): boolean {
  return /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ECONNRESET|timeout|network|socket/i.test(
    errorText(error),
  )
}

async function retryNetwork<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isTransientNetworkError(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, 1200))
    return operation()
  }
}

export function mailErrorMessage(error: unknown): string {
  const message = errorText(error)
  if (/unsafe login|id required|client.*id|please.*id/i.test(message))
    return '邮箱要求客户端标识，请更换授权码后重试。'
  if (
    /authentication|invalid credentials|login fail|authorization|auth.*failed|invalid.*password/i.test(
      message,
    )
  )
    return '授权码或应用专用密码不正确。'
  if (isTransientNetworkError(error)) {
    const code =
      typeof (error as { code?: unknown })?.code === 'string'
        ? `（${(error as { code: string }).code}）`
        : ''
    return `无法连接邮箱服务器${code}，请检查网络或代理。`
  }
  return '邮箱连接失败，请检查账户与授权码。'
}

export async function probeMailAccount(
  provider: MailProvider,
  email: string,
  secret: string,
): Promise<MailProbe> {
  try {
    return await retryNetwork(async () => {
      const client = providerClient(provider, email, secret)
      try {
        await client.connect()
        await identifyClient(client, provider)
        const mailbox = await client.mailboxOpen('INBOX', { readOnly: true })
        return { unread: Math.max(0, mailbox.unseen ?? 0) }
      } finally {
        await client.logout().catch(() => {})
      }
    })
  } catch (error) {
    throw new Error(mailErrorMessage(error))
  }
}


function structureHasAttachments(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const value = node as {
    disposition?: string
    childNodes?: unknown[]
    type?: string
  }
  if (value.disposition === 'attachment') return true
  if (Array.isArray(value.childNodes))
    return value.childNodes.some(structureHasAttachments)
  return false
}

function snippetOf(text: string | undefined): string | undefined {
  const value = text?.replace(/\s+/g, ' ').trim()
  return value ? value.slice(0, 160) : undefined
}

function summaryOf(message: FetchMessageObject): MailMessageSummary {
  const envelope = message.envelope
  const from = envelope?.from?.[0]
  return {
    uid: message.uid,
    subject: envelope?.subject || '(无主题)',
    ...(from?.name ? { fromName: from.name } : {}),
    ...(from?.address ? { fromAddress: from.address } : {}),
    ...(envelope?.date
      ? { date: new Date(envelope.date).getTime() }
      : {}),
    unread: !message.flags?.has('\\Seen'),
    hasAttachments: structureHasAttachments(message.bodyStructure),
  }
}

export async function syncMailInbox(
  provider: MailProvider,
  email: string,
  secret: string,
): Promise<MailInboxSync> {
  const client = providerClient(provider, email, secret)
  try {
    await client.connect()
    await identifyClient(client, provider)
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true })
    const total = mailbox.exists
    const start = Math.max(1, total - 49)
    const messages: MailMessageSummary[] = []
    if (total > 0) {
      for await (const message of client.fetch(`${start}:*`, {
        envelope: true,
        flags: true,
        size: true,
        bodyStructure: true,
      })) {
        messages.push(summaryOf(message))
      }
    }
    return {
      unread: Math.max(0, mailbox.unseen ?? 0),
      total,
      messages: messages.sort((a, b) => (b.date ?? 0) - (a.date ?? 0)),
    }
  } catch (error) {
    throw new Error(mailErrorMessage(error))
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function fetchOlderMailInbox(
  provider: MailProvider,
  email: string,
  secret: string,
  beforeUid: number,
  limit = 50,
): Promise<MailOlderSync> {
  if (beforeUid <= 1) return { messages: [], hasMore: false }
  const client = providerClient(provider, email, secret)
  try {
    await client.connect()
    await identifyClient(client, provider)
    await client.mailboxOpen('INBOX', { readOnly: true })
    const uids = await client.search(
      { uid: `1:${beforeUid - 1}` },
      { uid: true },
    )
    if (!uids || !uids.length) return { messages: [], hasMore: false }
    const chosen = uids.slice(-limit)
    const messages: MailMessageSummary[] = []
    for await (const message of client.fetch(
      chosen,
      {
        envelope: true,
        flags: true,
        size: true,
        bodyStructure: true,
      },
      { uid: true },
    )) {
      messages.push(summaryOf(message))
    }
    return {
      messages: messages.sort((a, b) => (b.date ?? 0) - (a.date ?? 0)),
      hasMore: uids.length > chosen.length,
    }
  } catch (error) {
    throw new Error(mailErrorMessage(error))
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function setMailSeen(
  provider: MailProvider,
  email: string,
  secret: string,
  uid: number,
  seen: boolean,
): Promise<void> {
  const client = providerClient(provider, email, secret)
  try {
    await client.connect()
    await identifyClient(client, provider)
    await client.mailboxOpen('INBOX', { readOnly: false })
    if (seen) {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
    } else {
      await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
    }
  } catch (error) {
    throw new Error(mailErrorMessage(error))
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function moveMailMessage(
  provider: MailProvider,
  email: string,
  secret: string,
  uid: number,
  target: 'archive' | 'trash',
): Promise<boolean> {
  const client = providerClient(provider, email, secret)
  const archiveNames = /^(archive|archives|all mail|归档|存档|所有邮件)$/i
  const trashNames = /^(trash|deleted messages|deleted items|已删除|已删除邮件|废纸篓)$/i
  try {
    await client.connect()
    await identifyClient(client, provider)
    await client.mailboxOpen('INBOX', { readOnly: false })
    const boxes = await client.list()
    const special = target === 'archive' ? ['\\archive', '\\all'] : ['\\trash']
    const names = target === 'archive' ? archiveNames : trashNames
    const folder =
      boxes.find((box) =>
        special.includes(box.specialUse?.toLowerCase() ?? ''),
      ) ?? boxes.find((box) => names.test(box.name))
    if (!folder) return false
    await client.messageMove(String(uid), folder.path, { uid: true })
    return true
  } catch (error) {
    throw new Error(mailErrorMessage(error))
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function appendMailToSent(
  provider: MailProvider,
  email: string,
  secret: string,
  raw: Buffer,
): Promise<boolean> {
  const client = providerClient(provider, email, secret)
  try {
    await client.connect()
    await identifyClient(client, provider)
    const boxes = await client.list()
    const sent =
      boxes.find((box) => box.specialUse?.toLowerCase() === '\\sent') ??
      boxes.find((box) =>
        /^(sent|sent messages|sent items|已发送|已发送邮件)$/i.test(box.name),
      )
    if (!sent) return false
    await client.append(sent.path, raw, ['\\Seen'])
    return true
  } catch {
    return false
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function fetchMailDetail(
  provider: MailProvider,
  email: string,
  secret: string,
  uid: number,
): Promise<MailFetchedDetail> {
  const client = providerClient(provider, email, secret)
  try {
    await client.connect()
    await identifyClient(client, provider)
    await client.mailboxOpen('INBOX', { readOnly: false })
    const message = await client.fetchOne(
      String(uid),
      { source: true },
      { uid: true },
    )
    if (!message || !('source' in message) || !message.source)
      throw new Error('邮件内容为空。')
    const parsed = await simpleParser(message.source)
    const from = parsed.from?.value?.[0]
    const subject = parsed.subject || '(无主题)'
    const text = parsed.text || ''
    const html = parsed.html
      ? sanitizeHtml(parsed.html, {
          allowedTags: [
            'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u',
            'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
          ],
          disallowedTagsMode: 'discard',
        })
      : undefined
    const detectionText =
      text ||
      (html
        ? sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
        : '')
    const detected = detectVerificationCode(
      subject,
      detectionText,
      parsed.date?.getTime() ?? Date.now(),
    )
    const attachments = parsed.attachments.map((attachment, index) => ({
      part: attachment.cid || `part-${index + 1}`,
      filename:
        attachment.filename ||
        `attachment-${index + 1}.${(attachment.contentType || 'bin').split('/')[1] || 'bin'}`,
      size: attachment.size ?? attachment.content.length,
      ...(attachment.contentType ? { mime: attachment.contentType } : {}),
      data: attachment.content,
    }))
    await client
      .messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      .catch(() => {})
    return {
      subject,
      ...(from?.name ? { fromName: from.name } : {}),
      ...(from?.address ? { fromAddress: from.address } : {}),
      ...(parsed.date ? { date: parsed.date.getTime() } : {}),
      unread: false,
      ...(text ? { bodyText: text } : {}),
      ...(html ? { bodyHtml: html } : {}),
      ...(snippetOf(detectionText)
        ? { snippet: snippetOf(detectionText) }
        : {}),
      ...(detected
        ? {
            code: detected.code,
            ...(detected.expiresAt
              ? { codeExpiresAt: detected.expiresAt }
              : {}),
          }
        : {}),
      attachments,
    }
  } catch (error) {
    throw new Error(mailErrorMessage(error))
  } finally {
    await client.logout().catch(() => {})
  }
}
