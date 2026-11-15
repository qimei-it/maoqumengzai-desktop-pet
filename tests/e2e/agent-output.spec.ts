import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page
let settings: Page
let saveDirectory = ''
const errors: string[] = []

const reply = [
  '## Mermaid 示例',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[开始] --> B{判断}',
  '  B -->|是| C[完成]',
  '  B -->|否| A',
  '```',
  '',
  '这是一段普通文本。',
].join('\n')

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-output-'))
  const data = join(directory, 'data')
  saveDirectory = join(directory, 'saved')
  await mkdir(data, { recursive: true })
  await mkdir(saveDirectory, { recursive: true })
  await writeFile(
    join(data, 'mqmz.agent.json'),
    JSON.stringify({
      version: 2,
      projects: [],
      sessions: [
        {
          id: 'session-output',
          title: '功能验证',
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
              parts: [{ type: 'text', text: '画一个流程图' }],
            },
            {
              id: 'a1',
              role: 'assistant',
              parts: [{ type: 'text', text: reply }],
            },
          ],
          history: [],
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
  settings = pages.find((item) => item.title.includes('设置'))!.page
  agent.on('pageerror', (error) => errors.push(error.message))
})

test.afterAll(async () => {
  await application.close()
})

test('agent renders Mermaid and saves the source and audio', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-agent-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.locator('.agent-mermaid svg')).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    agent.locator('.agent-message-actions button'),
  ).toHaveText(['保存', '导出音频'])

  await agent.evaluate(
    (directory) =>
      window.mqmz!.command({
        type: 'settings-update',
        patch: { agentAttachmentDir: directory },
      }),
    saveDirectory,
  )

  await agent
    .locator('.agent-message-actions button')
    .filter({ hasText: '保存' })
    .click()
  await expect
    .poll(async () => (await readdir(saveDirectory)).some((name) => name.endsWith('.md')))
    .toBe(true)
  const markdown = (await readdir(saveDirectory)).find((name) => name.endsWith('.md'))!
  expect(await readFile(join(saveDirectory, markdown), 'utf8')).toContain(
    '```mermaid',
  )

  await agent
    .locator('.agent-message-actions button')
    .filter({ hasText: '导出音频' })
    .click()
  await expect
    .poll(
      async () =>
        (await readdir(saveDirectory)).some((name) => name.endsWith('.wav')),
      { timeout: 60_000 },
    )
    .toBe(true)
  const audio = (await readdir(saveDirectory)).find((name) => name.endsWith('.wav'))!
  const bytes = await readFile(join(saveDirectory, audio))
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')

  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-section', section: 'ai' }),
  )
  await expect(settings.getByText('附件保存目录', { exact: true })).toBeVisible()
  await expect(settings.locator('.settings-path')).toHaveText(saveDirectory)
  expect(errors).toEqual([])
})
