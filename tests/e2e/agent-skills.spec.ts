import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page
let addedSkill = ''
let importDirectory = ''

function skill(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
}

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-skills-e2e-'))
  const data = join(directory, 'data')
  const skills = join(data, 'skills')
  await mkdir(join(skills, 'pet-views'), { recursive: true })
  await mkdir(join(skills, 'banner-design'), { recursive: true })
  await writeFile(
    join(skills, 'pet-views', 'SKILL.md'),
    skill(
      'Pet Views',
      'Generate pet garment views.',
      '# Pet Views\n\nUse the reference image.',
    ),
  )
  await writeFile(
    join(skills, 'banner-design', 'SKILL.md'),
    skill(
      'Banner Design',
      'Design social banners.',
      '# Banner Design\n\nUse a clean layout.',
    ),
  )
  addedSkill = join(directory, 'new-skill.md')
  await writeFile(
    addedSkill,
    skill('New Skill', 'Added from the test.', '# New Skill\n\nNew body.'),
  )
  importDirectory = join(directory, 'import')
  await mkdir(join(importDirectory, 'directory-one'), { recursive: true })
  await mkdir(join(importDirectory, 'directory-two'), { recursive: true })
  await writeFile(
    join(importDirectory, 'directory-one', 'SKILL.md'),
    skill('Directory One', 'First directory skill.', '# One'),
  )
  await writeFile(
    join(importDirectory, 'directory-two', 'SKILL.md'),
    skill('Directory Two', 'Second directory skill.', '# Two'),
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

test('skills page lists, searches, toggles, adds and uninstalls skills', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByRole('button', { name: '技能', exact: true }).click()
  await expect(agent.locator('.agent-skills-page')).toBeVisible()
  await expect(agent.locator('.agent-title')).toHaveText('技能')
  await expect(agent.getByText('已安装', { exact: true })).toHaveCount(0)
  const searchBox = await agent.getByLabel('搜索技能').boundingBox()
  const toolbarBox = await agent.locator('.agent-skills-toolbar').boundingBox()
  expect(searchBox).toBeTruthy()
  expect(toolbarBox).toBeTruthy()
  expect(searchBox!.width).toBeLessThanOrEqual(340)
  expect(searchBox!.width).toBeLessThan(toolbarBox!.width - 100)
  expect(searchBox!.x).toBeGreaterThan(toolbarBox!.x + 100)
  const searchRadius = await agent
    .locator('.agent-skills-search')
    .evaluate((element) => getComputedStyle(element).borderRadius)
  expect(Number.parseFloat(searchRadius)).toBeGreaterThan(100)
  const cards = agent.locator('.agent-skill-card')
  await expect(cards).toHaveCount(2)
  const boxes = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y }
    }),
  )
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2)
  expect(boxes[0].x).toBeLessThan(boxes[1].x)

  await agent.getByLabel('搜索技能').fill('pet')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Pet Views')
  await agent.getByRole('button', { name: '清空搜索' }).click()
  await expect(agent.getByLabel('搜索技能')).toHaveValue('')
  await expect(cards).toHaveCount(2)
  await agent.getByLabel('搜索技能').fill('reference image')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Pet Views')
  await agent.getByLabel('搜索技能').fill('definitely-not-a-skill')
  await expect(cards).toHaveCount(0)
  await expect(agent.getByText('没有找到匹配的技能')).toBeVisible()
  await agent.getByLabel('搜索技能').fill('')
  await expect(cards).toHaveCount(2)

  await agent.getByRole('button', { name: '刷新技能' }).click()
  await expect(cards).toHaveCount(2)

  await cards.filter({ hasText: 'Pet Views' }).click()
  const detail = agent.getByRole('dialog', { name: 'Pet Views 技能' })
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('Generate pet garment views.')
  await expect(detail).toContainText('Use the reference image.')
  await expect(
    detail.getByRole('button', { name: '在 Finder 中打开' }),
  ).toBeVisible()
  const toggle = detail.getByRole('switch')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  const skillsState = await agent.evaluate(async () => {
    const snapshot = await window.mqmz!.snapshot()
    return snapshot.ok ? snapshot.value.agentSkills : []
  })
  expect(
    skillsState.find((skill) => skill.name === 'Pet Views')?.enabled,
  ).toBe(false)
  await detail.getByRole('button', { name: '关闭' }).click()
  await expect(detail).toBeHidden()

  await application.evaluate(({ dialog }, path) => {
    ;(globalThis as unknown as { __mqmzSkillPath: string })
      .__mqmzSkillPath = path
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [
        (globalThis as unknown as { __mqmzSkillPath: string })
          .__mqmzSkillPath,
      ],
    })
  }, addedSkill)
  await agent.getByRole('button', { name: '添加', exact: true }).click()
  const added = agent.getByRole('dialog', { name: 'New Skill 技能' })
  await expect(added).toBeVisible()
  await expect(added).toContainText('Added from the test.')
  await added.getByRole('button', { name: '关闭' }).click()
  await expect(cards).toHaveCount(3)

  await application.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [directory],
    })
  }, importDirectory)
  await agent.getByRole('button', { name: '添加', exact: true }).click()
  await expect(cards).toHaveCount(5)
  await expect(
    agent.getByText('Directory One', { exact: true }),
  ).toBeVisible()
  await expect(
    agent.getByText('Directory Two', { exact: true }),
  ).toBeVisible()

  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    })
  })
  await cards.filter({ hasText: 'Banner Design' }).click()
  const banner = agent.getByRole('dialog', { name: 'Banner Design 技能' })
  await expect(banner).toBeVisible()
  await banner.getByRole('button', { name: '卸载' }).click()
  await expect(banner).toBeHidden()
  await expect(cards).toHaveCount(4)
  await expect(agent.getByText('Banner Design', { exact: true })).toHaveCount(0)

  await agent.getByRole('button', { name: '新建对话' }).click()
  await expect(agent.locator('.agent-skills-page')).toBeHidden()
})
