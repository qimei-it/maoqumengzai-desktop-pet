import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  compile: vi.fn(async () => ({
    message: Buffer.from('raw message'),
    envelope: { from: 'me@gmail.com', to: ['you@example.com'] },
  })),
  send: vi.fn(async () => ({ messageId: 'test' })),
  append: vi.fn(async () => true),
}))

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn((options: { streamTransport?: boolean }) =>
      options.streamTransport
        ? { sendMail: mocks.compile }
        : { sendMail: mocks.send },
    ),
  },
}))

vi.mock('../../src/main/mail-sync', () => ({
  appendMailToSent: mocks.append,
}))

import {
  sendMailMessage,
  smtpErrorMessage,
} from '../../src/main/mail-smtp'
import type { MailAccount } from '../../src/shared/mail'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SMTP delivery', () => {
  test('sends the built message and appends it to Sent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-smtp-test-'))
    directories.push(directory)
    const path = join(directory, 'report.txt')
    await writeFile(path, 'hello')
    const account: MailAccount = {
      id: '66c184d9-3c19-4066-9115-14ffadf92a58',
      provider: 'gmail',
      email: 'me@gmail.com',
      displayName: 'Me',
      authType: 'password',
      status: 'ready',
      unread: 0,
      createdAt: 0,
    }
    const result = await sendMailMessage({
      account,
      secret: 'app-password',
      to: 'you@example.com',
      subject: 'Hello',
      body: 'Body',
      attachments: [{ path, name: 'report.txt', size: 5 }],
    })
    expect(result.savedToSent).toBe(true)
    expect(mocks.compile).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'Me', address: 'me@gmail.com' },
        to: 'you@example.com',
        subject: 'Hello',
        text: 'Body',
      }),
    )
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        raw: Buffer.from('raw message'),
        envelope: { from: 'me@gmail.com', to: ['you@example.com'] },
      }),
    )
    expect(mocks.append).toHaveBeenCalledWith(
      'gmail',
      'me@gmail.com',
      'app-password',
      Buffer.from('raw message'),
    )
  })

  test('maps SMTP authentication and network failures', () => {
    expect(
      smtpErrorMessage(
        Object.assign(new Error('Invalid login'), { responseCode: 535 }),
      ),
    ).toBe('授权码或应用专用密码不正确。')
    expect(
      smtpErrorMessage(
        Object.assign(new Error('connect ETIMEDOUT'), {
          code: 'ETIMEDOUT',
        }),
      ),
    ).toBe('无法连接发件服务器，请检查网络或代理。')
    expect(
      smtpErrorMessage(new Error('Message size exceeds fixed maximum')),
    ).toBe('邮件或附件过大，服务商拒绝发送。')
    expect(smtpErrorMessage(new Error('550 Invalid recipient'))).toBe(
      '收件人地址无效，请检查后重试。',
    )
  })
})
