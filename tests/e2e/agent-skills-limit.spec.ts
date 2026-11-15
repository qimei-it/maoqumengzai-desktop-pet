import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-skill-limit-'))
  const data = join(directory, 'data')
  const builtin = join(directory, 'builtin')
  await mkdir(data, { recursive: true })
  const skills = []
  for (let index = 1; index <= 14; index += 1) {
    const name = `Paper ${String(index).padStart(2, '0')}`
    const id = String(index).padStart(2, '0')
    const folder = join(builtin, 'paper', id)
    await mkdir(folder, { recursive: true })
    await writeFile(
      join(folder, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Paper skill ${index}.\n---\n\n# ${name}\n`,
    )
    skills.push({
      id: `builtin-paper-${id}`,
      dir: `paper/${id}`,
      category: '论文科研',
      defaultEnabled: index <= 3,
    })
  }
  await writeFile(
    join(builtin, 'manifest.json'),
    JSON.stringify({ version: 1, skills }),
  )
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  environment.MQMZ_DATA_DIR = data
  environment.MQMZ_SKILLS_BUILTIN_ROOT = builtin
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

async function cardRows() {
  return agent
    .locator('.agent-skill-card')
    .evaluateAll((elements) =>
      elements.slice(0, 3).map((element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.x, y: rect.y }
      }),
    )
}

test('limits each category to 12 cards and adapts the column count', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByRole('button', { name: '技能', exact: true }).click()
  await expect(agent.locator('.agent-skills-page')).toBeVisible()
  await expect(agent.locator('.agent-skills-count')).toContainText(
    '技能 14（已启用 3）',
  )
  await expect(agent.locator('.agent-skill-card')).toHaveCount(12)
  await expect(
    agent.getByRole('button', { name: '显示全部 14 个' }),
  ).toBeVisible()
  await expect(agent.locator('.agent-skill-check')).toHaveCount(3)

  const narrow = await cardRows()
  expect(Math.abs(narrow[0].y - narrow[1].y)).toBeLessThan(2)
  expect(narrow[2].y).toBeGreaterThan(narrow[0].y)

  await agent.getByRole('button', { name: '显示全部 14 个' }).click()
  await expect(agent.locator('.agent-skill-card')).toHaveCount(14)

  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.getTitle().includes('智能体'),
    )
    window?.setBounds({ width: 1280, height: 860 })
  })
  await expect
    .poll(async () => {
      const rows = await cardRows()
      return (
        Math.abs(rows[0].y - rows[1].y) < 2 &&
        Math.abs(rows[1].y - rows[2].y) < 2
      )
    })
    .toBe(true)

  await agent.getByRole('tab', { name: '已启用 3' }).click()
  await expect(agent.locator('.agent-skill-card')).toHaveCount(3)
  await agent.getByRole('tab', { name: '全部' }).click()
  await expect(agent.locator('.agent-skill-card')).toHaveCount(14)
})
