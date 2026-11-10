import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import {
  archiveEntryName,
  archiveFileName,
  archiveInputLimit,
  extractEntryLimit,
  extractSizeLimit,
  extractedFolderName,
  safeArchiveEntry,
} from '../shared/archive'
import { writeExclusive } from './write-output'

/** Builds a flat ZIP next to the first source file without replacing anything. */
export async function createArchive(
  paths: readonly string[],
  now = new Date(),
): Promise<string> {
  if (!paths.length) throw new Error('没有可打包的文件。')
  const sizes = await Promise.all(paths.map(async (path) => (await stat(path)).size))
  const total = sizes.reduce((sum, size) => sum + size, 0)
  if (total > archiveInputLimit)
    throw new Error('一次最多打包 512 MB，请分开处理。')

  const used = new Set<string>()
  const entries: Record<string, Uint8Array> = {}
  for (const path of paths) {
    entries[archiveEntryName(path, used)] = new Uint8Array(
      await readFile(path),
    )
  }
  const bytes = zipSync(entries, { level: 6 })
  return writeExclusive(
    dirname(paths[0]),
    (attempt) => archiveFileName(paths, attempt, now),
    bytes,
  )
}

async function makeExtractFolder(zipPath: string): Promise<string> {
  const base = extractedFolderName(zipPath, () => false)
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base} (${attempt})`
    try {
      await mkdir(candidate)
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('目标目录里没有可用的文件夹名。')
}

/**
 * Extracts a ZIP into a new sibling folder. Entries are filtered before
 * decompression so traversal and oversized archives are rejected early.
 */
export async function extractArchive(
  zipPath: string,
): Promise<{ folder: string; count: number }> {
  const info = await stat(zipPath)
  if (info.size > archiveInputLimit)
    throw new Error('压缩包超过 512 MB，暂不支持解压。')
  const bytes = new Uint8Array(await readFile(zipPath))
  let count = 0
  let expanded = 0
  const used = new Set<string>()
  let unpacked: Record<string, Uint8Array>
  try {
    unpacked = unzipSync(bytes, {
      filter: (file) => {
        const safe = safeArchiveEntry(file.name)
        if (!safe)
          throw new Error('压缩包包含不安全的路径，已停止解压。')
        if (file.name.endsWith('/')) return false
        if (used.has(safe))
          throw new Error('压缩包包含重复路径，已停止解压。')
        used.add(safe)
        count += 1
        expanded += file.originalSize || 0
        if (count > extractEntryLimit)
          throw new Error('压缩包文件数量过多，已停止解压。')
        if (expanded > extractSizeLimit)
          throw new Error('解压后体积过大，已停止解压。')
        return true
      },
    })
  } catch (error) {
    if (error instanceof Error && /停止解压/.test(error.message)) throw error
    throw new Error('不是有效的 ZIP 压缩包。')
  }
  if (!count) throw new Error('压缩包是空的。')

  const folder = await makeExtractFolder(zipPath)
  try {
    for (const [name, data] of Object.entries(unpacked)) {
      const safe = safeArchiveEntry(name)
      if (!safe) throw new Error('压缩包包含不安全的路径，已停止解压。')
      const destination = join(folder, safe)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, data, { flag: 'wx' })
    }
  } catch (error) {
    await rm(folder, { recursive: true, force: true }).catch(() => {})
    if (error instanceof Error && /停止解压/.test(error.message)) throw error
    throw new Error('解压失败，已清理不完整的文件。')
  }
  return { folder, count }
}
