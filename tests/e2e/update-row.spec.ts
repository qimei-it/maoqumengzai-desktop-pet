import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let lab: Page
let pet: Page
let settings: Page
let agent: Page
let directory: string

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-update-e2e-'))
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = join(directory, 'data')
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_DEEPSEEK_MODELS_URL = 'http://127.0.0.1:1/models'
  environment.MQMZ_QUOTA_DEEPSEEK_URL = 'http://127.0.0.1:1/balance'
  environment.MQMZ_QUOTA_OPENAI_URL = 'http://127.0.0.1:1/usage'
  await mkdir(environment.MQMZ_DATA_DIR, { recursive: true })
  await mkdir(environment.MQMZ_SCREENSHOT_DIR, { recursive: true })
  delete environment.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    args: [resolve('.')],
    env: environment,
  })
  await waitForAppWindows(application)
  const windows = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  )
  lab = windows.find((item) => item.title.includes('验证台'))!.page
  pet = windows.find((item) => item.title.includes('交互标记'))!.page
  settings = windows.find((item) => item.title.includes('设置'))!.page
  agent = windows.find((item) => item.title.includes('智能体'))!.page
})

test.afterAll(async () => {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
})

test('about section shows the version and keeps updates off when unpackaged', async () => {
  await pet.evaluate(() => window.mqmz!.command({ type: 'settings-open' }))
  const settingsVisible = () =>
    application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle().includes('设置'))!
        .isVisible(),
    )
  await expect.poll(settingsVisible).toBe(true)
  await settings.getByRole('button', { name: '关于' }).click()
  await expect(
    settings.getByRole('button', { name: '关于' }),
  ).toHaveAttribute('aria-current', 'page')

  const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as {
    version: string
  }
  const versionRow = settings
    .locator('.settings-row')
    .filter({ has: settings.getByText('版本', { exact: true }) })
  await expect(versionRow).toContainText(`v${pkg.version}`)

  const updateRow = settings
    .locator('.settings-row')
    .filter({ has: settings.getByText('更新', { exact: true }) })
  await expect(updateRow).toContainText('当前版本不检查更新')
  await expect(updateRow.getByRole('button')).toHaveCount(0)
})

/**
 * The installer guard reads these scopes before quitting. Both renderers
 * (mail compose, agent composer) report through the same command, so the
 * contract is checked here without driving two extra panels.
 */
test('tracks unsaved scopes so the installer can ask before quitting', async () => {
  const unsaved = () =>
    lab.evaluate(async () => {
      const result = await window.mqmz!.snapshot()
      return result.ok ? result.value.unsaved : []
    })

  await expect.poll(unsaved).toEqual([])

  for (const scope of ['agent-input', 'mail-compose'] as const) {
    const result = await pet.evaluate(
      (value) =>
        window.mqmz!.command({ type: 'dirty-state', scope: value, dirty: true }),
      scope,
    )
    expect(result.ok).toBe(true)
    await expect.poll(unsaved).toContain(scope)

    await pet.evaluate(
      (value) =>
        window.mqmz!.command({
          type: 'dirty-state',
          scope: value,
          dirty: false,
        }),
      scope,
    )
    await expect.poll(unsaved).not.toContain(scope)
  }
})

/** The renderer side: an unsent agent message must register as unsaved work. */
test('an unsent agent message counts as unsaved work', async () => {
  test.setTimeout(120_000)
  const unsaved = () =>
    lab.evaluate(async () => {
      const result = await window.mqmz!.snapshot()
      return result.ok ? result.value.unsaved : []
    })

  await pet.evaluate(() => window.mqmz!.command({ type: 'agent-open' }))
  const agentPage = agent

  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.getTitle().includes('智能体'))!
          .isVisible(),
      ),
    )
    .toBe(true)

  // Without a saved key the panel shows the provider setup, not the composer.
  await agentPage.getByLabel('DeepSeek API Key').fill('sk-agent-test')
  await application.evaluate(() => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [{ id: 'deepseek-flash' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
  })
  await agentPage.getByRole('button', { name: '测试延迟' }).click()
  await expect(agentPage.locator('.agent-latency')).toContainText('ms')
  await agentPage.getByRole('button', { name: '保存', exact: true }).click()

  const input = agentPage.locator('.agent-input')
  await expect(input).toBeVisible()
  await input.fill('还没发出去的消息')
  await expect.poll(unsaved).toContain('agent-input')

  await input.fill('')
  await expect.poll(unsaved).not.toContain('agent-input')
})
