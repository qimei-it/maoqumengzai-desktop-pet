import { execFile } from 'node:child_process'
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import _7z, { type ListItem } from '7zip-min'
import { createExtractorFromData } from 'node-unrar-js'
import {
  archiveEntryName,
  archiveFileName,
  archiveInputLimit,
  extractEntryLimit,
  extractSizeLimit,
  extractedFolderName,
  is7zFile,
  isBz2File,
  isGzFile,
  isRarFile,
  isTarFile,
  isTgzFile,
  isXzFile,
  safeArchiveEntry,
} from '../shared/archive'
import {
  singleFileArchiveFormats,
  type ArchiveFormat,
} from '../shared/protocol'
import { writeExclusive } from './write-output'

/** 7zip-min only detects asar in some Electron argv shapes; normalize once. */
const sevenZipBinary = _7z
  .getConfig()
  .binaryPath?.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked')
if (sevenZipBinary) _7z.config({ binaryPath: sevenZipBinary })

export function sevenZipBinaryPath(): string | null {
  return sevenZipBinary ?? null
}

export type ExtractLimits = {
  inputBytes: number
  entries: number
  expandedBytes: number
}

const defaultExtractLimits: ExtractLimits = {
  inputBytes: archiveInputLimit,
  entries: extractEntryLimit,
  expandedBytes: extractSizeLimit,
}

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

const archiveFolderEntryLimit = 5000

type FolderEntry = { relative: string; path: string; size: number }

/** Flat list of a folder's files; symlinks and special files are skipped. */
async function walkFolder(root: string): Promise<FolderEntry[]> {
  const entries: FolderEntry[] = []
  const stack: { directory: string; prefix: string }[] = [
    { directory: root, prefix: '' },
  ]
  while (stack.length) {
    const current = stack.pop()!
    const children = await readdir(current.directory, { withFileTypes: true })
    for (const child of children) {
      if (child.isSymbolicLink()) continue
      const path = join(current.directory, child.name)
      const relative = current.prefix
        ? `${current.prefix}/${child.name}`
        : child.name
      if (child.isDirectory()) {
        stack.push({ directory: path, prefix: relative })
        continue
      }
      if (!child.isFile()) continue
      const info = await stat(path)
      entries.push({ relative, path, size: info.size })
      if (entries.length > archiveFolderEntryLimit)
        throw new Error(
          `文件夹内最多打包 ${archiveFolderEntryLimit} 个文件，请分开处理。`,
        )
    }
  }
  return entries
}

/** Total bytes of files and folders, counting folder contents recursively. */
async function sourceSize(path: string): Promise<number> {
  const info = await lstat(path)
  if (info.isSymbolicLink())
    throw new Error('只支持文件和文件夹，符号链接已跳过。')
  if (info.isFile()) return info.size
  if (!info.isDirectory()) throw new Error('只支持文件和文件夹。')
  const entries = await walkFolder(path)
  return entries.reduce((sum, entry) => sum + entry.size, 0)
}

const sevenZipTypes: Partial<Record<ArchiveFormat, string>> = {
  '7z': '7z',
  tar: 'tar',
  tgz: 'gzip',
  gz: 'gzip',
  bz2: 'bzip2',
  xz: 'xz',
}

async function createWith7z(
  paths: readonly string[],
  format: Exclude<ArchiveFormat, 'zip'>,
  now: Date,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-7z-'))
  const archive = join(directory, `archive.${format}`)
  try {
    const used = new Set<string>()
    const names: string[] = []
    for (const path of paths) {
      const name = archiveEntryName(path, used)
      names.push(name)
      const info = await lstat(path)
      if (info.isDirectory()) {
        const staged = join(directory, name)
        await mkdir(staged, { recursive: true })
        for (const entry of await walkFolder(path)) {
          const destination = join(staged, entry.relative)
          await mkdir(dirname(destination), { recursive: true })
          await copyFile(entry.path, destination)
        }
        continue
      }
      if (!info.isFile())
        throw new Error('只支持文件和文件夹，符号链接已跳过。')
      await copyFile(path, join(directory, name))
    }
    const type = sevenZipTypes[format]
    if (!type) throw new Error('暂不支持该归档格式。')
    if (format === 'tgz') {
      const tar = join(directory, 'archive.tar')
      await run7z(['a', '-ttar', tar, ...names], directory)
      await run7z(['a', '-tgzip', archive, tar], directory)
    } else {
      await run7z(
        [
          'a',
          `-t${type}`,
          ...(format === '7z' ? ['-mx=6'] : []),
          archive,
          ...names,
        ],
        directory,
      )
    }
    const bytes = await readFile(archive)
    return writeExclusive(
      dirname(paths[0]),
      (attempt) => archiveFileName(paths, attempt, now, format),
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
  const infos = await Promise.all(paths.map((path) => lstat(path)))
  const total = (
    await Promise.all(paths.map((path) => sourceSize(path)))
  ).reduce((sum, size) => sum + size, 0)
  if (total > archiveInputLimit)
    throw new Error('一次最多打包 512 MB，请分开处理。')
  if (
    (singleFileArchiveFormats as readonly ArchiveFormat[]).includes(format) &&
    (paths.length > 1 || infos.some((info) => info.isDirectory()))
  )
    throw new Error('GZ、BZ2、XZ 只能压缩单个文件。')

  if (format !== 'zip') return createWith7z(paths, format, now)

  const used = new Set<string>()
  const entries: Record<string, Uint8Array> = {}
  for (const path of paths) {
    const info = await lstat(path)
    if (info.isDirectory()) {
      const top = archiveEntryName(path, used)
      for (const entry of await walkFolder(path)) {
        const name = `${top}/${entry.relative}`
        if (!safeArchiveEntry(name))
          throw new Error('文件夹包含不安全的文件名，已停止打包。')
        entries[name] = new Uint8Array(await readFile(entry.path))
      }
      continue
    }
    if (!info.isFile())
      throw new Error('只支持文件和文件夹，符号链接已跳过。')
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
  limits: ExtractLimits,
): Promise<{ folder: string; count: number }> {
  const info = await stat(zipPath)
  if (info.size > limits.inputBytes)
    throw new Error(
      `压缩包超过 ${Math.round(limits.inputBytes / 1024 / 1024)} MB，暂不支持解压。`,
    )
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
        if (count > limits.entries)
          throw new Error('压缩包文件数量过多，已停止解压。')
        if (expanded > limits.expandedBytes)
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

function validateSevenZipFiles(
  files: ListItem[],
  limits: ExtractLimits,
): number {
  const used = new Set<string>()
  let expanded = 0
  for (const item of files) {
    if (item.encrypted === '+')
      throw new Error('暂不支持加密的压缩包。')
    const safe = safeArchiveEntry(item.name)
    if (!safe) throw new Error('压缩包包含不安全的路径，已停止解压。')
    if (used.has(safe))
      throw new Error('压缩包包含重复路径，已停止解压。')
    used.add(safe)
    expanded += Number(item.size || 0)
    if (files.length > limits.entries)
      throw new Error('压缩包文件数量过多，已停止解压。')
    if (expanded > limits.expandedBytes)
      throw new Error('解压后体积过大，已停止解压。')
  }
  if (!files.length) throw new Error('压缩包是空的。')
  return files.length
}

async function sevenZipFiles(archivePath: string): Promise<ListItem[]> {
  const items = await _7z.list(archivePath)
  return items.filter(
    (item) =>
      !item.name.endsWith('/') && !item.attr?.trim().startsWith('D'),
  )
}

async function extractWith7z(
  archivePath: string,
  limits: ExtractLimits,
): Promise<{ folder: string; count: number }> {
  const info = await stat(archivePath)
  if (info.size > limits.inputBytes)
    throw new Error(
      `压缩包超过 ${Math.round(limits.inputBytes / 1024 / 1024)} MB，暂不支持解压。`,
    )
  const files = await sevenZipFiles(archivePath)
  const count = validateSevenZipFiles(files, limits)
  const folder = await makeExtractFolder(archivePath)
  try {
    await _7z.unpack(archivePath, folder)
  } catch {
    await rm(folder, { recursive: true, force: true }).catch(() => {})
    throw new Error('解压失败，已清理不完整的文件。')
  }
  return { folder, count }
}

async function extractSingleStream(
  archivePath: string,
  limits: ExtractLimits,
): Promise<{ folder: string; count: number }> {
  const info = await stat(archivePath)
  if (info.size > limits.inputBytes)
    throw new Error(
      `压缩包超过 ${Math.round(limits.inputBytes / 1024 / 1024)} MB，暂不支持解压。`,
    )
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-stream-'))
  try {
    await _7z.unpack(archivePath, directory)
    const names = await readdir(directory)
    if (names.length !== 1) throw new Error('不是有效的单文件压缩包。')
    const safe = safeArchiveEntry(names[0])
    if (!safe) throw new Error('压缩包包含不安全的路径，已停止解压。')
    const source = join(directory, names[0])
    if ((await stat(source)).size > limits.expandedBytes)
      throw new Error('解压后体积过大，已停止解压。')
    const folder = await makeExtractFolder(archivePath)
    try {
      await copyFile(source, join(folder, safe))
    } catch {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
      throw new Error('解压失败，已清理不完整的文件。')
    }
    return { folder, count: 1 }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

async function extractTgz(
  archivePath: string,
  limits: ExtractLimits,
): Promise<{ folder: string; count: number }> {
  const info = await stat(archivePath)
  if (info.size > limits.inputBytes)
    throw new Error(
      `压缩包超过 ${Math.round(limits.inputBytes / 1024 / 1024)} MB，暂不支持解压。`,
    )
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-tgz-'))
  try {
    const outer = await sevenZipFiles(archivePath)
    validateSevenZipFiles(outer, limits)
    await _7z.unpack(archivePath, directory)
    const tarName = (await readdir(directory)).find((name) =>
      name.toLowerCase().endsWith('.tar'),
    )
    if (!tarName) throw new Error('不是有效的 TGZ 压缩包。')
    const tarPath = join(directory, tarName)
    if ((await stat(tarPath)).size > limits.expandedBytes)
      throw new Error('解压后体积过大，已停止解压。')
    const files = await sevenZipFiles(tarPath)
    const count = validateSevenZipFiles(files, limits)
    const folder = await makeExtractFolder(archivePath)
    try {
      await _7z.unpack(tarPath, folder)
    } catch {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
      throw new Error('解压失败，已清理不完整的文件。')
    }
    return { folder, count }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

async function extractRar(
  archivePath: string,
  limits: ExtractLimits,
): Promise<{ folder: string; count: number }> {
  const info = await stat(archivePath)
  if (info.size > limits.inputBytes)
    throw new Error(
      `压缩包超过 ${Math.round(limits.inputBytes / 1024 / 1024)} MB，暂不支持解压。`,
    )
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
    if (headers.length > limits.entries)
      throw new Error('压缩包文件数量过多，已停止解压。')
    if (expanded > limits.expandedBytes)
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
  limits: Partial<ExtractLimits> = {},
): Promise<{ folder: string; count: number }> {
  const value: ExtractLimits = { ...defaultExtractLimits, ...limits }
  if (is7zFile(archivePath)) return extractWith7z(archivePath, value)
  if (isTarFile(archivePath)) return extractWith7z(archivePath, value)
  if (isTgzFile(archivePath)) return extractTgz(archivePath, value)
  if (isGzFile(archivePath)) return extractSingleStream(archivePath, value)
  if (isBz2File(archivePath)) return extractSingleStream(archivePath, value)
  if (isXzFile(archivePath)) return extractSingleStream(archivePath, value)
  if (isRarFile(archivePath)) return extractRar(archivePath, value)
  return extractZip(archivePath, value)
}
