/**
 * Local data snapshots: one ZIP format shared by automatic backups, manual
 * exports and restores. Credentials and engine binaries are never included.
 */

import { execFile } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { sevenZipBinaryPath } from './archive-zip'

export const snapshotFormat = 1
export const snapshotRetention = 7
const snapshotPrefix = 'mqmz-backup-'
/** Earlier builds used a Chinese prefix; rename those to ASCII on sight. */
const legacySnapshotPrefix = '毛趣萌仔-备份-'
const manifestName = 'manifest.json'
const pendingDirName = 'pending-restore'
const snapshotsDirName = 'snapshots'
const rollbackPrefix = 'backup-before-restore-'
const resultFileName = 'mqmz.restore-result.json'

/** Per-machine secrets: never exported, never overwritten by a restore. */
const credentialFiles = new Set([
  'mqmz.ai.json',
  'mqmz.provider-keys.json',
  'mqmz.mail.secrets.json',
])

/** Regenerated or runtime-only content, excluded from every snapshot. */
const excludedTopLevel = new Set([
  'engines',
  'session',
  'GPUPersistentCache',
  'DevToolsActivePort',
  'Local State',
  snapshotsDirName,
  pendingDirName,
  resultFileName,
  'mqmz.mail.db-wal',
  'mqmz.mail.db-shm',
])

export type SnapshotManifest = {
  app: 'mqmz'
  format: number
  appVersion: string
  platform: string
  arch: string
  createdAt: number
  versions: Record<string, number>
  excluded: string[]
  entries: number
}

export type SnapshotFile = {
  id: string
  path: string
  createdAt: number
  bytes: number
}

export type RestoreResult = {
  ok: boolean
  at: number
  archive?: string
  rollbackDir?: string
  message?: string
}

function stamp(date = new Date()): string {
  const two = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
}

export function snapshotsDirectory(dataRoot: string): string {
  return join(dataRoot, snapshotsDirName)
}

export function snapshotFileName(date = new Date()): string {
  return `${snapshotPrefix}${stamp(date)}.zip`
}

function excludedName(name: string): boolean {
  return (
    credentialFiles.has(name) ||
    excludedTopLevel.has(name) ||
    name.startsWith(rollbackPrefix) ||
    name.endsWith('.tmp') ||
    name.endsWith('.lock')
  )
}

async function run7z(
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
): Promise<string> {
  const binary = sevenZipBinaryPath()
  if (!binary) throw new Error('7-Zip 引擎不可用。')
  return await new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout ?? 600_000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(String(stdout))
          return
        }
        reject(
          new Error(
            String(stderr || '').trim().split('\n').slice(-2).join(' ') ||
              '7-Zip 操作失败。',
          ),
        )
      },
    )
  })
}

/**
 * Archive entry names from `7z l -slt -ba`; `-ba` omits the archive header, so
 * every block is a real entry.
 */
function listedPaths(output: string): string[] {
  return output
    .split(/\r?\n\r?\n/)
    .map((block) => /^Path = (.+)$/m.exec(block)?.[1]?.trim())
    .filter((path): path is string => Boolean(path))
}

async function countEntries(
  directory: string,
  prefix = '',
): Promise<number> {
  let count = 0
  for (const child of await readdir(directory, { withFileTypes: true })) {
    if (child.isSymbolicLink()) continue
    if (child.isDirectory())
      count += await countEntries(join(directory, child.name), `${prefix}${child.name}/`)
    else count += 1
  }
  return count
}

export function isSafeArchiveEntry(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(normalized) || normalized.startsWith('/')) return false
  return normalized
    .split('/')
    .every((segment) => segment !== '..' && segment !== '')
}

async function copyIncluded(dataRoot: string, stage: string): Promise<void> {
  const children = await readdir(dataRoot, { withFileTypes: true })
  for (const child of children) {
    if (excludedName(child.name) || child.isSymbolicLink()) continue
    await cp(join(dataRoot, child.name), join(stage, child.name), {
      recursive: true,
      dereference: false,
      errorOnExist: false,
      force: true,
    }).catch(() => {})
  }
}

export async function createSnapshot(options: {
  dataRoot: string
  destination: string
  appVersion: string
  versions: Record<string, number>
}): Promise<SnapshotFile> {
  const stage = await mkdtemp(join(tmpdir(), 'mqmz-snapshot-'))
  try {
    await copyIncluded(options.dataRoot, stage)
    const manifest: SnapshotManifest = {
      app: 'mqmz',
      format: snapshotFormat,
      appVersion: options.appVersion,
      platform: process.platform,
      arch: process.arch,
      createdAt: Date.now(),
      versions: options.versions,
      excluded: [
        'API Key 与邮箱授权码',
        '引擎二进制',
        '快照与待恢复目录',
        '运行期缓存文件',
      ],
      entries: await countEntries(stage),
    }
    await writeFile(
      join(stage, manifestName),
      JSON.stringify(manifest, null, 2),
      'utf8',
    )
    await mkdir(dirname(options.destination), { recursive: true })
    await run7z(
      ['a', '-tzip', '-mx=3', '-y', options.destination, '.'],
      { cwd: stage },
    )
    const info = await stat(options.destination)
    return {
      id: basename(options.destination),
      path: options.destination,
      createdAt: manifest.createdAt,
      bytes: info.size,
    }
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => {})
  }
}

export async function listSnapshots(dataRoot: string): Promise<SnapshotFile[]> {
  const directory = snapshotsDirectory(dataRoot)
  const entries = await readdir(directory).catch(() => [])
  const snapshots: SnapshotFile[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.zip')) continue
    let name = entry
    if (name.startsWith(legacySnapshotPrefix)) {
      // Keep backup lists ASCII across platforms (Windows GBK codepages).
      const renamed = `${snapshotPrefix}${name.slice(legacySnapshotPrefix.length)}`
      await rename(join(directory, name), join(directory, renamed)).catch(
        () => {},
      )
      name = renamed
    }
    if (!name.startsWith(snapshotPrefix)) continue
    const path = join(directory, name)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) continue
    snapshots.push({
      id: name,
      path,
      createdAt: info.mtimeMs,
      bytes: info.size,
    })
  }
  return snapshots.sort((left, right) => right.createdAt - left.createdAt)
}

export async function rotateSnapshots(
  dataRoot: string,
  keep = snapshotRetention,
): Promise<void> {
  const snapshots = await listSnapshots(dataRoot)
  for (const snapshot of snapshots.slice(keep))
    await rm(snapshot.path, { force: true }).catch(() => {})
}

/** Reads the manifest, rejects newer formats and path-escaping entries. */
export async function inspectSnapshot(
  archivePath: string,
  supported: Record<string, number>,
): Promise<SnapshotManifest> {
  const paths = listedPaths(await run7z(['l', '-slt', '-ba', archivePath]))
  if (!paths.some((path) => isSafeArchiveEntry(path)))
    throw new Error('备份文件为空或已损坏。')
  if (!paths.every(isSafeArchiveEntry))
    throw new Error('备份文件包含不安全的路径。')
  if (!paths.includes(manifestName))
    throw new Error('备份文件缺少清单，无法恢复。')
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-manifest-'))
  try {
    await run7z([
      'e',
      '-y',
      archivePath,
      manifestName,
      `-o${directory}`,
    ])
    const manifest = JSON.parse(
      await readFile(join(directory, manifestName), 'utf8'),
    ) as SnapshotManifest
    if (manifest.app !== 'mqmz' || manifest.format !== snapshotFormat)
      throw new Error('备份格式不受支持。')
    for (const [key, version] of Object.entries(manifest.versions ?? {})) {
      const limit = supported[key]
      if (limit !== undefined && version > limit)
        throw new Error('备份来自更新版本的应用，请先升级后再恢复。')
    }
    return manifest
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error('备份清单已损坏，无法恢复。')
    throw error
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

export async function stageRestore(
  dataRoot: string,
  archivePath: string,
  manifest: SnapshotManifest,
): Promise<void> {
  const pending = join(dataRoot, pendingDirName)
  await rm(pending, { recursive: true, force: true })
  const payload = join(pending, 'payload')
  await mkdir(payload, { recursive: true })
  await run7z(['x', '-y', archivePath, `-o${payload}`])
  await writeFile(
    join(pending, 'state.json'),
    JSON.stringify({ at: Date.now(), archive: basename(archivePath), manifest }),
    'utf8',
  )
}

async function pruneRollbacks(dataRoot: string): Promise<void> {
  const entries = await readdir(dataRoot).catch(() => [])
  const rollbacks = entries
    .filter((name) => name.startsWith(rollbackPrefix))
    .sort()
    .reverse()
  for (const name of rollbacks.slice(1))
    await rm(join(dataRoot, name), { recursive: true, force: true }).catch(
      () => {},
    )
}

async function writeRestoreResult(
  dataRoot: string,
  result: RestoreResult,
): Promise<void> {
  await writeFile(
    join(dataRoot, resultFileName),
    JSON.stringify(result),
    'utf8',
  ).catch(() => {})
}

export async function readRestoreResult(
  dataRoot: string,
): Promise<RestoreResult | undefined> {
  try {
    const value = JSON.parse(
      await readFile(join(dataRoot, resultFileName), 'utf8'),
    ) as RestoreResult
    return typeof value.at === 'number' ? value : undefined
  } catch {
    return undefined
  }
}

/** Applies a staged restore before any service reads the data directory. */
export async function applyPendingRestore(
  dataRoot: string,
): Promise<RestoreResult | null> {
  const pending = join(dataRoot, pendingDirName)
  const payload = join(pending, 'payload')
  const hasPayload = await stat(payload)
    .then((info) => info.isDirectory())
    .catch(() => false)
  if (!hasPayload) {
    if (await stat(pending).catch(() => null))
      await rm(pending, { recursive: true, force: true }).catch(() => {})
    return null
  }
  const rollback = join(dataRoot, `${rollbackPrefix}${stamp()}`)
  const keep = new Set([
    ...credentialFiles,
    snapshotsDirName,
    pendingDirName,
    resultFileName,
  ])
  try {
    await mkdir(rollback, { recursive: true })
    for (const name of await readdir(dataRoot)) {
      if (keep.has(name)) continue
      await rename(join(dataRoot, name), join(rollback, name)).catch(() => {})
    }
    for (const name of await readdir(payload)) {
      if (keep.has(name)) continue
      await rename(join(payload, name), join(dataRoot, name)).catch(() => {})
    }
    await rm(pending, { recursive: true, force: true })
    await pruneRollbacks(dataRoot)
    const result: RestoreResult = {
      ok: true,
      at: Date.now(),
      rollbackDir: basename(rollback),
      message: '本地数据已恢复。',
    }
    await writeRestoreResult(dataRoot, result)
    return result
  } catch (error) {
    // Roll the previous data back; credentials were never moved.
    for (const name of await readdir(rollback).catch(() => [])) {
      await rename(join(rollback, name), join(dataRoot, name)).catch(() => {})
    }
    const result: RestoreResult = {
      ok: false,
      at: Date.now(),
      message:
        error instanceof Error ? error.message : '恢复失败，已保留原数据。',
    }
    await writeRestoreResult(dataRoot, result)
    await rm(pending, { recursive: true, force: true }).catch(() => {})
    return result
  }
}

/** Light check after a restore; failures are reported, not thrown. */
export async function verifyRestoredData(
  dataRoot: string,
): Promise<string[]> {
  const issues: string[] = []
  for (const name of ['mqmz.settings.json', 'mqmz.focus.json']) {
    try {
      JSON.parse(await readFile(join(dataRoot, name), 'utf8'))
    } catch {
      issues.push(`${name} 无法读取`)
    }
  }
  if (issues.length) issues.push('可从上一次回滚副本恢复原数据')
  return issues
}
