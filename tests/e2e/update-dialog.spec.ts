import { _electron as electron, expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

test('更新弹窗显示进度，支持取消、重新下载和安装', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-update-dialog-'))
  const data = join(directory, 'data')
  const shots = join(directory, 'shots')
  await mkdir(data, { recursive: true })
  await mkdir(shots, { recursive: true })
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  env.MQMZ_DATA_DIR = data
  env.MQMZ_SCREENSHOT_DIR = shots
  delete env.ELECTRON_RUN_AS_NODE
  const application = await electron.launch({ args: [resolve('.')], env })
  try {
    await waitForAppWindows(application)
    const pet = application.windows().find((page) => page.url().includes('view=pet'))!
    await application.evaluate(({ app, shell }, sha256) => {
      Object.defineProperty(app, 'isPackaged', { configurable: true, value: true })
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url.startsWith('https://mqmz.qimeistudio.com/latest.json'))
          return Response.json({
            version: '9.9.9',
            assets: {
              [`${process.platform}-${process.arch}`]: {
                file: 'mqmz-9.9.9-fixture.dmg', size: 12, sha256,
              },
            },
          })
        if (url.endsWith('/mqmz-9.9.9-fixture.dmg')) {
          const stream = new ReadableStream({
            start(controller) {
              ;(globalThis as any).__mqmzUpdateStream = controller
              controller.enqueue(new TextEncoder().encode('hell'))
            },
          })
          return new Response(stream)
        }
        return originalFetch(input, init)
      }
      shell.openPath = async (path) => {
        ;(globalThis as any).__mqmzOpenedInstaller = path
        return ''
      }
    }, createHash('sha256').update('hello world!').digest('hex'))
    await pet.evaluate(() => window.mqmz!.command({ type: 'settings-open' }))
    await expect.poll(() => application.windows().some((page) => page.url().includes('view=settings'))).toBe(true)
    const settings = application.windows().find((page) => page.url().includes('view=settings'))!
    await settings.getByRole('button', { name: '关于' }).click()
    const row = settings.locator('.settings-row').filter({ has: settings.getByText('更新', { exact: true }) })
    await pet.evaluate(() => window.mqmz!.command({ type: 'update-check' }))
    await expect(row).toContainText('发现 v9.9.9')
    await row.getByRole('button', { name: '下载' }).click()
    const dialog = settings.getByRole('dialog', { name: '下载更新' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row).toContainText('发现 v9.9.9')

    await row.getByRole('button', { name: '下载' }).click()
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
    await application.evaluate(() => {
      const stream = (globalThis as any).__mqmzUpdateStream
      stream.enqueue(new TextEncoder().encode('o world!'))
      stream.close()
    })
    const done = settings.getByRole('dialog', { name: '更新已下载' })
    await expect(done.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    await done.getByRole('button', { name: '安装', exact: true }).click()
    await expect.poll(() => application.evaluate(() => (globalThis as any).__mqmzOpenedInstaller ?? '')).toContain('mqmz-9.9.9-fixture.dmg')
  } finally {
    await application.close().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})
