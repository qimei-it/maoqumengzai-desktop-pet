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

export const mailProviderLabels: Record<MailProvider, string> = {
  qq: 'QQ 邮箱',
  '163': '网易邮箱',
  gmail: 'Gmail',
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
