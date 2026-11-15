import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-web-'))
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

test('searches the web and cites the source', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-web-tool-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toBeVisible()
  await application.evaluate(() => {
    const state = globalThis as unknown as {
      __mqmzChatBodies: string[]
      __mqmzSearchBody: string
    }
    state.__mqmzChatBodies = []
    state.__mqmzSearchBody = ''
    let calls = 0
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input)
      if (url.includes('/v1/tools/search')) {
        state.__mqmzSearchBody =
          typeof init?.body === 'string' ? init.body : ''
        return new Response(
          JSON.stringify({
            results: [
              {
                title: '毛趣萌仔官网',
                url: 'https://example.com/pet',
                summary: '桌宠介绍',
                date: null,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (!url.includes('/chat/completions'))
        return new Response('{}', { status: 503 })
      const body = typeof init?.body === 'string' ? init.body : ''
      if (body.includes('会话标题生成器'))
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { content: '联网搜索测试' } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      state.__mqmzChatBodies.push(body)
      calls += 1
      if (calls === 1)
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'web_search', arguments: JSON.stringify({ query: '毛趣萌仔' }) } }] } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      return new Response(
        [
          `data: ${JSON.stringify({ choices: [{ delta: { content: '参考 [毛趣萌仔官网](https://example.com/pet)。' } }] })}`,
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

  await agent.getByLabel('给智能体发送指令').fill('查一下毛趣萌仔')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(
    agent.getByRole('link', { name: '毛趣萌仔官网' }),
  ).toBeVisible({ timeout: 15_000 })
  const card = agent.locator('.agent-tool').first()
  await expect(card.locator('.agent-tool-title')).toHaveText('搜索 毛趣萌仔')
  await card.getByRole('button', { name: '展开完整输出' }).click()
  await expect(card.locator('.agent-tool-output')).toContainText('桌宠介绍')
  await expect(card.locator('.agent-tool-output')).toContainText(
    'https://example.com/pet',
  )

  const result = await application.evaluate(
    () =>
      globalThis as unknown as {
        __mqmzChatBodies: string[]
        __mqmzSearchBody: string
      },
  )
  expect(result.__mqmzChatBodies).toHaveLength(2)
  expect(result.__mqmzChatBodies[0]).toContain('"web_search"')
  expect(result.__mqmzChatBodies[0]).toContain('"read_url"')
  const search = JSON.parse(result.__mqmzSearchBody) as {
    query: string
    count: number
  }
  expect(search.query).toBe('毛趣萌仔')
  expect(search.count).toBe(5)
})
