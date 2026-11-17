import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let pet: Page
let settings: Page
let agent: Page
let panels: Array<{ name: string; page: Page }> = []
let directory: string

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-a11y-'))
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
  pet = windows.find((item) => item.title.includes('交互标记'))!.page
  settings = windows.find((item) => item.title.includes('设置'))!.page
  agent = windows.find((item) => item.title.includes('智能体'))!.page
  panels = [
    '设置',
    '智能体',
    '邮件',
    '待办清单',
    '剪贴板',
    '宠物档案',
    '文件转换',
    '批量重命名',
    '番茄时钟',
    '休息提醒',
  ].map((name) => ({
    name,
    page: windows.find((item) => item.title.includes(name))!.page,
  }))
})

test.afterAll(async () => {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
})

/** Interactive elements without any accessible name. */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const name = (element: Element): string => {
      const aria = element.getAttribute('aria-label')?.trim()
      if (aria) return aria
      const labelled = element.getAttribute('aria-labelledby')
      if (labelled) {
        const text = labelled
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim()
        if (text) return text
      }
      const title = element.getAttribute('title')?.trim()
      if (title) return title
      const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text) return text
      const placeholder = element.getAttribute('placeholder')?.trim()
      return placeholder ?? ''
    }
    const selector =
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"]'
    return [...document.querySelectorAll(selector)]
      .filter((element) => {
        const style = getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      .filter((element) => !name(element))
      .map((element) => element.outerHTML.slice(0, 120))
  })
}

test('every visible control exposes an accessible name', async () => {
  await pet.evaluate(() => window.mqmz!.command({ type: 'settings-open' }))
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.getTitle().includes('设置'))!
          .isVisible(),
      ),
    )
    .toBe(true)

  for (const panel of panels) {
    const unnamed = await unnamedControls(panel.page)
    expect(unnamed, `未命名的控件（${panel.name}）`).toEqual([])
  }
})

test('reduced motion stops panel animations', async () => {
  await settings.emulateMedia({ reducedMotion: 'reduce' })
  // Give the media query a frame to apply.
  await settings.waitForTimeout(150)
  const running = await settings.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => {
        const target = (animation as CSSAnimation).animationName
        return typeof target === 'string' ? target : 'unknown'
      }),
  )
  expect(running).toEqual([])
})

test('the create-pet dialog takes focus and closes with Escape', async () => {
  await pet.evaluate(() => window.mqmz!.command({ type: 'pet-create-open' }))
  const dialog = settings.getByRole('dialog', { name: '新建桌宠' })
  await expect(dialog).toBeVisible()
  const inside = await settings.evaluate(() => {
    const active = document.activeElement
    const dialog = document.querySelector('[role="dialog"]')
    return Boolean(active && dialog && dialog.contains(active))
  })
  expect(inside).toBe(true)

  await settings.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('segmented tab labels stay bold in every state', async () => {
  for (const [name, selector] of [
    ['番茄时钟', '.focus-phases button'],
    ['休息提醒', '.break-tabs button'],
  ] as const) {
    const page = panels.find((panel) => panel.name === name)!.page
    const weights = await page.evaluate(
      (value) =>
        [...document.querySelectorAll(value)].map(
          (element) => getComputedStyle(element).fontWeight,
        ),
      selector,
    )
    expect(weights.length, name).toBeGreaterThan(1)
    expect(weights, name).toEqual(weights.map(() => '600'))
  }
})
