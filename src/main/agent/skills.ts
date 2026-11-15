/**
 * Local skill library. A skill is a folder containing SKILL.md with optional
 * YAML frontmatter. Packages are imported as archives or a single Markdown file.
 */

import {
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import { copyFile } from 'node:fs/promises'
import type {
  AgentSkillDetail,
  AgentSkillView,
} from '../../shared/agent'
import { extractArchive } from '../archive-zip'

const skillFileName = /^skill\.md$/i
const importLimit = {
  inputBytes: 50 * 1024 * 1024,
  entries: 1000,
  expandedBytes: 200 * 1024 * 1024,
}

type LoadedSkill = AgentSkillView & {
  dir: string
  file: string
  isFile: boolean
  content: string
  defaultEnabled: boolean
}

type SkillIndex = {
  version: 2
  disabled: string[]
  enabled: string[]
}

type BuiltinManifestEntry = {
  id: string
  dir: string
  category: string
  defaultEnabled?: boolean
  source?: string
  license?: string
}

type BuiltinManifest = {
  version: 1
  skills: BuiltinManifestEntry[]
}

export type SkillStore = {
  list(): AgentSkillView[]
  refresh(): Promise<AgentSkillView[]>
  read(id: string): Promise<AgentSkillDetail>
  files(id: string): Promise<string[]>
  readFile(id: string, path: string): Promise<string>
  install(sourcePath: string): Promise<AgentSkillDetail[]>
  setEnabled(id: string, enabled: boolean): Promise<AgentSkillView>
  remove(id: string): Promise<boolean>
  directory(id: string): string | null
}

function slug(value: string): string {
  const name = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return name || 'skill'
}

function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    return trimmed.slice(1, -1)
  return trimmed
}

function parseSkill(
  content: string,
  fallbackName: string,
): { name: string; description: string; category: string; body: string } {
  const normalized = content.replace(/^\uFEFF/, '')
  let body = normalized
  let name = ''
  let description = ''
  let category = ''
  const frontmatter = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(
    normalized,
  )
  if (frontmatter) {
    body = normalized.slice(frontmatter[0].length)
    const lines = frontmatter[1].split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line)
      if (!match) continue
      const key = match[1].toLowerCase()
      let value = match[2]
      if (key === 'description' && /^[|>][+-]?\s*$/.test(value.trim())) {
        const continuation: string[] = []
        for (let next = index + 1; next < lines.length; next += 1) {
          if (!/^\s+/.test(lines[next])) break
          continuation.push(lines[next].trim())
          index = next
        }
        value = continuation.join(' ')
      }
      if (key === 'name') name = unquote(value)
      if (key === 'description') description = unquote(value)
      if (key === 'category') category = unquote(value)
    }
  }
  const trimmedBody = body.trim()
  if (!name) name = fallbackName
  if (!description) {
    const first = trimmedBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'))
    description = first ? stripMarkdown(first).slice(0, 160) : ''
  }
  return {
    name: name.trim().slice(0, 80) || fallbackName,
    description: description.trim().slice(0, 240),
    category: category.trim().slice(0, 40),
    body: trimmedBody,
  }
}

async function readSkillFile(path: string, fallbackName: string) {
  const content = await readFile(path, 'utf8').catch(() => '')
  return { content, ...parseSkill(content, fallbackName) }
}

async function findSkillFile(root: string): Promise<string | null> {
  const queue: { directory: string; depth: number }[] = [
    { directory: root, depth: 0 },
  ]
  const found: { path: string; depth: number }[] = []
  while (queue.length) {
    const current = queue.shift()!
    const entries = await readdir(current.directory, { withFileTypes: true }).catch(
      () => [],
    )
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const path = join(current.directory, entry.name)
      if (entry.isFile() && skillFileName.test(entry.name)) {
        found.push({ path, depth: current.depth })
        continue
      }
      if (entry.isDirectory() && current.depth < 3 && entry.name !== '__MACOSX')
        queue.push({ directory: path, depth: current.depth + 1 })
    }
  }
  found.sort((left, right) => left.depth - right.depth || left.path.localeCompare(right.path))
  return found[0]?.path ?? null
}

/** Finds separate skill roots inside a selected directory, ignoring nested assets. */
async function findSkillRoots(root: string): Promise<string[]> {
  const queue: { directory: string; depth: number }[] = [
    { directory: root, depth: 0 },
  ]
  const found: { path: string; depth: number }[] = []
  while (queue.length) {
    const current = queue.shift()!
    const entries = await readdir(current.directory, { withFileTypes: true }).catch(
      () => [],
    )
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const path = join(current.directory, entry.name)
      if (entry.isFile() && skillFileName.test(entry.name)) {
        found.push({ path, depth: current.depth })
        continue
      }
      if (entry.isDirectory() && current.depth < 4 && entry.name !== '__MACOSX')
        queue.push({ directory: path, depth: current.depth + 1 })
    }
  }
  found.sort((left, right) => left.depth - right.depth || left.path.localeCompare(right.path))
  const roots: string[] = []
  for (const file of found) {
    const directory = dirname(file.path)
    const nested = roots.some((rootDirectory) => {
      const rel = relative(rootDirectory, directory)
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
    })
    if (!nested) roots.push(directory)
  }
  return roots
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await stat(path).catch(() => null))
}

async function uniqueDirectory(root: string, base: string): Promise<string> {
  let candidate = base
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    if (!(await exists(join(root, candidate)))) return candidate
    candidate = `${base}-${attempt + 1}`
  }
  throw new Error('技能目录里没有可用的名称。')
}

function parseIndex(value: unknown): {
  disabled: Set<string>
  enabled: Set<string>
} {
  const disabled = new Set<string>()
  const enabled = new Set<string>()
  if (!value || typeof value !== 'object')
    return { disabled, enabled }
  const record = value as {
    version?: unknown
    disabled?: unknown
    enabled?: unknown
  }
  if (record.version !== 1 && record.version !== 2)
    return { disabled, enabled }
  if (Array.isArray(record.disabled))
    for (const item of record.disabled)
      if (typeof item === 'string' && item) disabled.add(item)
  if (Array.isArray(record.enabled))
    for (const item of record.enabled)
      if (typeof item === 'string' && item) enabled.add(item)
  return { disabled, enabled }
}

async function loadIndex(indexPath: string): Promise<{
  disabled: Set<string>
  enabled: Set<string>
}> {
  try {
    return parseIndex(JSON.parse(await readFile(indexPath, 'utf8')))
  } catch {
    return { disabled: new Set(), enabled: new Set() }
  }
}

async function saveIndex(
  indexPath: string,
  disabled: Set<string>,
  enabled: Set<string>,
): Promise<void> {
  const value: SkillIndex = {
    version: 2,
    disabled: [...disabled].sort(),
    enabled: [...enabled].sort(),
  }
  await mkdir(dirname(indexPath), { recursive: true })
  await writeFile(`${indexPath}.tmp`, JSON.stringify(value), {
    mode: 0o600,
  })
  await rename(`${indexPath}.tmp`, indexPath)
}

async function loadBuiltinManifest(
  builtinRoot: string | undefined,
): Promise<BuiltinManifestEntry[]> {
  if (!builtinRoot) return []
  const path = join(builtinRoot, 'manifest.json')
  const value = JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as
    | BuiltinManifest
    | null
  if (!value || value.version !== 1 || !Array.isArray(value.skills))
    return []
  return value.skills.filter(
    (entry) =>
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.dir === 'string' &&
      typeof entry.category === 'string',
  )
}

function builtinDirectory(
  builtinRoot: string,
  relativeDirectory: string,
): string | null {
  const path = resolve(builtinRoot, relativeDirectory)
  const rel = relative(resolve(builtinRoot), path)
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return path
}

async function copySkillSource(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: (path) => {
      const name = basename(path)
      return name !== '__MACOSX' && name !== '.DS_Store'
    },
  })
}

export async function createSkillStore(
  root: string,
  indexPath: string,
  builtinRoot?: string,
): Promise<SkillStore> {
  await mkdir(root, { recursive: true })
  const index = await loadIndex(indexPath)
  const disabled = index.disabled
  const enabledOverrides = index.enabled
  const records = new Map<string, LoadedSkill>()

  const enabledFor = (skill: LoadedSkill): boolean =>
    skill.builtin
      ? skill.defaultEnabled
        ? !disabled.has(skill.id)
        : enabledOverrides.has(skill.id)
      : !disabled.has(skill.id)

  const view = (skill: LoadedSkill): AgentSkillView => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    builtin: skill.builtin,
    enabled: enabledFor(skill),
  })

  const refresh = async (): Promise<AgentSkillView[]> => {
    const next = new Map<string, LoadedSkill>()
    for (const entry of await loadBuiltinManifest(builtinRoot)) {
      if (!builtinRoot) continue
      const directory = builtinDirectory(builtinRoot, entry.dir)
      if (!directory) continue
      const file = await findSkillFile(directory)
      if (!file) continue
      const parsed = await readSkillFile(file, entry.dir)
      next.set(entry.id, {
        id: entry.id,
        name: parsed.name,
        description: parsed.description,
        category: entry.category || parsed.category || '其他',
        builtin: true,
        enabled: false,
        dir: directory,
        file,
        isFile: false,
        content: parsed.body,
        defaultEnabled: entry.defaultEnabled !== false,
      })
    }
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name === '__MACOSX' || entry.name === '.DS_Store') continue
      if (entry.isDirectory()) {
        const file = await findSkillFile(join(root, entry.name))
        if (!file) continue
        const id = entry.name
        const parsed = await readSkillFile(file, entry.name)
        next.set(id, {
          id,
          name: parsed.name,
          description: parsed.description,
          category: parsed.category || '我的技能',
          builtin: false,
          enabled: false,
          dir: dirname(file),
          file,
          isFile: false,
          content: parsed.body,
          defaultEnabled: true,
        })
        continue
      }
      if (!entry.isFile() || !/\.(md|markdown)$/i.test(entry.name)) continue
      if (entry.name.toLowerCase() === 'skill.md') continue
      const id = basename(entry.name, extname(entry.name))
      const file = join(root, entry.name)
      const parsed = await readSkillFile(file, id)
      next.set(id, {
        id,
        name: parsed.name,
        description: parsed.description,
        category: parsed.category || '我的技能',
        builtin: false,
        enabled: false,
        dir: root,
        file,
        isFile: true,
        content: parsed.body,
        defaultEnabled: true,
      })
    }
    records.clear()
    for (const [id, skill] of next) records.set(id, skill)
    for (const id of [...disabled]) if (!records.has(id)) disabled.delete(id)
    for (const id of [...enabledOverrides])
      if (!records.has(id)) enabledOverrides.delete(id)
    await saveIndex(indexPath, disabled, enabledOverrides)
    return [...records.values()]
      .map(view)
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }

  const read = async (id: string): Promise<AgentSkillDetail> => {
    const record = records.get(id)
    if (!record) throw new Error('技能不存在。')
    const parsed = await readSkillFile(record.file, record.name)
    record.name = parsed.name
    record.description = parsed.description
    record.content = parsed.body
    return { ...view(record), content: parsed.body }
  }

  const installSkillDirectory = async (
    source: string,
    fallbackName: string,
  ): Promise<AgentSkillDetail> => {
    const skillFile = await findSkillFile(source)
    if (!skillFile) throw new Error('目录里没有 SKILL.md。')
    const parsed = await readSkillFile(skillFile, fallbackName)
    const id = await uniqueDirectory(root, slug(parsed.name))
    const directory = join(root, id)
    try {
      await copySkillSource(source, directory)
      await refresh()
      return await read(id)
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  const install = async (
    sourcePath: string,
  ): Promise<AgentSkillDetail[]> => {
    const info = await stat(sourcePath).catch(() => null)
    if (info?.isDirectory()) {
      const roots = await findSkillRoots(sourcePath)
      if (!roots.length) throw new Error('目录里没有 SKILL.md。')
      const details: AgentSkillDetail[] = []
      for (const source of roots)
        details.push(
          await installSkillDirectory(source, basename(source)),
        )
      return details
    }
    const extension = extname(sourcePath).toLowerCase()
    if (extension === '.md' || extension === '.markdown') {
      const content = await readFile(sourcePath, 'utf8')
      if (!content.trim()) throw new Error('SKILL.md 是空的。')
      const fallback = basename(sourcePath, extname(sourcePath))
      const parsed = parseSkill(content, fallback)
      const id = await uniqueDirectory(root, slug(parsed.name))
      const directory = join(root, id)
      await mkdir(directory, { recursive: true })
      try {
        await writeFile(join(directory, 'SKILL.md'), content, {
          mode: 0o600,
        })
        await refresh()
        return [await read(id)]
      } catch (error) {
        await rm(directory, { recursive: true, force: true }).catch(() => {})
        throw error
      }
    }
    if (!/\.(zip|7z|rar|tar|gz|tgz|bz2|xz)$/i.test(extension))
      throw new Error('只支持 SKILL.md、技能目录或压缩包。')
    const temporary = join(tmpdir(), `mqmz-skill-${Date.now()}-${Math.random()}`)
    await mkdir(temporary, { recursive: true })
    try {
      const copy = join(temporary, `package${extension}`)
      await copyFile(sourcePath, copy)
      const { folder } = await extractArchive(copy, importLimit)
      const skillFile = await findSkillFile(folder)
      if (!skillFile) throw new Error('压缩包里没有 SKILL.md。')
      return [
        await installSkillDirectory(
          dirname(skillFile),
          basename(dirname(skillFile)),
        ),
      ]
    } finally {
      await rm(temporary, { recursive: true, force: true }).catch(() => {})
    }
  }

  const setEnabled = async (
    id: string,
    enabled: boolean,
  ): Promise<AgentSkillView> => {
    const record = records.get(id)
    if (!record) throw new Error('技能不存在。')
    if (record.builtin && !record.defaultEnabled) {
      if (enabled) enabledOverrides.add(id)
      else enabledOverrides.delete(id)
      disabled.delete(id)
    } else {
      if (enabled) disabled.delete(id)
      else disabled.add(id)
      enabledOverrides.delete(id)
    }
    await saveIndex(indexPath, disabled, enabledOverrides)
    record.enabled = enabled
    return view(record)
  }

  const remove = async (id: string): Promise<boolean> => {
    const record = records.get(id)
    if (!record) throw new Error('技能不存在。')
    if (record.builtin) throw new Error('内置技能不能卸载。')
    if (record.isFile) await unlink(record.file)
    else await rm(record.dir, { recursive: true, force: true })
    disabled.delete(id)
    enabledOverrides.delete(id)
    await saveIndex(indexPath, disabled, enabledOverrides)
    await refresh()
    return true
  }

  const files = async (id: string): Promise<string[]> => {
    const record = records.get(id)
    if (!record) throw new Error('技能不存在。')
    if (record.isFile) return [basename(record.file)]
    const result: string[] = []
    const stack = [record.dir]
    while (stack.length && result.length < 200) {
      const directory = stack.pop()!
      const entries = await readdir(directory, {
        withFileTypes: true,
      }).catch(() => [])
      for (const entry of entries) {
        if (entry.isSymbolicLink() || entry.name === '.git') continue
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          stack.push(path)
          continue
        }
        if (!entry.isFile()) continue
        if (!/\.[A-Za-z0-9]{1,8}$/.test(entry.name)) continue
        result.push(relative(record.dir, path).split(sep).join('/'))
        if (result.length >= 200) break
      }
    }
    return result.sort()
  }

  const readSkillContent = async (
    id: string,
    value: string,
  ): Promise<string> => {
    const record = records.get(id)
    if (!record) throw new Error('技能不存在。')
    const clean = value.trim()
    if (!clean || isAbsolute(clean)) throw new Error('技能文件路径不正确。')
    const path = resolve(record.dir, clean)
    const rel = relative(resolve(record.dir), path)
    if (rel.startsWith('..') || isAbsolute(rel))
      throw new Error('技能文件路径超出技能目录。')
    const realRoot = await realpath(record.dir).catch(() => record.dir)
    const realPath = await realpath(path).catch(() => null)
    if (!realPath) throw new Error('技能文件不存在。')
    const realRel = relative(realRoot, realPath)
    if (realRel.startsWith('..') || isAbsolute(realRel))
      throw new Error('技能文件路径超出技能目录。')
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) throw new Error('技能文件不存在。')
    if (info.size > 512 * 1024) throw new Error('技能文件超过 512 KB。')
    const content = await readFile(path, 'utf8').catch(() => null)
    if (content === null) throw new Error('无法读取技能文件。')
    if (content.includes('\u0000')) throw new Error('技能文件不是文本。')
    return content
  }

  await refresh()
  return {
    list: () =>
      [...records.values()]
        .map(view)
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    refresh,
    read,
    files,
    readFile: readSkillContent,
    install,
    setEnabled,
    remove,
    directory: (id) => records.get(id)?.dir ?? null,
  }
}
