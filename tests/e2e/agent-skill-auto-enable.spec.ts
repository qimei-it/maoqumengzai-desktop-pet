import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

function sse(body: string): Response {
  return new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { content: body } }] })}`,
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

function toolCall(name: string, id: string, args: unknown): Response {
  return new Response(
    [
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] })}`,
      '',
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-auto-skill-'))
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
  await agent.getByLabel('DeepSeek API Key').fill('sk-auto-skill-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toBeVisible()
})

test.afterAll(async () => {
  await application.close()
})

test('enables a disabled skill only after approval', async () => {
  await application.evaluate(() => {
    const state = globalThis as unknown as { __step: number }
    state.__step = 0
    const sse = (body: string) =>
      new Response(
        [
          `data: ${JSON.stringify({ choices: [{ delta: { content: body } }] })}`,
          '',
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
          '',
          'data: [DONE]',
          '',
          '',
        ].join('\n'),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    const toolCall = (name: string, id: string, args: unknown) =>
      new Response(
        [
          `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } }] })}`,
          '',
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
          '',
          'data: [DONE]',
          '',
          '',
        ].join('\n'),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (!String(input).includes('/chat/completions'))
        return new Response('{}', { status: 503 })
      const body = typeof init?.body === 'string' ? init.body : ''
      if (body.includes('会话标题生成器')) return sse('技能自动启用测试')
      state.__step += 1
      if (state.__step === 1)
        return toolCall('skill_list', 'list-1', { query: 'seo' })
      if (state.__step === 2)
        return toolCall('skill_set_enabled', 'enable-1', {
          target: 'seo-plan',
          enabled: true,
        })
      if (state.__step === 3)
        return toolCall('skill_load', 'load-1', { name: 'seo-plan' })
      if (state.__step === 4) return sse('已启用并读取 SEO 计划技能。')
      if (state.__step === 5)
        return toolCall('skill_list', 'list-2', { query: 'seo' })
      if (state.__step === 6)
        return toolCall('skill_set_enabled', 'enable-2', {
          target: 'seo-hreflang',
          enabled: true,
        })
      return sse('已取消启用。')
    }
  })

  await agent.getByLabel('给智能体发送指令').fill('帮我规划一个 SEO 内容计划')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('需要确认', { exact: true })).toBeVisible()
  await expect(agent.locator('.agent-approval')).toContainText('启用技能 seo-plan')
  await agent.getByRole('button', { name: '批准', exact: true }).click()
  await expect(
    agent.getByText('已启用并读取 SEO 计划技能。', { exact: true }),
  ).toBeVisible()

  const enabled = await agent.evaluate(async () => {
    const result = await window.mqmz!.snapshot()
    if (!result.ok) return false
    return result.value.agentSkills.some(
      (skill) => skill.name === 'seo-plan' && skill.enabled,
    )
  })
  expect(enabled).toBe(true)
  const loaded = await agent.evaluate(async () => {
    const result = await window.mqmz!.snapshot()
    if (!result.ok) return false
    return result.value.agent.messages.some((message) =>
      message.parts.some(
        (part) =>
          part.type === 'tool' &&
          part.name === 'skill_load' &&
          part.status === 'done',
      ),
    )
  })
  expect(loaded).toBe(true)

  await agent.getByLabel('给智能体发送指令').fill('再启用一个 SEO 技能')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.locator('.agent-approval')).toContainText(
    '启用技能 seo-hreflang',
  )
  await agent.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(agent.getByText('已取消启用。', { exact: true })).toBeVisible()
  const rejected = await agent.evaluate(async () => {
    const result = await window.mqmz!.snapshot()
    if (!result.ok) return true
    return result.value.agentSkills.some(
      (skill) => skill.name === 'seo-hreflang' && skill.enabled,
    )
  })
  expect(rejected).toBe(false)
})
