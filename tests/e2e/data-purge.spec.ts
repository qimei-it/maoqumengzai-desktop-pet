import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication | undefined
let lab: Page
let directory = ''
let environment: Record<string, string> = {}
let dataDirectory = ''
let markerPath = ''

async function launch(): Promise<void> {
  application = await electron.launch({ args: [resolve('.')], env: environment })
  await waitForAppWindows(application)
  const pages = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  )
  lab = pages.find((item) => item.title.includes('验证台'))!.page
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-purge-e2e-'))
  dataDirectory = join(directory, 'data')
  markerPath = join(directory, 'mqmz-data-purge.json')
  environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = dataDirectory
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_TEST_NO_RELAUNCH = '1'
  await mkdir(environment.MQMZ_SCREENSHOT_DIR, { recursive: true })
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(join(dataDirectory, 'mqmz.sentinel'), 'keep until restart')
  await launch()
})

test.afterAll(async () => {
  await application?.close().catch(() => {})
})

test('deleting local data clears it on the next start', async () => {
  test.setTimeout(120_000)
  await application!.evaluate(({ dialog }) => {
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox =
      async () => ({ response: 1, checkboxChecked: false })
  })
  await lab.evaluate(() =>
    window.mqmz!.command({ type: 'settings-delete-data' }),
  )

  await expect.poll(() => existsSync(markerPath)).toBe(true)
  // The running app keeps its files; the wipe only happens after restart.
  expect(existsSync(join(dataDirectory, 'mqmz.sentinel'))).toBe(true)

  await application!.close()
  application = undefined
  delete environment.MQMZ_TEST_NO_RELAUNCH
  await launch()

  expect(existsSync(markerPath)).toBe(false)
  expect(existsSync(join(dataDirectory, 'mqmz.sentinel'))).toBe(false)
  expect(existsSync(dataDirectory)).toBe(true)
})