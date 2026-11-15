import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page
let slowDocx = ''
const soffice = '/Applications/LibreOffice.app/Contents/MacOS/soffice'

function docx(): Uint8Array {
  const paragraphs = Array.from(
    { length: 300 },
    (_, index) => `<w:p><w:r><w:t>Timeout test paragraph ${index + 1}</w:t></w:r></w:p>`,
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
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-timeout-'))
  const data = join(directory, 'data')
  slowDocx = join(directory, 'timeout.docx')
  await mkdir(data, { recursive: true })
  await writeFile(slowDocx, docx())
  await writeFile(
    join(data, 'mqmz.engines.json'),
    JSON.stringify({ version: 1, localPaths: { libreoffice: soffice } }),
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
  environment.MQMZ_AGENT_PARSE_TIMEOUT_MS = '300'
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

test('a slow Office parse times out without adding a draft', async () => {
  test.skip(!existsSync(soffice), 'LibreOffice is not installed')
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-agent-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await agent.evaluate(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.id = 'mqmz-agent-timeout-input'
    input.hidden = true
    document.body.append(input)
  })
  await agent.locator('#mqmz-agent-timeout-input').setInputFiles(slowDocx)
  await agent.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(
      '#mqmz-agent-timeout-input',
    )!
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
  await expect(agent.locator('.agent-parse-banner')).toBeHidden({
    timeout: 10_000,
  })
  await expect(agent.locator('.agent-attachment')).toHaveCount(0)
})
