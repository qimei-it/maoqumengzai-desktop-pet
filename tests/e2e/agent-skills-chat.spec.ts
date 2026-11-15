import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-skills-chat-'))
  const data = join(directory, 'data')
  const skillDirectory = join(data, 'skills', 'daily')
  await mkdir(skillDirectory, { recursive: true })
  await writeFile(
    join(skillDirectory, 'SKILL.md'),
    [
      '---',
      'name: 日报',
      'description: 按三段写日报',
      '---',
      '请按“进展、问题、下一步”三段写日报。',
    ].join('\n'),
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

test('injects enabled skills and loads one during the conversation', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-skill-chat-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toBeVisible()
  await application.evaluate(() => {
    const state = globalThis as unknown as { __mqmzSkillBodies: string[] }
    state.__mqmzSkillBodies = []
    let calls = 0
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (!String(input).includes('/chat/completions'))
        return new Response('{}', { status: 503 })
      const body = typeof init?.body === 'string' ? init.body : ''
      if (body.includes('会话标题生成器'))
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { content: '技能对话测试' } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      state.__mqmzSkillBodies.push(body)
      calls += 1
      if (calls === 1)
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'skill_load', arguments: JSON.stringify({ name: '日报' }) } }] } }] })}`,
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
          `data: ${JSON.stringify({ choices: [{ delta: { content: '日报已完成' } }] })}`,
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

  await agent.getByLabel('给智能体发送指令').fill('写日报')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toHaveValue('')
  await expect(agent.getByText('日报已完成')).toBeVisible({
    timeout: 15_000,
  })
  const bodies = await application.evaluate(
    () =>
      (
        globalThis as unknown as { __mqmzSkillBodies: string[] }
      ).__mqmzSkillBodies,
  )
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toContain('已启用技能')
  expect(bodies[0]).toContain('日报')
  expect(bodies[0]).toContain('"skill_load"')
  expect(bodies[1]).toContain('请按“进展、问题、下一步”三段写日报。')
  const card = agent.locator('.agent-tool').first()
  await expect(card.locator('.agent-tool-title')).toHaveText('读取技能 日报')
  await expect(card.locator('.agent-tool-status')).toHaveText('完成')
  await expect(card.locator('.agent-tool-output')).toHaveCount(0)
  await card.getByRole('button', { name: '展开完整输出' }).click()
  await expect(card.locator('.agent-tool-output')).toContainText(
    '请按“进展、问题、下一步”三段写日报。',
  )
})
