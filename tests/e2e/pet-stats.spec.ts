import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'
import { localDayKey } from '../../src/shared/pet-stats'

let application: ElectronApplication
let directory: string
let pet: Page
let profile: Page
let settings: Page

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-pet-stats-'))
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = join(directory, 'data')
  await mkdir(environment.MQMZ_DATA_DIR, { recursive: true })
  const now = Date.now()
  const days = [2, 1, 0].map((offset) => {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    return localDayKey(date.getTime())
  })
  await writeFile(
    join(environment.MQMZ_DATA_DIR, 'mqmz.pet-stats.json'),
    JSON.stringify({
      version: 1,
      firstSeenAt: now - 2 * 86_400_000,
      lastSeenAt: now,
      days,
      interactions: { poke: 4, focus: 2, water: 7, todo: 1 },
    }),
    'utf8',
  )
  delete environment.ELECTRON_RUN_AS_NODE
  application = await electron.launch({ args: [resolve('.')], env: environment })
  await waitForAppWindows(application)
  const windows = await Promise.all(
    application
      .windows()
      .map(async (page) => ({ page, title: await page.title() })),
  )
  const pick = (title: string): Page =>
    windows.find((item) => item.title.includes(title))!.page
  pet = pick('交互标记')
  profile = pick('宠物档案')
  settings = pick('设置')
})

test.afterAll(async () => {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
})

test('companion days show in the pet profile and settings card', async () => {
  await pet.evaluate(() => window.mqmz!.command({ type: 'profile-open' }))
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok && snapshot.value.profileOpen
    })
    .toBe(true)
  await expect(profile.getByText('已陪伴')).toBeVisible()
  await expect(profile.getByText('3 天')).toBeVisible()
  const layout = await profile.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('.profile-surface')!
    return { clientHeight: surface.clientHeight, scrollHeight: surface.scrollHeight }
  })
  expect(layout.scrollHeight).toBe(layout.clientHeight)
  await pet.evaluate(() => window.mqmz!.command({ type: 'profile-close' }))

  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-open' }),
  )
  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-section', section: 'profile' }),
  )
  await expect(settings.getByText('已陪伴 3 天')).toBeVisible()
})

test('a poke is recorded locally once per second', async () => {
  await pet.evaluate(() => window.mqmz!.command({ type: 'pet-poke' }))
  await pet.evaluate(() => window.mqmz!.command({ type: 'pet-poke' }))
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.petStats.interactions.poke : -1
    })
    .toBe(5)

  await new Promise<void>((done) => setTimeout(done, 1100))
  await pet.evaluate(() => window.mqmz!.command({ type: 'pet-poke' }))
  await expect
    .poll(async () => {
      const snapshot = await pet.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.petStats.interactions.poke : -1
    })
    .toBe(6)

  const stored = JSON.parse(
    await readFile(
      join(directory, 'data', 'mqmz.pet-stats.json'),
      'utf8',
    ),
  )
  expect(stored.version).toBe(1)
  expect(stored.interactions.poke).toBe(6)
  expect(stored.days).toHaveLength(3)
})
