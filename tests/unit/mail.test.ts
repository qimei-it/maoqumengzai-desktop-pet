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
    expect(db.listAccounts()).toHaveLength(1)

    db.removeAccount(account.id)
    expect(db.listAccounts()).toHaveLength(0)
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
