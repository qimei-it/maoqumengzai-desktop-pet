import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let pet: Page
let todo: Page
let toast: Page

async function snapshot() {
  const result = await pet.evaluate(() => window.mqmz!.snapshot())
  if (!result.ok) throw new Error('snapshot failed')
  return result.value
}

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-todo-toast-'))
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
  todo = pages.find((item) => item.title.includes('待办清单'))!.page
  toast =
    pages.find((item) => item.page.url().includes('view=toast'))?.page ??
    pages.find((item) => item.title.includes('提示'))!.page
})

test.afterAll(async () => {
  await application.close()
})

test('todo reminder bubble opens its list and reveals the due todo', async () => {
  await pet.evaluate(() =>
    window.mqmz!.command({
      type: 'todo-list-add',
      name: '提醒清单',
      color: 'blue',
    }),
  )
  let listId = ''
  await expect
    .poll(async () => {
      const state = await snapshot()
      listId =
        state.focus.todoLists.find((list) => list.name === '提醒清单')?.id ?? ''
      return listId
    })
    .not.toBe('')

  const dueAt = Date.now() + 1200
  await pet.evaluate(
    ({ listId, dueAt }) =>
      window.mqmz!.command({
        type: 'todo-add',
        text: '交周报',
        listId,
        dueAt,
      }),
    { listId, dueAt },
  )

  let todoId = ''
  await expect
    .poll(
      async () => {
        todoId = (await snapshot()).toastAction?.todoId ?? ''
        return todoId
      },
      { timeout: 10_000 },
    )
    .not.toBe('')

  const bubble = toast.locator('.toast-body.is-actionable')
  await expect(bubble).toBeVisible()
  await expect(toast.locator('.toast-surface')).toHaveClass(/is-actionable/)
  await expect(bubble).toHaveAttribute('title', '打开待办清单')
  await expect(bubble.locator('.toast-open-icon')).toBeVisible()

  await bubble.click()

  await expect
    .poll(() =>
      application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.getTitle().includes('待办清单'))
          ?.isVisible() ?? false,
      ),
    )
    .toBe(true)
  await expect(
    todo.locator('.todo-list-item', { hasText: '提醒清单' }),
  ).toHaveAttribute('aria-current', 'true')
  const row = todo.locator(`[data-todo-id="${todoId}"]`)
  await expect(row).toHaveClass(/revealed/)
  await expect(row).toContainText('交周报')
  await expect.poll(async () => (await snapshot()).todoFocus ?? null).toBeNull()
  await expect.poll(async () => (await snapshot()).toast ?? '').toBe('')

  await row.getByRole('button', { name: '标记完成' }).click()
  await expect
    .poll(async () => (await snapshot()).toast ?? '')
    .toBe('「交周报」完成啦，真棒')
})
