import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

function session(id: string, title: string, text: string) {
  return {
    id,
    title,
    mode: 'build',
    model: 'deepseek-flash',
    reasoning: 'high',
    workspace: null,
    projectId: null,
    pinned: false,
    createdAt: 1,
    updatedAt: 2,
    ui: [
      {
        id: `${id}-user`,
        role: 'user',
        parts: [{ type: 'text', text }],
      },
      {
        id: `${id}-assistant`,
        role: 'assistant',
        parts: [{ type: 'text', text: '收到。' }],
      },
    ],
    history: [],
    files: [],
    sources: [],
    usage: { input: 0, output: 0 },
  }
}

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-sessions-'))
  const data = join(directory, 'data')
  await mkdir(data, { recursive: true })
  await writeFile(
    join(data, 'mqmz.agent.json'),
    JSON.stringify({
      version: 2,
      projects: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: '策略项目',
          workspace: '/tmp',
          pinned: false,
          createdAt: 1,
        },
      ],
      sessions: [
        session(
          '33333333-3333-4333-8333-333333333333',
          '项目规划',
          '帮我规划下个项目。',
        ),
        session(
          '44444444-4444-4444-8444-444444444444',
          '周报整理',
          '整理本周周报。',
        ),
      ],
    }),
  )
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = data
  environment.MQMZ_SCREENSHOT_DIR = join(directory, 'shots')
  environment.MQMZ_QUOTA_DEEPSEEK_URL = 'http://127.0.0.1:1/balance'
  environment.MQMZ_QUOTA_OPENAI_URL = 'http://127.0.0.1:1/usage'
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
})

test.afterAll(async () => {
  await application.close()
})

test('supports search, archive, clear and shortcuts', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByLabel('DeepSeek API Key').fill('sk-agent-session-test')
  await agent.getByRole('button', { name: '保存', exact: true }).click()
  await expect(agent.getByLabel('给智能体发送指令')).toBeVisible()

  await agent.keyboard.press(`${modifier}+k`)
  await expect(agent.getByLabel('给智能体发送指令')).toBeFocused()
  await agent.keyboard.press(`${modifier}+f`)
  await expect(agent.getByLabel('搜索对话')).toBeFocused()

  const before = await agent.locator('.agent-session').count()
  await agent.keyboard.press(`${modifier}+n`)
  await expect(agent.locator('.agent-session')).toHaveCount(before + 1)

  await agent.getByLabel('搜索对话').fill('周报')
  await expect(agent.locator('.agent-session')).toHaveCount(1)
  await expect(agent.locator('.agent-session-text')).toHaveText('周报整理')
  await agent.getByLabel('搜索对话').fill('不存在的对话')
  await expect(agent.getByText('没有找到匹配的对话')).toBeVisible()
  await agent.getByLabel('清空搜索').click()

  const weekly = agent
    .locator('.agent-session')
    .filter({ hasText: '周报整理' })
  await weekly.getByLabel('对话菜单').click()
  await agent.getByRole('menuitem', { name: '归档' }).click()
  await expect(agent.getByText('已归档')).toBeVisible()
  await agent.getByText('已归档').click()
  await expect(weekly).toBeVisible()
  await weekly.getByLabel('对话菜单').click()
  await agent.getByRole('menuitem', { name: '取消归档' }).click()
  await expect(agent.getByText('已归档')).toHaveCount(0)

  const planning = agent
    .locator('.agent-session')
    .filter({ hasText: '项目规划' })
  await planning.click()
  await expect(agent.getByText('帮我规划下个项目。')).toBeVisible()
  await planning.getByLabel('对话菜单').click()
  await agent.getByRole('menuitem', { name: '清空对话' }).click()
  await expect(agent.getByText('清空这个对话？')).toBeVisible()
  await agent.getByRole('button', { name: '确认' }).click()
  await expect(agent.getByText('帮我规划下个项目。')).toHaveCount(0)
  await expect(
    agent.getByText('今天我们要做点什么？我可以处理待办、文件和邮件哦～'),
  ).toBeVisible()
})

test('configures a project tool policy', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  const project = agent
    .locator('.agent-project-row')
    .filter({ hasText: '策略项目' })
  await project.getByRole('button', { name: '项目菜单' }).click()
  await agent.getByRole('menuitem', { name: '工具权限' }).click()
  await expect(
    agent.getByRole('dialog', { name: '工具权限' }),
  ).toBeVisible()
  await agent.getByRole('button', { name: '自动允许写操作' }).click()
  await expect
    .poll(async () =>
      agent.evaluate(async () => {
        const result = await window.mqmz!.snapshot()
        return result.ok
          ? result.value.agent.projects.find(
              (item) => item.name === '策略项目',
            )?.toolPolicy
          : undefined
      }),
    )
    .toBe('allow')

  await project.getByRole('button', { name: '项目菜单' }).click()
  await agent.getByRole('menuitem', { name: '工具权限' }).click()
  await agent.getByRole('button', { name: '逐次确认' }).click()
  await expect
    .poll(async () =>
      agent.evaluate(async () => {
        const result = await window.mqmz!.snapshot()
        return result.ok
          ? result.value.agent.projects.find(
              (item) => item.name === '策略项目',
            )?.toolPolicy
          : undefined
      }),
    )
    .toBe('ask')
})
