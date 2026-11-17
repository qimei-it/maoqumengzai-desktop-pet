import { mkdtemp, mkdir, readFile, readdir, utimes, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  applyPendingRestore,
  createSnapshot,
  inspectSnapshot,
  isSafeArchiveEntry,
  listSnapshots,
  rotateSnapshots,
  snapshotFileName,
  snapshotsDirectory,
  stageRestore,
  verifyRestoredData,
} from '../../src/main/data-snapshot'

const versions = { settings: 2, focus: 5 }

async function seed(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'mqmz.settings.json'), '{"version":2}')
  await writeFile(join(root, 'mqmz.focus.json'), '{"version":5}')
  await writeFile(join(root, 'mqmz.ai.json'), 'source-key')
  await mkdir(join(root, 'engines'))
  await writeFile(join(root, 'engines', 'bin'), 'binary')
  await mkdir(join(root, 'pets'))
  await writeFile(join(root, 'pets', 'a.png'), 'image')
  await mkdir(join(root, 'snapshots'))
  await writeFile(join(root, 'snapshots', 'old.zip'), 'old')
}

describe('local snapshots', () => {
  test('creates a ZIP with a manifest and skips credentials and engines', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-snapshot-test-'))
    const source = join(directory, 'source')
    await seed(source)
    const archive = join(snapshotsDirectory(source), snapshotFileName())
    const file = await createSnapshot({
      dataRoot: source,
      destination: archive,
      appVersion: '0.0.1',
      versions,
    })
    expect(file.bytes).toBeGreaterThan(0)
    const manifest = await inspectSnapshot(file.path, versions)
    expect(manifest).toMatchObject({
      app: 'mqmz',
      format: 1,
      appVersion: '0.0.1',
      versions,
    })
    expect(manifest.entries).toBeGreaterThanOrEqual(3)

    // Applying reveals exactly what the archive shipped.
    const target = join(directory, 'target')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'mqmz.ai.json'), 'target-key')
    await stageRestore(target, archive, manifest)
    const result = await applyPendingRestore(target)
    expect(result?.ok).toBe(true)
    expect(existsSync(join(target, 'pets', 'a.png'))).toBe(true)
    expect(existsSync(join(target, 'engines'))).toBe(false)
    expect(await readFile(join(target, 'mqmz.ai.json'), 'utf8')).toBe(
      'target-key',
    )
  })

  test('rejects backups from a newer schema', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-snapshot-test-'))
    const source = join(directory, 'source')
    await seed(source)
    const archive = join(directory, 'newer.zip')
    await createSnapshot({
      dataRoot: source,
      destination: archive,
      appVersion: '9.0.0',
      versions: { settings: 3 },
    })
    await expect(inspectSnapshot(archive, versions)).rejects.toThrow(
      '更新版本',
    )
  })

  test('keeps only the newest snapshots', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-snapshot-test-'))
    await mkdir(snapshotsDirectory(directory), { recursive: true })
    for (let index = 0; index < 9; index += 1) {
      const path = join(
        snapshotsDirectory(directory),
        `mqmz-backup-2026010${index}-000000.zip`,
      )
      await writeFile(path, 'x')
      const time = new Date(2026, 0, 1 + index).getTime() / 1000
      await utimes(path, time, time)
    }
    await rotateSnapshots(directory, 7)
    const kept = await listSnapshots(directory)
    expect(kept).toHaveLength(7)
    expect(kept[0].id).toContain('20260108')
  })

  test('restores data and keeps a rollback copy of the previous state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-snapshot-test-'))
    const source = join(directory, 'source')
    await seed(source)
    const archive = join(directory, 'backup.zip')
    await createSnapshot({
      dataRoot: source,
      destination: archive,
      appVersion: '0.0.1',
      versions,
    })
    const manifest = await inspectSnapshot(archive, versions)
    const target = join(directory, 'target')
    await mkdir(join(target, 'snapshots'), { recursive: true })
    await writeFile(join(target, 'mqmz.settings.json'), 'old-settings')
    await writeFile(join(target, 'mqmz.ai.json'), 'target-key')
    await writeFile(join(target, 'snapshots', 'keep.zip'), 'keep')
    await stageRestore(target, archive, manifest)
    const result = await applyPendingRestore(target)
    expect(result?.ok).toBe(true)
    expect(await readFile(join(target, 'mqmz.settings.json'), 'utf8')).toBe(
      '{"version":2}',
    )
    expect(await readFile(join(target, 'mqmz.ai.json'), 'utf8')).toBe(
      'target-key',
    )
    expect(existsSync(join(target, 'snapshots', 'keep.zip'))).toBe(true)
    const rollback = (await readdir(target)).find((name) =>
      name.startsWith('backup-before-restore-'),
    )
    expect(rollback).toBeTruthy()
    expect(
      await readFile(join(target, rollback!, 'mqmz.settings.json'), 'utf8'),
    ).toBe('old-settings')
    expect(existsSync(join(target, 'pending-restore'))).toBe(false)
  })

  test('renames legacy Chinese snapshot names to ASCII', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-snapshot-test-'))
    await mkdir(snapshotsDirectory(directory), { recursive: true })
    const legacy = join(
      snapshotsDirectory(directory),
      '毛趣萌仔-备份-20260101-000000.zip',
    )
    await writeFile(legacy, 'x')
    const snapshots = await listSnapshots(directory)
    expect(snapshots.map((item) => item.id)).toEqual([
      'mqmz-backup-20260101-000000.zip',
    ])
    expect(existsSync(legacy)).toBe(false)
  })

  test('flags unreadable data after a restore', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-snapshot-test-'))
    await writeFile(join(directory, 'mqmz.settings.json'), '{broken')
    await writeFile(join(directory, 'mqmz.focus.json'), '{"version":5}')
    const issues = await verifyRestoredData(directory)
    expect(issues[0]).toContain('mqmz.settings.json')
  })

  test('rejects archive entries that escape the data directory', () => {
    expect(isSafeArchiveEntry('pets/a.png')).toBe(true)
    expect(isSafeArchiveEntry('../evil.txt')).toBe(false)
    expect(isSafeArchiveEntry('/abs/evil.txt')).toBe(false)
    expect(isSafeArchiveEntry('C:/evil.txt')).toBe(false)
    expect(isSafeArchiveEntry('a/../../b')).toBe(false)
  })
})
