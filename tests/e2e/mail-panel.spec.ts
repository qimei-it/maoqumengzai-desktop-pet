import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { MailDatabase } from '../../src/main/mail-db'

let application: ElectronApplication
let pet: Page
let mail: Page
let compose: Page
let settings: Page
let directory: string
let accountId: string
let backupAccountId: string
let attachmentDir: string
let attachmentPath: string
const messageBody = '您的验证码是 333333，10 分钟内有效。'

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-mail-panel-'))
  const data = join(directory, 'data')
  attachmentDir = join(directory, 'attachments')
  await mkdir(data, { recursive: true })
  await mkdir(attachmentDir, { recursive: true })
  const db = new MailDatabase(join(data, 'mqmz.mail.db'))
  const account = db.addAccount({
    provider: 'qq',
    email: 'demo@qq.com',
    displayName: '测试邮箱',
  })
  accountId = account.id
  db.updateAccount(accountId, { unread: 1 })
  db.replaceFolders(accountId, [
    {
      path: 'INBOX',
      name: '收件箱',
      kind: 'inbox',
      unread: 1,
      total: 2,
    },
    {
      path: 'Sent',
      name: '已发送',
      kind: 'sent',
      unread: 0,
      total: 0,
    },
  ])
  await new Promise((resolve) => setTimeout(resolve, 5))
  backupAccountId = db.addAccount({
    provider: 'gmail',
    email: 'backup@qq.com',
    displayName: '备用邮箱',
  }).id
  const now = Date.now()
  db.upsertMessages(accountId, 'INBOX', [
    {
      uid: 2,
      subject: '最新验证码',
      fromName: 'Example',
      fromAddress: 'security@example.com',
      date: now,
      snippet: '您的验证码是 333333',
      unread: true,
      hasAttachments: true,
    },
    {
      uid: 1,
      subject: '旧验证码',
      fromName: 'Example',
      fromAddress: 'security@example.com',
      date: now - 60 * 60_000,
      snippet: '验证码 222222',
      unread: false,
      hasAttachments: false,
    },
  ])
  const cacheDir = join(data, 'mail-cache', accountId, 'INBOX', '2')
  await mkdir(cacheDir, { recursive: true })
  attachmentPath = join(cacheDir, '1-report.txt')
  await writeFile(attachmentPath, 'attachment body')
  db.saveMessageDetail(accountId, 'INBOX', 2, {
    bodyText: messageBody,
    code: '333333',
    codeExpiresAt: now + 10 * 60_000,
    attachments: [
      {
        part: 'part-1',
        filename: '报告.txt',
        size: 15,
        mime: 'text/plain',
        localPath: attachmentPath,
      },
    ],
  })
  db.saveMessageDetail(accountId, 'INBOX', 1, {
    bodyText: '验证码 222222',
    code: '222222',
    attachments: [],
  })
  db.close()
  await writeFile(
    join(data, 'mqmz.mail.json'),
    JSON.stringify({
      version: 1,
      syncMinutes: 60,
      notify: false,
      unreadBadge: true,
      attachmentDir,
      retentionDays: 90,
    }),
  )
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = data
  delete environment.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    args: [resolve('.')],
    env: environment,
  })
  await expect.poll(() => application.windows().length).toBe(23)
  const windows = await Promise.all(
    application.windows().map(async (page) => ({
      page,
      title: await page.title(),
    })),
  )
  pet = windows.find((item) => item.title.includes('交互标记'))!.page
  mail = windows.find((item) => item.title.includes('邮件'))!.page
  compose = windows.find((item) => item.title.includes('撰写'))!.page
  settings = windows.find((item) => item.title.includes('设置'))!.page
})

test.afterAll(async () => {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
})

test('邮件面板显示缓存正文、验证码与附件并可保存', async () => {
  await pet.evaluate(
    (id) => window.mqmz!.command({ type: 'mail-open', accountId: id }),
    accountId,
  )
  await expect(mail.locator('.mail-surface')).toBeVisible()
  await expect(mail.locator('.mail-message')).toHaveCount(2)
  await expect(mail.locator('.mail-account.active')).toContainText(
    '测试邮箱（demo@qq.com）',
  )
  await expect(
    mail.getByRole('button', { name: '添加邮箱账户' }),
  ).toBeVisible()
  await expect(
    mail.getByRole('button', { name: '刷新邮件' }),
  ).toBeVisible()
  await expect(mail.locator('.mail-refresh')).toHaveCount(0)
  await expect(mail.locator('.mail-folder')).toHaveCount(2)
  await expect(mail.locator('.mail-folder')).toHaveText([
    '收件箱1',
    '已发送',
  ])
  await mail.locator('.mail-folder', { hasText: '已发送' }).click()
  await expect(mail.locator('.mail-folder.active')).toContainText('已发送')
  await expect(mail.locator('.mail-message')).toHaveCount(0)
  await mail.locator('.mail-folder', { hasText: '收件箱' }).click()
  await expect(mail.locator('.mail-message')).toHaveCount(2)
  const movedBounds = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('邮件'),
    )!
    const bounds = window.getBounds()
    window.setPosition(bounds.x + 40, bounds.y + 30)
    return { ...window.getBounds() }
  })
  await mail.locator('.mail-account').first().click()
  await expect(mail.locator('.mail-message')).toHaveCount(2)
  const keptBounds = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('邮件'),
    )!
    return { ...window.getBounds() }
  })
  expect(keptBounds.x).toBe(movedBounds.x)
  expect(keptBounds.y).toBe(movedBounds.y)
  await expect(
    mail.getByRole('button', { name: '新建邮件' }),
  ).toBeEnabled()
  await expect(mail.locator('.mail-unread')).toHaveText('1')
  await expect(mail.locator('.mail-error')).toContainText(
    '授权已失效，请重新授权。',
  )
  await expect(
    mail.locator('.mail-error').getByRole('button', {
      name: '重新授权',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    mail.locator('.mail-error').getByRole('button', {
      name: '重试',
      exact: true,
    }),
  ).toBeVisible()

  await mail.locator('.mail-message', { hasText: '最新验证码' }).click()
  await expect(mail.locator('.mail-reader h2')).toHaveText('最新验证码')
  await expect(mail.locator('.mail-text')).toContainText('333333')
  await expect(mail.locator('.mail-code')).toHaveText('333333')
  await expect(mail.locator('.mail-code-note')).toContainText('有效期至')
  await expect(mail.locator('.mail-unread')).toHaveCount(0)
  for (const name of ['回复', '转发', '归档', '删除']) {
    await expect(
      mail.getByRole('button', { name, exact: true }),
    ).toBeVisible()
  }

  await mail.getByRole('button', { name: '回复', exact: true }).click()
  await expect(compose.locator('.compose-surface')).toBeVisible()
  await expect(
    compose
      .locator('.compose-field', { hasText: '收件人' })
      .locator('input'),
  ).toHaveValue('security@example.com')
  await expect(
    compose
      .locator('.compose-field', { hasText: '主题' })
      .locator('input'),
  ).toHaveValue('Re: 最新验证码')
  await expect(compose.locator('.compose-content')).toContainText(
    '----- 原邮件 -----',
  )
  await compose.getByRole('button', { name: '取消', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.mailCompose.open : true
    })
    .toBe(false)

  await mail.getByRole('button', { name: '转发', exact: true }).click()
  await expect(compose.locator('.compose-surface')).toBeVisible()
  await expect(
    compose
      .locator('.compose-field', { hasText: '收件人' })
      .locator('input'),
  ).toHaveValue('')
  await expect(
    compose
      .locator('.compose-field', { hasText: '主题' })
      .locator('input'),
  ).toHaveValue('Fwd: 最新验证码')
  await compose.getByRole('button', { name: '取消', exact: true }).click()

  await expect(mail.locator('.mail-attachment-summary')).toHaveText(
    '1 个附件 · 15 B',
  )
  await mail.locator('.mail-attachments').getByRole('button', {
    name: '保存',
    exact: true,
  }).click()
  await expect(mail.locator('.toast-item.toast-success')).toContainText(
    '已保存到',
  )
  await expect
    .poll(async () => {
      const { readdir } = await import('node:fs/promises')
      return readdir(attachmentDir)
    })
    .toContain('报告.txt')

  await mail.locator('.mail-message', { hasText: '旧验证码' }).click()
  await expect(mail.locator('.mail-code')).toHaveText('222222')
  await expect(mail.locator('.mail-code-note')).toHaveText(
    '已被新验证码替代',
  )
  await expect(mail.locator('.mail-code')).toBeDisabled()
  await expect(mail.locator('.mail-loading')).toHaveCount(0)
  await expect(
    mail.getByRole('button', { name: '标记未读', exact: true }),
  ).toBeVisible()

  await mail.getByLabel('搜索邮件').fill('旧验证码')
  await expect(mail.locator('.mail-message')).toHaveCount(1)
  await expect(mail.locator('.mail-message')).toContainText('旧验证码')
  await mail.getByLabel('搜索邮件').fill('')
  await expect(mail.locator('.mail-message')).toHaveCount(2)

  await mail.getByRole('button', { name: '新建邮件' }).click()
  await expect(compose.locator('.compose-surface')).toBeVisible()
  await expect(
    compose.getByRole('heading', { name: '新邮件', exact: true }),
  ).toBeVisible()
  await expect(
    compose.getByRole('button', { name: '加粗', exact: true }),
  ).toBeVisible()
  await expect(
    compose.locator('#mail-contact-options option'),
  ).not.toHaveCount(0)
  await compose.getByRole('button', { name: '发送', exact: true }).click()
  await expect(
    compose.locator('.toast-item.toast-error').last(),
  ).toContainText('请填写收件人')
  await application.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    })
  }, attachmentPath)
  await compose
    .getByRole('button', { name: '添加附件', exact: true })
    .click()
  await expect(compose.locator('.compose-attachments')).toContainText(
    '1-report.txt',
  )
  await compose.getByRole('button', { name: '取消', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.mailCompose.open : true
    })
    .toBe(false)
})

test('添加或编辑账户时隐藏账户卡片', async () => {
  await pet.evaluate(() =>
    window.mqmz!.command({ type: 'settings-section', section: 'mail' }),
  )
  await expect(settings.locator('.mail-account')).toHaveCount(2)
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.mail.cacheBytes : 0
    })
    .toBeGreaterThan(0)
  const clearCache = settings
    .locator('.mail-row', { hasText: '附件缓存' })
    .getByRole('button', { name: '清理', exact: true })
  await expect(clearCache).toBeEnabled()
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    })
  })
  await clearCache.click()
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.mail.cacheBytes : -1
    })
    .toBe(0)
  await settings
    .locator('.mail-row', { hasText: '邮箱账户' })
    .getByRole('button', { name: '添加', exact: true })
    .click()
  await expect(settings.locator('.mail-account')).toHaveCount(0)
  await settings.getByRole('button', { name: '取消', exact: true }).click()
  await expect(settings.locator('.mail-account')).toHaveCount(2)
  await settings
    .locator('.mail-account')
    .first()
    .getByRole('button', { name: '重新授权' })
    .click()
  await expect(settings.locator('.mail-account')).toHaveCount(0)
  await settings.getByRole('button', { name: '取消', exact: true }).click()
  await expect(settings.locator('.mail-account')).toHaveCount(2)
  await pet.evaluate(() =>
    window.mqmz!.command({ type: 'settings-close' }),
  )
})

test('删除当前账户后切换到下一个账户，删除全部后关闭邮件面板', async () => {
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    })
  })
  await pet.evaluate(
    (id) => window.mqmz!.command({ type: 'mail-remove-account', accountId: id }),
    accountId,
  )
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.mailPanel.accountId : undefined
    })
    .toBe(backupAccountId)
  await expect(mail.locator('.mail-account.active')).toContainText(
    '备用邮箱',
  )
  await pet.evaluate(
    (id) => window.mqmz!.command({ type: 'mail-remove-account', accountId: id }),
    backupAccountId,
  )
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.mailPanel.open : true
    })
    .toBe(false)
})
