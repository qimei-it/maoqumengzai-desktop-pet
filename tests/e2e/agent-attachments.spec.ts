import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile as readFileSync } from 'node:fs/promises'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page
let notes = ''
let image = ''
let dropped = ''
let slowDocx = ''
let clip = ''
let ofd = ''
let saveDirectory = ''

const soffice = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
const ffmpeg =
  process.env.MQMZ_TEST_FFMPEG ??
  join(
    homedir(),
    'Library/Application Support/mqmz-desktop/engines/ffmpeg/6.0/ffmpeg',
  )

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const ofdFonts = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]

function ofdSample(font: Uint8Array): Uint8Array {
  return zipSync({
    'OFD.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" DocType="OFD" Version="1.0"><ofd:DocBody><ofd:DocInfo><ofd:DocID>mqmz-ofd-test</ofd:DocID><ofd:DocTitle>OFD 附件</ofd:DocTitle></ofd:DocInfo><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>',
    ),
    'Doc_0/Document.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><ofd:Document xmlns:ofd="http://www.ofdspec.org/2016"><ofd:CommonData><ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea><ofd:DocumentRes>PublicRes.xml</ofd:DocumentRes><ofd:MaxUnitID>10</ofd:MaxUnitID></ofd:CommonData><ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/></ofd:Pages></ofd:Document>',
    ),
    'Doc_0/PublicRes.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res"><ofd:Fonts><ofd:Font ID="1" FontName="Arial" FamilyName="Arial" Charset="unicode"><ofd:FontFile>font.ttf</ofd:FontFile></ofd:Font></ofd:Fonts></ofd:Res>',
    ),
    'Doc_0/Res/font.ttf': font,
    'Doc_0/Pages/Page_0/Content.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area><ofd:Content><ofd:Layer><ofd:TextObject ID="2" Boundary="20 20 170 30" Font="1" Size="12" CTM="1 0 0 1 0 0"><ofd:TextCode X="0" Y="12">OFD sample text</ofd:TextCode></ofd:TextObject></ofd:Layer></ofd:Content></ofd:Page>',
    ),
  })
}

function docx(): Uint8Array {
  const paragraphs = Array.from(
    { length: 300 },
    (_, index) => `<w:p><w:r><w:t>Progress test paragraph ${index + 1}</w:t></w:r></w:p>`,
  ).join('')
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`,
    ),
  })
}

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-attach-e2e-'))
  const data = join(directory, 'data')
  saveDirectory = join(directory, 'saved')
  notes = join(directory, 'notes.md')
  image = join(directory, 'photo.png')
  dropped = join(directory, 'dropped.md')
  await mkdir(data, { recursive: true })
  await mkdir(saveDirectory, { recursive: true })
  await writeFile(notes, '# 附件\n本地文本内容。')
  await writeFile(image, png)
  await writeFile(dropped, '# 拖入\n拖入的附件内容。')
  slowDocx = join(directory, 'slow.docx')
  await writeFile(slowDocx, docx())
  const fontPath = ofdFonts.find((path) => existsSync(path))
  if (fontPath) {
    ofd = join(directory, 'sample.ofd')
    await writeFile(ofd, ofdSample(new Uint8Array(await readFileSync(fontPath))))
  }
  if (existsSync(ffmpeg)) {
    clip = join(directory, 'clip.mp4')
    execFileSync(
      ffmpeg,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x240:d=1',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-shortest',
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        clip,
      ],
      { stdio: 'ignore' },
    )
  }
  const localPaths: Record<string, string> = {}
  if (existsSync(soffice)) localPaths.libreoffice = soffice
  if (clip) localPaths.ffmpeg = ffmpeg
  if (Object.keys(localPaths).length)
    await writeFile(
      join(data, 'mqmz.engines.json'),
      JSON.stringify({ version: 1, localPaths }),
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
  await expect(agent.locator('.agent-messages').getByText('收到附件', { exact: true }).first()).toBeVisible({ timeout: 15_000 })

  const log = await application.evaluate(() => {
    return (
      globalThis as unknown as {
        __mqmzFetchLog: Array<{ url: string; body: string }>
      }
    ).__mqmzFetchLog
  })
  expect(log.filter((entry) => entry.url.endsWith('/files'))).toHaveLength(1)
  const chat = log.find((entry) => entry.url.includes('/chat/completions') && entry.body.includes('attachment name'))
  expect(chat).toBeTruthy()
  expect(chat!.body).toContain('file-api-e2e')
  expect(chat!.body).toContain('<attachment name=\\"notes.md\\">')
  expect(chat!.body).toContain('本地文本内容。')

  await application.evaluate(({ shell }) => {
    const state = globalThis as unknown as { __mqmzOpened: string[] }
    state.__mqmzOpened = []
    shell.openPath = async (path) => {
      state.__mqmzOpened.push(path)
      return ''
    }
  })
  await agent.getByRole('button', { name: '打开附件 notes.md' }).click()
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
  await agent.getByRole('button', { name: '保存附件 notes.md' }).click()
  await expect
    .poll(async () =>
      (await readdir(saveDirectory)).some((name) =>
        name.startsWith('notes'),
      ),
    )
    .toBe(true)
  const savedAttachment = (await readdir(saveDirectory)).find((name) =>
    name.startsWith('notes'),
  )!
  expect(await readFile(join(saveDirectory, savedAttachment), 'utf8')).toBe(
    '# 附件\n本地文本内容。',
  )

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
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await expect(agent.locator('.agent-attachment-name')).toHaveAttribute(
    'title',
    /图片 · 视觉解析/,
  )
  await expect
    .poll(async () =>
      agent.evaluate(async () => {
        const result = await window.mqmz!.snapshot()
        return result.ok ? result.value.agent.model : ''
      }),
    )
    .toBe('deepseek-flash')
  await agent.getByRole('button', { name: /移除附件 photo/ }).click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(0)
})

test('renders a spec-compliant OFD attachment for vision parsing', async () => {
  test.skip(!ofd, 'no TTF font available for the OFD sample')
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-model', model: 'deepseek-flash' }),
  )
  await application.evaluate(({ dialog }, paths) => {
    ;(globalThis as unknown as { __mqmzPick: string[] }).__mqmzPick = paths
    dialog.showOpenDialog = async () =>
      ({
        canceled: false,
        filePaths: (globalThis as unknown as { __mqmzPick: string[] })
          .__mqmzPick,
      })
  }, [ofd])
  await agent.getByLabel('添加附件').click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await expect(agent.locator('.agent-attachment-name')).toHaveAttribute(
    'title',
    /OFD · 1 页 · 视觉解析/,
  )
  await agent.getByRole('button', { name: '移除附件 sample.ofd' }).click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(0)
})

test('extracts video frames for Flash and only transcripts for Pro', async () => {
  test.skip(!clip, 'FFmpeg is not installed')
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-model', model: 'deepseek-flash' }),
  )
  await application.evaluate(({ dialog }, paths) => {
    ;(globalThis as unknown as { __mqmzPick: string[] }).__mqmzPick = paths
    dialog.showOpenDialog = async () =>
      ({
        canceled: false,
        filePaths: (globalThis as unknown as { __mqmzPick: string[] })
          .__mqmzPick,
      })
  }, [clip])
  await agent.getByLabel('添加附件').click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await expect(agent.locator('.agent-attachment-name')).toHaveAttribute(
    'title',
    /视频 · [1-4] 帧 \+ 语音转写/,
  )
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-model', model: 'deepseek-v4-pro' }),
  )
  await expect(agent.locator('.agent-pro-hint')).toHaveCount(0)
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await agent.getByRole('button', { name: /移除附件 clip/ }).click()

  await agent.getByLabel('添加附件').click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await expect(agent.locator('.agent-attachment-name')).toHaveAttribute(
    'title',
    /视频 · 语音转写/,
  )
  await agent.getByRole('button', { name: /移除附件 clip/ }).click()
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-model', model: 'deepseek-flash' }),
  )
})

test('keeps the draft when switching to the Pro model and can switch back', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-model', model: 'deepseek-flash' }),
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
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await agent.getByLabel('给智能体发送指令').fill('保留草稿')
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-model', model: 'deepseek-v4-pro' }),
  )
  await expect(agent.locator('.agent-pro-hint')).toBeVisible()
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await expect(agent.getByLabel('给智能体发送指令')).toHaveText('保留草稿')
  await expect(agent.getByRole('button', { name: '发送' })).toBeDisabled()
  await agent.getByRole('button', { name: '切换 Flash 继续' }).click()
  await expect(agent.locator('.agent-messages').getByText('收到附件', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await expect(agent.locator('.agent-attachment')).toHaveCount(0)
  await expect(agent.locator('.agent-pro-hint')).toHaveCount(0)
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

test('failed uploads keep the draft and can be retried', async () => {
  await application.evaluate(() => {
    let uploads = 0
    const state = globalThis as unknown as {
      __mqmzUploadAttempts: () => number
      __mqmzChatBody?: string
    }
    state.__mqmzUploadAttempts = () => uploads
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input)
      if (url.endsWith('/files')) {
        uploads += 1
        if (uploads === 1)
          return new Response(
            JSON.stringify({ error: { message: 'busy' } }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        return new Response(
          JSON.stringify({
            id: 'file-api-retry',
            expires_at: Math.floor(Date.now() / 1000) + 86_400,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/chat/completions')) {
        state.__mqmzChatBody =
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
  await agent.getByLabel('添加附件').click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await agent.getByLabel('给智能体发送指令').fill('看看这张图')
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.locator('.agent-attachment.is-error')).toBeVisible()
  await expect(
    agent.getByRole('button', { name: '重试上传 photo.png' }),
  ).toBeVisible()
  await expect(agent.getByLabel('给智能体发送指令')).toHaveText(
    '看看这张图',
  )
  await agent.getByRole('button', { name: '重试上传 photo.png' }).click()
  await expect(agent.locator('.agent-attachment.is-error')).toHaveCount(0)
  await agent.getByRole('button', { name: '发送' }).click()
  await expect(agent.getByText('收到', { exact: true })).toBeVisible({
    timeout: 15_000,
  })
  expect(
    await application.evaluate(
      () =>
        (globalThis as unknown as { __mqmzUploadAttempts: () => number })
          .__mqmzUploadAttempts(),
    ),
  ).toBe(2)
  expect(
    await application.evaluate(
      () =>
        (globalThis as unknown as { __mqmzChatBody?: string })
          .__mqmzChatBody ?? '',
    ),
  ).toContain('file-api-retry')
})

test('shows attachment parsing progress and can cancel a long parse', async () => {
  test.skip(!existsSync(soffice), 'LibreOffice is not installed')
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.evaluate(() => {
    document.querySelector('#mqmz-agent-parse-input')?.remove()
    const input = document.createElement('input')
    input.type = 'file'
    input.id = 'mqmz-agent-parse-input'
    input.hidden = true
    document.body.append(input)
  })
  await agent.locator('#mqmz-agent-parse-input').setInputFiles(slowDocx)
  await expect
    .poll(async () =>
      agent.evaluate(async () => {
        const result = await window.mqmz!.snapshot()
        return result.ok ? result.value.agent.busy : true
      }),
    )
    .toBe(false)
  await agent.evaluate(() => {
    const input =
      document.querySelector<HTMLInputElement>('#mqmz-agent-parse-input')!
    const transfer = new DataTransfer()
    for (const file of input.files!) transfer.items.add(file)
    document.querySelector('.agent-main')!.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(agent.locator('.agent-parse-banner')).toBeVisible({
    timeout: 10_000,
  })
  await expect(agent.locator('.agent-parse-label')).toContainText('解析附件')
  await agent.locator('.agent-parse-cancel').click()
  await expect(agent.locator('.agent-parse-banner')).toBeHidden({
    timeout: 10_000,
  })
  await expect(agent.locator('.agent-attachment')).toHaveCount(0)
  await agent
    .locator('#mqmz-agent-parse-input')
    .evaluate((element) => element.remove())
})

test('pastes a clipboard image as an attachment with a preview', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await application.evaluate(async ({ clipboard, ClipboardItem }, data) => {
    await clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([new Uint8Array(data)], {
          type: 'image/png',
        }),
      }),
    ])
  }, [...png])
  await agent.getByLabel('给智能体发送指令').focus()
  await agent.keyboard.press(
    `${process.platform === 'darwin' ? 'Meta' : 'Control'}+v`,
  )
  await expect(agent.locator('.agent-attachment')).toHaveCount(1)
  await expect(agent.locator('.agent-attachment-thumb')).toBeVisible()
  await agent.getByRole('button', { name: /移除附件 截图/ }).click()
  await expect(agent.locator('.agent-attachment')).toHaveCount(0)
})
