/** Directory relocation helpers used when the storage root changes. */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  rm,
  stat,
} from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export type PathRename = { from: string; to: string }

export type CopyResult = {
  copied: number
  identical: number
  renamed: PathRename[]
  /** Files and directories created here, for rollback in newest-first order. */
  created: string[]
  skipped: number
}

export function isSamePath(left: string, right: string): boolean {
  const a = resolve(left)
  const b = resolve(right)
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b
}

export function isInsidePath(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return (
    rel !== '' &&
    rel !== '..' &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  )
}

export function pathsOverlap(left: string, right: string): boolean {
  return (
    isSamePath(left, right) ||
    isInsidePath(left, right) ||
    isInsidePath(right, left)
  )
}

export function normalizeRelative(value: string): string {
  return value.split(sep).join('/')
}

export function renameMap(
  result: CopyResult,
): Map<string, string> {
  return new Map(
    result.renamed.map((item) => [
      normalizeRelative(item.from),
      normalizeRelative(item.to),
    ]),
  )
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await lstat(path).catch(() => null))
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha1')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function sameContent(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([stat(left), stat(right)])
  if (!a.isFile() || !b.isFile() || a.size !== b.size) return false
  return (await hashFile(left)) === (await hashFile(right))
}

function renamedName(name: string, attempt: number): string {
  const extension = extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  return `${stem} (${attempt})${extension}`
}

/**
 * Copies a directory tree without deleting the source. Existing identical
 * files are reused; different files are imported with a numeric suffix and
 * reported so stored paths can be rewritten.
 */
export async function copyDirectoryContents(
  source: string,
  target: string,
): Promise<CopyResult> {
  const result: CopyResult = {
    copied: 0,
    identical: 0,
    renamed: [],
    created: [],
    skipped: 0,
  }
  const info = await lstat(source).catch(() => null)
  if (!info?.isDirectory()) return result
  await mkdir(target, { recursive: true })
  async function walk(
    fromDirectory: string,
    toDirectory: string,
    prefix: string,
  ): Promise<void> {
    const entries = await readdir(fromDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const from = join(fromDirectory, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) {
        result.skipped += 1
        continue
      }
      if (entry.isDirectory()) {
        const to = join(toDirectory, entry.name)
        if (!(await exists(to))) {
          await mkdir(to)
          result.created.push(to)
        }
        await walk(from, to, rel)
        continue
      }
      if (!entry.isFile()) {
        result.skipped += 1
        continue
      }
      const direct = join(toDirectory, entry.name)
      if (!(await exists(direct))) {
        await copyFile(from, direct)
        result.copied += 1
        result.created.push(direct)
        continue
      }
      if (await sameContent(from, direct)) {
        result.identical += 1
        continue
      }
      let attempt = 1
      let destination = direct
      while (await exists(destination)) {
        destination = join(
          toDirectory,
          renamedName(entry.name, attempt),
        )
        attempt += 1
      }
      await copyFile(from, destination)
      result.copied += 1
      result.created.push(destination)
      result.renamed.push({
        from: rel,
        to: `${prefix ? `${prefix}/` : ''}${basename(destination)}`,
      })
    }
  }
  await walk(source, target, '')
  return result
}

/** Removes copied files and the directories created for them. */
export async function rollbackCopy(created: string[]): Promise<void> {
  for (const path of [...created].reverse())
    await rm(path, { recursive: true, force: true }).catch(() => {})
}

/** Number of regular files below a directory, used for confirmations. */
export async function countFiles(directory: string): Promise<number> {
  let total = 0
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  )
  for (const entry of entries) {
    if (entry.isFile()) total += 1
    else if (entry.isDirectory())
      total += await countFiles(join(directory, entry.name))
  }
  return total
}
