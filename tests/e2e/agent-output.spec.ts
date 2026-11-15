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
let artifactPath = ''
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
  '',
  ...Array.from(
    { length: 80 },
    (_, index) => `第 ${index + 1} 行用于测试滚动位置。`,
  ),
].join('\n\n')

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-output-'))
  const data = join(directory, 'data')
  saveDirectory = join(directory, 'saved')
  artifactPath = join(directory, 'converted.pdf')
  await mkdir(data, { recursive: true })
  await mkdir(saveDirectory, { recursive: true })
  await writeFile(artifactPath, '%PDF-1.4 test artifact')
  await writeFile(
    join(data, 'mqmz.agent.json'),
    JSON.stringify({
      version: 2,
      projects: [],
      sessions: [
        {
          id: '11111111-1111-4111-8111-111111111111',
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
              parts: [
                {
                  type: 'text',
                  text: '画一个流程图，并用中文解释每个节点的含义。'.repeat(4),
                },
              ],
            },
            {
              id: 'a1',
              role: 'assistant',
              parts: [{ type: 'text', text: reply }],
            },
            {
              id: 'a2',
              role: 'assistant',
              parts: [
                {
                  type: 'tool',
                  id: 'tool-1',
                  name: 'convert_start',
                  title: '转换 1 个文件为 pdf',
                  args: '{}',
                  status: 'done',
                  output: '已生成 转换结果.pdf',
                  artifacts: [
                    {
                      id: '11111111-1111-4111-8111-222222222222',
                      name: '转换结果.pdf',
                      kind: 'document',
                    },
                  ],
                },
              ],
            },
          ],
          sources: [
            {
              id: '11111111-1111-4111-8111-222222222222',
              name: '转换结果.pdf',
              path: artifactPath,
              kind: 'artifact',
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

test('agent renders Mermaid, copies output, exports the chat, and follows scroll', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-agent-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.locator('.agent-mermaid svg')).toBeVisible({
    timeout: 30_000,
  })
  await expect
    .poll(async () => {
      const box = await agent
        .locator('.agent-messages-inner')
        .boundingBox()
      return box?.width ?? 0
    })
    .toBeGreaterThan(0)
  const composerBox = await agent.locator('.agent-composer').boundingBox()
  const innerBox = await agent.locator('.agent-messages-inner').boundingBox()
  const userBox = await agent
    .locator('.agent-message.user .agent-text')
    .first()
    .boundingBox()
  expect(composerBox).toBeTruthy()
  expect(innerBox).toBeTruthy()
  expect(userBox).toBeTruthy()
  expect(Math.abs(innerBox!.width - composerBox!.width)).toBeLessThanOrEqual(1)
  expect(userBox!.width).toBeLessThanOrEqual(composerBox!.width * 0.55 + 1)
  const actions = agent
    .locator('.agent-message.assistant .agent-message-actions')
    .last()
    .getByRole('button', { name: '复制' })
  await expect(actions).toBeVisible()
  await actions.click()
  const clipboardText = await application.evaluate(
    ({ clipboard }) => clipboard.readText(),
  )
  expect(clipboardText).toContain('```mermaid')
  expect(clipboardText).toContain('这是一段普通文本。')

  const tool = agent.locator('.agent-tool').first()
  await expect(tool.locator('.agent-tool-output')).toHaveCount(0)
  await tool.getByRole('button', { name: '展开完整输出' }).click()
  const output = tool.locator('.agent-tool-output')
  await expect(output).toBeVisible()
  await expect(output).toContainText('已生成 转换结果.pdf')
  await tool.getByRole('button', { name: '复制输出' }).click()
  expect(
    await application.evaluate(({ clipboard }) => clipboard.readText()),
  ).toBe('已生成 转换结果.pdf')

  await application.evaluate(({ shell }) => {
    const state = globalThis as unknown as { __mqmzOpened: string[] }
    state.__mqmzOpened = []
    shell.openPath = async (path) => {
      state.__mqmzOpened.push(path)
      return ''
    }
  })
  await tool.getByRole('button', { name: '打开 转换结果.pdf' }).click()
  await expect
    .poll(() =>
      application.evaluate(
        () =>
          (
            globalThis as unknown as { __mqmzOpened: string[] }
          ).__mqmzOpened.length,
      ),
    )
    .toBe(1)

  await agent.evaluate(
    (directory) =>
      window.mqmz!.command({
        type: 'settings-update',
        patch: { agentAttachmentDir: directory },
      }),
    saveDirectory,
  )
  await agent.getByRole('button', { name: '保存 转换结果.pdf' }).click()
  await expect
    .poll(async () =>
      (await readdir(saveDirectory)).some((name) =>
        name.startsWith('转换结果'),
      ),
    )
    .toBe(true)
  const artifact = (await readdir(saveDirectory)).find((name) =>
    name.startsWith('转换结果'),
  )!
  expect(await readFile(join(saveDirectory, artifact), 'utf8')).toBe(
    '%PDF-1.4 test artifact',
  )
  await agent.getByLabel('对话菜单').first().click()
  await agent.getByRole('menuitem', { name: '保存为 Markdown' }).click()
  await expect
    .poll(async () =>
      (await readdir(saveDirectory)).some((name) => name.endsWith('.md')),
    )
    .toBe(true)
  const markdown = (await readdir(saveDirectory)).find((name) =>
    name.endsWith('.md'),
  )!
  const markdownText = await readFile(join(saveDirectory, markdown), 'utf8')
  expect(markdownText).toContain('# 功能验证')
  expect(markdownText).toContain('画一个流程图')
  expect(markdownText).toContain('```mermaid')

  const messages = agent.locator('.agent-messages')
  await messages.evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll'))
  })
  await expect(agent.locator('.agent-scroll-button')).toBeVisible()
  await expect(agent.locator('.agent-scroll-button')).toHaveAttribute(
    'aria-label',
    '回到底部',
  )
  await agent.locator('.agent-scroll-button').click()
  await expect
    .poll(() =>
      messages.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThan(30)
  await expect(agent.locator('.agent-scroll-button')).toBeHidden()

  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-section', section: 'ai' }),
  )
  await expect(settings.getByText('附件保存目录', { exact: true })).toBeVisible()
  await expect(settings.locator('.settings-path')).toHaveText(saveDirectory)
  expect(errors).toEqual([])
})

test('shows thinking dots while streaming and returns to the bottom', async () => {
  await application.evaluate(() => {
    globalThis.fetch = async () => {
      const encoder = new TextEncoder()
      let index = 0
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const timer = setInterval(() => {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: {
                        content: `流式输出 ${index + 1}\n\n`,
                      },
                    },
                  ],
                })}\n\n`,
              ),
            )
            index += 1
            if (index < 80) return
            clearInterval(timer)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: {},
                      finish_reason: 'stop',
                    },
                  ],
                  usage: {
                    prompt_tokens: 1,
                    completion_tokens: 80,
                  },
                })}\n\n`,
              ),
            )
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }, 50)
        },
      })
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
  })
  await agent.getByLabel('给智能体发送指令').fill('继续输出')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.locator('.agent-running')).toBeVisible()
  await agent.waitForTimeout(200)
  await agent.locator('.agent-messages').evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll'))
  })
  const scrollButton = agent.locator('.agent-scroll-button')
  await expect(scrollButton).toBeVisible()
  await expect(scrollButton).toHaveClass(/is-thinking/)
  await scrollButton.hover()
  await expect(scrollButton).not.toHaveClass(/is-thinking/)
  await expect(scrollButton).toHaveAttribute('aria-label', '回到底部')
  await scrollButton.click()
  await expect
    .poll(() =>
      agent
        .locator('.agent-messages')
        .evaluate(
          (element) =>
            element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
    )
    .toBeLessThan(30)
  await expect(scrollButton).toBeHidden()
})

test('copies Mermaid source, exports images and redraws on theme change', async () => {
  const diagram = agent.locator('.agent-mermaid').first()
  await expect(diagram).toBeVisible({ timeout: 30_000 })
  await diagram.hover()
  await diagram
    .getByRole('button', { name: '复制 Mermaid 源码' })
    .click()
  expect(
    await application.evaluate(({ clipboard }) => clipboard.readText()),
  ).toContain('flowchart LR')

  const directory = join(saveDirectory, 'diagrams')
  await mkdir(directory, { recursive: true })
  const svgPath = join(directory, 'diagram.svg')
  const pngPath = join(directory, 'diagram.png')
  await application.evaluate(({ dialog }, paths) => {
    const state = globalThis as unknown as {
      __mqmzExportIndex: number
      __mqmzExportPaths: string[]
    }
    state.__mqmzExportIndex = 0
    state.__mqmzExportPaths = paths
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: state.__mqmzExportPaths[state.__mqmzExportIndex++],
    })
  }, [svgPath, pngPath])

  await diagram.hover()
  await diagram.getByRole('button', { name: '导出 SVG 图片' }).click()
  await expect
    .poll(() =>
      readFile(svgPath, 'utf8').then(
        () => true,
        () => false,
      ),
    )
    .toBe(true)
  expect(await readFile(svgPath, 'utf8')).toContain('<svg')

  await diagram.hover()
  await diagram.getByRole('button', { name: '导出 PNG 图片' }).click()
  await expect
    .poll(() =>
      readFile(pngPath).then(
        () => true,
        () => false,
      ),
    )
    .toBe(true)
  const png = await readFile(pngPath)
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')

  const theme = await agent.evaluate(async () => {
    const snapshot = await window.mqmz!.snapshot()
    return snapshot.ok ? snapshot.value.settings.theme : 'default'
  })
  await agent.evaluate(() =>
    window.mqmz!.command({
      type: 'settings-update',
      patch: { theme: 'halloween' },
    }),
  )
  await expect(agent.locator('.agent-mermaid').first()).toBeVisible()
  await agent.evaluate(
    (value) =>
      window.mqmz!.command({
        type: 'settings-update',
        patch: { theme: value },
      }),
    theme,
  )
})
