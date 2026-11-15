import { describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { createSkillStore } from '../../src/main/agent/skills'

async function directory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mqmz-skills-'))
}

function skillFile(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
}

describe('agent skill store', () => {
  test('installs a SKILL.md, reads it, toggles and uninstalls it', async () => {
    const root = await directory()
    const store = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
    )
    const source = join(root, 'SKILL.md')
    await writeFile(
      source,
      skillFile(
        'Pet Views',
        'Generate pet garment views.',
        '# Instructions\n\nUse the reference image.',
      ),
    )
    const [detail] = await store.install(source)
    expect(detail).toMatchObject({
      name: 'Pet Views',
      description: 'Generate pet garment views.',
      enabled: true,
    })
    expect(detail.content).toContain('# Instructions')
    expect(store.list()).toHaveLength(1)

    const disabled = await store.setEnabled(detail.id, false)
    expect(disabled.enabled).toBe(false)

    const reopened = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
    )
    expect(reopened.list()[0].enabled).toBe(false)
    expect((await reopened.read(detail.id)).content).toContain(
      'Use the reference image.',
    )

    expect(await reopened.remove(detail.id)).toBe(true)
    expect(reopened.list()).toHaveLength(0)
    await expect(
      stat(join(root, 'skills', detail.id)),
    ).rejects.toBeTruthy()
  })

  test('installs a zip package and keeps its assets', async () => {
    const root = await directory()
    const store = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
    )
    const archive = join(root, 'skill.zip')
    await writeFile(
      archive,
      zipSync({
        'my-skill/SKILL.md': strToU8(
          skillFile('ZIP Skill', 'From an archive.', '# ZIP body'),
        ),
        'my-skill/assets/note.txt': strToU8('asset'),
      }),
    )
    const [detail] = await store.install(archive)
    expect(detail.name).toBe('ZIP Skill')
    expect(detail.description).toBe('From an archive.')
    expect(await readFile(join(root, 'skills', detail.id, 'assets', 'note.txt'), 'utf8')).toBe(
      'asset',
    )
  })

  test('rejects an archive without SKILL.md', async () => {
    const root = await directory()
    const store = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
    )
    const archive = join(root, 'empty.zip')
    await writeFile(archive, zipSync({ 'readme.txt': strToU8('nothing') }))
    await expect(store.install(archive)).rejects.toThrow('没有 SKILL.md')
  })

  test('installs every skill inside a selected directory', async () => {
    const root = await directory()
    const store = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
    )
    const source = join(root, 'import')
    await mkdir(join(source, 'one', 'assets'), { recursive: true })
    await mkdir(join(source, 'two'), { recursive: true })
    await writeFile(
      join(source, 'one', 'SKILL.md'),
      skillFile('Directory One', 'First directory skill.', 'one'),
    )
    await writeFile(join(source, 'one', 'assets', 'a.txt'), 'asset')
    await writeFile(
      join(source, 'two', 'SKILL.md'),
      skillFile('Directory Two', 'Second directory skill.', 'two'),
    )
    const details = await store.install(source)
    expect(details.map((item) => item.name)).toEqual([
      'Directory One',
      'Directory Two',
    ])
    expect(store.list()).toHaveLength(2)
    expect(
      await readFile(
        join(root, 'skills', details[0].id, 'assets', 'a.txt'),
        'utf8',
      ),
    ).toBe('asset')
  })

  test('keeps duplicate skill names in separate folders', async () => {
    const root = await directory()
    const store = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
    )
    const first = join(root, 'first.md')
    const second = join(root, 'second.md')
    await writeFile(first, skillFile('Same Name', 'First.', 'first'))
    await writeFile(second, skillFile('Same Name', 'Second.', 'second'))
    const [one] = await store.install(first)
    const [two] = await store.install(second)
    expect(one.id).not.toBe(two.id)
    expect(store.list()).toHaveLength(2)
  })

  test('loads read-only built-in skills with categories and opt-in state', async () => {
    const root = await directory()
    const builtin = join(root, 'builtin')
    await mkdir(join(builtin, 'paper', 'alpha', 'references'), {
      recursive: true,
    })
    await mkdir(join(builtin, 'paper', 'beta'), { recursive: true })
    await writeFile(
      join(builtin, 'paper', 'alpha', 'SKILL.md'),
      skillFile('Paper Alpha', 'Default paper skill.', '# Alpha'),
    )
    await writeFile(
      join(builtin, 'paper', 'alpha', 'references', 'guide.md'),
      'reference body',
    )
    await writeFile(
      join(builtin, 'paper', 'beta', 'SKILL.md'),
      skillFile('Paper Beta', 'Opt-in paper skill.', '# Beta'),
    )
    await writeFile(
      join(builtin, 'manifest.json'),
      JSON.stringify({
        version: 1,
        skills: [
          {
            id: 'builtin-alpha',
            dir: 'paper/alpha',
            category: '论文科研',
            defaultEnabled: true,
          },
          {
            id: 'builtin-beta',
            dir: 'paper/beta',
            category: '论文科研',
            defaultEnabled: false,
          },
        ],
      }),
    )
    const store = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
      builtin,
    )
    const list = store.list()
    expect(list).toHaveLength(2)
    expect(list.find((item) => item.id === 'builtin-alpha')).toMatchObject({
      name: 'Paper Alpha',
      category: '论文科研',
      builtin: true,
      enabled: true,
    })
    expect(list.find((item) => item.id === 'builtin-beta')).toMatchObject({
      builtin: true,
      enabled: false,
    })
    expect(await store.files('builtin-alpha')).toEqual([
      'SKILL.md',
      'references/guide.md',
    ])
    expect(
      await store.readFile('builtin-alpha', 'references/guide.md'),
    ).toBe('reference body')
    await expect(
      store.readFile('builtin-alpha', '../beta/SKILL.md'),
    ).rejects.toThrow('超出技能目录')

    await store.setEnabled('builtin-beta', true)
    await store.setEnabled('builtin-alpha', false)
    const reopened = await createSkillStore(
      join(root, 'skills'),
      join(root, 'mqmz.skills.json'),
      builtin,
    )
    expect(
      reopened.list().find((item) => item.id === 'builtin-beta')?.enabled,
    ).toBe(true)
    expect(
      reopened.list().find((item) => item.id === 'builtin-alpha')?.enabled,
    ).toBe(false)
    await expect(reopened.remove('builtin-alpha')).rejects.toThrow(
      '内置技能不能卸载',
    )
  })
})
