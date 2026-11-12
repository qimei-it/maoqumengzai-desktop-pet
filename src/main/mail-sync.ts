/** IMAP connection probe and inbox unread sync. */
import { ImapFlow } from 'imapflow'
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
export type MailInboxSync = MailProbe & { messages: MailMessageSummary[] }
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
    ...(provider === '163'
      ? {
          clientInfo: {
            name: 'MaoquMengzai',
            version: '0.0.1',
            vendor: 'mqmz',
          },
        }
      : {}),
  })
}

export function mailErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/unsafe login|id required|client.*id|please.*id/i.test(message))
    return '邮箱要求客户端标识，请更换授权码后重试。'
  if (
    /authentication|invalid credentials|login fail|authorization|auth.*failed|invalid.*password/i.test(
      message,
    )
  )
    return '授权码或应用专用密码不正确。'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout|network|socket/i.test(message))
    return '无法连接邮箱服务器，请检查网络。'
  return '邮箱连接失败，请检查账户与授权码。'
}

export async function probeMailAccount(
  provider: MailProvider,
  email: string,
  secret: string,
): Promise<MailProbe> {
  const client = providerClient(provider, email, secret)
  try {
    await client.connect()
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true })
    return { unread: Math.max(0, mailbox.unseen ?? 0) }
  } catch (error) {
    throw new Error(mailErrorMessage(error))
  } finally {
    await client.logout().catch(() => {})
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

export async function syncMailInbox(
  provider: MailProvider,
  email: string,
  secret: string,
): Promise<MailInboxSync> {
  const client = providerClient(provider, email, secret)
  try {
    await client.connect()
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
        const envelope = message.envelope
        const from = envelope?.from?.[0]
        messages.push({
          uid: message.uid,
          subject: envelope?.subject || '(无主题)',
          ...(from?.name ? { fromName: from.name } : {}),
          ...(from?.address ? { fromAddress: from.address } : {}),
          ...(envelope?.date
            ? { date: new Date(envelope.date).getTime() }
            : {}),
          unread: !message.flags?.has('\\Seen'),
          hasAttachments: structureHasAttachments(message.bodyStructure),
        })
      }
    }
    return {
      unread: Math.max(0, mailbox.unseen ?? 0),
      messages: messages.sort((a, b) => (b.date ?? 0) - (a.date ?? 0)),
    }
  } catch (error) {
    throw new Error(mailErrorMessage(error))
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
    await client.mailboxOpen('INBOX', { readOnly: false })
    const message = await client.fetchOne(String(uid), { source: true })
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
    await client.messageFlagsAdd(String(uid), ['\\Seen'])
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
