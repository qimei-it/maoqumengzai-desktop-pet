/** Pure batch-rename rules shared by the panel preview and the main process. */

export type RenameMode = 'replace' | 'add' | 'format'
export type RenameKind = 'file' | 'folder'
export type RenameItem = { name: string; kind: RenameKind }
export type RenamePosition = 'before' | 'after'
export type RenameFormat = 'index' | 'counter' | 'date'

export type RenameConfig = {
  mode: RenameMode
  find: string
  replace: string
  text: string
  position: RenamePosition
  format: RenameFormat
  start: number
}

export const defaultRenameConfig: RenameConfig = {
  mode: 'replace',
  find: '',
  replace: '',
  text: '',
  position: 'after',
  format: 'index',
  start: 1,
}

export function splitName(
  name: string,
  kind: RenameKind = 'file',
): { stem: string; extension: string } {
  if (kind === 'folder') return { stem: name, extension: '' }
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: name, extension: '' }
  return { stem: name.slice(0, dot), extension: name.slice(dot) }
}

/** Keep names valid on both macOS and Windows. */
export function sanitizeStem(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned || '未命名'
}

function dateStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = date.getHours()
  const period = hours < 12 ? '上午' : '下午'
  const hour = hours % 12 || 12
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${period}${hour}.${minute}.${second}`
}

function replacedName(name: string, find: string, replacement: string): string {
  if (!find) return name
  // Finder's Replace Text is case-insensitive and may change the extension.
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return name.replace(new RegExp(escaped, 'gi'), () => replacement)
}

function renamedStem(stem: string, config: RenameConfig, index: number, now: Date): string {
  if (config.mode === 'replace') return stem
  if (config.mode === 'add') {
    if (!config.text) return stem
    return config.position === 'before'
      ? `${config.text}${stem}`
      : `${stem}${config.text}`
  }
  const base = config.text.trim() || stem
  const suffix =
    config.format === 'index'
      ? String(config.start + index)
      : config.format === 'counter'
        ? String(config.start + index).padStart(5, '0')
        : dateStamp(now)
  return config.position === 'before'
    ? `${suffix} ${base}`
    : `${base} ${suffix}`
}

/**
 * Returns a display preview. Existing files on disk and same-directory
 * collisions are resolved by the main process when applying.
 */
export function previewRename(
  items: readonly (string | RenameItem)[],
  config: RenameConfig,
  now = new Date(),
): string[] {
  const used = new Set<string>()
  return items.map((item, index) => {
    const { name, kind } =
      typeof item === 'string'
        ? { name: item, kind: 'file' as const }
        : item
    const source =
      config.mode === 'replace'
        ? replacedName(name, config.find, config.replace)
        : renamedStem(splitName(name, kind).stem, config, index, now)
    const parts =
      config.mode === 'replace'
        ? splitName(source, kind)
        : { stem: source, extension: splitName(name, kind).extension }
    let candidate = sanitizeStem(parts.stem)
    let attempt = 1
    const base = candidate
    while (used.has(`${candidate}${parts.extension}`.toLocaleLowerCase())) {
      attempt += 1
      candidate = `${base} (${attempt})`
    }
    used.add(`${candidate}${parts.extension}`.toLocaleLowerCase())
    return `${candidate}${parts.extension}`
  })
}
