import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page
let workspace = ''
let data = ''

const projectId = '66666666-6666-4666-8666-666666666666'
const sessionId = '77777777-7777-4777-8777-777777777777'

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-coding-'))
  data = join(directory, 'data')
  workspace = join(directory, 'project')
  await mkdir(join(data), { recursive: true })
  await mkdir(join(workspace, 'src'), { recursive: true })
  await writeFile(join(workspace, 'src', 'app.ts'), 'const value = 1\n')
  await writeFile(join(directory, 'outside.txt'), 'outside secret')
  await writeFile(
    join(data, 'mqmz.agent.json'),
    JSON.stringify({
      version: 2,
      projects: [
        {
          id: projectId,
          name: '代码项目',
          workspace,
          pinned: false,
          createdAt: 1,
        },
      ],
      sessions: [
        {
          id: sessionId,
          title: '代码修改',
          mode: 'build',
          model: 'deepseek-flash',
          reasoning: 'high',
          workspace,
          projectId,
          pinned: false,
          createdAt: 1,
          updatedAt: 2,
          ui: [],
          history: [],
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

test('edits a workspace file after approval and keeps a backup', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-coding-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toBeVisible()
  await application.evaluate(() => {
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
            `data: ${JSON.stringify({ choices: [{ delta: { content: '编辑工作区文件' } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      calls += 1
      void body
      if (calls === 1)
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'edit-1', function: { name: 'workspace_replace', arguments: JSON.stringify({ path: 'src/app.ts', find: 'const value = 1', replace: 'const value = 2' }) } }] } }] })}`,
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
          `data: ${JSON.stringify({ choices: [{ delta: { content: '已修改为 2。' } }] })}`,
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

  await agent.getByLabel('给智能体发送指令').fill('把 1 改成 2')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(
    agent.getByText('需要确认', { exact: true }),
  ).toBeVisible({ timeout: 15_000 })
  await agent.getByRole('button', { name: '批准', exact: true }).click()
  await expect(agent.getByText('已修改为 2。')).toBeVisible({
    timeout: 15_000,
  })
  expect(await readFile(join(workspace, 'src', 'app.ts'), 'utf8')).toBe(
    'const value = 2\n',
  )
  const backups = await readdir(join(data, 'agent-backups'))
  expect(backups.length).toBeGreaterThan(0)
  expect(
    await readFile(
      join(data, 'agent-backups', backups.find((name) => name.endsWith('app.ts'))!),
      'utf8',
    ),
  ).toBe('const value = 1\n')
})

test('blocks paths outside the workspace', async () => {
  await application.evaluate(() => {
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
            `data: ${JSON.stringify({ choices: [{ delta: { content: '越界读取测试' } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      calls += 1
      if (calls === 1)
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'read-1', function: { name: 'workspace_read', arguments: JSON.stringify({ path: '../outside.txt' }) } }] } }] })}`,
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
          `data: ${JSON.stringify({ choices: [{ delta: { content: '读取被拒绝。' } }] })}`,
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
  await agent.getByLabel('给智能体发送指令').fill('读一下外面的文件')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('读取被拒绝。')).toBeVisible({
    timeout: 15_000,
  })
  const card = agent.locator('.agent-tool').last()
  await expect(card.locator('.agent-tool-title')).toHaveText(
    '读取 ../outside.txt',
  )
  await expect(card).toHaveAttribute('data-status', 'error')
  await card.getByRole('button', { name: '展开完整输出' }).click()
  await expect(card.locator('.agent-tool-output')).toContainText(
    '路径超出工作区',
  )
  const history = await agent.evaluate(async () => {
    const result = await window.mqmz!.snapshot()
    return result.ok
      ? JSON.stringify(result.value.agent.messages)
      : ''
  })
  expect(history).not.toContain('outside secret')
})
