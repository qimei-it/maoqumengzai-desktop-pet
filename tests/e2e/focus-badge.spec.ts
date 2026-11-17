import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let pet: Page
let badge: Page
let pomodoro: Page
let directory: string

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-badge-'))
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = join(directory, 'data')
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_DEEPSEEK_MODELS_URL = 'http://127.0.0.1:1/models'
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
  badge = windows.find((item) => item.title.includes('计时环'))!.page
  pomodoro = windows.find((item) => item.title.includes('番茄时钟'))!.page
})

test.afterAll(async () => {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
})

async function startPhase(phase: 'focus' | 'short' | 'long'): Promise<void> {
  await pet.evaluate(() => window.mqmz!.command({ type: 'pomodoro-open' }))
  // Switching phases is refused while a timer runs, so settle it first.
  await pet.evaluate(() => window.mqmz!.command({ type: 'focus-pause' }))
  await pet.evaluate(() => window.mqmz!.command({ type: 'focus-reset' }))
  await pet.evaluate(
    (value) => window.mqmz!.command({ type: 'focus-phase', phase: value }),
    phase,
  )
  await pet.evaluate(() => window.mqmz!.command({ type: 'focus-start' }))
  // The ring only shows while the pomodoro panel is closed.
  await pet.evaluate(() => window.mqmz!.command({ type: 'pomodoro-close' }))
}

async function ring(): Promise<{
  stroke: string
  text: string
  className: string
}> {
  return badge.evaluate(() => {
    const progress = document.querySelector('.focus-badge-progress')!
    const label = document.querySelector('.focus-badge-ring span')!
    return {
      stroke: getComputedStyle(progress).stroke,
      text: getComputedStyle(label).color,
      className: progress.getAttribute('class') ?? '',
    }
  })
}

async function snapshot(): Promise<{
  phase: string
  running: boolean
}> {
  const result = await pet.evaluate(() => window.mqmz!.snapshot())
  if (!result.ok) throw new Error(result.error)
  return { phase: result.value.focus.phase, running: result.value.focus.running }
}

test('focus and both breaks share one countdown ring with distinct colours', async () => {
  await startPhase('focus')
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.getTitle().includes('计时环'))!
          .isVisible(),
      ),
    )
    .toBe(true)
  const focus = await ring()
  expect(focus.className).toContain('is-focus')
  // The countdown text, colon included, uses the ring colour.
  expect(focus.text).toBe(focus.stroke)

  const pose = await pet.evaluate(() => {
    const image = document.querySelector('.marker')
    return image?.getAttribute('src') ?? ''
  })
  expect(pose).toContain('focus')

  await startPhase('short')
  const short = await ring()
  expect(short.className).toContain('is-short')
  expect(short.stroke).not.toBe(focus.stroke)
  expect(short.text).toBe(short.stroke)

  await startPhase('long')
  const long = await ring()
  expect(long.className).toContain('is-long')
  expect(long.stroke).not.toBe(focus.stroke)
  expect(long.stroke).not.toBe(short.stroke)
  expect(long.text).toBe(long.stroke)

  // Same pet state in every phase.
  const poseAfter = await pet.evaluate(() => {
    const image = document.querySelector('.marker')
    return image?.getAttribute('src') ?? ''
  })
  expect(poseAfter).toContain('focus')
})

test('a running timer is not stopped by switching phases', async () => {
  await startPhase('focus')
  expect(await snapshot()).toEqual({ phase: 'focus', running: true })

  // The tab is disabled while running, and the command refuses the switch.
  await pet.evaluate(() => window.mqmz!.command({ type: 'pomodoro-open' }))
  await expect
    .poll(() =>
      pomodoro.evaluate(() =>
        [...document.querySelectorAll('.focus-phases button')].every(
          (button) => (button as HTMLButtonElement).disabled,
        ),
      ),
    )
    .toBe(true)
  await pet.evaluate(() =>
    window.mqmz!.command({ type: 'focus-phase', phase: 'short' }),
  )
  expect(await snapshot()).toEqual({ phase: 'focus', running: true })

  // Pausing re-enables the switch, and only then does the phase change.
  await pet.evaluate(() => window.mqmz!.command({ type: 'focus-pause' }))
  await expect
    .poll(() =>
      pomodoro.evaluate(() =>
        [...document.querySelectorAll('.focus-phases button')].every(
          (button) => !(button as HTMLButtonElement).disabled,
        ),
      ),
    )
    .toBe(true)
  await pet.evaluate(() =>
    window.mqmz!.command({ type: 'focus-phase', phase: 'short' }),
  )
  expect(await snapshot()).toEqual({ phase: 'short', running: false })

  await pet.evaluate(() => window.mqmz!.command({ type: 'focus-start' }))
  expect(await snapshot()).toEqual({ phase: 'short', running: true })
})
