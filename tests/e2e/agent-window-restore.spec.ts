import { _electron as electron, expect, test } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

test('agent window defaults, persists and restores its bounds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-window-'))
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

  const readAgent = (app: Awaited<ReturnType<typeof electron.launch>>) =>
    app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) =>
        item.getTitle().includes('智能体'),
      )!
      return {
        bounds: window.getBounds(),
        resizable: window.isResizable(),
      }
    })

  let application = await electron.launch({
    args: [resolve('.')],
    env: environment,
  })
  await waitForAppWindows(application)
  const initial = await readAgent(application)
  expect(initial.resizable).toBe(true)
  expect(initial.bounds.width).toBeGreaterThanOrEqual(700)
  expect(initial.bounds.height).toBeGreaterThanOrEqual(500)

  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    window.setBounds({ x: 120, y: 80, width: 1000, height: 700 })
  })
  await new Promise((resolve) => setTimeout(resolve, 800))
  await application.close()

  application = await electron.launch({
    args: [resolve('.')],
    env: environment,
  })
  await waitForAppWindows(application)
  const restored = await readAgent(application)
  expect(restored.bounds.width).toBe(1000)
  expect(restored.bounds.height).toBe(700)
  await application.close()
})
