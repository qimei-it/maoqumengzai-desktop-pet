import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let pet: Page
let directory: string

const quietStart = 22
const quietEnd = 8
// 2026-11-18 07:50 local; the next 5-minute break lands at 08:00 sharp.
const beforeDndEnd = new Date(2026, 10, 18, 7, 50).getTime()
const dndEnd = new Date(2026, 10, 18, 8, 0).getTime()

async function snapshot() {
  const result = await pet.evaluate(() => window.mqmz!.snapshot())
  if (!result.ok) throw new Error(result.error)
  return result.value
}

async function patchNow(value: number) {
  await application.evaluate((_electron, now) => {
    const state = globalThis as typeof globalThis & {
      __mqmzRealNow?: () => number
    }
    if (!state.__mqmzRealNow) state.__mqmzRealNow = Date.now
    Date.now = () => now
  }, value)
}

async function restoreNow() {
  await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __mqmzRealNow?: () => number
    }
    if (state.__mqmzRealNow) {
      Date.now = state.__mqmzRealNow
      delete state.__mqmzRealNow
    }
  })
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-break-dnd-'))
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = join(directory, 'data')
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_QUOTA_DEEPSEEK_URL = 'http://127.0.0.1:1/balance'
  environment.MQMZ_QUOTA_OPENAI_URL = 'http://127.0.0.1:1/usage'
  delete environment.ELECTRON_RUN_AS_NODE
  await mkdir(environment.MQMZ_DATA_DIR, { recursive: true })
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
  pet = pages.find((item) => item.title.includes('交互标记'))!.page
})

test.afterAll(async () => {
  await restoreNow().catch(() => {})
  await application?.close()
  await rm(directory, { recursive: true, force: true })
})

test('the first sitting reminder after the quiet window fires once', async () => {
  await patchNow(beforeDndEnd)
  await pet.evaluate(
    ({ start, end }) =>
      window.mqmz!.command({
        type: 'break-dnd',
        enabled: true,
        start,
        end,
      }),
    { start: quietStart, end: quietEnd },
  )
  await pet.evaluate(() =>
    window.mqmz!.command({
      type: 'break-interval',
      kind: 'sitting',
      minutes: 5,
    }),
  )
  await pet.evaluate(() =>
    window.mqmz!.command({ type: 'break-toggle', kind: 'sitting', enabled: true }),
  )

  await expect
    .poll(async () => (await snapshot()).focus.breakSittingNextAt ?? 0)
    .toBe(dndEnd)

  // Nothing may speak while the quiet window is still active.
  await new Promise((resolve) => setTimeout(resolve, 1_500))
  const quiet = await snapshot()
  expect(
    quiet.events.some((event) => event.message.includes('久坐提醒')),
  ).toBe(false)

  // Cross 08:00, then nudge the scheduler with an unrelated persisted change.
  await patchNow(dndEnd + 5_000)
  await pet.evaluate(() =>
    window.mqmz!.command({ type: 'water-goal', goal: 8 }),
  )

  await expect
    .poll(
      async () => {
        const state = await snapshot()
        return state.events.some((event) =>
          event.message.includes('久坐提醒'),
        )
      },
      { timeout: 10_000 },
    )
    .toBe(true)

  const after = await snapshot()
  expect(after.focus.breakSittingNextAt ?? 0).toBeGreaterThan(dndEnd)
  // Only one reminder for this boundary.
  expect(
    after.events.filter((event) => event.message.includes('久坐提醒')),
  ).toHaveLength(1)
})
