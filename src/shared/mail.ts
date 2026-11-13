/** Local mail account and settings types shared by main and renderer. */
export type MailProvider = 'qq' | '163' | 'gmail'
export type MailAccountStatus = 'ready' | 'error'
export type MailAuthType = 'password'

export type MailAccount = {
  id: string
  provider: MailProvider
  email: string
  displayName?: string
  authType: MailAuthType
  status: MailAccountStatus
  unread: number
  lastSyncAt?: number
  error?: string
  createdAt: number
}

export type MailConfig = {
  syncMinutes: number
  notify: boolean
  unreadBadge: boolean
  attachmentDir: string
  retentionDays: number
}

export type MailState = {
  accounts: MailAccount[]
  config: MailConfig
  busy: boolean
  error?: string
}

export const mailDisplayNameLimit = 40

/** Returns a user-facing error for an invalid display name, if any. */
export function mailDisplayNameError(value: string): string | undefined {
  const name = value.trim()
  if (!name) return undefined
  if (/[\u0000-\u001f\u007f-\u009f\u200b\ufeff]/.test(name))
    return '显示名称不能包含控制字符。'
  if (Array.from(name).length > mailDisplayNameLimit)
    return `显示名称不能超过 ${mailDisplayNameLimit} 个字符。`
  return undefined
}

export const mailProviderLabels: Record<MailProvider, string> = {
  qq: 'QQ 邮箱',
  '163': '网易邮箱',
  gmail: 'Gmail',
}

export const mailHelpUrls: Record<MailProvider, string> = {
  qq: 'https://wx.mail.qq.com/list/readtemplate?name=app_intro.html#/agreement/authorizationCode',
  '163':
    'https://help.mail.163.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac20c5161d133bdd17d',
  gmail:
    'https://knowledge.workspace.google.com/admin/sync/turn-pop-and-imap-on-or-off-for-users?hl=zh-cn',
}

export const mailProviderHosts: Record<
  MailProvider,
  { host: string; port: number }
> = {
  qq: { host: 'imap.qq.com', port: 993 },
  '163': { host: 'imap.163.com', port: 993 },
  gmail: { host: 'imap.gmail.com', port: 993 },
}

export const mailSyncOptions = [5, 10, 15, 30, 45, 60] as const
export const mailRetentionOptions = [30, 90, 180, 0] as const

export function mailUnreadTotal(
  accounts: ReadonlyArray<Pick<MailAccount, 'unread'>>,
): number {
  return accounts.reduce(
    (total, account) => total + Math.max(0, account.unread),
    0,
  )
}

export function mailAccountLabel(
  account: Pick<MailAccount, 'email' | 'displayName'>,
): string {
  const name = account.displayName?.trim()
  return name ? `${name}（${account.email}）` : account.email
}

export type MailMessageSummary = {
  uid: number
  subject: string
  fromName?: string
  fromAddress?: string
  date?: number
  unread: boolean
  hasAttachments: boolean
  snippet?: string
}

export type MailAttachmentInfo = {
  part: string
  filename: string
  size: number
  mime?: string
  localPath?: string
}

export type MailMessageDetail = MailMessageSummary & {
  bodyText?: string
  bodyHtml?: string
  attachments: MailAttachmentInfo[]
  code?: string
  codeExpiresAt?: number
  codeSuperseded?: boolean
}

export type MailPanelState = {
  open: boolean
  accountId?: string
  loading: boolean
  messages: MailMessageSummary[]
  selected?: MailMessageDetail
  error?: string
  notice?: string
  noticeId?: number
}
