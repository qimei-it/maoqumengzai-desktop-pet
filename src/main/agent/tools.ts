/**
 * Tool registry. Tools depend only on the service contracts, never on
 * Electron windows or other main-process internals.
 */

import type { AgentMode } from '../../shared/agent'
import { archiveFormats, todoRepeats } from '../../shared/protocol'
import type { ArchiveFormat, ConvertAction, TodoRepeat } from '../../shared/protocol'
import type { RenameConfig } from '../../shared/rename'
import { randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
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
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import type { ProviderToolDefinition } from './provider'
import type {
  PanelTarget,
  ServiceResult,
  Services,
  SettingsPatch,
} from '../services/contracts'
import { runShell } from '../services/shell'

export type WebSearchResult = {
  title: string
  url: string
  summary: string
  date?: string | null
}

export type WebTools = {
  search(query: string, count: number): Promise<WebSearchResult[]>
  read(url: string): Promise<{ url: string; title: string; text: string }>
}

export type ToolResult = {
  ok: boolean
  text: string
  artifacts?: { name: string; path: string }[]
}

export type ToolContext = {
  workspace: string | null
  signal: AbortSignal
  model?: import('../../shared/agent-models').AgentModelId
  reasoning?: 'off' | 'low' | 'high' | 'max'
  /** Recoverable backup directory for file writes. */
  backupRoot?: string
  /** Binds a directory as the session workspace after user approval. */
  bindWorkspace?(path: string): void
  /** Streams progress for long-running tools such as sub-agents. */
  onProgress?: (output: string) => void
}

export type AgentTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  plan: 'allow' | 'deny'
  build: 'allow' | 'ask'
  title(args: Record<string, unknown>): string
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`缺少参数 ${field}。`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new Error(`参数 ${field} 过长。`)
  return trimmed
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error('参数类型不正确。')
  return value.trim().slice(0, max)
}

function numberArg(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('参数必须是数字。')
  return Math.min(max, Math.max(min, Math.round(value)))
}

function booleanArg(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`参数 ${field} 必须是布尔值。`)
  return value
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function formatTime(value: number | undefined): string {
  if (!value) return '未设置'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/** Unwraps a structured service result; errors become tool errors. */
async function call<T>(
  result: Promise<ServiceResult<T>> | ServiceResult<T>,
): Promise<T> {
  const value = await result
  if (!value.ok) throw new Error(value.error)
  return value.value
}

const convertActions = [
  'jpg',
  'png',
  'webp',
  'mp4',
  'mov',
  'mkv',
  'webm',
  'gif',
  'webp-anim',
  'mp3',
  'wav',
  'm4a',
  'flac',
  'ogg',
  'pdf-png',
  'pdf-jpg',
  'pdf-txt',
  'office-pdf',
  'office-docx',
  'office-xlsx',
  'office-pptx',
  'ofd-pdf',
  'ofd-png',
  'ofd-jpg',
  'csv-xlsx',
  'document-pdf',
  'pdf',
  'merge-pdf',
  'split-pdf',
  'pdf-encrypt',
  'pdf-decrypt',
] as const

const convertActionSet = new Set<string>(convertActions)

function convertActionArg(value: unknown): ConvertAction {
  if (typeof value !== 'string' || !convertActionSet.has(value))
    throw new Error('不支持的转换目标。')
  return value as ConvertAction
}

function fileIdList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('缺少文件 ID 列表。')
  const ids = value.filter((id): id is string => typeof id === 'string')
  if (!ids.length) throw new Error('至少需要一个文件。')
  if (ids.length > 16) throw new Error('一次最多处理 16 个文件。')
  return ids
}

function mailFolderArg(value: unknown): string {
  const folder = optionalText(value, 200)
  if (!folder) return 'INBOX'
  return folder.toLowerCase() === 'inbox' ? 'INBOX' : folder
}

function mailUidArg(value: unknown): number {
  const uid = numberArg(value, 1, 2_000_000_000)
  if (!uid) throw new Error('缺少邮件 uid。')
  return uid
}

function todoRepeatArg(value: unknown): TodoRepeat | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== 'string' ||
    !(todoRepeats as readonly string[]).includes(value)
  )
    throw new Error('不支持的重复规则。')
  return value as TodoRepeat
}

function formatConvert(summary: {
  converted: number
  failed: number
  outputs: { name: string }[]
}): string {
  const names = summary.outputs
    .map((output) => output.name)
    .slice(0, 6)
    .join('、')
  return `已转换 ${summary.converted} 个文件${
    summary.failed ? `，失败 ${summary.failed} 个` : ''
  }${names ? `：${names}` : ''}`
}

function formatShell(
  output: {
    exitCode: number | null
    stdout: string
    stderr: string
    truncated: boolean
    timedOut: boolean
    aborted: boolean
    workspace: string
  },
): ToolResult {
  if (output.aborted)
    return { ok: false, text: '已取消。' }
  const notes = [
    output.timedOut ? '命令超时，已终止。' : '',
    output.truncated ? '（输出过长，已截断）' : '',
  ].filter(Boolean)
  const parts = [
    `退出码：${output.exitCode === null ? '无' : output.exitCode}`,
    ...notes,
    `工作目录：${output.workspace}`,
    ...(output.stdout ? ['', '标准输出：', output.stdout] : []),
    ...(output.stderr ? ['', '标准错误：', output.stderr] : []),
  ]
  return {
    ok: !output.timedOut && output.exitCode === 0,
    text: parts.join('\n'),
  }
}

const workspaceReadBytes = 512 * 1024
const workspaceWriteBytes = 512 * 1024
const workspaceSkipDirectories = new Set([
  'node_modules',
  '.git',
  '.mqmz-backups',
])

function workspaceRoot(ctx: ToolContext): string {
  if (!ctx.workspace) throw new Error('请先为对话选择项目工作区。')
  return ctx.workspace
}

function workspaceRelative(
  root: string,
  value: unknown,
  allowRoot = false,
): { path: string; relative: string } {
  if (typeof value !== 'string') throw new Error('缺少文件路径。')
  const clean = value.trim()
  if (!clean) throw new Error('缺少文件路径。')
  if (isAbsolute(clean)) throw new Error('请使用工作区内的相对路径。')
  const path = resolve(root, clean)
  const rel = relative(resolve(root), path)
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('路径超出工作区。')
  if (!rel && !allowRoot) throw new Error('请指定工作区内的文件。')
  return { path, relative: rel.split('\\').join('/') }
}

function workspaceBlocked(rel: string): boolean {
  return rel
    .split('/')
    .filter(Boolean)
    .some((part) => part === '.git' || part === 'node_modules')
}

async function workspaceRealRoot(root: string): Promise<string> {
  return realpath(root).catch(() => root)
}

async function assertWorkspacePath(
  root: string,
  path: string,
): Promise<string> {
  const realRoot = await workspaceRealRoot(root)
  const exists = await lstat(path).catch(() => null)
  const candidate = exists
    ? await realpath(path).catch(() => null)
    : await realpath(dirname(path)).catch(() => null)
  if (!candidate) throw new Error('文件或目录不存在。')
  const rel = relative(realRoot, candidate)
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('路径超出工作区。')
  return realRoot
}

async function readWorkspaceText(
  path: string,
  limit = workspaceReadBytes,
): Promise<{ text: string; truncated: boolean; size: number }> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new Error('文件不存在或不是普通文件。')
  const buffer = await readFile(path)
  const slice = buffer.subarray(0, limit)
  if (slice.includes(0)) throw new Error('这是二进制文件，无法按文本读取。')
  return {
    text: slice.toString('utf8'),
    truncated: buffer.length > limit,
    size: buffer.length,
  }
}

async function backupWorkspaceFile(
  path: string,
  ctx: ToolContext,
): Promise<string | null> {
  const info = await lstat(path).catch(() => null)
  if (!info?.isFile()) return null
  const root =
    ctx.backupRoot ?? join(tmpdir(), 'mqmz-agent-backups')
  await mkdir(root, { recursive: true })
  const target = join(
    root,
    `${Date.now()}-${randomUUID().slice(0, 8)}-${basename(path)}`,
  )
  await copyFile(path, target)
  return target
}

async function writeWorkspaceText(
  path: string,
  content: string,
): Promise<void> {
  const temp = join(
    dirname(path),
    `.${basename(path)}.${randomUUID().slice(0, 8)}.tmp`,
  )
  await writeFile(temp, content, 'utf8')
  try {
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {})
    throw error
  }
}

async function walkWorkspace(
  root: string,
  start: string,
  limit: number,
): Promise<Array<{ path: string; relative: string; size: number }>> {
  const files: Array<{ path: string; relative: string; size: number }> = []
  const stack = [start]
  while (stack.length && files.length < limit) {
    const directory = stack.pop()!
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => [],
    )
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (entry.isSymbolicLink()) continue
      const path = join(directory, entry.name)
      const rel = relative(root, path).split('\\').join('/')
      if (entry.isDirectory()) {
        if (workspaceSkipDirectories.has(entry.name)) continue
        stack.push(path)
        continue
      }
      if (!entry.isFile()) continue
      if (workspaceSkipDirectories.has(entry.name)) continue
      const info = await stat(path).catch(() => null)
      if (!info) continue
      files.push({ path, relative: rel, size: info.size })
      if (files.length >= limit) break
    }
  }
  return files
}

export function createTools(
  services: Services,
  web?: WebTools,
): Record<string, AgentTool> {
  const tools: AgentTool[] = [
    {
      name: 'shelf_list',
      description: '列出置物架里的文件和文件夹，包含 ID、名称、大小和状态。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: () => '查看置物架',
      async run() {
        const files = await call(services.shelf.list())
        if (!files.length) return { ok: true, text: '置物架是空的。' }
        return {
          ok: true,
          text: json(
            files.map((file) => ({
              id: file.id,
              name: file.name,
              kind: file.kind === 'folder' ? '文件夹' : '文件',
              size: file.kind === 'folder' ? '—' : formatSize(file.size),
              status: file.status,
            })),
          ),
        }
      },
    },
    {
      name: 'file_read',
      description:
        '读取置物架里某个文本文件的内容。只能读取置物架中的文件，不能读取任意路径。',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: '置物架文件 ID' },
          maxChars: {
            type: 'integer',
            minimum: 200,
            maximum: 20000,
            description: '最多读取的字符数，默认 8000',
          },
        },
        required: ['fileId'],
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: (args) => `读取 ${String(args.name ?? args.fileId ?? '文件')}`,
      async run(args) {
        const id = text(args.fileId, 'fileId', 100)
        const limit = numberArg(args.maxChars, 200, 20_000) ?? 8000
        const value = await call(services.shelf.read(id, limit))
        return {
          ok: true,
          text: `${value.name}\n\n${value.text}${
            value.truncated ? '\n\n（内容过长，已截断）' : ''
          }`,
        }
      },
    },
    {
      name: 'file_reveal',
      description: '在访达或资源管理器中定位置物架里的文件，不修改源文件。',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: '置物架文件 ID' },
        },
        required: ['fileId'],
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: (args) => `定位 ${String(args.fileId ?? '文件')}`,
      async run(args) {
        const id = text(args.fileId, 'fileId', 100)
        await call(services.shelf.reveal(id))
        return { ok: true, text: '已在访达中定位该文件。' }
      },
    },
    {
      name: 'file_save_copy',
      description: '通过保存对话框把置物架文件另存一份副本。',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: '置物架文件 ID' },
        },
        required: ['fileId'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `另存副本 ${String(args.fileId ?? '')}`,
      async run(args) {
        const id = text(args.fileId, 'fileId', 100)
        const saved = await call(services.shelf.saveCopy(id))
        if (!saved) return { ok: false, text: '已取消另存。' }
        return {
          ok: true,
          text: `已另存到 ${saved.path}`,
          artifacts: [{ name: basename(saved.path), path: saved.path }],
        }
      },
    },
    {
      name: 'shelf_remove',
      description: '把文件移出置物架；源文件不会被删除。',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: '置物架文件 ID' },
        },
        required: ['fileId'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `移出置物架 ${String(args.fileId ?? '')}`,
      async run(args) {
        const id = text(args.fileId, 'fileId', 100)
        const removed = await call(services.shelf.remove(id))
        return {
          ok: true,
          text: `已把 ${removed.name} 移出置物架；源文件保留。`,
        }
      },
    },
    {
      name: 'convert_start',
      description:
        '把置物架里的文件转换成指定格式。音视频需要 FFmpeg，Office 需要 LibreOffice；PDF 加密/解密需要 password。',
      parameters: {
        type: 'object',
        properties: {
          fileIds: {
            type: 'array',
            items: { type: 'string' },
            description: '置物架文件 ID 列表',
          },
          action: {
            type: 'string',
            enum: [...convertActions],
            description: '目标格式动作',
          },
          password: { type: 'string', description: 'PDF 加密/解密密码' },
        },
        required: ['fileIds', 'action'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) =>
        `转换 ${Array.isArray(args.fileIds) ? args.fileIds.length : 0} 个文件为 ${String(args.action ?? '')}`,
      async run(args) {
        const ids = fileIdList(args.fileIds)
        const action = convertActionArg(args.action)
        const password = optionalText(args.password, 200)
        const summary = await call(services.convert.run(ids, action, password))
        return {
          ok: true,
          text: formatConvert(summary),
          artifacts: summary.outputs
            .filter((output) => Boolean(output.path))
            .map((output) => ({
              name: output.name,
              path: output.path!,
            })),
        }
      },
    },
    {
      name: 'archive_start',
      description: '把置物架里的文件打包成压缩包。',
      parameters: {
        type: 'object',
        properties: {
          fileIds: {
            type: 'array',
            items: { type: 'string' },
            description: '置物架文件 ID 列表',
          },
          format: {
            type: 'string',
            enum: [...archiveFormats],
            description: '压缩格式',
          },
        },
        required: ['fileIds', 'format'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) =>
        `打包 ${Array.isArray(args.fileIds) ? args.fileIds.length : 0} 个文件为 ${String(args.format ?? '')}`,
      async run(args) {
        const ids = fileIdList(args.fileIds)
        if (
          typeof args.format !== 'string' ||
          !(archiveFormats as readonly string[]).includes(args.format)
        )
          throw new Error('不支持的压缩格式。')
        const summary = await call(
          services.archive.create(ids, args.format as ArchiveFormat),
        )
        return {
          ok: true,
          text: `已生成 ${summary.name}（${formatSize(summary.size)}）`,
          ...(summary.path
            ? {
                artifacts: [
                  { name: summary.name, path: summary.path },
                ],
              }
            : {}),
        }
      },
    },
    {
      name: 'extract_archive',
      description: '解压置物架里的压缩包到原目录附近，并把结果放回置物架。',
      parameters: {
        type: 'object',
        properties: {
          fileIds: {
            type: 'array',
            items: { type: 'string' },
            description: '压缩包文件 ID 列表',
          },
        },
        required: ['fileIds'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) =>
        `解压 ${Array.isArray(args.fileIds) ? args.fileIds.length : 0} 个压缩包`,
      async run(args) {
        const ids = fileIdList(args.fileIds)
        const { count } = await call(services.archive.extract(ids))
        return { ok: true, text: `已解压 ${count} 个文件。` }
      },
    },
    {
      name: 'rename_files',
      description:
        '批量重命名置物架里的文件。replace 替换文本，add 添加文本，format 使用序号/日期重命名。',
      parameters: {
        type: 'object',
        properties: {
          fileIds: {
            type: 'array',
            items: { type: 'string' },
            description: '至少两个置物架文件 ID',
          },
          mode: {
            type: 'string',
            enum: ['replace', 'add', 'format'],
            description: '重命名方式',
          },
          find: { type: 'string', description: 'replace 模式要查找的文本' },
          replace: { type: 'string', description: 'replace 模式的替换文本' },
          text: { type: 'string', description: 'add 模式要添加的文本' },
          position: {
            type: 'string',
            enum: ['before', 'after'],
            description: 'add 模式的位置，默认 after',
          },
          format: {
            type: 'string',
            enum: ['index', 'counter', 'date'],
            description: 'format 模式的格式',
          },
          start: {
            type: 'integer',
            minimum: 1,
            maximum: 9999,
            description: '序号起始值，默认 1',
          },
        },
        required: ['fileIds', 'mode'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) =>
        `重命名 ${Array.isArray(args.fileIds) ? args.fileIds.length : 0} 个文件`,
      async run(args) {
        const ids = fileIdList(args.fileIds)
        if (ids.length < 2) throw new Error('至少需要两个文件。')
        const mode =
          args.mode === 'add' || args.mode === 'format'
            ? args.mode
            : 'replace'
        const config: RenameConfig = {
          mode,
          find: optionalText(args.find, 200) ?? '',
          replace: optionalText(args.replace, 200) ?? '',
          text: optionalText(args.text, 200) ?? '',
          position: args.position === 'before' ? 'before' : 'after',
          format:
            args.format === 'counter' || args.format === 'date'
              ? args.format
              : 'index',
          start: numberArg(args.start, 1, 9999) ?? 1,
        }
        if (mode === 'replace' && !config.find)
          throw new Error('replace 模式需要 find。')
        if (mode === 'add' && !config.text)
          throw new Error('add 模式需要 text。')
        const { count } = await call(services.rename.run(ids, config))
        return { ok: true, text: `已重命名 ${count} 个文件。` }
      },
    },
    {
      name: 'todo_list',
      description: '查看待办清单、分组和未完成待办。',
      parameters: {
        type: 'object',
        properties: {
          includeDone: {
            type: 'boolean',
            description: '是否包含已完成待办，默认 false',
          },
        },
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: () => '查看待办',
      async run(args) {
        const includeDone = args.includeDone === true
        const snapshot = await call(services.todo.list(includeDone))
        const listNames = new Map(
          snapshot.lists.map((list) => [list.id, list.name]),
        )
        return {
          ok: true,
          text: json({
            groups: snapshot.groups.map((group) => group.name),
            lists: snapshot.lists.map((list) => ({
              id: list.id,
              name: list.name,
              group: list.groupId
                ? snapshot.groups.find((group) => group.id === list.groupId)
                    ?.name
                : null,
            })),
            todos: snapshot.todos.slice(-120).map((todo) => ({
              id: todo.id,
              text: todo.text,
              done: todo.done,
              list: todo.listId ? (listNames.get(todo.listId) ?? null) : null,
              dueAt: todo.dueAt
                ? new Date(todo.dueAt).toISOString()
                : null,
              urgent: todo.urgent,
              flagged: todo.flagged,
              tags: todo.tags,
              repeat: todo.repeat,
            })),
          }),
        }
      },
    },
    {
      name: 'todo_create',
      description:
        '新建一条待办。dueAt 使用 ISO 8601 时间字符串，例如 2026-11-14T10:00:00+08:00。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '待办内容' },
          listId: { type: 'string', description: '可选的清单 ID' },
          dueAt: { type: 'string', description: '可选截止时间，ISO 8601' },
          urgent: { type: 'boolean', description: '是否紧急' },
          flagged: { type: 'boolean', description: '是否标记' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '标签',
          },
        },
        required: ['text'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `新建待办：${String(args.text ?? '')}`,
      async run(args) {
        const value = text(args.text, 'text', 200)
        const listId =
          typeof args.listId === 'string' ? args.listId : undefined
        let dueAt: number | null = null
        if (typeof args.dueAt === 'string' && args.dueAt.trim()) {
          const parsed = Date.parse(args.dueAt)
          if (Number.isNaN(parsed)) throw new Error('截止时间格式不正确。')
          dueAt = parsed
        }
        const tags = Array.isArray(args.tags)
          ? args.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .slice(0, 8)
          : undefined
        const created = await call(
          services.todo.create({
            text: value,
            listId: listId ?? null,
            dueAt,
            urgent: args.urgent === true,
            flagged: args.flagged === true,
            ...(tags ? { tags } : {}),
          }),
        )
        return {
          ok: true,
          text: `已新建待办：${created.text}${dueAt ? `，截止 ${formatTime(dueAt)}` : ''}`,
        }
      },
    },
    {
      name: 'todo_complete',
      description: '把一条待办标记为完成；重复待办会自动生成下一次。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办 ID' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `完成待办 ${String(args.id ?? '')}`,
      async run(args) {
        const id = text(args.id, 'id', 100)
        const done = await call(services.todo.complete(id))
        return {
          ok: true,
          text: done.changed ? `已完成：${done.text}` : '这条待办已经完成。',
        }
      },
    },
    {
      name: 'todo_update',
      description:
        '修改一条待办。dueAt 使用 ISO 8601 时间；传空字符串表示清除截止时间。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办 ID' },
          text: { type: 'string', description: '新的待办内容' },
          dueAt: {
            type: 'string',
            description: 'ISO 8601 截止时间；空字符串表示清除',
          },
          urgent: { type: 'boolean' },
          flagged: { type: 'boolean' },
          notes: { type: 'string', description: '备注' },
          tags: { type: 'array', items: { type: 'string' } },
          repeat: {
            type: 'string',
            enum: [...todoRepeats],
            description: '重复规则',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `修改待办 ${String(args.id ?? '')}`,
      async run(args) {
        const id = text(args.id, 'id', 100)
        const patch: {
          text?: string
          dueAt?: number | null
          urgent?: boolean
          flagged?: boolean
          notes?: string
          tags?: string[]
          repeat?: TodoRepeat
        } = {}
        if (args.text !== undefined)
          patch.text = text(args.text, 'text', 200)
        if (args.dueAt !== undefined) {
          if (args.dueAt === '') {
            patch.dueAt = null
          } else {
            if (typeof args.dueAt !== 'string')
              throw new Error('截止时间格式不正确。')
            const parsed = Date.parse(args.dueAt)
            if (Number.isNaN(parsed))
              throw new Error('截止时间格式不正确。')
            patch.dueAt = parsed
          }
        }
        if (args.urgent !== undefined)
          patch.urgent = booleanArg(args.urgent, 'urgent')
        if (args.flagged !== undefined)
          patch.flagged = booleanArg(args.flagged, 'flagged')
        if (args.notes !== undefined)
          patch.notes = optionalText(args.notes, 2000) ?? ''
        if (args.tags !== undefined) {
          if (!Array.isArray(args.tags))
            throw new Error('参数 tags 必须是数组。')
          patch.tags = args.tags
            .filter((tag): tag is string => typeof tag === 'string')
            .slice(0, 8)
        }
        const repeat = todoRepeatArg(args.repeat)
        if (repeat) patch.repeat = repeat
        if (!Object.keys(patch).length)
          return { ok: false, text: '没有需要修改的字段。' }
        const updated = await call(services.todo.update(id, patch))
        return { ok: true, text: `已更新待办：${updated.text}` }
      },
    },
    {
      name: 'todo_remove',
      description: '删除一条待办。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办 ID' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `删除待办 ${String(args.id ?? '')}`,
      async run(args) {
        const id = text(args.id, 'id', 100)
        const removed = await call(services.todo.remove(id))
        return { ok: true, text: `已删除待办：${removed.text}` }
      },
    },
    {
      name: 'todo_clear_done',
      description: '清理所有已完成的待办。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: () => '清理已完成待办',
      async run() {
        const { count } = await call(services.todo.clearDone())
        return {
          ok: true,
          text: count ? `已清理 ${count} 条已完成待办。` : '没有已完成待办。',
        }
      },
    },
    {
      name: 'todo_list_create',
      description: '新建一个待办清单。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '清单名称，1-40 字' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `新建清单：${String(args.name ?? '')}`,
      async run(args) {
        const name = text(args.name, 'name', 40)
        const created = await call(services.todo.createList(name))
        return { ok: true, text: `已新建清单：${created.name}` }
      },
    },
    {
      name: 'music_status',
      description: '查看当前播放器、歌曲、歌手、播放状态、音量和歌词。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: () => '查看音乐状态',
      async run() {
        const status = await call(services.music.status())
        return { ok: true, text: json(status) }
      },
    },
    {
      name: 'music_control',
      description: '控制当前播放器：播放/暂停、上一首、下一首或静音。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['toggle', 'previous', 'next', 'mute'],
            description: '控制动作',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'allow',
      title: (args) => `音乐：${String(args.action ?? '')}`,
      async run(args) {
        const action = args.action
        if (
          action !== 'toggle' &&
          action !== 'previous' &&
          action !== 'next' &&
          action !== 'mute'
        )
          throw new Error('不支持的音乐操作。')
        await call(services.music.control(action))
        return { ok: true, text: `已执行音乐操作：${action}` }
      },
    },
    {
      name: 'settings_read',
      description: '读取当前应用设置中的常用项。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: () => '读取设置',
      async run() {
        const settings = await call(services.settings.read())
        return { ok: true, text: json(settings) }
      },
    },
    {
      name: 'settings_update',
      description:
        '修改应用设置。只支持宠物名字、主题、缩放、音乐条样式、气泡开关和开机启动。',
      parameters: {
        type: 'object',
        properties: {
          petName: { type: 'string', description: '宠物名字，1-20 字' },
          theme: {
            type: 'string',
            enum: ['default', 'halloween', 'christmas'],
            description: '主题',
          },
          scale: {
            type: 'number',
            enum: [0.75, 1, 1.5, 2],
            description: '宠物缩放',
          },
          musicBarStyle: {
            type: 'string',
            enum: ['compact', 'double', 'minimal'],
            description: '音乐条样式',
          },
          statusBubbles: { type: 'boolean' },
          musicBubbles: { type: 'boolean' },
          launchAtLogin: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `修改设置：${Object.keys(args).join('、') || '无'}`,
      async run(args) {
        const patch: SettingsPatch = {}
        if (args.petName !== undefined)
          patch.petName = String(args.petName)
        if (args.theme !== undefined)
          patch.theme = String(args.theme) as SettingsPatch['theme']
        if (args.scale !== undefined)
          patch.scale = Number(args.scale) as SettingsPatch['scale']
        if (args.musicBarStyle !== undefined)
          patch.musicBarStyle = String(
            args.musicBarStyle,
          ) as SettingsPatch['musicBarStyle']
        for (const key of [
          'statusBubbles',
          'musicBubbles',
          'launchAtLogin',
        ] as const) {
          if (args[key] !== undefined) patch[key] = args[key] === true
        }
        if (!Object.keys(patch).length)
          return { ok: false, text: '没有需要修改的设置。' }
        await call(services.settings.update(patch))
        return {
          ok: true,
          text: `已修改设置：${Object.keys(patch).join('、')}`,
        }
      },
    },
    {
      name: 'clipboard_list',
      description: '查看剪贴板历史记录（文本已截断，敏感内容被过滤）。',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 30,
            description: '返回条数，默认 10',
          },
        },
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: () => '查看剪贴板',
      async run(args) {
        const limit = numberArg(args.limit, 1, 30) ?? 10
        const entries = await call(services.clipboard.list(limit))
        if (!entries.length)
          return { ok: true, text: '剪贴板历史是空的。' }
        return {
          ok: true,
          text: json(
            entries.map((entry) => ({
              id: entry.id,
              kind: entry.kind,
              text:
                entry.kind === 'text'
                  ? (entry.text ?? '').slice(0, 300)
                  : '（图片）',
              createdAt: new Date(entry.createdAt).toISOString(),
              pinned: entry.pinned,
            })),
          ),
        }
      },
    },
    {
      name: 'clipboard_copy',
      description: '把一条剪贴板历史记录重新复制到剪贴板。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '剪贴板记录 ID' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `复制剪贴板记录 ${String(args.id ?? '')}`,
      async run(args) {
        const id = text(args.id, 'id', 100)
        await call(services.clipboard.copy(id))
        return { ok: true, text: '已复制到剪贴板。' }
      },
    },
    {
      name: 'clipboard_pin',
      description: '固定或取消固定一条剪贴板记录。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '剪贴板记录 ID' },
          pinned: { type: 'boolean', description: '是否固定' },
        },
        required: ['id', 'pinned'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) =>
        `${args.pinned ? '固定' : '取消固定'}剪贴板记录 ${String(args.id ?? '')}`,
      async run(args) {
        const id = text(args.id, 'id', 100)
        const pinned = booleanArg(args.pinned, 'pinned')
        await call(services.clipboard.pin(id, pinned))
        return {
          ok: true,
          text: pinned ? '已固定该记录。' : '已取消固定。',
        }
      },
    },
    {
      name: 'mail_list',
      description: '查看已绑定的邮箱账户和最近邮件摘要，不读取正文。',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '可选的邮箱账户 ID' },
          folder: { type: 'string', description: '文件夹，默认 INBOX' },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 30,
            description: '返回条数，默认 10',
          },
        },
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: () => '查看邮件摘要',
      async run(args) {
        const accountId =
          typeof args.accountId === 'string' && args.accountId
            ? args.accountId
            : undefined
        const folder = mailFolderArg(args.folder)
        const limit = numberArg(args.limit, 1, 30) ?? 10
        const snapshot = await call(
          services.mail.list(accountId, folder, limit),
        )
        if (!snapshot.accounts.length)
          return { ok: true, text: '还没有绑定邮箱账户。' }
        return {
          ok: true,
          text: json({
            accounts: snapshot.accounts.map((account) => ({
              id: account.id,
              provider: account.provider,
              email: account.email,
            })),
            folder: snapshot.folder,
            messages: snapshot.messages.map((message) => ({
              uid: message.uid,
              subject: message.subject,
              from: message.fromName || message.fromAddress || '',
              date: message.date
                ? new Date(message.date).toISOString()
                : null,
              unread: message.unread,
              hasAttachments: message.hasAttachments,
              snippet: (message.snippet ?? '').slice(0, 160),
            })),
          }),
        }
      },
    },
    {
      name: 'mail_read',
      description: '读取一封邮件的正文和附件名称，不会把邮件标记为已读。',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '邮箱账户 ID' },
          uid: { type: 'integer', description: '邮件 uid，来自 mail_list' },
          folder: { type: 'string', description: '文件夹，默认 INBOX' },
        },
        required: ['accountId', 'uid'],
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: (args) => `读取邮件 ${String(args.uid ?? '')}`,
      async run(args) {
        const accountId = text(args.accountId, 'accountId', 100)
        const uid = mailUidArg(args.uid)
        const folder = mailFolderArg(args.folder)
        const detail = await call(
          services.mail.read(accountId, uid, folder),
        )
        return {
          ok: true,
          text: json({
            subject: detail.subject,
            from: detail.from,
            date: detail.date
              ? new Date(detail.date).toISOString()
              : null,
            attachments: detail.attachments,
            body: detail.body.slice(0, 6000),
          }),
        }
      },
    },
    {
      name: 'mail_send',
      description:
        '发送一封邮件。必须提供账户、收件人、主题和正文；可以从置物架附加文件。',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '邮箱账户 ID' },
          to: { type: 'string', description: '收件人，多个用逗号分隔' },
          cc: { type: 'string', description: '抄送，可选' },
          bcc: { type: 'string', description: '密送，可选' },
          subject: { type: 'string', description: '主题' },
          body: { type: 'string', description: '纯文本正文' },
          attachmentFileIds: {
            type: 'array',
            items: { type: 'string' },
            description: '置物架文件 ID 列表，可选',
          },
        },
        required: ['accountId', 'to', 'subject', 'body'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) =>
        `发送邮件：${String(args.subject ?? '')} → ${String(args.to ?? '')}`,
      async run(args) {
        const accountId = text(args.accountId, 'accountId', 100)
        const to = text(args.to, 'to', 2000)
        const subject = text(args.subject, 'subject', 500)
        const body = text(args.body, 'body', 1_000_000)
        const cc = optionalText(args.cc, 2000)
        const bcc = optionalText(args.bcc, 2000)
        const ids = Array.isArray(args.attachmentFileIds)
          ? args.attachmentFileIds
              .filter((id): id is string => typeof id === 'string')
              .slice(0, 10)
          : []
        const result = await call(
          services.mail.send({
            accountId,
            to,
            ...(cc ? { cc } : {}),
            ...(bcc ? { bcc } : {}),
            subject,
            body,
            ...(ids.length ? { attachmentFileIds: ids } : {}),
          }),
        )
        return {
          ok: true,
          text: `邮件已发送给 ${result.to}${
            result.attachments ? `，附件 ${result.attachments} 个` : ''
          }。${result.savedToSent ? '' : '未能保存到已发送。'}`,
        }
      },
    },
    {
      name: 'mail_archive',
      description: '把一封邮件归档。',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '邮箱账户 ID' },
          uid: { type: 'integer', description: '邮件 uid' },
          folder: { type: 'string', description: '当前文件夹，默认 INBOX' },
        },
        required: ['accountId', 'uid'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `归档邮件 ${String(args.uid ?? '')}`,
      async run(args) {
        const accountId = text(args.accountId, 'accountId', 100)
        const uid = mailUidArg(args.uid)
        const folder = mailFolderArg(args.folder)
        const { subject } = await call(
          services.mail.archive(accountId, folder, uid),
        )
        return { ok: true, text: `已归档「${subject}」。` }
      },
    },
    {
      name: 'mail_delete',
      description:
        '删除一封邮件：普通文件夹移动到已删除，已删除文件夹中永久删除。',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '邮箱账户 ID' },
          uid: { type: 'integer', description: '邮件 uid' },
          folder: { type: 'string', description: '当前文件夹，默认 INBOX' },
        },
        required: ['accountId', 'uid'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `删除邮件 ${String(args.uid ?? '')}`,
      async run(args) {
        const accountId = text(args.accountId, 'accountId', 100)
        const uid = mailUidArg(args.uid)
        const folder = mailFolderArg(args.folder)
        const { subject } = await call(
          services.mail.remove(accountId, folder, uid),
        )
        return { ok: true, text: `已删除「${subject}」。` }
      },
    },
    {
      name: 'mail_move',
      description: '把一封邮件移动到指定文件夹。',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '邮箱账户 ID' },
          uid: { type: 'integer', description: '邮件 uid' },
          folder: { type: 'string', description: '当前文件夹，默认 INBOX' },
          targetFolder: {
            type: 'string',
            description: '目标文件夹路径，来自 mail_list 的文件夹列表',
          },
        },
        required: ['accountId', 'uid', 'targetFolder'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `移动邮件到 ${String(args.targetFolder ?? '')}`,
      async run(args) {
        const accountId = text(args.accountId, 'accountId', 100)
        const uid = mailUidArg(args.uid)
        const folder = mailFolderArg(args.folder)
        const targetFolder = text(args.targetFolder, 'targetFolder', 200)
        const { subject } = await call(
          services.mail.move(accountId, folder, uid, targetFolder),
        )
        return {
          ok: true,
          text: `已把「${subject}」移动到 ${targetFolder}。`,
        }
      },
    },
    {
      name: 'focus_control',
      description: '控制番茄时钟：开始、暂停、重置或跳到下一阶段。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'pause', 'reset', 'skip'],
            description: '控制动作',
          },
        },
        required: ['action'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'allow',
      title: (args) => `番茄时钟：${String(args.action ?? '')}`,
      async run(args) {
        const action = args.action
        if (
          action !== 'start' &&
          action !== 'pause' &&
          action !== 'reset' &&
          action !== 'skip'
        )
          throw new Error('不支持的番茄时钟操作。')
        const state = await call(services.focus.control(action))
        const phase =
          state.phase === 'focus'
            ? '专注'
            : state.phase === 'short'
              ? '短休'
              : '长休'
        return {
          ok: true,
          text: `番茄时钟已${action === 'start' ? '开始' : action === 'pause' ? '暂停' : action === 'reset' ? '重置' : '跳到下一阶段'}：${phase}，${state.running ? '进行中' : '未运行'}。`,
        }
      },
    },
    {
      name: 'water_drink',
      description: '记录一次喝水。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'allow',
      title: () => '记录喝水',
      async run() {
        const { count, goal } = await call(services.focus.drink())
        return { ok: true, text: `已记录一次喝水：${count}/${goal}。` }
      },
    },
    {
      name: 'water_snooze',
      description: '把下一次喝水提醒延后指定分钟数。',
      parameters: {
        type: 'object',
        properties: {
          minutes: {
            type: 'integer',
            minimum: 1,
            maximum: 60,
            description: '延后分钟数，默认 10',
          },
        },
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'allow',
      title: (args) => `喝水提醒延后 ${String(args.minutes ?? 10)} 分钟`,
      async run(args) {
        const minutes = numberArg(args.minutes, 1, 60) ?? 10
        await call(services.focus.snoozeWater(minutes))
        return { ok: true, text: `喝水提醒已延后 ${minutes} 分钟。` }
      },
    },
    {
      name: 'break_snooze',
      description: '把久坐或护眼提醒延后指定分钟数。',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['sitting', 'eyes'],
            description: 'sitting 久坐，eyes 护眼',
          },
          minutes: {
            type: 'integer',
            minimum: 1,
            maximum: 60,
            description: '延后分钟数，默认 10',
          },
        },
        required: ['kind'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'allow',
      title: (args) =>
        `${args.kind === 'eyes' ? '护眼' : '久坐'}提醒延后 ${String(args.minutes ?? 10)} 分钟`,
      async run(args) {
        const kind = args.kind
        if (kind !== 'sitting' && kind !== 'eyes')
          throw new Error('不支持的提醒类型。')
        const minutes = numberArg(args.minutes, 1, 60) ?? 10
        await call(services.focus.snoozeBreak(kind, minutes))
        return {
          ok: true,
          text: `${kind === 'eyes' ? '护眼' : '久坐'}提醒已延后 ${minutes} 分钟。`,
        }
      },
    },
    {
      name: 'shell_run',
      description:
        '在用户选择的工作区里执行一条命令。每条命令都必须由用户确认，不能静默执行。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          timeoutSeconds: {
            type: 'integer',
            minimum: 1,
            maximum: 120,
            description: '超时时间，默认 30 秒',
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `执行命令：${String(args.command ?? '')}`,
      async run(args, ctx) {
        const command = text(args.command, 'command', 2000)
        const timeoutSeconds =
          numberArg(args.timeoutSeconds, 1, 120) ?? 30
        const output = await runShell({
          command,
          workspace: ctx.workspace,
          timeoutSeconds,
          signal: ctx.signal,
        })
        if (!output.ok) throw new Error(output.error)
        return formatShell(output.value)
      },
    },
    {
      name: 'ui_open',
      description:
        '打开应用内的功能面板，让用户看到结果。支持待办、邮件、置物架、设置、剪贴板、宠物档案、专注、番茄时钟、喝水提醒、休息提醒。',
      parameters: {
        type: 'object',
        properties: {
          panel: {
            type: 'string',
            enum: [
              'todo',
              'mail',
              'shelf',
              'settings',
              'clipboard',
              'profile',
              'focus',
              'pomodoro',
              'water',
              'break',
            ],
            description: '要打开的面板',
          },
        },
        required: ['panel'],
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: (args) => `打开面板：${String(args.panel ?? '')}`,
      async run(args) {
        const panel = args.panel
        if (typeof panel !== 'string')
          throw new Error('缺少面板名称。')
        await call(services.panel.open(panel as PanelTarget))
        return { ok: true, text: `已打开面板：${panel}` }
      },
    },
    {
      name: 'workspace_list',
      description:
        '列出当前项目工作区里的文件和目录。编辑前先用它确认路径。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对工作区的目录，默认根目录' },
          depth: { type: 'number', description: '目录深度，1-3，默认 2' },
        },
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: (args) => `查看工作区 ${String(args.path ?? '')}`.trim(),
      async run(args, ctx) {
        const root = workspaceRoot(ctx)
        const target = workspaceRelative(
          root,
          typeof args.path === 'string' ? args.path : '.',
          true,
        )
        await assertWorkspacePath(root, target.path)
        const info = await stat(target.path).catch(() => null)
        if (!info?.isDirectory()) throw new Error('目录不存在。')
        const depth = numberArg(args.depth, 1, 3) ?? 2
        const lines: string[] = []
        const walk = async (directory: string, level: number) => {
          const entries = await readdir(directory, {
            withFileTypes: true,
          }).catch(() => [])
          for (const entry of entries.sort((left, right) =>
            left.name.localeCompare(right.name),
          )) {
            if (lines.length >= 300) return
            if (entry.isSymbolicLink()) continue
            if (workspaceSkipDirectories.has(entry.name)) continue
            const rel = relative(root, join(directory, entry.name))
              .split('\\')
              .join('/')
            lines.push(entry.isDirectory() ? `${rel}/` : rel)
            if (entry.isDirectory() && level < depth)
              await walk(join(directory, entry.name), level + 1)
          }
        }
        await walk(target.path, 1)
        if (!lines.length) return { ok: true, text: '目录是空的。' }
        return {
          ok: true,
          text: `${lines.join('\n')}${
            lines.length >= 300 ? '\n（已截断）' : ''
          }`,
        }
      },
    },
    {
      name: 'workspace_read',
      description:
        '读取当前项目工作区内的文本文件。修改前先读取原文以确认内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对工作区的文件路径' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: (args) => `读取 ${String(args.path ?? '')}`,
      async run(args, ctx) {
        const root = workspaceRoot(ctx)
        const target = workspaceRelative(root, args.path)
        if (workspaceBlocked(target.relative))
          throw new Error('不能读取这个目录。')
        await assertWorkspacePath(root, target.path)
        const existing = await lstat(target.path).catch(() => null)
        if (existing?.isSymbolicLink())
          throw new Error('不能通过符号链接写入文件。')
        const file = await readWorkspaceText(target.path)
        return {
          ok: true,
          text: `${file.text}${
            file.truncated
              ? '\n（文件超过 512 KB，已截断）'
              : ''
          }`,
        }
      },
    },
    {
      name: 'workspace_search',
      description:
        '在当前项目工作区里搜索文本，返回文件、行号和匹配内容。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要搜索的文字' },
          path: { type: 'string', description: '可选的相对目录或文件' },
          limit: { type: 'number', description: '最多返回多少条，默认 50' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: (args) => `搜索 ${String(args.query ?? '')}`.slice(0, 80),
      async run(args, ctx) {
        const root = workspaceRoot(ctx)
        const query = text(args.query, 'query', 200)
        const limit = numberArg(args.limit, 1, 100) ?? 50
        const start = workspaceRelative(
          root,
          typeof args.path === 'string' ? args.path : '.',
          true,
        )
        await assertWorkspacePath(root, start.path)
        const info = await stat(start.path).catch(() => null)
        if (!info) throw new Error('搜索路径不存在。')
        const files = info.isFile()
          ? [
              {
                path: start.path,
                relative: start.relative,
                size: info.size,
              },
            ]
          : await walkWorkspace(root, start.path, 500)
        const needle = query.toLowerCase()
        const matches: string[] = []
        for (const file of files) {
          if (matches.length >= limit) break
          if (file.size > workspaceReadBytes) continue
          const content = await readFile(file.path, 'utf8').catch(
            () => null,
          )
          if (!content || content.includes('\u0000')) continue
          const lines = content.split(/\r?\n/)
          for (const [index, line] of lines.entries()) {
            if (!line.toLowerCase().includes(needle)) continue
            matches.push(
              `${file.relative}:${index + 1}: ${line.trim().slice(0, 200)}`,
            )
            if (matches.length >= limit) break
          }
        }
        if (!matches.length)
          return { ok: true, text: `没有找到“${query}”。` }
        return { ok: true, text: matches.join('\n') }
      },
    },
    {
      name: 'workspace_write',
      description:
        '在工作区内创建或整体覆盖一个文本文件。覆盖前会保留可恢复副本，写盘前需要用户确认。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对工作区的文件路径' },
          content: { type: 'string', description: '完整文件内容' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `写入 ${String(args.path ?? '')}`,
      async run(args, ctx) {
        const root = workspaceRoot(ctx)
        const target = workspaceRelative(root, args.path)
        if (workspaceBlocked(target.relative))
          throw new Error('不能写入这个目录。')
        if (typeof args.content !== 'string')
          throw new Error('缺少文件内容。')
        if (Buffer.byteLength(args.content, 'utf8') > workspaceWriteBytes)
          throw new Error('文件超过 512 KB，无法写入。')
        await mkdir(dirname(target.path), { recursive: true })
        await assertWorkspacePath(root, target.path)
        const existing = await lstat(target.path).catch(() => null)
        if (existing?.isSymbolicLink())
          throw new Error('不能通过符号链接写入文件。')
        const backup = await backupWorkspaceFile(target.path, ctx)
        await writeWorkspaceText(target.path, args.content)
        return {
          ok: true,
          text: `已写入 ${target.relative}（${args.content.length} 字符）${
            backup ? '，原文件已保留可恢复副本' : ''
          }。`,
        }
      },
    },
    {
      name: 'workspace_replace',
      description:
        '把文件中的一段精确文本替换为新文本。默认要求只匹配一次；写盘前需要用户确认并保留备份。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对工作区的文件路径' },
          find: { type: 'string', description: '要查找的原文' },
          replace: { type: 'string', description: '替换后的文本' },
          all: { type: 'boolean', description: '是否替换全部匹配' },
        },
        required: ['path', 'find', 'replace'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `修改 ${String(args.path ?? '')}`,
      async run(args, ctx) {
        const root = workspaceRoot(ctx)
        const target = workspaceRelative(root, args.path)
        if (workspaceBlocked(target.relative))
          throw new Error('不能修改这个目录。')
        const find = text(args.find, 'find', 10_000)
        if (typeof args.replace !== 'string')
          throw new Error('缺少替换文本。')
        await assertWorkspacePath(root, target.path)
        const file = await readWorkspaceText(target.path)
        if (file.truncated)
          throw new Error('文件超过 512 KB，无法安全替换。')
        const count = file.text.split(find).length - 1
        if (!count) throw new Error('没有找到要替换的文本。')
        const all = args.all === true
        if (!all && count > 1)
          throw new Error(
            `原文匹配了 ${count} 次，请提供更长片段或设置 all。`,
          )
        const next = all
          ? file.text.split(find).join(args.replace)
          : file.text.replace(find, args.replace)
        if (Buffer.byteLength(next, 'utf8') > workspaceWriteBytes)
          throw new Error('修改后文件超过 512 KB。')
        const backup = await backupWorkspaceFile(target.path, ctx)
        await writeWorkspaceText(target.path, next)
        return {
          ok: true,
          text: `已修改 ${target.relative}，替换 ${all ? count : 1} 处${
            backup ? '，原文件已保留可恢复副本' : ''
          }。`,
        }
      },
    },
    {
      name: 'workspace_delete',
      description:
        '删除工作区内的一个文件。删除前会保留可恢复副本，并需要用户确认。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对工作区的文件路径' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      plan: 'deny',
      build: 'ask',
      title: (args) => `删除 ${String(args.path ?? '')}`,
      async run(args, ctx) {
        const root = workspaceRoot(ctx)
        const target = workspaceRelative(root, args.path)
        if (workspaceBlocked(target.relative))
          throw new Error('不能删除这个目录。')
        await assertWorkspacePath(root, target.path)
        const info = await lstat(target.path).catch(() => null)
        if (info?.isSymbolicLink())
          throw new Error('不能删除符号链接。')
        if (!info?.isFile()) throw new Error('只能删除普通文件。')
        const backup = await backupWorkspaceFile(target.path, ctx)
        await unlink(target.path)
        return {
          ok: true,
          text: `已删除 ${target.relative}${
            backup ? '，已保留可恢复副本' : ''
          }。`,
        }
      },
    },
    ...(web
      ? [
          {
            name: 'web_search',
            description:
              '联网搜索公开网页。回答时用 Markdown 链接引用搜到的来源。',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: '搜索关键词' },
                count: {
                  type: 'number',
                  description: '返回结果数量，1-8，默认 5',
                },
              },
              required: ['query'],
              additionalProperties: false,
            },
            plan: 'allow' as const,
            build: 'allow' as const,
            title: (args: Record<string, unknown>) =>
              `搜索 ${String(args.query ?? '')}`.slice(0, 80),
            async run(args: Record<string, unknown>) {
              const query = text(args.query, 'query', 128)
              const count = numberArg(args.count, 1, 8) ?? 5
              const results = await web.search(query, count)
              if (!results.length)
                return {
                  ok: true,
                  text: `没有找到与“${query}”相关的结果。`,
                }
              return {
                ok: true,
                text: results
                  .map(
                    (result, index) =>
                      `${index + 1}. [${result.title}](${result.url})\n${result.summary}${
                        result.date ? `（${result.date}）` : ''
                      }`,
                  )
                  .join('\n\n'),
              }
            },
          },
          {
            name: 'read_url',
            description:
              '读取一个公开网页的正文。回答时用 Markdown 链接标注来源。',
            parameters: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'http 或 https 网页地址' },
              },
              required: ['url'],
              additionalProperties: false,
            },
            plan: 'allow' as const,
            build: 'allow' as const,
            title: (args: Record<string, unknown>) =>
              `读取网页 ${String(args.url ?? '')}`.slice(0, 80),
            async run(args: Record<string, unknown>) {
              const url = text(args.url, 'url', 2048)
              const page = await web.read(url)
              return {
                ok: true,
                text: `标题：${page.title}\n来源：${page.url}\n\n${page.text}`,
              }
            },
          },
        ]
      : []),
  ]

  return Object.fromEntries(tools.map((tool) => [tool.name, tool]))
}

export function toolDefinition(tool: AgentTool): ProviderToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}

export function permissionFor(
  tool: AgentTool | undefined,
  mode: AgentMode,
): 'allow' | 'ask' | 'deny' {
  if (!tool) return 'deny'
  return mode === 'plan' ? tool.plan : tool.build
}

export function safeTitle(
  tool: AgentTool,
  args: Record<string, unknown>,
): string {
  try {
    return tool.title(args).slice(0, 80)
  } catch {
    return tool.name
  }
}
