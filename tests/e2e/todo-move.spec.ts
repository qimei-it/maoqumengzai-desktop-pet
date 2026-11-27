import { _electron as electron, expect, test } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

test('清单移动分组、待办移动清单并在重启后保留', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-todo-move-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  env.MQMZ_DATA_DIR = join(directory, 'data')
  env.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  delete env.ELECTRON_RUN_AS_NODE
  await mkdir(env.MQMZ_DATA_DIR, { recursive: true })
  await mkdir(env.MQMZ_SCREENSHOT_DIR, { recursive: true })
  let application = await electron.launch({ args: [resolve('.')], env })
  try {
    async function windows() {
      await waitForAppWindows(application)
      const pages = await Promise.all(application.windows().map(async (page) => ({ page, title: await page.title() })))
      return {
        pet: pages.find((item) => item.title.includes('交互标记'))!.page,
        todo: pages.find((item) => item.title.includes('待办清单'))!.page,
      }
    }
    let { pet, todo } = await windows()
    await pet.evaluate(async () => {
      await window.mqmz!.command({ type: 'todo-group-add', name: '生活日常' })
      await window.mqmz!.command({ type: 'todo-group-add', name: '工作事务' })
      await window.mqmz!.command({ type: 'todo-list-add', name: '购物清单' })
      await window.mqmz!.command({ type: 'todo-list-add', name: '工作清单' })
      await window.mqmz!.command({ type: 'todo-add', text: '买牛奶', tags: ['重要'], flagged: true })
      await window.mqmz!.command({ type: 'todo-open' })
    })
    const shopping = todo.locator('.todo-list-row', { hasText: '购物清单' })
    await expect(shopping).toBeVisible()
    await shopping.click({ button: 'right' })
    const groupMenu = todo.getByRole('menu', { name: '移动清单到分组' })
    await expect(groupMenu).toBeVisible()
    await todo.keyboard.press('Escape')
    await expect(groupMenu).toHaveCount(0)
    await shopping.click({ button: 'right' })
    await groupMenu.getByRole('menuitemradio', { name: '生活日常' }).click()
    const life = todo.locator('.todo-rail-group', { has: todo.locator('.todo-group-name', { hasText: '生活日常' }) })
    await expect(life.locator('.todo-list-row', { hasText: '购物清单' })).toBeVisible()
    await shopping.click({ button: 'right' })
    await groupMenu.getByRole('menuitemradio', { name: '工作事务' }).click()
    const work = todo.locator('.todo-rail-group', { has: todo.locator('.todo-group-name', { hasText: '工作事务' }) })
    await expect(work.locator('.todo-list-row', { hasText: '购物清单' })).toBeVisible()
    await shopping.click({ button: 'right' })
    await groupMenu.getByRole('menuitemradio', { name: '未分组' }).click()
    await expect(life.locator('.todo-list-row', { hasText: '购物清单' })).toHaveCount(0)
    await shopping.click({ button: 'right' })
    await groupMenu.getByRole('menuitemradio', { name: '生活日常' }).click()
    const item = todo.locator('.todo-item')
    await item.click({ button: 'right' })
    const itemMenu = todo.getByRole('menu', { name: '移动待办到清单' })
    await expect(itemMenu).toBeVisible()
    await todo.screenshot({ path: '/private/tmp/mqmz-todo-move-menu.png' })
    await itemMenu.getByRole('menuitemradio', { name: '购物清单' }).click()
    await shopping.locator('.todo-list-item').click()
    await expect(todo.locator('.todo-item', { hasText: '买牛奶' })).toBeVisible()
    await item.locator('.todo-content.view').click()
    await item.getByRole('button', { name: '移动待办到清单' }).click()
    await itemMenu.getByRole('menuitemradio', { name: '工作清单' }).click()
    await expect(item).toHaveCount(0)
    await todo.locator('.todo-list-row', { hasText: '工作清单' }).locator('.todo-list-item').click()
    await expect(item).toBeVisible()
    await item.click({ button: 'right' })
    await itemMenu.getByRole('menuitemradio', { name: '无清单' }).click()
    await expect(item).toHaveCount(0)
    await todo.getByRole('tab', { name: /全部/ }).click()
    await item.click({ button: 'right' })
    await itemMenu.getByRole('menuitemradio', { name: '购物清单' }).click()
    await expect.poll(async () => {
      const result = await pet.evaluate(() => window.mqmz!.snapshot())
      if (!result.ok) return null
      const list = result.value.focus.todoLists.find((entry) => entry.name === '购物清单')
      const group = result.value.focus.todoGroups.find((entry) => entry.name === '生活日常')
      const entry = result.value.focus.todos.find((entry) => entry.text === '买牛奶')
      return { group: list?.groupId === group?.id, list: entry?.listId === list?.id, flagged: entry?.flagged, tags: entry?.tags }
    }).toEqual({ group: true, list: true, flagged: true, tags: ['重要'] })
    await application.close()
    application = await electron.launch({ args: [resolve('.')], env })
    ;({ pet, todo } = await windows())
    const persisted = await pet.evaluate(() => window.mqmz!.snapshot())
    expect(persisted.ok).toBe(true)
    if (!persisted.ok) throw new Error(persisted.error)
    const list = persisted.value.focus.todoLists.find((entry) => entry.name === '购物清单')
    const group = persisted.value.focus.todoGroups.find((entry) => entry.name === '生活日常')
    const entry = persisted.value.focus.todos.find((entry) => entry.text === '买牛奶')
    expect(list?.groupId).toBe(group?.id)
    expect(entry?.listId).toBe(list?.id)
    expect(entry?.flagged).toBe(true)
    expect(entry?.tags).toEqual(['重要'])
  } finally {
    await application.close()
    await rm(directory, { recursive: true, force: true })
  }
})
