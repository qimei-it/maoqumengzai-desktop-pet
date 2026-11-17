import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let pet: Page
let settings: Page
let directory: string
const petId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1'

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-pet-cards-'))
  const data = join(directory, 'data')
  const pets = join(data, 'pets', petId)
  await mkdir(pets, { recursive: true })
  const poses = ['base', 'blink', 'focus', 'lifted', 'music', 'ponder']
  for (const pose of poses)
    await copyFile(
      resolve('src/renderer/assets/pet/ragdoll/base.png'),
      join(pets, `${pose}.png`),
    )
  await writeFile(
    join(pets, 'pet.json'),
    JSON.stringify({
      version: 1,
      id: petId,
      name: '测试桌宠',
      styleId: 'mqmz-watercolor',
      styleName: '麻薯柔和水彩',
      model: 'doubao-seedream-5-5-261028',
      species: '鱼',
      createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      poses: Object.fromEntries(poses.map((pose) => [pose, `${pose}.png`])),
    }),
  )

  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = data
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_DEEPSEEK_MODELS_URL = 'http://127.0.0.1:1/models'
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
})

test.afterAll(async () => {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
})

test('the profile page lists the built-in pet and every saved pet', async () => {
  await pet.evaluate(() => window.mqmz!.command({ type: 'settings-open' }))
  await pet.evaluate(() =>
    window.mqmz!.command({ type: 'settings-section', section: 'profile' }),
  )
  // Settings is torn down on close, so always take the live page.
  settings = application
    .windows()
    .find((page) => !page.isClosed() && page.url().includes('view=settings'))!

  const cards = settings.locator('.pet-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toContainText('麻薯')
  await expect(cards.nth(1)).toContainText('测试桌宠')
  // The built-in cat is the active one until another pet is chosen.
  await expect(cards.nth(0)).toHaveAttribute('aria-current', 'true')

  const state = await pet.evaluate(async () => {
    const result = await window.mqmz!.snapshot()
    return result.ok ? result.value.pets : []
  })
  expect(state).toHaveLength(2)
  expect(state[0]).toMatchObject({ id: 'default', name: '麻薯', active: true })
  expect(state[1]).toMatchObject({ id: petId, species: '鱼', active: false })
})

test('clicking a saved pet switches to it and back', async () => {
  const cards = settings.locator('.pet-card')
  await cards.nth(1).click()
  await expect
    .poll(async () => {
      const result = await pet.evaluate(() => window.mqmz!.snapshot())
      return result.ok
        ? result.value.pets.find((item) => item.active)?.id
        : undefined
    })
    .toBe(petId)

  settings = application
    .windows()
    .find((page) => !page.isClosed() && page.url().includes('view=settings'))!
  await expect(settings.locator('.pet-card').nth(1)).toHaveAttribute(
    'aria-current',
    'true',
  )

  await pet.evaluate(() => window.mqmz!.command({ type: 'pet-select', id: 'default' }))
  await expect
    .poll(async () => {
      const result = await pet.evaluate(() => window.mqmz!.snapshot())
      return result.ok
        ? result.value.pets.find((item) => item.active)?.id
        : undefined
    })
    .toBe('default')
})
