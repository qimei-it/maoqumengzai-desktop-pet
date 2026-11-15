import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { waitForAppWindows } from './app-windows'

let application: ElectronApplication
let agent: Page

function skill(
  name: string,
  description: string,
  body = `# ${name}`,
): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
}

test.beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-builtin-skills-'))
  const data = join(directory, 'data')
  const builtin = join(directory, 'builtin')
  await mkdir(data, { recursive: true })
  await mkdir(join(builtin, 'paper', 'alpha'), { recursive: true })
  await mkdir(join(builtin, 'paper', 'beta'), { recursive: true })
  await mkdir(join(builtin, 'doc', 'gamma'), { recursive: true })
  await writeFile(
    join(builtin, 'paper', 'alpha', 'SKILL.md'),
    skill(
      'Paper Alpha',
      'Default enabled paper skill.',
      '# Paper Alpha\n\nMentions Doc Gamma and watermelon in the body.',
    ),
  )
  await mkdir(join(builtin, 'paper', 'alpha', 'references'), {
    recursive: true,
  })
  await writeFile(
    join(builtin, 'paper', 'alpha', 'references', 'guide.md'),
    'reference body',
  )
  await writeFile(
    join(builtin, 'paper', 'beta', 'SKILL.md'),
    skill('Paper Beta', 'Opt-in paper skill.'),
  )
  await writeFile(
    join(builtin, 'doc', 'gamma', 'SKILL.md'),
    skill('Doc Gamma', 'Default enabled documentation skill.'),
  )
  await writeFile(
    join(builtin, 'manifest.json'),
    JSON.stringify({
      version: 1,
      skills: [
        {
          id: 'builtin-paper-alpha',
          dir: 'paper/alpha',
          category: '论文科研',
          defaultEnabled: true,
          license: 'MIT',
          source: 'https://example.com/alpha',
        },
        {
          id: 'builtin-paper-beta',
          dir: 'paper/beta',
          category: '论文科研',
          defaultEnabled: false,
          license: 'MIT',
          source: 'https://example.com/beta',
        },
        {
          id: 'builtin-doc-gamma',
          dir: 'doc/gamma',
          category: '文档办公',
          defaultEnabled: true,
          license: 'MIT',
          source: 'https://example.com/gamma',
        },
      ],
    }),
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

test('groups built-in skills by category and keeps them read-only', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByRole('button', { name: '技能', exact: true }).click()
  await expect(agent.locator('.agent-skills-page')).toBeVisible()
  const heads = agent.locator('.agent-skill-group-head h3')
  await expect(heads).toHaveText([
    '通用工具',
    '论文科研',
    '文档办公',
    '创意工具',
    '电商运营',
  ])
  const groups = agent.locator('.agent-skill-group')
  await expect(groups.nth(0)).toContainText('暂无技能')
  await expect(groups.nth(1)).toContainText('Paper Alpha')
  await expect(groups.nth(1)).toContainText('Paper Beta')
  await expect(groups.nth(2)).toContainText('Doc Gamma')
  await expect(groups.nth(3)).toContainText('暂无技能')
  await expect(groups.nth(4)).toContainText('暂无技能')
  await expect(agent.locator('.agent-skill-card')).toHaveCount(3)
  await expect(agent.locator('.agent-skill-check')).toHaveCount(2)

  const paperGroup = groups.nth(1)
  await expect(paperGroup.locator('.agent-skill-group-title')).toContainText(
    '论文科研2（已启用 1）',
  )
  await paperGroup.getByRole('tab', { name: '已启用 1' }).click()
  await expect(paperGroup.locator('.agent-skill-card')).toHaveCount(1)
  await expect(paperGroup).toContainText('Paper Alpha')
  await paperGroup.getByRole('tab', { name: '未启用 1' }).click()
  await expect(paperGroup.locator('.agent-skill-card')).toHaveCount(1)
  await expect(paperGroup).toContainText('Paper Beta')
  await paperGroup.getByRole('tab', { name: '全部' }).click()
  await expect(paperGroup.locator('.agent-skill-card')).toHaveCount(2)

  const beta = groups
    .nth(1)
    .locator('.agent-skill-card')
    .filter({ hasText: 'Paper Beta' })
  await beta.click()
  const detail = agent.getByRole('dialog', { name: 'Paper Beta 技能' })
  await expect(detail).toBeVisible()
  await expect(detail.getByText('内置 Skill')).toBeVisible()
  await expect(detail.getByRole('button', { name: '卸载' })).toHaveCount(0)
  const toggle = detail.getByRole('switch')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await detail.getByRole('button', { name: '关闭' }).click()
  await expect(agent.locator('.agent-skill-check')).toHaveCount(3)
  await expect(paperGroup.locator('.agent-skill-group-title')).toContainText(
    '论文科研2（已启用 2）',
  )

  const snapshot = await agent.evaluate(async () => {
    const result = await window.mqmz!.snapshot()
    return result.ok ? result.value.agentSkills : []
  })
  expect(snapshot).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'Paper Alpha',
        category: '论文科研',
        builtin: true,
        enabled: true,
      }),
      expect.objectContaining({
        name: 'Paper Beta',
        builtin: true,
        enabled: true,
      }),
    ]),
  )
})

test('prefers name and description matches over body text', async () => {
  await agent.evaluate(() =>
    window.mqmz!.command({ type: 'agent-open' }),
  )
  await agent.getByRole('button', { name: '技能', exact: true }).click()
  const search = agent.getByLabel('搜索技能')
  await search.fill('Doc Gamma')
  await expect(agent.locator('.agent-skill-card')).toHaveCount(1)
  await expect(agent.locator('.agent-skill-card')).toContainText('Doc Gamma')
  await expect(agent.locator('.agent-skill-card')).not.toContainText(
    'Paper Alpha',
  )

  await search.fill('watermelon')
  await expect(agent.locator('.agent-skill-card')).toHaveCount(1)
  await expect(agent.locator('.agent-skill-card')).toContainText(
    'Paper Alpha',
  )
  await search.fill('')
})
