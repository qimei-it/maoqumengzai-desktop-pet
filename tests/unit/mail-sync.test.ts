import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  mailboxOpen: vi.fn(async () => ({ exists: 4, unseen: 2 })),
  run: vi.fn(async () => ({
    name: 'Coremail Imap',
    vendor: 'Mailtech',
    TransID: 'abc',
  })),
  search: vi.fn(async () => [] as number[]),
  fetch: vi.fn(),
  fetchOne: vi.fn(async () => ({ source: Buffer.from('mail') })),
  list: vi.fn(
    async (): Promise<
      Array<{ path: string; name: string; specialUse?: string }>
    > => [],
  ),
  status: vi.fn(async () => ({ messages: 2, unseen: 1 })),
  move: vi.fn(async () => ({ uidMap: new Map() })),
  deleteFn: vi.fn(async () => true),
  flagsAdd: vi.fn(async () => true),
  flagsRemove: vi.fn(async () => true),
  logout: vi.fn(async () => {}),
  parse: vi.fn(async () => ({
    subject: '登录验证码',
    from: { value: [{ name: 'Example', address: 'security@example.com' }] },
    date: new Date('2026-01-01T08:00:00Z'),
    text: '您的验证码是 123456，5 分钟内有效。',
    html: undefined,
    attachments: [],
  })),
}))

vi.mock('imapflow', () => ({
  ImapFlow: class {
    connect = mocks.connect
    mailboxOpen = mocks.mailboxOpen
    run = mocks.run
    search = mocks.search
    fetch = mocks.fetch
    fetchOne = mocks.fetchOne
    list = mocks.list
    status = mocks.status
    messageMove = mocks.move
    messageDelete = mocks.deleteFn
    messageFlagsAdd = mocks.flagsAdd
    messageFlagsRemove = mocks.flagsRemove
    logout = mocks.logout
  },
}))

vi.mock('mailparser', () => ({
  simpleParser: mocks.parse,
}))

import {
  deleteMailMessages,
  fetchMailDetail,
  fetchMailFolders,
  fetchOlderMailInbox,
  mailErrorMessage,
  moveMailMessage,
  probeMailAccount,
  setMailSeen,
  syncMailInbox,
} from '../../src/main/mail-sync'

describe('mail detail fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('fetches and marks the selected message by UID', async () => {
    const detail = await fetchMailDetail(
      'qq',
      'demo@qq.com',
      'auth-code',
      3013,
    )
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.fetchOne).toHaveBeenCalledWith(
      '3013',
      { source: true },
      { uid: true },
    )
    expect(mocks.flagsAdd).toHaveBeenCalledWith(
      '3013',
      ['\\Seen'],
      { uid: true },
    )
    expect(detail.code).toBe('123456')
    expect(detail.codeExpiresAt).toBe(
      new Date('2026-01-01T08:00:00Z').getTime() + 5 * 60_000,
    )
  })

  test('loads older cached pages by UID', async () => {
    mocks.search.mockResolvedValueOnce([1, 2, 3])
    mocks.fetch.mockImplementationOnce(async function* () {
      yield {
        uid: 3,
        envelope: {
          subject: '旧邮件',
          from: [{ address: 'old@example.com' }],
          date: new Date('2026-01-01T07:00:00Z'),
        },
        flags: new Set(),
        bodyStructure: undefined,
      }
    })
    const result = await fetchOlderMailInbox(
      'gmail',
      'demo@gmail.com',
      'auth-code',
      4,
    )
    expect(mocks.search).toHaveBeenCalledWith({ uid: '1:3' }, { uid: true })
    expect(result.messages[0]).toMatchObject({
      uid: 3,
      subject: '旧邮件',
      fromAddress: 'old@example.com',
    })
    expect(result.hasMore).toBe(false)
  })

  test('syncs the selected folder instead of always INBOX', async () => {
    mocks.mailboxOpen.mockResolvedValueOnce({ exists: 0, unseen: 0 })
    await syncMailInbox(
      'gmail',
      'demo@gmail.com',
      'auth-code',
      '[Gmail]/已删除邮件',
    )
    expect(mocks.mailboxOpen).toHaveBeenCalledWith('[Gmail]/已删除邮件', {
      readOnly: true,
    })
  })

  test('maps IMAP special-use folders to localized categories', async () => {
    mocks.list.mockResolvedValueOnce([
      {
        path: 'INBOX',
        name: 'Inbox',
        specialUse: '\\Inbox',
      },
      {
        path: '[Gmail]/Sent Mail',
        name: 'Sent Mail',
        specialUse: '\\Sent',
      },
      {
        path: '[Gmail]/Trash',
        name: 'Trash',
        specialUse: '\\Trash',
      },
    ])
    const folders = await fetchMailFolders(
      'gmail',
      'demo@gmail.com',
      'auth-code',
    )
    expect(folders.map((folder) => [folder.kind, folder.name])).toEqual([
      ['inbox', '收件箱'],
      ['sent', '已发送'],
      ['trash', '已删除'],
    ])
    expect(folders[0]).toMatchObject({ unread: 1, total: 2 })
  })

  test('moves Gmail mail to All Mail when archiving', async () => {
    mocks.list.mockResolvedValueOnce([
      {
        path: 'INBOX',
        name: 'Inbox',
        specialUse: '\\Inbox',
      },
      {
        path: '[Gmail]/All Mail',
        name: 'All Mail',
        specialUse: '\\All',
      },
    ])
    const moved = await moveMailMessage(
      'gmail',
      'demo@gmail.com',
      'auth-code',
      9,
      'archive',
    )
    expect(moved).toBe(true)
    expect(mocks.move).toHaveBeenCalledWith('9', '[Gmail]/All Mail', {
      uid: true,
    })
  })

  test('updates the seen flag for manual unread state', async () => {
    await setMailSeen('gmail', 'demo@gmail.com', 'auth-code', 5, false)
    expect(mocks.flagsRemove).toHaveBeenCalledWith(
      '5',
      ['\\Seen'],
      { uid: true },
    )
  })

  test('permanently deletes a UID batch in one connection', async () => {
    await deleteMailMessages(
      'gmail',
      'demo@gmail.com',
      'auth-code',
      [7, 8],
      '[Gmail]/Trash',
    )
    expect(mocks.deleteFn).toHaveBeenCalledWith('7,8', { uid: true })
  })

  test('retries a transient network failure once', async () => {
    mocks.connect.mockRejectedValueOnce(
      Object.assign(new Error('connect ETIMEDOUT'), {
        code: 'ETIMEDOUT',
      }),
    )
    const probe = await probeMailAccount(
      'gmail',
      'demo@gmail.com',
      'abcd efgh ijkl mnop',
    )
    expect(probe.unread).toBe(1)
    expect(mocks.connect).toHaveBeenCalledTimes(2)
    expect(mocks.run).not.toHaveBeenCalled()
  })

  test('resends IMAP ID after login for 163 before opening mailboxes', async () => {
    await probeMailAccount('163', 'demo@163.com', 'auth-code')
    expect(mocks.run).toHaveBeenCalledWith('ID', {
      name: 'MaoquMengzai',
      version: '0.0.1',
      vendor: 'mqmz',
    })
    const connectOrder = mocks.connect.mock.invocationCallOrder[0]
    const idOrder = mocks.run.mock.invocationCallOrder[0]
    const openOrder = mocks.mailboxOpen.mock.invocationCallOrder[0]
    expect(idOrder).toBeGreaterThan(connectOrder)
    expect(openOrder).toBeGreaterThan(idOrder)
  })

  test('resends IMAP ID for 163 before fetching message details', async () => {
    await fetchMailDetail('163', 'demo@163.com', 'auth-code', 3013)
    const idOrder = mocks.run.mock.invocationCallOrder[0]
    const openOrder = mocks.mailboxOpen.mock.invocationCallOrder[0]
    const fetchOrder = mocks.fetchOne.mock.invocationCallOrder[0]
    expect(openOrder).toBeGreaterThan(idOrder)
    expect(fetchOrder).toBeGreaterThan(openOrder)
  })
})

describe('mail error mapping', () => {
  test('surfaces Unsafe Login from the IMAP response text', () => {
    const error = Object.assign(new Error('Command failed'), {
      responseStatus: 'NO',
      responseText: 'SELECT Unsafe Login. Please contact kefu@188.com for help',
    })
    expect(mailErrorMessage(error)).toBe(
      '邮箱要求客户端标识，请更换授权码后重试。',
    )
  })

  test('includes a network error code for diagnostics', () => {
    const error = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    })
    expect(mailErrorMessage(error)).toBe(
      '无法连接邮箱服务器（ETIMEDOUT），请检查网络或代理。',
    )
  })

  test('surfaces authentication failures from the response text', () => {
    const error = Object.assign(new Error('Command failed'), {
      responseText: '[AUTHENTICATIONFAILED] Invalid credentials',
    })
    expect(mailErrorMessage(error)).toBe('授权码或应用专用密码不正确。')
  })
})
