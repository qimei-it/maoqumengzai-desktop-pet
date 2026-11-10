/** Pure naming and safety rules for ZIP archiving and image shrinking. */
import { basename, dirname, extname, join } from 'node:path'

export const compressOutputFolder = 'compress_output'
/** Total input cap for in-memory ZIP creation. */
export const archiveInputLimit = 512 * 1024 * 1024
/** Guards against ZIP bombs and huge archives. */
export const extractEntryLimit = 2000
export const extractSizeLimit = 1024 * 1024 * 1024
export const shrinkMaxEdge = 2560

function stemOf(path: string): { stem: string; extension: string } {
  const name = basename(path)
  const extension = extname(name)
  return {
    stem: extension ? name.slice(0, -extension.length) : name,
    extension,
  }
}

function stamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
}

/** One file keeps its name; batches use a timestamped archive name. */
export function archiveStem(paths: readonly string[], now = new Date()): string {
  if (paths.length === 1) return stemOf(paths[0]).stem
  return `归档-${stamp(now)}`
}

export function archiveFileName(
  paths: readonly string[],
  attempt: number,
  now = new Date(),
): string {
  const stem = archiveStem(paths, now)
  return `${stem}${attempt === 1 ? '' : ` (${attempt})`}.zip`
}

/** Entry names are flat and case-insensitively unique inside the archive. */
export function archiveEntryName(
  path: string,
  used: Set<string>,
): string {
  const { stem, extension } = stemOf(path)
  let candidate = `${stem}${extension}`
  let attempt = 1
  while (used.has(candidate.toLocaleLowerCase())) {
    attempt += 1
    candidate = `${stem} (${attempt})${extension}`
  }
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

export function isZipFile(name: string): boolean {
  return extname(name).toLowerCase() === '.zip'
}

export function extractedFolderName(
  zipPath: string,
  exists: (path: string) => boolean,
): string {
  const { stem } = stemOf(zipPath)
  const folder = dirname(zipPath)
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const candidate = join(
      folder,
      `${stem}${attempt === 1 ? '' : ` (${attempt})`}`,
    )
    if (!exists(candidate)) return candidate
  }
  throw new Error('目标目录里没有可用的文件夹名。')
}

/**
 * Rejects absolute paths, drive letters, traversal and empty names so an
 * archive can never write outside its own destination folder.
 */
export function safeArchiveEntry(entry: string): string | null {
  const normalized = entry.replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0'))
    return null
  if (/^[a-zA-Z]:/.test(normalized)) return null
  const parts = normalized.split('/').filter((part) => part && part !== '.')
  if (!parts.length || parts.some((part) => part === '..')) return null
  return parts.join('/')
}

export function compressOutputDirectory(
  sourcePath: string,
  batch: boolean,
): string {
  const folder = dirname(sourcePath)
  return batch ? join(folder, compressOutputFolder) : folder
}

export function compressedName(sourcePath: string, attempt: number): string {
  const { stem, extension } = stemOf(sourcePath)
  return `${stem}-压缩${attempt === 1 ? '' : ` (${attempt})`}${extension || '.jpg'}`
}
