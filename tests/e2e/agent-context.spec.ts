import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

const sessionId = '22222222-2222-4222-8222-222222222222'

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-context-'))
  const data = join(directory, 'data')
  await mkdir(data, { recursive: true })
  const history = Array.from({ length: 70 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `第 ${index + 1} 轮对话：${'需要保留的历史上下文。'.repeat(160)}`,
  }))
  await writeFile(
    join(data, 'mqmz.agent.json'),
    JSON.stringify({
      version: 2,
      projects: [],
      sessions: [
        {
          id: sessionId,
          title: '长对话',
          mode: 'build',
          model: 'deepseek-flash',
          reasoning: 'high',
          workspace: null,
          projectId: null,
          pinned: false,
          createdAt: 1,
          updatedAt: 2,
          ui: [
            {
              id: 'u1',
              role: 'user',
              parts: [{ type: 'text', text: '这是一段很长的历史对话。' }],
            },
            {
              id: 'a1',
              role: 'assistant',
              parts: [{ type: 'text', text: '好的。' }],
            },
          ],
          history,
          files: [],
          sources: [],
          usage: { input: 0, output: 0 },
        },
      ],
    }),
  )
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

test('compacts a long conversation and shows the context notice', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-context-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await application.evaluate(() => {
    const state = globalThis as unknown as { __mqmzContextBody?: string }
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input)
      if (url.includes('/chat/completions')) {
        state.__mqmzContextBody =
          typeof init?.body === 'string' ? init.body : ''
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { content: '收到' } }] })}`,
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
      return new Response('{}', { status: 503 })
    }
  })
  await agent.getByLabel('给智能体发送指令').fill('继续')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('收到')).toBeVisible({ timeout: 15_000 })
  await expect(agent.locator('.agent-context-notice')).toBeVisible()
  await expect(agent.locator('.agent-context-notice')).toContainText(
    '条消息已压缩为摘要',
  )
  const body = await application.evaluate(
    () =>
      (globalThis as unknown as { __mqmzContextBody?: string })
        .__mqmzContextBody ?? '',
  )
  expect(body).toContain('本会话较早内容的摘要')
  expect(body).toContain('继续')
})

test('retries a failed reply without resending the prompt', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await application.evaluate(() => {
    let attempts = 0
    globalThis.fetch = async (
      input: string | URL | Request,
      _init?: RequestInit,
    ) => {
      if (!String(input).includes('/chat/completions'))
        return new Response('{}', { status: 503 })
      attempts += 1
      if (attempts === 1)
        return new Response(
          JSON.stringify({ error: { message: 'busy' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        )
      return new Response(
        [
          `data: ${JSON.stringify({ choices: [{ delta: { content: '再来一次' } }] })}`,
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
  const usersBefore = await agent.locator('.agent-message.user').count()
  await agent.getByLabel('给智能体发送指令').fill('再来一次检查')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.locator('.agent-error')).toContainText(
    'DeepSeek 服务暂时不可用',
    { timeout: 15_000 },
  )
  const retry = agent.getByRole('button', { name: '重试', exact: true })
  await expect(retry).toBeVisible()
  await retry.click()
  await expect(agent.getByText('再来一次')).toBeVisible({ timeout: 15_000 })
  await expect(retry).toHaveCount(0)
  expect(await agent.locator('.agent-message.user').count()).toBe(
    usersBefore + 1,
  )
})
