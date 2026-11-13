import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page
let settings: Page
const errors: string[] = []

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-ui-'))
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = join(directory, 'data')
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_QUOTA_DEEPSEEK_URL = 'http://127.0.0.1:1/balance'
  environment.MQMZ_QUOTA_OPENAI_URL = 'http://127.0.0.1:1/usage'
  await mkdir(environment.MQMZ_DATA_DIR, { recursive: true })
  await mkdir(environment.MQMZ_SCREENSHOT_DIR, { recursive: true })
  application = await electron.launch({
    args: [resolve('.')],
    env: environment,
  })
  await waitForAppWindows(application)
  const pages = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  )
  agent = pages.find((item) => item.title.includes('智能体'))!.page
  settings = pages.find((item) => item.title.includes('设置'))!.page
  agent.on('pageerror', (error) => errors.push(error.message))
})

test.afterAll(async () => {
  await application.close()
})

test('agent panel configures, switches mode, and keeps sessions', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await expect(
    agent.getByRole('heading', { name: '连接 DeepSeek', exact: true }),
  ).toBeVisible()
  await agent.getByLabel('DeepSeek API Key').fill('sk-agent-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('对话模型')).toBeVisible()

  await agent.getByLabel('对话模型').selectOption('deepseek-v4-pro')
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.model : ''
    })
    .toBe('deepseek-v4-pro')

  await agent.getByRole('button', { name: '计划', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.mode : ''
    })
    .toBe('plan')

  const before = await agent.evaluate(() => window.mqmz!.snapshot())
  const count = before.ok ? before.value.agent.sessions.length : 0
  await agent.getByRole('button', { name: '新建会话', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.sessions.length : 0
    })
    .toBe(count + 1)

  expect(errors).toEqual([])
})

test('pet profile section exposes create and bind entries', async () => {
  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-open' }),
  )
  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-section', section: 'profile' }),
  )
  await expect(
    settings.getByRole('button', { name: '新建桌宠', exact: true }),
  ).toBeVisible()
  await expect(
    settings.getByRole('button', { name: '绑定小程序', exact: true }),
  ).toBeVisible()
  await settings.getByRole('button', { name: '新建桌宠', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await settings.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.toast : ''
    })
    .toBe('新建桌宠即将开放')
})
