import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

async function agentWindow() {
  return application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )
    if (!window) return null
    return {
      bounds: window.getBounds(),
      maximized: window.isMaximized(),
      resizable: window.isResizable(),
    }
  })
}

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-window-'))
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

test('double-clicking the panel border toggles default size and full screen', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await expect.poll(async () => (await agentWindow())?.maximized).toBe(false)
  const initial = await agentWindow()
  expect(initial?.resizable).toBe(true)

  const box = await agent.locator('.agent-shell').boundingBox()
  expect(box).toBeTruthy()
  const edge = { x: box!.width - 5, y: box!.height / 2 }

  await agent.mouse.dblclick(edge.x, edge.y)
  await expect.poll(async () => (await agentWindow())?.maximized).toBe(true)

  const maximizedBox = await agent.locator('.agent-shell').boundingBox()
  expect(maximizedBox).toBeTruthy()
  await agent.mouse.dblclick(maximizedBox!.width - 5, maximizedBox!.height / 2)
  await expect.poll(async () => (await agentWindow())?.maximized).toBe(false)

  const expected = await application.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    const area = screen.getDisplayMatching(window.getBounds()).workArea
    return {
      width: Math.min(920, area.width - 24),
      height: Math.min(640, area.height - 24),
    }
  })
  await expect
    .poll(async () => (await agentWindow())?.bounds)
    .toMatchObject({ width: expected.width, height: expected.height })

  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    window.setBounds({ width: 1000, height: 700 })
  })
  await expect
    .poll(async () => (await agentWindow())?.bounds.width)
    .toBe(1000)
})
