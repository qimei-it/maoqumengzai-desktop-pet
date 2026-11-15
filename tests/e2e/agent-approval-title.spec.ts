import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-approval-'))
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
  await agent.evaluate(() => window.mqmz!.command({ type: 'agent-open' }))
  await agent.getByLabel('DeepSeek API Key').fill('sk-approval-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toBeVisible()
})

test.afterAll(async () => {
  await application.close()
})

test('generates a clean title and enforces the rename limit', async () => {
  await application.evaluate(() => {
    const state = globalThis as unknown as { __step: number }
    state.__step = 0
    const sse = (content: string) =>
      [
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
        '',
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n')
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (!String(input).includes('/chat/completions'))
        return new Response('{}', { status: 503 })
      const body = typeof init?.body === 'string' ? init.body : ''
      if (body.includes('会话标题生成器'))
        return new Response(sse('日报，整理。'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      state.__step += 1
      if (state.__step === 1)
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'todo-1', function: { name: 'todo_create', arguments: JSON.stringify({ text: '默认审批' }) } }] } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      if (state.__step === 2)
        return new Response(sse('默认审批完成'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      if (state.__step === 3)
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'todo-2', function: { name: 'todo_create', arguments: JSON.stringify({ text: '自动审批' }) } }] } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      if (state.__step === 4)
        return new Response(sse('自动审批完成'), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      if (state.__step === 5)
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'todo-3', function: { name: 'todo_create', arguments: JSON.stringify({ text: '计划拒绝' }) } }] } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      return new Response(sse('计划模式完成'), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
  })

  await agent.getByLabel('给智能体发送指令').fill('帮我整理今天的日报')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.locator('.agent-approval')).toBeVisible()
  await agent.getByRole('button', { name: '批准', exact: true }).click()
  await expect(agent.getByText('默认审批完成', { exact: true })).toBeVisible()
  await expect(agent.locator('.agent-session-text').first()).toHaveText(
    '日报整理',
  )

  await agent.locator('button[aria-label="对话菜单"]').first().click()
  await agent.locator('.agent-menu-item').filter({ hasText: '重命名' }).click()
  const input = agent.getByLabel('对话名称')
  await input.fill('这是一个超过十六个字符的对话标题测试')
  await expect(agent.locator('.agent-field-count')).toHaveText('18/16')
  await expect(agent.locator('.agent-field-count')).toHaveClass(/is-over/)
  await expect(agent.locator('.agent-dialog-error')).toHaveText(
    '标题最多 16 个字符',
  )
  await expect(
    agent.locator('.agent-modal-foot').getByRole('button', { name: '保存' }),
  ).toBeDisabled()
  await agent.keyboard.press('Escape')
})

test('approval modes gate routine and risky tools', async () => {
  await application.evaluate(() => {
    ;(globalThis as unknown as { __step: number }).__step = 2
  })
  const approvalLabel = agent.locator('.agent-approval-select')
  await expect(approvalLabel).toContainText('请求批准')

  await approvalLabel.click()
  await expect(agent.locator('.agent-approval-option')).toHaveText([
    '请求批准',
    '自动审批',
    '完全访问',
  ])
  await agent
    .locator('.agent-approval-option')
    .filter({ hasText: '自动审批' })
    .click()
  await expect(approvalLabel).toContainText('自动审批')

  await agent.getByLabel('给智能体发送指令').fill('自动审批测试')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('自动审批完成', { exact: true })).toBeVisible()
  await expect(agent.locator('.agent-approval')).toHaveCount(0)

  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-approval-mode', mode: 'full' }),
  )
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-mode', mode: 'plan' }),
  )
  await agent.getByLabel('给智能体发送指令').fill('计划模式测试')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('计划模式完成', { exact: true })).toBeVisible()
  await expect(agent.locator('.agent-approval')).toHaveCount(0)
  const denied = await agent.evaluate(async () => {
    const result = await window.mqmz!.snapshot()
    if (!result.ok) return false
    return result.value.agent.messages.some((message) =>
      message.parts.some(
        (part) =>
          part.type === 'tool' && part.output?.includes('当前模式下不可用'),
      ),
    )
  })
  expect(denied).toBe(true)
})
