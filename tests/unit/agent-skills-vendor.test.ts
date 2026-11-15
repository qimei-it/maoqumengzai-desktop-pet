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
    expect(list.length).toBeGreaterThan(190)
    expect(new Set(list.map((item) => item.id)).size).toBe(list.length)
    for (const skill of list) {
      expect(skill.builtin).toBe(true)
      expect(skill.category).toBe('论文科研')
      expect(skill.name.trim().length).toBeGreaterThan(0)
    }
    const enabled = list.filter((item) => item.enabled)
    expect(enabled.length).toBe(14)
    expect(enabled.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'research-lookup',
        'scientific-writing',
        'nature-writing',
        'nature-reviewer',
        'humanizer',
      ]),
    )
    const files = await store.files('builtin-k-dense-research-lookup')
    expect(files).toContain('SKILL.md')
  })
})
