import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let pet: Page
let todo: Page
let directory: string

async function tags(): Promise<string[]> {
  const result = await pet.evaluate(() => window.mqmz!.snapshot())
  if (!result.ok) throw new Error(result.error)
  return result.value.focus.todoTags
}

async function todoTags(text: string): Promise<string[]> {
  const result = await pet.evaluate(() => window.mqmz!.snapshot())
  if (!result.ok) throw new Error(result.error)
  return result.value.focus.todos.find((item) => item.text === text)?.tags ?? []
}

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mqmz-todo-tags-'))
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = join(directory, 'data')
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  delete environment.ELECTRON_RUN_AS_NODE
  await mkdir(environment.MQMZ_DATA_DIR, { recursive: true })
  await mkdir(environment.MQMZ_SCREENSHOT_DIR, { recursive: true })
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
  todo = windows.find((item) => item.title.includes('待办清单'))!.page
})

test.afterAll(async () => {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
})

test('tags can be renamed and removed from their context menu', async () => {
  await pet.evaluate(() =>
    window.mqmz!.command({
      type: 'todo-add',
      text: '标签测试',
      tags: ['工作', '生活'],
    }),
  )
  await expect.poll(() => tags()).toEqual(['工作', '生活'])

  const work = todo.locator('.todo-tag-chip', { hasText: '#工作' })
  await work.click({ button: 'right' })
  await expect(todo.locator('.todo-tag-menu')).toBeVisible()
  await todo
    .locator('.todo-tag-menu')
    .getByRole('menuitem', { name: '重命名' })
    .click()

  const input = todo.locator('.todo-tag-rename')
  await expect(input).toBeVisible()
  await input.fill('项目')
  await input.press('Enter')

  await expect.poll(() => tags()).toEqual(['项目', '生活'])
  await expect.poll(() => todoTags('标签测试')).toEqual(['项目', '生活'])
  await expect(
    todo.locator('.todo-tag-chip', { hasText: '#项目' }),
  ).toHaveCount(1)

  const life = todo.locator('.todo-tag-chip', { hasText: '#生活' })
  await life.click({ button: 'right' })
  await todo
    .locator('.todo-tag-menu')
    .getByRole('menuitem', { name: '删除' })
    .click()

  await expect.poll(() => tags()).toEqual(['项目'])
  await expect.poll(() => todoTags('标签测试')).toEqual(['项目'])
  await expect(
    todo.locator('.todo-tag-chip', { hasText: '#生活' }),
  ).toHaveCount(0)
})

test('the todo window can grow and restores its default size', async () => {
  await pet.evaluate(() => window.mqmz!.command({ type: 'todo-open' }))
  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) => {
        const target = BrowserWindow.getAllWindows().find((item) =>
          item.getTitle().includes('待办清单'),
        )
        return target?.isVisible() ?? false
      }),
    )
    .toBe(true)

  const windowState = () =>
    application.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows().find((item) =>
        item.getTitle().includes('待办清单'),
      )
      if (!target) throw new Error('todo window missing')
      return {
        resizable: target.isResizable(),
        maximizable: target.isMaximizable(),
        minimum: target.getMinimumSize(),
        maximized: target.isMaximized(),
        size: target.getSize(),
      }
    })

  const initial = await windowState()
  expect(initial.resizable).toBe(true)
  expect(initial.maximizable).toBe(true)
  expect(initial.minimum).toEqual([1000, 800])

  await todo.evaluate(() =>
    window.mqmz!.command({ type: 'panel-control', action: 'toggle-default' }),
  )
  await expect.poll(async () => (await windowState()).maximized).toBe(true)

  await todo.evaluate(() =>
    window.mqmz!.command({ type: 'panel-control', action: 'toggle-default' }),
  )
  await expect.poll(async () => (await windowState()).maximized).toBe(false)

  const restored = await windowState()
  expect(restored.size[0]).toBeGreaterThanOrEqual(1000)
  expect(restored.size[1]).toBeGreaterThanOrEqual(800)
})
