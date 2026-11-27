import { _electron as electron, expect, test } from '@playwright/test'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { waitForAppWindows } from './app-windows'

test('原项目目录被替换后可创建新项目并保留旧项目', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mqmz-agent-replaced-'))
  const workspace = join(root, '测试')
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  env.MQMZ_DATA_DIR = join(root, 'data')
  env.MQMZ_SCREENSHOT_DIR = join(root, 'shots')
  delete env.ELECTRON_RUN_AS_NODE
  await Promise.all([mkdir(workspace), mkdir(env.MQMZ_DATA_DIR), mkdir(env.MQMZ_SCREENSHOT_DIR)])
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    await waitForAppWindows(app)
    const windows = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })))
    const agent = windows.find((item) => item.title.includes('智能体'))!.page
    await agent.evaluate(() => window.mqmz!.command({ type: 'agent-config', apiKey: 'sk-agent-test' }))
    await agent.evaluate(() => window.mqmz!.command({ type: 'agent-open' }))
    const created = await agent.evaluate((path) => window.mqmz!.command({ type: 'agent-project-create', name: '旧项目', workspace: path }), workspace)
    expect(created.ok).toBe(true)
    const duplicate = await agent.evaluate((path) => window.mqmz!.command({ type: 'agent-project-create', name: '重复项目', workspace: path }), workspace)
    expect(duplicate.ok).toBe(false)
    await rename(workspace, join(root, '旧目录'))
    await mkdir(workspace)
    const next = await agent.evaluate((path) => window.mqmz!.command({ type: 'agent-project-create', name: '新项目', workspace: path }), workspace)
    expect(next.ok).toBe(true)
    if (!next.ok) throw new Error(next.error)
    const projects = next.value.agent.projects
    expect(projects.find((item) => item.name === '旧项目')?.unavailable).toBe(true)
    expect(projects.find((item) => item.name === '新项目')?.unavailable).toBe(false)
    const oldRow = agent.locator('.agent-project-row', { hasText: '旧项目' })
    await expect(oldRow).toHaveClass(/unavailable/)
    await expect(oldRow.locator('.agent-project-name')).toHaveText('旧项目')
    await expect(oldRow.getByRole('button', { name: '在旧项目中新建对话' })).toBeDisabled()
    await expect(agent.locator('.agent-project-name', { hasText: '新项目' })).toBeVisible()
    await agent.screenshot({ path: '/private/tmp/mqmz-agent-project-replaced.png' })
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    await waitForAppWindows(app)
    const restarted = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })))
    const reopened = restarted.find((item) => item.title.includes('智能体'))!.page
    const snapshot = await reopened.evaluate(() => window.mqmz!.snapshot())
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) throw new Error(snapshot.error)
    expect(snapshot.value.agent.projects.find((item) => item.name === '旧项目')?.unavailable).toBe(true)
    expect(snapshot.value.agent.projects.find((item) => item.name === '新项目')?.unavailable).toBe(false)
  } finally {
    await app.close()
    await rm(root, { recursive: true, force: true })
  }
})
