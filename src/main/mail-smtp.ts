/** Direct SMTP delivery through the mailbox provider's own server. */
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import nodemailer from 'nodemailer'
import sanitizeHtml from 'sanitize-html'
import {
  mailSmtpHosts,
  type MailAccount,
  type MailProvider,
} from '../shared/mail'
import { appendMailToSent } from './mail-sync'

export type OutgoingAttachment = {
  path: string
  name: string
  size: number
}

export type OutgoingMail = {
  account: MailAccount
  secret: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  bodyHtml?: string
  attachments: OutgoingAttachment[]
}

export type SendMailResult = {
  savedToSent: boolean
}

function errorText(error: unknown): string {
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {}
  return [
    record.message,
    record.code,
    record.responseCode,
    record.response,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .trim() || String(error)
}

export function smtpErrorMessage(error: unknown): string {
  const message = errorText(error)
  if (
    /authentication|invalid.*(?:login|credential|password)|535|534|username|password/i.test(
      message,
    )
  )
    return '授权码或应用专用密码不正确。'
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ECONNRESET|timeout|network|socket/i.test(
      message,
    )
  )
    return '无法连接发件服务器，请检查网络或代理。'
  if (/message size|too large|exceed|552|attachment|file size/i.test(message))
    return '邮件或附件过大，服务商拒绝发送。'
  if (
    /recipient|address|mailbox|550|551|553|554|invalid.*(?:to|email)/i.test(
      message,
    )
  )
    return '收件人地址无效，请检查后重试。'
  return '邮件发送失败，请稍后重试。'
}

export async function sendMailMessage(
  mail: OutgoingMail,
): Promise<SendMailResult> {
  const smtp = mailSmtpHosts[mail.account.provider]
  const from = mail.account.displayName
    ? { name: mail.account.displayName, address: mail.account.email }
    : mail.account.email
  const html = mail.bodyHtml
    ? sanitizeHtml(mail.bodyHtml, {
        allowedTags: [
          'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u',
          'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
        ],
        allowedAttributes: {},
      })
    : undefined
  const mailOptions: nodemailer.SendMailOptions = {
    from,
    to: mail.to,
    ...(mail.cc ? { cc: mail.cc } : {}),
    ...(mail.bcc ? { bcc: mail.bcc } : {}),
    subject: mail.subject || '(无主题)',
    text: mail.body,
    ...(html ? { html } : {}),
    attachments: mail.attachments.map((attachment) => ({
      filename: attachment.name || basename(attachment.path),
      path: attachment.path,
    })),
  }

  try {
    for (const attachment of mail.attachments) {
      const info = await stat(attachment.path)
      if (!info.isFile()) throw new Error('附件不存在。')
    }
  } catch (error) {
    if (error instanceof Error && error.message === '附件不存在。')
      throw error
    throw new Error('附件不存在或无法读取。')
  }

  try {
    const compiler = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    })
    const built = await compiler.sendMail(mailOptions)
    const raw = built.message
    if (!Buffer.isBuffer(raw)) throw new Error('邮件内容构建失败。')
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: true,
      auth: { user: mail.account.email, pass: mail.secret },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,
    })
    await transporter.sendMail({
      envelope: built.envelope as nodemailer.SendMailOptions['envelope'],
      raw,
    })
    const savedToSent = await appendMailToSent(
      mail.account.provider as MailProvider,
      mail.account.email,
      mail.secret,
      raw,
    )
    return { savedToSent }
  } catch (error) {
    throw new Error(smtpErrorMessage(error))
  }
}
