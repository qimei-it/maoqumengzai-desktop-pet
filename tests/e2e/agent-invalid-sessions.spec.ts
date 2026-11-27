import { _electron as electron, expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { waitForAppWindows } from './app-windows'

test('失效项目会话变灰不可打开，删除规则随目录状态变化', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mqmz-agent-invalid-'))
  const oldPath = join(root, '旧目录')
  const goodPath = join(root, '有效目录')
  const data = join(root, 'data')
  const shots = join(root, 'shots')
  await Promise.all([mkdir(oldPath), mkdir(goodPath), mkdir(data), mkdir(shots)])
  const oldId = randomUUID(), goodId = randomUUID()
  const oldSession = randomUUID(), removeIndividually = randomUUID(), goodSession = randomUUID()
  const stamp = Date.now()
  const project = async (id: string, name: string, workspace: string) => {
    const info = await stat(workspace)
    return { id, name, workspace, pinned: false, createdAt: stamp, workspaceIdentity: `${info.dev}:${info.ino}:${info.birthtimeMs}` }
  }
  const session = (id: string, projectId: string, workspace: string, title: string, content: string) => ({
    id, projectId, workspace, title, mode: 'build', model: 'deepseek-flash', reasoning: 'high', pinned: false,
    createdAt: stamp, updatedAt: stamp, usage: { input: 0, output: 0 },
    ui: [{ id: randomUUID(), role: 'assistant', parts: [{ type: 'text', text: content }] }], history: [],
  })
  await writeFile(join(data, 'mqmz.agent.json'), JSON.stringify({ version: 2,
    projects: [await project(oldId, '失效项目', oldPath), await project(goodId, '有效项目', goodPath)],
    sessions: [session(oldSession, oldId, oldPath, '失效会话', '旧会话内容'), session(removeIndividually, oldId, oldPath, '单独删除会话', '另一条内容'), session(goodSession, goodId, goodPath, '保留会话', '有效会话内容')],
  }))
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  env.MQMZ_DATA_DIR = data
  env.MQMZ_SCREENSHOT_DIR = shots
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    await waitForAppWindows(app)
    const windows = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })))
    const agent = windows.find((item) => item.title.includes('智能体'))!.page
    await agent.evaluate(() => window.mqmz!.command({ type: 'agent-config', apiKey: 'sk-agent-test' }))
    await agent.evaluate(() => window.mqmz!.command({ type: 'agent-open' }))
    await expect(agent.getByText('旧会话内容')).toBeVisible()
    await rename(oldPath, join(root, '已移走目录'))
    const invalid = agent.locator('.agent-session', { hasText: '失效会话' })
    await expect(invalid).toHaveClass(/unavailable/, { timeout: 10_000 })
    await expect(agent.getByText('旧会话内容')).toHaveCount(0)
    await expect(agent.getByText('项目目录已失效，此对话不可用。')).toBeVisible()
    await expect(agent.getByLabel('给智能体发送指令')).toHaveCount(0)
    await invalid.click()
    await expect(agent.getByText('旧会话内容')).toHaveCount(0)
    await agent.screenshot({ path: '/private/tmp/mqmz-invalid-session.png' })
    const other = agent.locator('.agent-session', { hasText: '单独删除会话' })
    await other.hover()
    await other.getByRole('button', { name: '对话菜单' }).click()
    await expect(agent.getByRole('menuitem')).toHaveCount(1)
    await agent.getByRole('menuitem', { name: '删除' }).click()
    await agent.getByRole('alertdialog').getByRole('button', { name: '确认' }).click()
    await expect(other).toHaveCount(0)
    const oldProject = agent.locator('.agent-project-row', { hasText: '失效项目' })
    await expect(oldProject).toHaveClass(/unavailable/)
    await expect(oldProject.locator('.agent-project-name')).toHaveText('失效项目')
    await expect(oldProject.getByRole('button', { name: '在失效项目中新建对话' })).toBeDisabled()
    await oldProject.click()
    await expect(invalid).toHaveCount(0)
    await oldProject.click()
    await expect(invalid).toBeVisible()
    await expect(agent.getByText('旧会话内容')).toHaveCount(0)
    await oldProject.hover()
    await oldProject.getByRole('button', { name: '项目菜单' }).click()
    await agent.getByRole('menuitem', { name: '删除' }).click()
    const confirm = agent.getByRole('alertdialog')
    await expect(confirm).toContainText('项目及其对话将被删除')
    await confirm.getByRole('button', { name: '确认' }).click()
    await expect(oldProject).toHaveCount(0)
    await expect(invalid).toHaveCount(0)
    const goodProject = agent.locator('.agent-project-row', { hasText: '有效项目' })
    await goodProject.hover()
    await goodProject.getByRole('button', { name: '项目菜单' }).click()
    await agent.getByRole('menuitem', { name: '删除' }).click()
    await expect(confirm).toContainText('项目下的对话会移动到未分组')
    await confirm.getByRole('button', { name: '确认' }).click()
    const kept = agent.locator('.agent-session', { hasText: '保留会话' })
    await expect(kept).toBeVisible()
    await kept.click()
    await expect(agent.getByText('有效会话内容')).toBeVisible()
  } finally {
    await app.close()
    await rm(root, { recursive: true, force: true })
  }
})
