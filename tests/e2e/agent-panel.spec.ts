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
  const keyInput = agent.getByLabel('DeepSeek API Key')
  const getKeyButton = agent.getByRole('button', { name: '获取 API Key' })
  const testButton = agent.getByRole('button', { name: '测试延迟' })
  const saveButton = agent.getByRole('button', { name: '保存', exact: true })
  await expect(getKeyButton).toBeVisible()
  await expect(agent.locator('.agent-external-icon')).toBeVisible()
  await expect(testButton).toBeDisabled()
  await expect(saveButton).toBeDisabled()
  const inputBox = await keyInput.boundingBox()
  const getKeyBox = await getKeyButton.boundingBox()
  const saveBox = await saveButton.boundingBox()
  expect(inputBox && getKeyBox && saveBox).toBeTruthy()
  if (inputBox && getKeyBox && saveBox) {
    expect(Math.abs(getKeyBox.x - inputBox.x)).toBeLessThanOrEqual(2)
    expect(
      Math.abs(saveBox.x + saveBox.width - (inputBox.x + inputBox.width)),
    ).toBeLessThanOrEqual(2)
  }
  await keyInput.fill('sk-agent-test')
  await expect(testButton).toBeEnabled()
  await expect(saveButton).toBeEnabled()
  await application.evaluate(() => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'deepseek-flash' }] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
  })
  await testButton.click()
  await expect(agent.locator('.agent-latency')).toContainText('ms')
  await saveButton.click()
  const input = agent.locator('.agent-input')
  await expect(input).toHaveAttribute(
    'placeholder',
    '让“麻薯”来帮你工作',
  )
  await expect(agent.locator('.agent-empty')).toContainText(
    '今天我们要做点什么？我可以处理待办、文件和邮件哦～',
  )
  await agent.evaluate(() =>
    window.mqmz!.command({
      type: 'settings-update',
      patch: { petName: '测试宠' },
    }),
  )
  await expect(input).toHaveAttribute(
    'placeholder',
    '让“测试宠”来帮你工作',
  )
  await agent.evaluate(() =>
    window.mqmz!.command({
      type: 'settings-update',
      patch: { petName: '麻薯' },
    }),
  )
  const modelTrigger = agent.getByRole('button', { name: /^选择模型/ })
  await expect(modelTrigger).toBeVisible()
  await expect(modelTrigger).toContainText('DeepSeek-V4.1-Flash')

  await modelTrigger.click()
  await agent
    .getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ })
    .click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.model : ''
    })
    .toBe('deepseek-v4-pro')

  await modelTrigger.click()
  await agent
    .getByRole('menuitemradio', { name: '最高', exact: true })
    .click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.reasoning : ''
    })
    .toBe('max')

  await agent.getByRole('button', { name: '计划', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.agent.mode : ''
    })
    .toBe('plan')

  const before = await agent.evaluate(() => window.mqmz!.snapshot())
  const count = before.ok ? before.value.agent.sessions.length : 0
  await agent.locator('.agent-new-chat').first().click()
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
  const name = '项目'.repeat(8)
  const fallbackName = (
    workspace.split('/').filter(Boolean).pop() ?? '项目'
  ).slice(0, 16)
  await agent.getByLabel('添加项目').click()
  const projectDialog = agent.locator('.agent-modal')
  await expect(
    projectDialog.getByRole('heading', { name: '创建项目', exact: true }),
  ).toBeVisible()
  await expect(
    projectDialog.locator('.agent-modal-head .agent-icon-button'),
  ).toHaveCount(0)
  await expect(
    projectDialog.getByRole('button', { name: '取消', exact: true }),
  ).toBeVisible()
  await projectDialog.getByRole('button', { name: '取消', exact: true }).click()
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

  const sessionProjectId = async () => {
    const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
    return snapshot.ok
      ? (snapshot.value.agent.sessions.find((item) => item.id === sessionId)
          ?.projectId ?? null)
      : projectId
  }

  const empty = agent.locator('.agent-empty')
  await expect(empty).toBeVisible()
  await expect(empty.locator('.agent-empty-project-name')).toHaveText(name)
  await expect(empty.locator('.agent-empty-project-dots')).toHaveText(/^\.+$/)
  await expect(empty.locator('br')).toHaveCount(1)
  expect(
    await empty.evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe('18px')
  expect(
    await empty.evaluate((element) => getComputedStyle(element).color),
  ).toBe('rgb(26, 26, 26)')
  expect(
    await empty
      .locator('.agent-empty-project-name')
      .evaluate((element) => getComputedStyle(element).fontWeight),
  ).toBe('600')
  const emptySpaces = await empty.locator('p').evaluate((element) => {
    const text = [...element.childNodes].map(
      (node) => node.textContent ?? '',
    )
    return {
      before: text[0]?.endsWith(' ') ?? false,
      after: text[2]?.startsWith(' ') ?? false,
    }
  })
  expect(emptySpaces).toEqual({ before: true, after: true })

  await agent.locator('.agent-workspace-select').click()
  const search = agent.getByPlaceholder('搜索项目')
  await expect(search).toBeVisible()
  await search.fill('没有这个项目')
  await expect(agent.getByText('没有匹配的项目')).toBeVisible()
  await search.fill(name)
  const projectOption = agent.getByRole('option', { name, exact: true })
  await expect(projectOption).toHaveAttribute('aria-selected', 'true')
  await agent.getByRole('button', { name: '不在项目中工作' }).click()
  await expect.poll(sessionProjectId).toBeNull()
  await expect(empty).toContainText(
    '今天我们要做点什么？我可以处理待办、文件和邮件哦～',
  )

  await agent.locator('.agent-workspace-select').click()
  await agent.getByRole('option', { name, exact: true }).click()
  await expect.poll(sessionProjectId).toBe(projectId)
  await expect(empty.locator('.agent-empty-project-name')).toHaveText(name)

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

  const pinnedSection = agent
    .locator('.agent-section')
    .filter({ hasText: '置顶' })
  await expect(pinnedSection).toBeVisible()
  const pinnedRow = pinnedSection
    .locator('.agent-session')
    .filter({ hasText: '重命名测试' })
  await expect(pinnedRow).toBeVisible()
  await pinnedRow.hover()
  await expect(
    pinnedRow.getByRole('button', { name: '取消置顶' }),
  ).toBeVisible()
  await expect(
    pinnedRow.getByRole('button', { name: '删除对话' }),
  ).toBeVisible()
  await expect(
    pinnedRow.getByRole('button', { name: '对话菜单' }),
  ).toHaveCount(0)
  await expect(
    agent
      .locator('.agent-project-sessions .agent-session')
      .filter({ hasText: '重命名测试' }),
  ).toHaveCount(0)

  await pinnedRow.getByRole('button', { name: '取消置顶' }).click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok
        ? snapshot.value.agent.sessions.find((item) => item.id === sessionId)
            ?.pinned
        : true
    })
    .toBe(false)
  await expect(
    agent
      .locator('.agent-project-sessions .agent-session')
      .filter({ hasText: '重命名测试' }),
  ).toBeVisible()

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

  const deletableSession = agent.locator('.agent-session', {
    hasText: '重命名测试',
  })
  await deletableSession.hover()
  await deletableSession.getByRole('button', { name: '对话菜单' }).click()
  await agent.getByRole('menuitem', { name: '删除', exact: true }).click()
  const sessionConfirm = agent.getByRole('alertdialog')
  await expect(sessionConfirm).toBeVisible()
  await expect(
    sessionConfirm.getByRole('button', { name: '取消', exact: true }),
  ).toBeVisible()
  await sessionConfirm.getByRole('button', { name: '确认', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok
        ? snapshot.value.agent.sessions.some((item) => item.id === sessionId)
        : true
    })
    .toBe(false)

  const deletableProject = agent.locator('.agent-project-row', {
    hasText: '项目重命名',
  })
  await deletableProject.hover()
  await deletableProject.getByRole('button', { name: '项目菜单' }).click()
  await agent.getByRole('menuitem', { name: '删除', exact: true }).click()
  const projectConfirm = agent.getByRole('alertdialog')
  await expect(projectConfirm).toBeVisible()
  await projectConfirm.getByRole('button', { name: '确认', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok
        ? snapshot.value.agent.projects.some((item) => item.id === projectId)
        : true
    })
    .toBe(false)

  const fallbackProject = await agent.evaluate(
    ({ workspace }) =>
      window.mqmz!.command({
        type: 'agent-project-create',
        name: '',
        workspace,
      }),
    { workspace },
  )
  expect(fallbackProject.ok).toBe(true)
  await expect
    .poll(async () => {
      const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok
        ? (snapshot.value.agent.projects.find(
            (item) => item.workspace === workspace,
          )?.name ?? '')
        : ''
    })
    .toBe(fallbackName)
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
  expect(initial.bounds.width).toBeGreaterThanOrEqual(920)
  expect(initial.bounds.height).toBeGreaterThanOrEqual(640)

  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    window.setBounds({ ...window.getBounds(), width: 860, height: 600 })
  })
  await agent.waitForTimeout(300)
  const clamped = await readWindow()
  expect(clamped.bounds.width).toBe(920)
  expect(clamped.bounds.height).toBe(640)

  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    window.setBounds({ ...window.getBounds(), width: 1100, height: 760 })
  })
  await agent.waitForTimeout(600)
  const resized = await readWindow()
  expect(resized.bounds.width).toBe(1100)
  expect(resized.bounds.height).toBe(760)

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
    .toBe('1100x760:false')

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

  const sidebarLayout = () =>
    agent.evaluate(() => {
      const rect = (selector: string) => {
        const box = document
          .querySelector(selector)!
          .getBoundingClientRect()
        return { x: box.x, y: box.y }
      }
      return {
        side: rect('.agent-side'),
        newChat: rect('.agent-new-chat'),
        head: rect('.agent-head'),
      }
    })
  const maximizedLayout = await sidebarLayout()
  expect(maximizedLayout.side.x).toBeCloseTo(7, 0)
  expect(maximizedLayout.side.y).toBeCloseTo(7, 0)
  expect(maximizedLayout.newChat.x).toBeCloseTo(11, 0)
  expect(maximizedLayout.newChat.y).toBeCloseTo(77, 0)
  expect(maximizedLayout.head.x).toBeCloseTo(255, 0)
  expect(maximizedLayout.head.y).toBeCloseTo(7, 0)

  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'panel-control', action: 'maximize' }),
  )
  await expect
    .poll(async () => (await readWindow()).maximized)
    .toBe(false)
  expect((await readWindow()).bounds.width).toBe(1100)

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

test('agent sidebar settings opens the 智能体 section', async () => {
  await agent.evaluate(() => window.mqmz!.command({ type: 'agent-open' }))
  await agent.getByRole('button', { name: '设置', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await settings.evaluate(() => window.mqmz!.snapshot())
      return snapshot.ok ? snapshot.value.settingsSection : ''
    })
    .toBe('ai')
  const visible = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('设置'),
    )
    return window?.isVisible() ?? false
  })
  expect(visible).toBe(true)
  const navItem = settings.getByRole('button', {
    name: '智能体',
    exact: true,
  })
  await expect(navItem).toBeVisible()
  await expect(navItem.locator('svg')).toHaveClass(/lucide-cpu-ai/)
  await expect(
    settings.getByText('DeepSeek', { exact: true }).first(),
  ).toBeVisible()
})

test('composer grows to 75% of the conversation pane', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  const ratio = () =>
    agent.evaluate(() => {
      const main = document
        .querySelector('.agent-main')!
        .getBoundingClientRect()
      const form = document
        .querySelector('.agent-composer')!
        .getBoundingClientRect()
      return form.width / main.width
    })
  const widths = () =>
    agent.evaluate(() => {
      const messages = document
        .querySelector('.agent-messages-inner')!
        .getBoundingClientRect()
      const composer = document
        .querySelector('.agent-composer')!
        .getBoundingClientRect()
      return { messages: messages.width, composer: composer.width }
    })
  const composerHeight = () =>
    agent.evaluate(
      () =>
        document.querySelector('.agent-composer')!.getBoundingClientRect()
          .height,
    )
  const readBounds = () =>
    application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) =>
        item.getTitle().includes('智能体'),
      )!
      return window.getBounds()
    })

  await expect(agent.locator('.agent-main')).toBeVisible()
  await expect(agent.locator('.agent-composer')).toBeVisible()
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    window.setBounds({ ...window.getBounds(), width: 920, height: 640 })
  })
  await agent.waitForTimeout(400)
  const original = await readBounds()
  expect(await ratio()).toBeGreaterThan(0.9)
  const initialWidths = await widths()
  expect(initialWidths.messages).toBeGreaterThan(0)
  expect(
    Math.abs(initialWidths.messages - initialWidths.composer),
  ).toBeLessThan(16)
  const initialHeight = await composerHeight()
  expect(initialHeight).toBeLessThan(160)

  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    window.setBounds({ ...window.getBounds(), width: 1400, height: 800 })
  })
  await agent.waitForTimeout(600)
  expect(await ratio()).toBeCloseTo(0.75, 2)
  const enlargedWidths = await widths()
  expect(
    Math.abs(enlargedWidths.messages - enlargedWidths.composer),
  ).toBeLessThan(16)
  expect(await composerHeight()).toBeGreaterThan(initialHeight + 8)

  await application.evaluate(({ BrowserWindow }, bounds) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )!
    window.setBounds(bounds)
  }, original)
  await agent.waitForTimeout(400)
})

test('agent model menu separates dialogue and image models', async () => {
  const snapshot = await agent.evaluate(() => window.mqmz!.snapshot())
  if (!snapshot.ok || !snapshot.value.agent.configured) {
    await agent.evaluate(() =>
      window.mqmz!.command({ type: 'agent-config', apiKey: 'sk-agent-test' }),
    )
  }
  await agent.evaluate(() => window.mqmz!.command({ type: 'agent-open' }))
  await agent.locator('.agent-model-trigger').click()
  const menu = agent.locator('.agent-model-menu')
  await expect(menu.getByText('DeepSeek', { exact: true })).toBeVisible()
  await expect(menu.getByText('MiniMax', { exact: true })).toBeVisible()
  await expect(menu.getByText('火山方舟', { exact: true })).toBeVisible()
  for (const kind of ['文本', '图像', '视频', '音频']) {
    await expect(menu.getByText(kind, { exact: true }).first()).toBeVisible()
  }
  await expect(
    menu.getByText('Doubao Seedream 5.5', { exact: true }),
  ).toBeVisible()
  await expect(
    menu.locator(
      '.agent-model-option:has(.agent-model-kind)[aria-checked="true"]',
    ),
  ).toHaveCount(1)
  await expect(menu.locator('.agent-model-session')).toHaveCount(0)
  const defaultPill = menu.locator('.agent-model-default').first()
  await expect(defaultPill).toBeVisible()
  expect(
    await defaultPill.evaluate((node) =>
      node.nextElementSibling?.classList.contains('agent-model-kind'),
    ),
  ).toBe(true)
  await agent.locator('.agent-model-trigger').click()
})

test('pet profile section exposes the create entry', async () => {
  await application.evaluate(() => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [{ id: 'doubao-seedream-5-5-261028' }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      )
  })
  await application.evaluate(({ dialog }) => {
    ;(
      dialog as unknown as {
        showMessageBox: () => Promise<{
          response: number
          checkboxChecked: boolean
        }>
      }
    ).showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    })
  })
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
  ).toHaveCount(0)
  await settings.getByRole('button', { name: '新建桌宠', exact: true }).click()
  await expect
    .poll(async () => {
      const snapshot = await settings.evaluate(() =>
        window.mqmz!.snapshot(),
      )
      return snapshot.ok ? snapshot.value.settingsSection : ''
    })
    .toBe('ai')
  const volcanoInput = settings.getByLabel('火山方舟 API Key')
  await expect(volcanoInput).toBeVisible()
  await expect(volcanoInput).toBeFocused()
  await volcanoInput.fill('ark-e2e-test')
  await settings
    .locator('.settings-field-end')
    .last()
    .getByRole('button', { name: '添加', exact: true })
    .click()
  await expect
    .poll(async () => {
      const snapshot = await settings.evaluate(() =>
        window.mqmz!.snapshot(),
      )
      return snapshot.ok ? snapshot.value.ai.volcano.configured : false
    })
    .toBe(true)
  await settings.getByRole('button', { name: '宠物档案', exact: true }).click()
  await settings.getByRole('button', { name: '新建桌宠', exact: true }).click()
  const wizard = settings.getByRole('dialog', { name: '新建桌宠' })
  await expect(wizard).toBeVisible()
  await settings.waitForTimeout(300)
  await expect(wizard.getByText('麻薯柔和水彩')).toHaveCount(0)
  await expect(
    wizard.getByRole('button', { name: '关闭', exact: true }),
  ).toHaveCount(0)
  await expect(
    wizard.getByText('请先添加火山方舟 API Key。'),
  ).toHaveCount(0)
  const initialBox = await wizard.boundingBox()
  await wizard
    .getByLabel(
      '最多添加 4 张同一只宠物的照片，建议 2–4 张，可一次选择多张；如穿衣服或戴配饰，请保持同一套。照片仅用于本次生成，保存或放弃后会删除。',
    )
    .hover()
  await expect(wizard.getByRole('tooltip')).toHaveCSS('opacity', '1')
  const nameInput = wizard.getByLabel('桌宠名字')
  await nameInput.fill('麻薯')
  await expect(
    wizard.getByText('已经有同名桌宠，请换一个。'),
  ).toBeVisible()
  const conflictBox = await wizard.boundingBox()
  expect(conflictBox?.height).toBe(initialBox?.height)
  await nameInput.fill('团子')
  await expect(
    wizard.getByText('已经有同名桌宠，请换一个。'),
  ).toHaveCount(0)
  await wizard.getByRole('button', { name: '取消', exact: true }).click()
  await expect(wizard).toHaveCount(0)
})
