import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-actions-'))
  const data = join(directory, 'data')
  await mkdir(data, { recursive: true })
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = data
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_QUOTA_DEEPSEEK_URL = 'http://127.0.0.1:1/balance'
  environment.MQMZ_QUOTA_OPENAI_URL = 'http://127.0.0.1:1/usage'
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
})

test.afterAll(async () => {
  await application.close()
})

test('edits and regenerates a turn', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-message-action-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toBeVisible()
  await application.evaluate(() => {
    let replies = 0
    globalThis.fetch = async (input: string | URL | Request) => {
      if (!String(input).includes('/chat/completions'))
        return new Response('{}', { status: 503 })
      replies += 1
      return new Response(
        [
          `data: ${JSON.stringify({ choices: [{ delta: { content: `回答 ${replies}` } }] })}`,
          '',
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
          '',
          'data: [DONE]',
          '',
          '',
        ].join('\n'),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    }
  })

  await agent.getByLabel('给智能体发送指令').fill('原始问题')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('回答 1')).toBeVisible({ timeout: 15_000 })

  await agent
    .locator('.agent-message.user')
    .filter({ hasText: '原始问题' })
    .getByRole('button', { name: '编辑并重发' })
    .click()
  await expect(agent.getByRole('dialog', { name: '编辑消息' })).toBeVisible()
  await agent.getByLabel('消息内容').fill('修改后的问题')
  await agent.getByRole('button', { name: '保存并发送' }).click()
  await expect(
    agent.locator('.agent-message').getByText('修改后的问题'),
  ).toBeVisible()
  await expect(
    agent.locator('.agent-message').getByText('原始问题'),
  ).toHaveCount(0)
  await expect(
    agent.locator('.agent-message').getByText('回答 1'),
  ).toHaveCount(0)
  await expect(agent.getByText('回答 2')).toBeVisible({ timeout: 15_000 })
  await expect(agent.locator('.agent-message.user')).toHaveCount(1)

  await agent
    .locator('.agent-message.assistant')
    .last()
    .getByRole('button', { name: '重新生成' })
    .click()
  await expect(agent.getByText('回答 3')).toBeVisible({ timeout: 15_000 })
  await expect(
    agent.locator('.agent-message').getByText('回答 2'),
  ).toHaveCount(0)
  await expect(agent.locator('.agent-message.user')).toHaveCount(1)
  await expect(
    agent.locator('.agent-message').getByText('修改后的问题'),
  ).toBeVisible()
})
