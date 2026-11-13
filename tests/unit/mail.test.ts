import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, test } from 'vitest'
import { MailDatabase } from '../../src/main/mail-db'
import {
  defaultMailConfig,
  loadMailConfig,
  saveMailConfig,
} from '../../src/main/mail-config'
import {
  mailAccountLabel,
  mailDisplayNameError,
  mailDisplayNameLimit,
  mailGmailAppPasswordUrl,
  mailHelpUrls,
  mailRecipientError,
  mailUnreadTotal,
  formatMailBadge,
  normalizeMailSecret,
} from '../../src/shared/mail'

const directories: string[] = []

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-mail-test-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('mail database', () => {
  test('adds, updates, deduplicates and removes accounts', async () => {
    const directory = await tempDirectory()
    const db = new MailDatabase(join(directory, 'mail.db'))
    const account = db.addAccount({
      provider: 'qq',
      email: 'user@qq.com',
      displayName: 'QQ',
    })
    expect(account.status).toBe('ready')
    expect(account.unread).toBe(0)
    expect(db.listAccounts()).toHaveLength(1)

    db.updateAccount(account.id, {
      status: 'error',
      unread: 3,
      error: '授权失效',
      lastSyncAt: 123,
    })
    expect(db.account(account.id)).toMatchObject({
      status: 'error',
      unread: 3,
      error: '授权失效',
      lastSyncAt: 123,
    })

    const same = db.addAccount({ provider: 'qq', email: 'user@qq.com' })
    expect(same.id).toBe(account.id)
    const secondQq = db.addAccount({ provider: 'qq', email: 'two@qq.com' })
    const gmail = db.addAccount({ provider: 'gmail', email: 'user@gmail.com' })
    expect(secondQq.id).not.toBe(account.id)
    expect(gmail.id).not.toBe(account.id)
    expect(db.listAccounts()).toHaveLength(3)

    db.removeAccount(account.id)
    expect(db.listAccounts()).toHaveLength(2)
    db.removeAccount(secondQq.id)
    db.removeAccount(gmail.id)
    expect(db.listAccounts()).toHaveLength(0)
    db.close()
  })


  test('prunes cached messages older than the retention window', async () => {
    const directory = await tempDirectory()
    const db = new MailDatabase(join(directory, 'mail.db'))
    const account = db.addAccount({ provider: 'qq', email: 'old@qq.com' })
    const now = Date.now()
    db.upsertMessages(account.id, 'INBOX', [
      {
        uid: 1,
        subject: '旧缓存',
        date: now - 40 * 86_400_000,
        unread: false,
        hasAttachments: true,
      },
      {
        uid: 2,
        subject: '新缓存',
        date: now - 2 * 86_400_000,
        unread: false,
        hasAttachments: false,
      },
    ])
    db.saveMessageDetail(account.id, 'INBOX', 1, {
      bodyText: '旧正文',
      code: '123456',
      attachments: [
        {
          part: 'part-1',
          filename: 'old.txt',
          size: 3,
          localPath: '/tmp/old.txt',
        },
      ],
    })
    expect(db.pruneMessages(now - 30 * 86_400_000, 0)).toEqual([
      { accountId: account.id, folder: 'INBOX', uid: 1 },
    ])
    expect(db.listMessages(account.id).map((item) => item.uid)).toEqual([2])
    expect(db.message(account.id, 'INBOX', 1)).toBeUndefined()
    db.close()
  })

  test('keeps the newest page when a folder is older than retention', async () => {
    const directory = await tempDirectory()
    const db = new MailDatabase(join(directory, 'mail.db'))
    const account = db.addAccount({ provider: '163', email: 'sent@163.com' })
    const now = Date.now()
    db.upsertMessages(
      account.id,
      '已发送',
      Array.from({ length: 52 }, (_, index) => ({
        uid: 100 + index,
        subject: `旧邮件 ${index}`,
        date: now - (400 + index) * 86_400_000,
        unread: false,
        hasAttachments: false,
      })),
    )
    const removed = db.pruneMessages(now - 30 * 86_400_000, 50)
    expect(removed).toHaveLength(2)
    expect(db.countMessages(account.id, '已发送')).toBe(50)
    db.close()
  })

  test('stores and orders IMAP folder categories', async () => {
    const directory = await tempDirectory()
    const db = new MailDatabase(join(directory, 'mail.db'))
    const account = db.addAccount({ provider: 'gmail', email: 'f@gmail.com' })
    db.replaceFolders(account.id, [
      {
        path: '[Gmail]/Trash',
        name: '已删除',
        kind: 'trash',
        unread: 0,
        total: 3,
      },
      {
        path: 'INBOX',
        name: '收件箱',
        kind: 'inbox',
        unread: 2,
        total: 8,
      },
      {
        path: '[Gmail]/Sent Mail',
        name: '已发送',
        kind: 'sent',
        unread: 0,
        total: 4,
      },
    ])
    expect(db.listFolders(account.id).map((folder) => folder.kind)).toEqual([
      'inbox',
      'sent',
      'trash',
    ])
    expect(db.listFolders(account.id)[0]).toMatchObject({
      path: 'INBOX',
      name: '收件箱',
      unread: 2,
      total: 8,
    })
    db.close()
  })

  test('stores drafts with attachments and removes them', async () => {
    const directory = await tempDirectory()
    const db = new MailDatabase(join(directory, 'mail.db'))
    const account = db.addAccount({ provider: '163', email: 'd@163.com' })
    const draft = db.saveDraft({
      id: 'b84f3e6a-1b1a-4c2a-9d63-2f0f3f6b8d10',
      accountId: account.id,
      to: 'you@example.com',
      cc: '',
      bcc: '',
      subject: '草稿主题',
      bodyText: '正文',
      bodyHtml: '<div>正文</div>',
      attachments: [
        { path: '/tmp/report.pdf', name: 'report.pdf', size: 12 },
      ],
    })
    expect(draft.subject).toBe('草稿主题')
    expect(db.listDrafts(account.id)[0]).toMatchObject({
      id: draft.id,
      to: 'you@example.com',
      subject: '草稿主题',
      attachmentCount: 1,
    })
    expect(db.draft(draft.id)?.attachments[0].name).toBe('report.pdf')
    db.removeDraft(draft.id)
    expect(db.listDrafts()).toHaveLength(0)
    db.close()
  })

  test('searches cached messages and tracks older pages', async () => {
    const directory = await tempDirectory()
    const db = new MailDatabase(join(directory, 'mail.db'))
    const account = db.addAccount({ provider: 'gmail', email: 'c@gmail.com' })
    db.upsertMessages(account.id, 'INBOX', [
      {
        uid: 2,
        subject: '验证码邮件',
        fromName: 'Example',
        fromAddress: 'security@example.com',
        date: 2,
        snippet: '登录验证码',
        unread: false,
        hasAttachments: false,
      },
      {
        uid: 1,
        subject: '账单',
        fromName: 'Example',
        fromAddress: 'billing@example.com',
        date: 1,
        snippet: '本月账单',
        unread: false,
        hasAttachments: false,
      },
    ])
    expect(db.countMessages(account.id)).toBe(2)
    expect(db.oldestUid(account.id)).toBe(1)
    expect(db.searchMessages(account.id, 'INBOX', '验证码')).toHaveLength(1)
    expect(db.searchMessages(account.id, 'INBOX', 'billing')).toHaveLength(1)
    expect(db.searchMessages(account.id, 'INBOX', '不存在')).toHaveLength(0)
    db.close()
  })

  test('marks older codes from the same sender as superseded', async () => {
    const directory = await tempDirectory()
    const db = new MailDatabase(join(directory, 'mail.db'))
    const account = db.addAccount({ provider: 'gmail', email: 'b@gmail.com' })
    db.upsertMessages(account.id, 'INBOX', [
      {
        uid: 1,
        subject: '验证码 111111',
        fromAddress: 'security@example.com',
        date: 1000,
        unread: false,
        hasAttachments: false,
      },
      {
        uid: 2,
        subject: '验证码 222222',
        fromAddress: 'security@example.com',
        date: 2000,
        unread: false,
        hasAttachments: false,
      },
    ])
    db.saveMessageDetail(account.id, 'INBOX', 1, {
      bodyText: '验证码 111111',
      code: '111111',
      attachments: [],
    })
    db.saveMessageDetail(account.id, 'INBOX', 2, {
      bodyText: '验证码 222222',
      code: '222222',
      codeExpiresAt: Date.now() + 60_000,
      attachments: [],
    })
    expect(db.message(account.id, 'INBOX', 1)?.codeSuperseded).toBe(true)
    expect(db.message(account.id, 'INBOX', 2)?.codeSuperseded).toBeUndefined()
    expect(db.message(account.id, 'INBOX', 2)?.codeExpiresAt).toBeGreaterThan(
      Date.now(),
    )
    db.close()
  })

  test('stores message summaries, details, codes and attachments', async () => {
    const directory = await tempDirectory()
    const db = new MailDatabase(join(directory, 'mail.db'))
    const account = db.addAccount({ provider: 'gmail', email: 'a@gmail.com' })
    db.upsertMessages(account.id, 'INBOX', [
      {
        uid: 2,
        subject: '验证码',
        fromAddress: 'noreply@example.com',
        date: 2,
        unread: true,
        hasAttachments: true,
      },
      {
        uid: 1,
        subject: '旧邮件',
        date: 1,
        unread: false,
        hasAttachments: false,
      },
    ])
    expect(db.listMessages(account.id).map((item) => item.uid)).toEqual([2, 1])
    db.saveMessageDetail(account.id, 'INBOX', 2, {
      bodyText: '验证码 123456',
      code: '123456',
      attachments: [
        {
          part: 'part-1',
          filename: 'a.txt',
          size: 3,
          localPath: '/tmp/a.txt',
        },
      ],
    })
    expect(db.message(account.id, 'INBOX', 2)).toMatchObject({
      bodyText: '验证码 123456',
      code: '123456',
      attachments: [{ filename: 'a.txt', localPath: '/tmp/a.txt' }],
    })
    db.setUnread(account.id, 'INBOX', 2, false)
    expect(db.message(account.id, 'INBOX', 2)?.unread).toBe(false)
    db.clearDetails()
    expect(db.message(account.id, 'INBOX', 2)).toMatchObject({
      attachments: [],
    })
    expect(db.message(account.id, 'INBOX', 2)?.bodyText).toBeUndefined()
    expect(db.message(account.id, 'INBOX', 2)?.code).toBeUndefined()
    db.removeMessage(account.id, 'INBOX', 2)
    expect(db.listMessages(account.id).map((item) => item.uid)).toEqual([1])
    expect(db.message(account.id, 'INBOX', 2)).toBeUndefined()
    db.close()
  })
})

describe('mail unread total', () => {
  test('sums unread counts across accounts', () => {
    expect(mailUnreadTotal([{ unread: 2 }, { unread: 3 }])).toBe(5)
    expect(mailUnreadTotal([])).toBe(0)
  })

  test('caps the unread badge at 99+', () => {
    expect(formatMailBadge(0)).toBe('')
    expect(formatMailBadge(1)).toBe('1')
    expect(formatMailBadge(99)).toBe('99')
    expect(formatMailBadge(100)).toBe('99+')
    expect(formatMailBadge(1200)).toBe('99+')
  })

  test('uses the official help links for each provider', () => {
    expect(mailHelpUrls.qq).toContain('wx.mail.qq.com')
    expect(mailHelpUrls['163']).toContain('help.mail.163.com')
    expect(mailHelpUrls.gmail).toContain('knowledge.workspace.google.com')
    expect(mailGmailAppPasswordUrl).toContain(
      'blog.csdn.net/weixin_54689482/article/details/146033946',
    )
  })

  test('validates recipient lists', () => {
    expect(mailRecipientError('a@example.com', true)).toBeUndefined()
    expect(
      mailRecipientError('Me <a@example.com>, b@example.com'),
    ).toBeUndefined()
    expect(mailRecipientError('', true)).toContain('收件人')
    expect(mailRecipientError('not-an-address', true)).toContain('地址无效')
    expect(mailRecipientError('a@example.com', false)).toBeUndefined()
  })

  test('removes spaces from Google app passwords', () => {
    expect(normalizeMailSecret('abcd efgh ijkl mnop')).toBe(
      'abcdefghijklmnop',
    )
    expect(normalizeMailSecret('abcd\u00a0efgh\nijkl\tmnop')).toBe(
      'abcdefghijklmnop',
    )
  })

  test('validates display name length and control characters', () => {
    expect(mailDisplayNameError('')).toBeUndefined()
    expect(mailDisplayNameError('   ')).toBeUndefined()
    expect(mailDisplayNameError('  麻薯  ')).toBeUndefined()
    expect(
      mailDisplayNameError('麻'.repeat(mailDisplayNameLimit)),
    ).toBeUndefined()
    expect(
      mailDisplayNameError('😀'.repeat(mailDisplayNameLimit)),
    ).toBeUndefined()
    expect(
      mailDisplayNameError('麻'.repeat(mailDisplayNameLimit + 1)),
    ).toContain('40')
    expect(mailDisplayNameError('麻薯\u0000')).toContain('控制字符')
    expect(mailDisplayNameError('麻薯\u200b')).toContain('控制字符')
    expect(mailDisplayNameError('👨‍👩‍👧‍👦')).toBeUndefined()
  })

  test('labels accounts with display name and address', () => {
    expect(
      mailAccountLabel({ email: 'a@qq.com', displayName: '麻薯的QQ' }),
    ).toBe('麻薯的QQ（a@qq.com）')
    expect(mailAccountLabel({ email: 'a@qq.com' })).toBe('a@qq.com')
    expect(
      mailAccountLabel({ email: 'a@qq.com', displayName: '  ' }),
    ).toBe('a@qq.com')
  })
})

describe('mail config', () => {
  test('uses the requested attachment directory by default', () => {
    const downloads = join('/tmp', 'Downloads')
    const config = defaultMailConfig(downloads)
    expect(config.attachmentDir).toBe(
      join(downloads, 'maoqumengzai', 'attachments'),
    )
    expect(config.syncMinutes).toBe(15)
    expect(config.retentionDays).toBe(90)
  })

  test('round-trips config and falls back on malformed files', async () => {
    const directory = await tempDirectory()
    const path = join(directory, 'mail.json')
    const downloads = join(directory, 'Downloads')
    const config = {
      ...defaultMailConfig(downloads),
      syncMinutes: 5,
      notify: false,
      retentionDays: 30,
    }
    await saveMailConfig(path, config)
    expect(await loadMailConfig(path, downloads)).toEqual(config)
    await writeFile(path, '{broken', 'utf8')
    expect(await loadMailConfig(path, downloads)).toEqual(
      defaultMailConfig(downloads),
    )
  })
})
