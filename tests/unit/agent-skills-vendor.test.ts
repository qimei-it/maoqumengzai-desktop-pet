import { describe, expect, test } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSkillStore } from '../../src/main/agent/skills'

const builtinRoot = join(process.cwd(), 'resources', 'skills')

describe('vendored research skills', () => {
  test('loads every bundled skill with a category and stable defaults', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mqmz-vendored-skills-'))
    const store = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
      builtinRoot,
    )
    const list = store.list()
    expect(list.length).toBe(709)
    expect(new Set(list.map((item) => item.name)).size).toBe(list.length)
    expect(list.some((item) => item.requires)).toBe(true)
    expect(new Set(list.map((item) => item.id)).size).toBe(list.length)
    for (const skill of list) {
      expect(skill.builtin).toBe(true)
      expect([
        '通用工具',
        '论文科研',
        '文档办公',
        '设计开发',
        '内容创作',
        '创意工具',
        '电商运营',
      ]).toContain(skill.category)
      expect(skill.name.trim().length).toBeGreaterThan(0)
    }
    const enabled = list.filter((item) => item.enabled)
    expect(enabled.length).toBe(36)
    expect(enabled.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'research-lookup',
        'scientific-writing',
        'nature-writing',
        'nature-reviewer',
        'humanizer',
        'docx',
        'web-search',
        'amazon-listing-optimization',
        'academic-pptx',
        'ui-ux-pro-max',
        'impeccable',
        'baoyu-format-markdown',
        'ecommerce-visual-copywriting',
        'copywriting',
        'seo',
        'marketing-campaigns',
        'ecommerce-business-plan',
        'tiktok-shop-operator',
        'video-script-writer',
        'cinematic-giant-visual-prompts',
        'ads-audit',
        'geo-content-optimizer',
      ]),
    )
    const files = await store.files('builtin-k-dense-research-lookup')
    expect(files).toContain('SKILL.md')
  })
})
