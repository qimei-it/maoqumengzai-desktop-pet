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
  mailHelpUrls,
  mailUnreadTotal,
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
    expect(db.pruneMessages(now - 30 * 86_400_000)).toEqual([
      { accountId: account.id, folder: 'INBOX', uid: 1 },
    ])
    expect(db.listMessages(account.id).map((item) => item.uid)).toEqual([2])
    expect(db.message(account.id, 'INBOX', 1)).toBeUndefined()
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
    db.close()
  })
})

describe('mail unread total', () => {
  test('sums unread counts across accounts', () => {
    expect(mailUnreadTotal([{ unread: 2 }, { unread: 3 }])).toBe(5)
    expect(mailUnreadTotal([])).toBe(0)
  })

  test('uses the official help links for each provider', () => {
    expect(mailHelpUrls.qq).toContain('wx.mail.qq.com')
    expect(mailHelpUrls['163']).toContain('help.mail.163.com')
    expect(mailHelpUrls.gmail).toContain('knowledge.workspace.google.com')
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
