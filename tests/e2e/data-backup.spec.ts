import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { unzipSync } from 'fflate'
import { defaultSettings } from '../../src/shared/settings'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let lab: Page
let settings: Page
let directory = ''
let environment: Record<string, string> = {}
let dataDirectory = ''

async function launch(): Promise<void> {
  application = await electron.launch({ args: [resolve('.')], env: environment })
  await waitForAppWindows(application)
  const pages = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  )
  lab = pages.find((item) => item.title.includes('验证台'))!.page
  settings = pages.find((item) => item.title.includes('设置'))!.page
}

async function snapshot() {
  const result = await lab.evaluate(() => window.mqmz!.snapshot())
  if (!result.ok) throw new Error(result.error)
  return result.value
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-backup-e2e-'))
  dataDirectory = join(directory, 'data')
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
  await writeFile(
    join(dataDirectory, 'mqmz.settings.json'),
    JSON.stringify({ ...defaultSettings, version: 2 }),
    'utf8',
  )
  await writeFile(
    join(dataDirectory, 'mqmz.ai.json'),
    JSON.stringify({ version: 1, key: 'plain:e2e-key' }),
    { mode: 0o600 },
  )
  await launch()
})

test.afterAll(async () => {
  await application?.close().catch(() => {})
})

test('automatic and manual backups restore the local data', async () => {
  test.setTimeout(180_000)
  await settings.evaluate(() => window.mqmz!.command({ type: 'settings-open' }))
  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-section', section: 'data' }),
  )
  await expect(settings.getByText('自动备份', { exact: true })).toBeVisible()
  await expect(
    settings.getByRole('button', { name: '导出…', exact: true }),
  ).toBeVisible()

  // The daily snapshot runs right after startup with no previous backup.
  await expect
    .poll(async () => (await snapshot()).backup.snapshots.length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => (await snapshot()).backup.busy)
    .toBe(false)
  const autoSwitch = settings.getByRole('switch', { name: '自动备份' })
  await expect(autoSwitch).toHaveAttribute('aria-checked', 'true')
  await autoSwitch.click()
  await expect
    .poll(async () => (await snapshot()).backup.autoEnabled)
    .toBe(false)
  await autoSwitch.click()
  await expect
    .poll(async () => (await snapshot()).backup.autoEnabled)
    .toBe(true)
  const firstSnapshot = (await snapshot()).backup.snapshots[0]

  // A manual export produces the same ZIP format.
  const exportPath = join(directory, 'manual-backup.zip')
  await application.evaluate(({ dialog }, path) => {
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog =
      async () => ({ canceled: false, filePath: path })
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox =
      async () => ({ response: 1, checkboxChecked: false })
  }, exportPath)
  await settings.getByRole('button', { name: '导出…', exact: true }).click()
  await expect
    .poll(async () => (await stat(exportPath).catch(() => null))?.size ?? 0, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0)
  const manifest = JSON.parse(
    new TextDecoder().decode(unzipSync(await readFile(exportPath))['manifest.json']),
  ) as { app: string; format: number; entries: number }
  expect(manifest.app).toBe('mqmz')
  expect(manifest.format).toBe(1)
  expect(manifest.entries).toBeGreaterThan(0)

  // Add a todo after the snapshot, then restore the snapshot.
  await lab.evaluate(() =>
    window.mqmz!.command({ type: 'todo-add', text: '恢复前待办' }),
  )
  await expect
    .poll(async () =>
      (await snapshot()).focus.todos.some((todo) => todo.text === '恢复前待办'),
    )
    .toBe(true)
  await settings.getByRole('button', { name: '选择备份…' }).click()
  await settings.getByRole('button', { name: '恢复', exact: true }).first().click()
  await expect
    .poll(() => existsSync(join(dataDirectory, 'pending-restore', 'payload')), {
      timeout: 30_000,
    })
    .toBe(true)
  await expect
    .poll(async () => (await snapshot()).backup.busy)
    .toBe(false)

  await application.close()
  await launch()

  const restored = await snapshot()
  expect(
    restored.focus.todos.some((todo) => todo.text === '恢复前待办'),
  ).toBe(false)
  expect(restored.backup.snapshots.length).toBeGreaterThanOrEqual(
    firstSnapshot ? 2 : 1,
  )
  expect(
    (await readFile(join(dataDirectory, 'mqmz.ai.json'), 'utf8')).includes(
      'plain:e2e-key',
    ),
  ).toBe(true)
  expect(existsSync(join(dataDirectory, 'pending-restore'))).toBe(false)
  const rollback = (await readdir(dataDirectory)).find((name) =>
    name.startsWith('backup-before-restore-'),
  )
  expect(rollback).toBeTruthy()

  // The restored app keeps working and persists new writes.
  await lab.evaluate(() =>
    window.mqmz!.command({ type: 'todo-add', text: '恢复后待办' }),
  )
  await expect
    .poll(
      async () =>
        (await readFile(join(dataDirectory, 'mqmz.focus.json'), 'utf8')).includes(
          '恢复后待办',
        ),
      { timeout: 15_000 },
    )
    .toBe(true)
  await expect
    .poll(async () => (await readFile(join(dataDirectory, 'mqmz.ai.json'), 'utf8')).includes('plain:e2e-key'))
    .toBe(true)
})
