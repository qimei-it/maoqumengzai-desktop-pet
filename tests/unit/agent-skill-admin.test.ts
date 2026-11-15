import { describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentSkillScan } from '../../src/shared/agent'
import { createSkillAdmin } from '../../src/main/agent/skill-admin'
import { createSkillStore } from '../../src/main/agent/skills'

function scan(status: AgentSkillScan['status']): AgentSkillScan {
  return {
    status,
    scanner: 'test',
    summary:
      status === 'blocked' ? '安全检查未通过（test，严重 1）。' : '安全检查通过。',
    findings: [],
  }
}

async function writeSkill(root: string, name: string): Promise<string> {
  const directory = join(root, name)
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} 用途\n---\n按说明执行。`,
  )
  return directory
}

async function setup(options: { builtin?: boolean } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'mqmz-admin-'))
  const sourceRoot = join(base, 'sources')
  let builtinRoot: string | undefined
  if (options.builtin) {
    builtinRoot = join(base, 'builtin')
    await mkdir(join(builtinRoot, 'demo'), { recursive: true })
    await writeFile(
      join(builtinRoot, 'demo', 'SKILL.md'),
      '---\nname: 内置演示\n---\n内置内容。',
    )
    await writeFile(
      join(builtinRoot, 'manifest.json'),
      JSON.stringify({
        version: 1,
        skills: [{ id: 'builtin-demo', dir: 'demo', category: '通用工具' }],
      }),
    )
  }
  const store = await createSkillStore(
    join(base, 'skills'),
    join(base, 'index.json'),
    builtinRoot,
  )
  const scansPath = join(base, 'scans.json')
  return { base, sourceRoot, store, scansPath }
}

describe('skill admin', () => {
  test('installs a local skill and scans it', async () => {
    const { base, sourceRoot, store, scansPath } = await setup()
    const admin = await createSkillAdmin({
      store,
      scansPath,
      scanDirectory: async () => scan('safe'),
    })
    const source = await writeSkill(sourceRoot, 'demo')
    const result = await admin.installLocal(source)
    expect(result.installed).toHaveLength(1)
    expect(result.installed[0]).toMatchObject({
      name: 'demo',
      enabled: true,
      builtin: false,
    })
    expect(result.scans[0].scan.status).toBe('safe')
    expect(admin.list().some((item) => item.name === 'demo')).toBe(true)
    expect(base).toBeTruthy()
  })

  test('keeps a blocked skill disabled until a rescan passes', async () => {
    const { sourceRoot, store, scansPath } = await setup()
    let next: AgentSkillScan['status'] = 'blocked'
    const admin = await createSkillAdmin({
      store,
      scansPath,
      scanDirectory: async () => scan(next),
    })
    const source = await writeSkill(sourceRoot, 'risky')
    const result = await admin.installLocal(source)
    expect(result.installed[0].enabled).toBe(false)
    expect(result.scans[0].scan.status).toBe('blocked')

    await expect(admin.ensureCanEnable('risky')).rejects.toThrow('安全检查')
    await expect(admin.setEnabled('risky', true)).rejects.toThrow('安全检查')

    next = 'safe'
    const rescan = await admin.scan('risky')
    expect(rescan.status).toBe('safe')
    const enabled = await admin.setEnabled('risky', true)
    expect(enabled.enabled).toBe(true)
  })

  test('remembers a blocked scan across restarts', async () => {
    const { sourceRoot, store, scansPath } = await setup()
    const blocked = await createSkillAdmin({
      store,
      scansPath,
      scanDirectory: async () => scan('blocked'),
    })
    await blocked.installLocal(await writeSkill(sourceRoot, 'risky'))

    const restarted = await createSkillAdmin({
      store,
      scansPath,
      scanDirectory: async () => scan('safe'),
    })
    await expect(restarted.ensureCanEnable('risky')).rejects.toThrow('安全检查')
  })

  test('installs from a resolved URL and cleans up', async () => {
    const { base, sourceRoot, store, scansPath } = await setup()
    const source = await writeSkill(sourceRoot, 'remote')
    let cleaned = false
    const admin = await createSkillAdmin({
      store,
      scansPath,
      scanDirectory: async () => scan('safe'),
      resolve: async () => ({
        path: source,
        cleanup: async () => {
          cleaned = true
        },
      }),
    })
    const result = await admin.installUrl('https://example.com/skill.zip')
    expect(result.installed[0].name).toBe('remote')
    expect(cleaned).toBe(true)
    expect(base).toBeTruthy()
  })

  test('uninstalls user skills but never built-ins', async () => {
    const { sourceRoot, base, store, scansPath } = await setup({
      builtin: true,
    })
    const admin = await createSkillAdmin({
      store,
      scansPath,
      scanDirectory: async () => scan('safe'),
    })
    await admin.installLocal(await writeSkill(sourceRoot, 'mine'))
    expect(await admin.remove('mine')).toBe(true)
    expect(admin.list().some((item) => item.name === 'mine')).toBe(false)
    await expect(admin.remove('builtin-demo')).rejects.toThrow('内置')
    expect(base).toBeTruthy()
  })

  test('caps directory installs at the configured limit', async () => {
    const { sourceRoot, store } = await setup()
    const bundle = join(sourceRoot, 'bundle')
    await writeSkill(bundle, 'one')
    await writeSkill(bundle, 'two')
    await expect(store.install(bundle, { maxSkills: 1 })).rejects.toThrow('最多')
  })
})
