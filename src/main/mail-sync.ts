/** IMAP connection probe and inbox unread sync. */
import { ImapFlow } from 'imapflow'
import {
  mailProviderHosts,
  type MailProvider,
} from '../shared/mail'

export type MailProbe = { unread: number }

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
