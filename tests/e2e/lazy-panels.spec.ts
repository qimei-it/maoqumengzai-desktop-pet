import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Panels are created on first use. This spec runs with eager creation turned
 * off, so it also guards the default production behaviour.
 */
test('panels are created only when first opened', async () => {
  test.setTimeout(90_000)
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-lazy-'))
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = join(directory, 'data')
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.MQMZ_EAGER_WINDOWS
  await mkdir(environment.MQMZ_DATA_DIR, { recursive: true })
  await mkdir(environment.MQMZ_SCREENSHOT_DIR, { recursive: true })

  let application: ElectronApplication | undefined
  try {
    application = await electron.launch({
      args: [resolve('.')],
      env: environment,
    })
    const titles = () =>
      Promise.all(application!.windows().map((page) => page.title()))
    const has = async (needle: string) =>
      (await titles()).some((title) => title.includes(needle))
    const visible = (needle: string) =>
      application!.evaluate(
        ({ BrowserWindow }, value) =>
          BrowserWindow.getAllWindows().some(
            (window) =>
              window.getTitle().includes(value) && window.isVisible(),
          ),
        needle,
      )

    await expect.poll(() => has('交互标记'), { timeout: 20_000 }).toBe(true)
    // No panel or overlay exists before it is requested.
    expect(await has('设置')).toBe(false)
    expect(await has('文件置物架')).toBe(false)
    expect(await has('气泡')).toBe(false)
    const beforeOpen = (await titles()).length

    const pet = application
      .windows()
      .find((page) => page.url().includes('view=pet'))
    expect(pet).toBeDefined()
    await pet!.evaluate(() => window.mqmz!.command({ type: 'settings-open' }))

    await expect.poll(() => has('设置')).toBe(true)
    const afterOpen = (await titles()).length
    // Only the requested panel is built, not the whole panel set.
    expect(afterOpen).toBe(beforeOpen + 1)

    // Reopening a retained panel reuses the same window.
    await pet!.evaluate(() => window.mqmz!.command({ type: 'settings-close' }))
    await expect.poll(() => visible('设置')).toBe(false)
    await pet!.evaluate(() => window.mqmz!.command({ type: 'settings-open' }))
    await expect.poll(() => visible('设置')).toBe(true)
    await expect.poll(() => titles().then((list) => list.length)).toBe(afterOpen)

    // Overlays are also created on demand: a toast must still appear.
    await pet!.evaluate(() => window.mqmz!.command({ type: 'pet-default' }))
    await expect.poll(() => has('提示')).toBe(true)
  } finally {
    await application?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
