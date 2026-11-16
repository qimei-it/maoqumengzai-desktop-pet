import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { StoredSession } from '../../src/main/agent/store'
import {
  loadAgentStore,
  migrateLegacyGeneratedStore,
  relocateSessionPaths,
  saveAgentStore,
  sessionReferencesPath,
  storeReferencesLegacyGenerated,
} from '../../src/main/agent/store'
import { defaultGenerationParams } from '../../src/shared/generation'
import {
  copyDirectoryContents,
  isInsidePath,
  pathsOverlap,
  renameMap,
  rollbackCopy,
} from '../../src/main/storage-migration'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  )
})

async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mqmz-storage-'))
  directories.push(dir)
  return dir
}

function storedSession(base: string): StoredSession {
  return {
    id: 'session',
    title: '会话',
    mode: 'build',
    model: 'deepseek-flash',
    reasoning: 'high',
    workspace: null,
    projectId: null,
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    ui: [
      {
        id: 'message',
        role: 'assistant',
        parts: [
          {
            type: 'media',
            status: 'done',
            items: [
              {
                id: 'media',
                name: '猫.png',
                kind: 'image',
                path: join(base, '2026-11-16', 'session', '猫.png'),
                directory: join(base, '2026-11-16', 'session'),
              },
            ],
            generation: {
              tool: 'image_generate',
              args: {},
              references: [
                { path: join(base, 'ref.png'), kind: 'image' },
              ],
            },
          },
        ],
      },
    ],
    history: [],
    files: [
      {
        id: 'file',
        name: '对话.md',
        path: join(base, '对话.md'),
        purpose: 'user_data',
        expiresAt: null,
      },
    ],
    sources: [
      {
        id: 'source',
        name: '猫.png',
        path: join(base, '2026-11-16', 'session', '猫.png'),
        kind: 'artifact',
      },
    ],
    usage: { input: 0, output: 0 },
    lastGeneration: {
      prompt: '画猫',
      params: defaultGenerationParams,
      references: [{ path: join(base, 'ref.png'), kind: 'image' }],
    },
  }
}

describe('storage relocation', () => {
  test('rewrites stored paths and applies renamed imports', () => {
    const oldBase = join('/tmp', 'old', 'agent-files')
    const newBase = join('/tmp', 'new', 'agent-files')
    const session = storedSession(oldBase)
    relocateSessionPaths(
      session,
      oldBase,
      newBase,
      new Map([
        ['2026-11-16/session/猫.png', '2026-11-16/session/猫 (1).png'],
      ]),
    )
    expect(session.files?.[0].path).toBe(join(newBase, '对话.md'))
    expect(session.sources?.[0].path).toBe(
      join(newBase, '2026-11-16', 'session', '猫 (1).png'),
    )
    const part = session.ui[0].parts[0]
    expect(part.type).toBe('media')
    if (part.type !== 'media') return
    expect(part.items[0].path).toBe(
      join(newBase, '2026-11-16', 'session', '猫 (1).png'),
    )
    expect(part.items[0].directory).toBe(
      join(newBase, '2026-11-16', 'session'),
    )
    expect(part.generation?.references?.[0].path).toBe(
      join(newBase, 'ref.png'),
    )
    expect(session.lastGeneration?.references?.[0].path).toBe(
      join(newBase, 'ref.png'),
    )
    expect(sessionReferencesPath(session, oldBase)).toBe(false)
    expect(sessionReferencesPath(session, newBase)).toBe(true)
  })

  test('detects nested directories in both directions', () => {
    expect(isInsidePath('/tmp/a', '/tmp/a/b')).toBe(true)
    expect(isInsidePath('/tmp/a/b', '/tmp/a')).toBe(false)
    expect(pathsOverlap('/tmp/a', '/tmp/a/b')).toBe(true)
    expect(pathsOverlap('/tmp/a', '/tmp/b')).toBe(false)
    expect(pathsOverlap('/tmp/a', '/tmp/a')).toBe(true)
  })

  test('moves legacy generated URLs into registered sources', async () => {
    const base = await root()
    const storePath = join(base, 'agent.json')
    const generated = join(base, 'generated')
    const target = join(base, 'agent-files', 'legacy')
    await mkdir(generated, { recursive: true })
    await writeFile(join(generated, 'legacy.png'), 'image')
    const session = storedSession(base)
    const part = session.ui[0].parts[0]
    if (part.type !== 'media') throw new Error('media part expected')
    part.items = [
      {
        id: 'legacy-media',
        name: 'legacy.png',
        kind: 'image',
        url: 'mqmz-media://generated/legacy.png',
      },
    ]
    delete session.sources
    delete session.files
    session.lastGeneration = undefined
    await saveAgentStore(storePath, { sessions: [session], projects: [] })
    const before = await loadAgentStore(storePath)
    expect(storeReferencesLegacyGenerated(before, generated)).toBe(true)
    const copied = await copyDirectoryContents(generated, target)
    await migrateLegacyGeneratedStore(
      storePath,
      generated,
      target,
      renameMap(copied),
    )
    const after = await loadAgentStore(storePath)
    expect(storeReferencesLegacyGenerated(after, generated)).toBe(false)
    const migrated = after.sessions[0].ui[0].parts[0]
    if (migrated.type !== 'media') throw new Error('media part expected')
    expect(migrated.items[0].path).toBe(join(target, 'legacy.png'))
    expect(migrated.items[0].url).toContain('mqmz-media://source/')
    expect(after.sessions[0].sources).toEqual([
      {
        id: 'legacy-media',
        name: 'legacy.png',
        path: join(target, 'legacy.png'),
        kind: 'artifact',
      },
    ])
  })
})

describe('directory copy', () => {
  test('keeps identical files and renames different collisions', async () => {
    const base = await root()
    const source = join(base, 'source')
    const target = join(base, 'target')
    await mkdir(join(source, '2026-11-16'), { recursive: true })
    await mkdir(join(target, '2026-11-16'), { recursive: true })
    await writeFile(join(source, 'same.txt'), 'same')
    await writeFile(join(target, 'same.txt'), 'same')
    await writeFile(join(source, '冲突.txt'), 'one')
    await writeFile(join(target, '冲突.txt'), 'two')
    await writeFile(join(source, '2026-11-16', '新.png'), 'new')
    const result = await copyDirectoryContents(source, target)
    expect(result.identical).toBe(1)
    expect(result.copied).toBe(2)
    expect(result.renamed).toEqual([
      { from: '冲突.txt', to: '冲突 (1).txt' },
    ])
    expect(renameMap(result).get('冲突.txt')).toBe('冲突 (1).txt')
  })

  test('skips symlinks and rolls back copied files', async () => {
    const base = await root()
    const source = join(base, 'source')
    const target = join(base, 'target')
    await mkdir(join(source, 'nested'), { recursive: true })
    await writeFile(join(source, 'nested', 'a.txt'), 'a')
    await symlink(join(source, 'nested', 'a.txt'), join(source, 'link.txt'))
    const result = await copyDirectoryContents(source, target)
    expect(result.skipped).toBe(1)
    expect(result.created.length).toBeGreaterThan(0)
    await rollbackCopy(result.created)
    await expect(
      writeFile(join(target, 'nested', 'a.txt'), 'x'),
    ).rejects.toThrow()
  })
})
