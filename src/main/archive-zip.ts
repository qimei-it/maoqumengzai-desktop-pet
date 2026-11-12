import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import _7z from '7zip-min'
import { createExtractorFromData } from 'node-unrar-js'
import {
  archiveEntryName,
  archiveFileName,
  archiveInputLimit,
  extractEntryLimit,
  extractSizeLimit,
  extractedFolderName,
  is7zFile,
  isRarFile,
  safeArchiveEntry,
} from '../shared/archive'
import type { ArchiveFormat } from '../shared/settings'
import { writeExclusive } from './write-output'

/** 7zip-min only detects asar in some Electron argv shapes; normalize once. */
const sevenZipBinary = _7z
  .getConfig()
  .binaryPath?.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked')
if (sevenZipBinary) _7z.config({ binaryPath: sevenZipBinary })

/** Builds a flat ZIP next to the first source file without replacing anything. */
function run7z(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const binary = sevenZipBinary
    if (!binary) {
      reject(new Error('7-Zip 引擎不可用。'))
      return
    }
    execFile(
      binary,
      args,
      { cwd, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve()
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

async function create7z(
  paths: readonly string[],
  now: Date,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-7z-'))
  const archive = join(directory, 'archive.7z')
  try {
    const used = new Set<string>()
    const names: string[] = []
    for (const path of paths) {
      const name = archiveEntryName(path, used)
      names.push(name)
      await copyFile(path, join(directory, name))
    }
    await run7z(['a', '-t7z', '-mx=6', archive, ...names], directory)
    const bytes = await readFile(archive)
    return writeExclusive(
      dirname(paths[0]),
      (attempt) => archiveFileName(paths, attempt, now, '7z'),
      bytes,
    )
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

/** Builds a flat archive next to the first source file without replacing anything. */
export async function createArchive(
  paths: readonly string[],
  format: ArchiveFormat = 'zip',
  now = new Date(),
): Promise<string> {
  if (!paths.length) throw new Error('没有可打包的文件。')
  const sizes = await Promise.all(
    paths.map(async (path) => (await stat(path)).size),
  )
  const total = sizes.reduce((sum, size) => sum + size, 0)
  if (total > archiveInputLimit)
    throw new Error('一次最多打包 512 MB，请分开处理。')

  if (format === '7z') return create7z(paths, now)

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
    (attempt) => archiveFileName(paths, attempt, now, 'zip'),
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
async function extractZip(
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

async function extract7z(
  archivePath: string,
): Promise<{ folder: string; count: number }> {
  const info = await stat(archivePath)
  if (info.size > archiveInputLimit)
    throw new Error('压缩包超过 512 MB，暂不支持解压。')
  const items = await _7z.list(archivePath)
  const files = items.filter(
    (item) =>
      !item.name.endsWith('/') && !item.attr?.trim().startsWith('D'),
  )
  const used = new Set<string>()
  let expanded = 0
  for (const item of files) {
    if (item.encrypted === '+')
      throw new Error('暂不支持加密的 7Z 压缩包。')
    const safe = safeArchiveEntry(item.name)
    if (!safe) throw new Error('压缩包包含不安全的路径，已停止解压。')
    if (used.has(safe))
      throw new Error('压缩包包含重复路径，已停止解压。')
    used.add(safe)
    expanded += Number(item.size || 0)
    if (files.length > extractEntryLimit)
      throw new Error('压缩包文件数量过多，已停止解压。')
    if (expanded > extractSizeLimit)
      throw new Error('解压后体积过大，已停止解压。')
  }
  if (!files.length) throw new Error('压缩包是空的。')
  const folder = await makeExtractFolder(archivePath)
  try {
    await _7z.unpack(archivePath, folder)
  } catch {
    await rm(folder, { recursive: true, force: true }).catch(() => {})
    throw new Error('解压失败，已清理不完整的文件。')
  }
  return { folder, count: files.length }
}

async function extractRar(
  archivePath: string,
): Promise<{ folder: string; count: number }> {
  const info = await stat(archivePath)
  if (info.size > archiveInputLimit)
    throw new Error('压缩包超过 512 MB，暂不支持解压。')
  const bytes = await readFile(archivePath)
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const extractor = await createExtractorFromData({ data })
  const headers = [...extractor.getFileList().fileHeaders].filter(
    (header) => !header.flags.directory,
  )
  const used = new Set<string>()
  let expanded = 0
  for (const header of headers) {
    if (header.flags.encrypted)
      throw new Error('暂不支持加密的 RAR 压缩包。')
    const safe = safeArchiveEntry(header.name)
    if (!safe) throw new Error('压缩包包含不安全的路径，已停止解压。')
    if (used.has(safe))
      throw new Error('压缩包包含重复路径，已停止解压。')
    used.add(safe)
    expanded += header.unpSize
    if (headers.length > extractEntryLimit)
      throw new Error('压缩包文件数量过多，已停止解压。')
    if (expanded > extractSizeLimit)
      throw new Error('解压后体积过大，已停止解压。')
  }
  if (!headers.length) throw new Error('压缩包是空的。')
  const folder = await makeExtractFolder(archivePath)
  try {
    const result = extractor.extract()
    for (const file of result.files) {
      if (file.fileHeader.flags.directory) continue
      const safe = safeArchiveEntry(file.fileHeader.name)
      if (!safe) throw new Error('压缩包包含不安全的路径，已停止解压。')
      if (!file.extraction) continue
      const destination = join(folder, safe)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, file.extraction, { flag: 'wx' })
    }
  } catch (error) {
    await rm(folder, { recursive: true, force: true }).catch(() => {})
    if (error instanceof Error && /停止解压/.test(error.message)) throw error
    throw new Error('解压失败，已清理不完整的文件。')
  }
  return { folder, count: headers.length }
}

export async function extractArchive(
  archivePath: string,
): Promise<{ folder: string; count: number }> {
  if (is7zFile(archivePath)) return extract7z(archivePath)
  if (isRarFile(archivePath)) return extractRar(archivePath)
  return extractZip(archivePath)
}
