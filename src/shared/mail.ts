/** Local mail account and settings types shared by main and renderer. */
export type MailProvider = 'qq' | '163' | 'gmail'
export type MailAccountStatus = 'ready' | 'error'
export type MailAuthType = 'password'
export type MailFolderKind =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'trash'
  | 'junk'
  | 'archive'
  | 'all'
  | 'other'

export type MailFolder = {
  path: string
  name: string
  kind: MailFolderKind
  unread: number
  total: number
}

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
  folders: Record<string, MailFolder[]>
  drafts: MailDraftSummary[]
  config: MailConfig
  busy: boolean
  cacheBytes: number
  error?: string
}

export const mailContactLimit = 50
export const mailSubjectLimit = 500
export const mailBodyLimit = 1_000_000
export const mailAttachmentLimit = 20
export const mailAttachmentTotalLimit = 25 * 1024 * 1024
/** Local drafts are not an IMAP folder; this sentinel switches the panel view. */
export const mailLocalDraftsFolder = '__local_drafts__'

/** Unread badges cap at 99+ so the display never grows without bound. */
export function formatMailBadge(count: number): string {
  const value = Math.max(0, Math.floor(count))
  if (!value) return ''
  return value > 99 ? '99+' : String(value)
}

export type MailContact = {
  name?: string
  address: string
}

function addressPart(value: string): string {
  const match = /<([^>]+)>/.exec(value)
  return (match?.[1] ?? value).trim()
}

export function mailRecipientAddresses(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((item) => addressPart(item))
    .filter(Boolean)
}

export function mailRecipientError(
  value: string,
  required = false,
): string | undefined {
  const text = value.trim()
  if (!text) return required ? '请填写收件人。' : undefined
  if (text.length > 1000) return '收件人地址过长。'
  const addresses = mailRecipientAddresses(text)
  if (!addresses.length) return required ? '请填写收件人。' : undefined
  if (addresses.length > 50) return '收件人数量不能超过 50 个。'
  for (const address of addresses) {
    if (
      address.length > 254 ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)
    )
      return `地址无效：${address}`
  }
  return undefined
}

export const mailDisplayNameLimit = 40

/** App passwords are shown in grouped blocks; mail clients use them unspaced. */
export function normalizeMailSecret(value: string): string {
  return value.replace(/[\s\u00a0]+/g, '')
}

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

export const mailGmailAppPasswordUrl =
  'https://blog.csdn.net/weixin_54689482/article/details/146033946'

export const mailHelpUrls: Record<MailProvider, string> = {
  qq: 'https://wx.mail.qq.com/list/readtemplate?name=app_intro.html#/agreement/authorizationCode',
  '163':
    'https://help.mail.163.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac20c5161d133bdd17d',
  gmail:
    'https://knowledge.workspace.google.com/admin/sync/turn-pop-and-imap-on-or-off-for-users?hl=zh-cn',
}

export const mailSmtpHosts: Record<
  MailProvider,
  { host: string; port: number }
> = {
  qq: { host: 'smtp.qq.com', port: 465 },
  '163': { host: 'smtp.163.com', port: 465 },
  gmail: { host: 'smtp.gmail.com', port: 465 },
}

export type MailAttachmentPick = {
  id: string
  name: string
  size: number
}

export const mailProviderHosts: Record<
  MailProvider,
  { host: string; port: number }
> = {
  qq: { host: 'imap.qq.com', port: 993 },
  '163': { host: 'imap.163.com', port: 993 },
  gmail: { host: 'imap.gmail.com', port: 993 },
}

/** 163 accounts may use either @163.com or @126.com; both are NetEase. */
export function mailImapServer(
  provider: MailProvider,
  email: string,
): { host: string; port: number } {
  if (provider === '163' && email.toLowerCase().endsWith('@126.com'))
    return { host: 'imap.126.com', port: 993 }
  return mailProviderHosts[provider]
}

export function mailSmtpServer(
  provider: MailProvider,
  email: string,
): { host: string; port: number } {
  if (provider === '163' && email.toLowerCase().endsWith('@126.com'))
    return { host: 'smtp.126.com', port: 465 }
  return mailSmtpHosts[provider]
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

export type MailDraftAttachment = {
  path: string
  name: string
  size: number
}

export type MailComposeDraft = {
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  bodyHtml?: string
  attachments?: MailDraftAttachment[]
}

export type MailDraft = {
  id: string
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  bodyText: string
  bodyHtml: string
  attachments: MailDraftAttachment[]
  updatedAt: number
}

export type MailDraftSummary = {
  id: string
  accountId: string
  to: string
  subject: string
  attachmentCount: number
  updatedAt: number
}

export type MailAlert = {
  id: number
  accountId: string
  uid: number
  sender: string
  subject: string
  code?: string
  codeExpiresAt?: number
  attachmentCount: number
}

export type MailComposeState = {
  open: boolean
  accountId?: string
  draftId?: string
  revision: number
  sending: boolean
  draft?: MailComposeDraft
  attachments: MailAttachmentPick[]
  contacts: MailContact[]
  error?: string
}

export type MailPanelState = {
  open: boolean
  accountId?: string
  loading: boolean
  loadingKind?: 'sync' | 'detail' | 'more'
  folder: string
  hasMore: boolean
  query?: string
  messages: MailMessageSummary[]
  drafts?: MailDraftSummary[]
  selected?: MailMessageDetail
  error?: string
  notice?: string
  noticeId?: number
}
