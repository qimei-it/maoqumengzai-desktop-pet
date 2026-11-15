import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page
let notes = ''
let image = ''
let dropped = ''

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-attach-e2e-'))
  const data = join(directory, 'data')
  notes = join(directory, 'notes.md')
  image = join(directory, 'photo.png')
  dropped = join(directory, 'dropped.md')
  await mkdir(data, { recursive: true })
  await writeFile(notes, '# 附件\n本地文本内容。')
  await writeFile(image, png)
  await writeFile(dropped, '# 拖入\n拖入的附件内容。')
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

test('attachments use local text, upload images, and respect the Pro model', async () => {
  await application.evaluate(({ dialog }) => {
    ;(globalThis as unknown as { __mqmzPick: string[] }).__mqmzPick = []
    dialog.showOpenDialog = async () =>
      ({
        canceled: false,
        filePaths: (globalThis as unknown as { __mqmzPick: string[] })
          .__mqmzPick,
      })
  })
  await application.evaluate(
    ({ dialog }, paths) => {
      ;(globalThis as unknown as { __mqmzPick: string[] }).__mqmzPick = paths
      dialog.showOpenDialog = async () =>
        ({
          canceled: false,
          filePaths: (globalThis as unknown as { __mqmzPick: string[] })
            .__mqmzPick,
        })
    },
    [notes, image],
  )
  await application.evaluate(() => {
    const state = globalThis as unknown as {
      __mqmzFetchLog?: Array<{ url: string; body: string }>
    }
    state.__mqmzFetchLog = []
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? init.body : ''
      state.__mqmzFetchLog!.push({ url, body })
      if (url.includes('/chat/completions'))
        return new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { content: '收到附件' } }] })}`,
            '',
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 4 } })}`,
            '',
            'data: [DONE]',
            '',
            '',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        )
      if (url.endsWith('/files'))
        return new Response(
          JSON.stringify({
            id: 'file-api-e2e',
            expires_at: Math.floor(Date.now() / 1000) + 86_400,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      if (url.includes('/tools/asr'))
        return new Response(JSON.stringify({ text: '语音内容' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      if (url.endsWith('/models'))
        return new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      return new Response('{}', { status: 503 })
    }
  })

  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-agent-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()

  await agent.getByLabel('添加附件').click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(2)
  await agent.getByLabel('给智能体发送指令').fill('看看附件')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('收到附件')).toBeVisible({ timeout: 15_000 })

  const log = await application.evaluate(() => {
    return (
      globalThis as unknown as {
        __mqmzFetchLog: Array<{ url: string; body: string }>
      }
    ).__mqmzFetchLog
  })
  expect(log.filter((entry) => entry.url.endsWith('/files'))).toHaveLength(1)
  const chat = log.find((entry) => entry.url.includes('/chat/completions'))
  expect(chat).toBeTruthy()
  expect(chat!.body).toContain('file-api-e2e')
  expect(chat!.body).toContain('<attachment name=\\"notes.md\\">')
  expect(chat!.body).toContain('本地文本内容。')

  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-model', model: 'deepseek-v4-pro' }),
  )
  await application.evaluate(({ dialog }, paths) => {
    ;(globalThis as unknown as { __mqmzPick: string[] }).__mqmzPick = paths
    dialog.showOpenDialog = async () =>
      ({
        canceled: false,
        filePaths: (globalThis as unknown as { __mqmzPick: string[] })
          .__mqmzPick,
      })
  }, [image])
  await agent.getByLabel('添加附件').click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(0)

  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-model', model: 'deepseek-flash' }),
  )
})

test('dragging files into the agent panel shows a hint and attaches them', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.evaluate(() => {
    document.querySelector('#mqmz-agent-drop-input')?.remove()
    const input = document.createElement('input')
    input.type = 'file'
    input.id = 'mqmz-agent-drop-input'
    input.multiple = true
    input.hidden = true
    document.body.append(input)
  })
  await agent.locator('#mqmz-agent-drop-input').setInputFiles(dropped)
  await agent.evaluate(() => {
    const input =
      document.querySelector<HTMLInputElement>('#mqmz-agent-drop-input')!
    const transfer = new DataTransfer()
    for (const file of input.files!) transfer.items.add(file)
    ;(window as unknown as { __mqmzAgentTransfer: DataTransfer })
      .__mqmzAgentTransfer = transfer
    document.querySelector('.agent-main')!.dispatchEvent(
      new DragEvent('dragenter', {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(agent.locator('.agent-drop-hint')).toContainText(
    '添加到当前对话',
  )
  await agent.evaluate(() => {
    const transfer = (
      window as unknown as { __mqmzAgentTransfer: DataTransfer }
    ).__mqmzAgentTransfer
    document.querySelector('.agent-main')!.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(agent.locator('.agent-attachment-name')).toContainText(
    'dropped.md',
  )
  await agent.getByRole('button', { name: '移除附件 dropped.md' }).click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(0)
  await agent
    .locator('#mqmz-agent-drop-input')
    .evaluate((element) => element.remove())
})
