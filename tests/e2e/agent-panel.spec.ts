import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page
let settings: Page
let dataDirectory = ''
const errors: string[] = []

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-ui-'))
  dataDirectory = directory
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = join(directory, 'data')
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_QUOTA_DEEPSEEK_URL = 'http://127.0.0.1:1/balance'
  environment.MQMZ_QUOTA_OPENAI_URL = 'http://127.0.0.1:1/usage'
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
  agent = pages.find((item) => item.title.includes('智能体'))!.page
  settings = pages.find((item) => item.title.includes('设置'))!.page
  agent.on('pageerror', (error) => errors.push(error.message))
})

test.afterAll(async () => {
  await application.close()
})

test('agent panel configures, switches mode, and keeps sessions', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await expect(
    agent.getByRole('heading', { name: '连接 DeepSeek', exact: true }),
  ).toBeVisible()
  await agent.getByLabel('DeepSeek API Key').fill('sk-agent-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('对话模型')).toBeVisible()

  await agent.getByLabel('对话模型').selectOption('deepseek-v4-pro')
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.model : ''
    })
    .toBe('deepseek-v4-pro')

  await agent.getByRole('button', { name: '计划', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.mode : ''
    })
    .toBe('plan')

  const before = await agent.evaluate(() => window.mqmz!.snapshot())
  const count = before.ok ? before.value.agent.sessions.length : 0
  await agent.locator('.agent-new-chat').click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.sessions.length : 0
    })
    .toBe(count + 1)

  expect(errors).toEqual([])
})

test('projects group sessions and support session actions', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  const workspace = process.cwd()
  const name = workspace.split('/').filter(Boolean).pop()!
  await agent.evaluate(
    ({ name, workspace }) =>
      window.mqmz!.command({
        type: 'agent-project-create',
        name,
        workspace,
      }),
    { name, workspace },
  )

  const invalid = await agent.evaluate(() =>
    window.mqmz!.command({
      type: 'agent-project-create',
      name: '无效项目',
      workspace: '/definitely/not/a/real/folder',
    }),
  )
  expect(invalid.ok).toBe(false)

  let projectId = ''
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      const project = snapshot.ok
        ? snapshot.value.agent.projects.find(
            (item) => item.workspace === workspace,
          )
        : undefined
      projectId = project?.id ?? ''
      return Boolean(projectId)
    })
    .toBe(true)

  await agent.evaluate(
    (id) => window.mqmz!.command({ type: 'agent-project-new', projectId: id }),
    projectId,
  )

  let sessionId = ''
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      const session = snapshot.ok
        ? snapshot.value.agent.sessions.find(
            (item) => item.projectId === projectId,
          )
        : undefined
      sessionId = session?.id ?? ''
      return Boolean(sessionId)
    })
    .toBe(true)

  await expect(agent.getByText('项目', { exact: true })).toBeVisible()
  const projectRow = agent
    .locator('.agent-project-row')
    .filter({ hasText: name })
  await expect(projectRow).toBeVisible()

  await projectRow.hover()
  await projectRow.getByRole('button', { name: '项目菜单' }).click()
  for (const label of ['置顶', '编辑', /Finder|资源管理器/, '删除']) {
    await expect(
      agent.getByRole('menuitem', {
        name: label instanceof RegExp ? label : new RegExp(label),
      }),
    ).toBeVisible()
  }
  await agent.keyboard.press('Escape')
  await expect(
    agent.locator('.agent-project-sessions .agent-session').first(),
  ).toBeVisible()

  await agent.evaluate(
    ({ id }) =>
      window.mqmz!.command({
        type: 'agent-session-rename',
        id,
        title: '重命名测试',
      }),
    { id: sessionId },
  )
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok
        ? snapshot.value.agent.sessions.find((item) => item.id === sessionId)
            ?.title
        : ''
    })
    .toBe('重命名测试')

  const sessionRow = agent
    .locator('.agent-project-sessions .agent-session')
    .filter({ hasText: '重命名测试' })
  await sessionRow.hover()
  await sessionRow.getByRole('button', { name: '对话菜单' }).click()
  await expect(
    agent.getByRole('menuitem', { name: '重命名' }),
  ).toBeVisible()
  await expect(agent.getByRole('menuitem', { name: '移动' })).toBeVisible()
  await agent.keyboard.press('Escape')

  await agent.evaluate(
    ({ id }) =>
      window.mqmz!.command({
        type: 'agent-session-move',
        id,
        projectId: null,
      }),
    { id: sessionId },
  )
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok
        ? snapshot.value.agent.sessions.find((item) => item.id === sessionId)
            ?.projectId
        : projectId
    })
    .toBeNull()

  await agent.evaluate(
    ({ id }) =>
      window.mqmz!.command({
        type: 'agent-session-pin',
        id,
        pinned: true,
      }),
    { id: sessionId },
  )
  await agent.evaluate(
    ({ id }) =>
      window.mqmz!.command({
        type: 'agent-project-pin',
        id,
        pinned: true,
      }),
    { id: projectId },
  )
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      if (!snapshot.ok) return false
      const session = snapshot.value.agent.sessions.find(
        (item) => item.id === sessionId,
      )
      const project = snapshot.value.agent.projects.find(
        (item) => item.id === projectId,
      )
      return session?.pinned === true && project?.pinned === true
    })
    .toBe(true)

  await agent.evaluate(
    ({ id, projectId }) =>
      window.mqmz!.command({
        type: 'agent-session-move',
        id,
        projectId,
      }),
    { id: sessionId, projectId },
  )
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok
        ? snapshot.value.agent.sessions.find((item) => item.id === sessionId)
            ?.projectId
        : null
    })
    .toBe(projectId)

  await agent.evaluate(
    ({ id }) =>
      window.mqmz!.command({
        type: 'agent-project-update',
        id,
        name: '项目重命名',
      }),
    { id: projectId },
  )
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok
        ? snapshot.value.agent.projects.find((item) => item.id === projectId)
            ?.name
        : ''
    })
    .toBe('项目重命名')

  await agent.evaluate(
    (id) => window.mqmz!.command({ type: 'agent-session-delete', id }),
    sessionId,
  )
  await agent.evaluate(
    (id) => window.mqmz!.command({ type: 'agent-project-delete', id }),
    projectId,
  )
})

test('agent window resizes, maximizes, and remembers bounds', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  const readWindow = () =>
    application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) =>
        item.getTitle().includes('智能体'),
      )!
      return {
        bounds: window.getBounds(),
        maximized: window.isMaximized(),
        resizable: window.isResizable(),
        maximizable: window.isMaximizable(),
      }
    })

  const initial = await readWindow()
  expect(initial.resizable).toBe(true)
  if (process.platform === 'darwin') expect(initial.maximizable).toBe(true)
  expect(initial.bounds.width).toBeGreaterThanOrEqual(700)

  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    window.setBounds({ ...window.getBounds(), width: 860, height: 600 })
  })
  await agent.waitForTimeout(600)
  const resized = await readWindow()
  expect(resized.bounds.width).toBe(860)
  expect(resized.bounds.height).toBe(600)

  await expect
    .poll(async () => {
      try {
        const saved = JSON.parse(
          await readFile(
            join(dataDirectory, 'data', 'mqmz.agent-window.json'),
            'utf8',
          ),
        ) as {
          bounds: { width: number; height: number }
          maximized: boolean
        }
        return `${saved.bounds.width}x${saved.bounds.height}:${saved.maximized}`
      } catch {
        return 'missing'
      }
    })
    .toBe('860x600:false')

  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'panel-control', action: 'maximize' }),
  )
  await expect
    .poll(async () => (await readWindow()).maximized)
    .toBe(true)
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agentMaximized : false
    })
    .toBe(true)
  await expect(agent.locator('.agent-shell.is-maximized')).toBeVisible()

  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'panel-control', action: 'maximize' }),
  )
  await expect
    .poll(async () => (await readWindow()).maximized)
    .toBe(false)
  expect((await readWindow()).bounds.width).toBe(860)

  await agent.locator('.agent-head').dblclick({
    position: { x: 300, y: 20 },
  })
  await expect
    .poll(async () => (await readWindow()).maximized, { timeout: 4000 })
    .toBe(true)
  await agent.locator('.agent-head').dblclick({
    position: { x: 300, y: 20 },
  })
  await expect
    .poll(async () => (await readWindow()).maximized, { timeout: 4000 })
    .toBe(false)
})

test('pet profile section exposes create and bind entries', async () => {
  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-open' }),
  )
  await settings.evaluate(() =>
    window.mqmz!.command({ type: 'settings-section', section: 'profile' }),
  )
  await expect(
    settings.getByRole('button', { name: '新建桌宠', exact: true }),
  ).toBeVisible()
  await expect(
    settings.getByRole('button', { name: '绑定小程序', exact: true }),
  ).toBeVisible()
  await settings.getByRole('button', { name: '新建桌宠', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await settings.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.toast : ''
    })
    .toBe('新建桌宠即将开放')
})
