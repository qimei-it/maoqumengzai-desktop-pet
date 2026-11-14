/** First-version tool registry. Every tool calls the same services the UI uses. */

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import type { AgentMode, AgentPetProfile } from '../../shared/agent'
import type { ClipboardState } from '../../shared/clipboard'
import type {
  ArchiveFormat,
  ConvertAction,
  FocusTodo,
  LyricsState,
  MusicState,
  TodoGroup,
  TodoList,
  TodoRepeat,
} from '../../shared/protocol'
import { archiveFormats, todoRepeats } from '../../shared/protocol'
import type { RenameConfig } from '../../shared/rename'
import type {
  MailAccount,
  MailMessageSummary,
} from '../../shared/mail'
import {
  mailBodyLimit,
  mailRecipientError,
  mailSubjectLimit,
} from '../../shared/mail'
import type { SettingsState } from '../../shared/settings'
import {
  musicBarStyles,
  petScales,
  themeIds,
} from '../../shared/settings'
import { sendMailMessage } from '../mail-smtp'
import type { ProviderToolDefinition } from './provider'

export type AgentPanelTarget =
  | 'todo'
  | 'mail'
  | 'shelf'
  | 'settings'
  | 'clipboard'
  | 'profile'
  | 'focus'
  | 'pomodoro'
  | 'water'
  | 'break'

export type AgentDeps = {
  getSettings(): SettingsState
  getPetProfile(): AgentPetProfile
  updateSettings(patch: Partial<SettingsState>): Promise<void>
  shelfFiles(): Array<{
    id: string
    name: string
    size: number
    status: string
  }>
  resolveShelfFile(id: string): Promise<string>
  todos(): FocusTodo[]
  todoLists(): TodoList[]
  todoGroups(): TodoGroup[]
  addTodo(
    text: string,
    listId?: string | null,
    flags?: {
      dueAt?: number | null
      urgent?: boolean
      flagged?: boolean
      tags?: string[]
      repeat?: FocusTodo['repeat']
    },
  ): void
  toggleTodo(id: string): boolean
  music(): MusicState
  lyrics(): LyricsState | undefined
  controlMusic(action: 'previous' | 'toggle' | 'next' | 'mute'): void
  clipboard(): ClipboardState
  revealFile(id: string): Promise<void>
  saveCopy(id: string): Promise<string | null>
  removeFromShelf(id: string): Promise<void>
  convertFiles(
    fileIds: string[],
    action: ConvertAction,
    password?: string,
  ): Promise<string>
  archiveFiles(fileIds: string[], format: ArchiveFormat): Promise<string>
  extractFiles(fileIds: string[]): Promise<number>
  renameFiles(fileIds: string[], config: RenameConfig): Promise<number>
  mailRead(
    accountId: string,
    uid: number,
    folder: string,
  ): Promise<{
    subject: string
    from: string
    date?: number
    body: string
    attachments: string[]
  }>
  mailMove(
    accountId: string,
    folder: string,
    uid: number,
    mode: 'archive' | 'delete' | 'move',
    targetFolder?: string,
  ): Promise<string>
  updateTodo(
    id: string,
    patch: {
      text?: string
      dueAt?: number | null
      urgent?: boolean
      flagged?: boolean
      notes?: string
      tags?: string[]
      repeat?: TodoRepeat
    },
  ): void
  removeTodo(id: string): void
  clearDoneTodos(): number
  addTodoList(name: string): void
  focusControl(action: 'start' | 'pause' | 'reset' | 'skip'): {
    phase: string
    running: boolean
  }
  waterDrink(): { count: number; goal: number }
  waterSnooze(minutes: number): void
  breakSnooze(kind: 'sitting' | 'eyes', minutes: number): void
  clipboardCopy(id: string): Promise<void>
  clipboardPin(id: string, pinned: boolean): void
  mailAccounts(): MailAccount[]
  mailMessages(
    accountId: string,
    folder: string,
    limit: number,
  ): MailMessageSummary[]
  mailSecret(accountId: string): Promise<string | null>
  openPanel(panel: AgentPanelTarget): void
}

export type ToolResult = { ok: boolean; text: string }

export type ToolContext = {
  workspace: string | null
  signal: AbortSignal
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

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function formatTime(value: number | undefined): string {
  if (!value) return '未设置'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
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

function booleanArg(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`参数 ${field} 必须是布尔值。`)
  return value
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

const maxShellOutput = 64 * 1024

async function runShell(
  command: string,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const windows = process.platform === 'win32'
    const child = spawn(
      windows ? 'cmd.exe' : '/bin/zsh',
      windows ? ['/d', '/s', '/c', command] : ['-lc', command],
      {
        cwd,
        env: { ...process.env },
        detached: !windows,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    let truncated = false
    let settled = false
    const append = (target: 'out' | 'err', chunk: Buffer): void => {
      const value = chunk.toString('utf8')
      if (target === 'out') {
        if (stdout.length < maxShellOutput) stdout += value
        else truncated = true
      } else if (stderr.length < maxShellOutput) stderr += value
      else truncated = true
    }
    child.stdout.on('data', (chunk: Buffer) => append('out', chunk))
    child.stderr.on('data', (chunk: Buffer) => append('err', chunk))

    const timer = setTimeout(() => {
      finish(null, '命令超时，已终止。')
    }, timeoutMs)

    const kill = (): void => {
      if (child.pid && !windows) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          child.kill('SIGTERM')
        }
      } else {
        child.kill('SIGTERM')
      }
    }
    const onAbort = (): void => {
      kill()
      finish(null, '已取消。')
    }
    signal.addEventListener('abort', onAbort, { once: true })

    let extra = ''
    function finish(code: number | null, note?: string): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      extra = note ?? ''
      const parts = [
        `退出码：${code === null ? '无' : code}`,
        ...(extra ? [extra] : []),
        `工作目录：${cwd}`,
        ...(stdout.trim() ? ['', '标准输出：', stdout.trim()] : []),
        ...(stderr.trim() ? ['', '标准错误：', stderr.trim()] : []),
        ...(truncated ? ['', '（输出过长，已截断）'] : []),
      ]
      resolve({
        ok: code === 0,
        text: parts.join('\n'),
      })
    }

    child.on('error', (error) => {
      finish(null, `无法执行：${error.message}`)
    })
    child.on('close', (code) => {
      finish(code)
    })
  })
}

export function createTools(deps: AgentDeps): Record<string, AgentTool> {
  const tools: AgentTool[] = [
    {
      name: 'shelf_list',
      description: '列出置物架里的文件，包含文件 ID、名称、大小和状态。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      plan: 'allow',
      build: 'allow',
      title: () => '查看置物架',
      async run() {
        const files = deps.shelfFiles()
        if (!files.length)
          return { ok: true, text: '置物架是空的。' }
        return {
          ok: true,
          text: json(
            files.map((file) => ({
              id: file.id,
              name: file.name,
              size: formatSize(file.size),
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
        const file = deps.shelfFiles().find((item) => item.id === id)
        if (!file) throw new Error('置物架里没有这个文件。')
        const path = await deps.resolveShelfFile(id)
        const buffer = await readFile(path)
        if (buffer.includes(0))
          return { ok: false, text: '这不是文本文件，无法直接读取。' }
        const value = buffer.toString('utf8').slice(0, limit)
        return {
          ok: true,
          text: `${file.name}\n\n${value}${buffer.length > limit ? '\n\n（内容过长，已截断）' : ''}`,
        }
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
        const lists = deps.todoLists()
        const listNames = new Map(lists.map((list) => [list.id, list.name]))
        const todos = deps
          .todos()
          .filter((todo) => includeDone || !todo.done)
          .slice(-120)
        return {
          ok: true,
          text: json({
            groups: deps.todoGroups().map((group) => group.name),
            lists: lists.map((list) => ({
              id: list.id,
              name: list.name,
              group: list.groupId
                ? deps.todoGroups().find((g) => g.id === list.groupId)?.name
                : null,
            })),
            todos: todos.map((todo) => ({
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
        deps.addTodo(value, listId ?? null, {
          dueAt,
          urgent: args.urgent === true,
          flagged: args.flagged === true,
          ...(tags ? { tags } : {}),
        })
        return {
          ok: true,
          text: `已新建待办：${value}${dueAt ? `，截止 ${formatTime(dueAt)}` : ''}`,
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
        const todo = deps.todos().find((item) => item.id === id)
        if (!todo) throw new Error('找不到这条待办。')
        if (todo.done) return { ok: true, text: '这条待办已经完成。' }
        const changed = deps.toggleTodo(id)
        if (!changed) throw new Error('没有找到可完成的待办。')
        return { ok: true, text: `已完成：${todo.text}` }
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
        const music = deps.music()
        const lyrics = deps.lyrics()
        return {
          ok: true,
          text: json({
            playing: music.playing,
            title: music.title ?? null,
            artist: music.artist ?? null,
            album: music.album ?? null,
            app: music.appName ?? null,
            volume: music.volume ?? null,
            muted: music.muted ?? false,
            shuffle: music.shuffle ?? null,
            repeat: music.repeat ?? null,
            lyrics: lyrics?.synced ?? lyrics?.plain ?? null,
          }),
        }
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
        deps.controlMusic(action)
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
        const settings = deps.getSettings()
        return {
          ok: true,
          text: json({
            petName: settings.petName,
            theme: settings.theme,
            scale: settings.scale,
            musicBarStyle: settings.musicBarStyle,
            statusBubbles: settings.statusBubbles,
            musicBubbles: settings.musicBubbles,
            shelfAutoScreenshots: settings.shelfAutoScreenshots,
            shelfClipboardImages: settings.shelfClipboardImages,
            launchAtLogin: settings.launchAtLogin,
          }),
        }
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
            enum: [...themeIds],
            description: '主题',
          },
          scale: {
            type: 'number',
            enum: [...petScales],
            description: '宠物缩放',
          },
          musicBarStyle: {
            type: 'string',
            enum: [...musicBarStyles],
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
        const patch: Partial<SettingsState> = {}
        if (args.petName !== undefined) {
          const name = text(args.petName, 'petName', 20)
          patch.petName = name
        }
        if (args.theme !== undefined) {
          if (
            typeof args.theme !== 'string' ||
            !(themeIds as readonly string[]).includes(args.theme)
          )
            throw new Error('不支持的主题。')
          patch.theme = args.theme as SettingsState['theme']
        }
        if (args.scale !== undefined) {
          if (
            typeof args.scale !== 'number' ||
            !(petScales as readonly number[]).includes(args.scale)
          )
            throw new Error('不支持的缩放比例。')
          patch.scale = args.scale as SettingsState['scale']
        }
        if (args.musicBarStyle !== undefined) {
          if (
            typeof args.musicBarStyle !== 'string' ||
            !(musicBarStyles as readonly string[]).includes(args.musicBarStyle)
          )
            throw new Error('不支持的音乐条样式。')
          patch.musicBarStyle =
            args.musicBarStyle as SettingsState['musicBarStyle']
        }
        for (const key of [
          'statusBubbles',
          'musicBubbles',
          'launchAtLogin',
        ] as const) {
          if (args[key] !== undefined) {
            if (typeof args[key] !== 'boolean')
              throw new Error(`参数 ${key} 必须是布尔值。`)
            patch[key] = args[key]
          }
        }
        if (!Object.keys(patch).length)
          return { ok: false, text: '没有需要修改的设置。' }
        await deps.updateSettings(patch)
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
        const entries = deps.clipboard().entries.slice(0, limit)
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
      name: 'mail_list',
      description: '查看已绑定的邮箱账户和最近邮件摘要，不读取正文。',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: '可选的邮箱账户 ID' },
          folder: {
            type: 'string',
            description: '文件夹，默认 INBOX',
          },
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
        const accounts = deps.mailAccounts()
        if (!accounts.length)
          return { ok: true, text: '还没有绑定邮箱账户。' }
        const accountId =
          typeof args.accountId === 'string' && args.accountId
            ? args.accountId
            : accounts[0].id
        const account = accounts.find((item) => item.id === accountId)
        if (!account) throw new Error('找不到这个邮箱账户。')
        const folder =
          typeof args.folder === 'string' && args.folder.trim()
            ? args.folder.trim().toUpperCase()
            : 'INBOX'
        const limit = numberArg(args.limit, 1, 30) ?? 10
        const messages = deps.mailMessages(account.id, folder, limit)
        return {
          ok: true,
          text: json({
            accounts: accounts.map((item) => ({
              id: item.id,
              provider: item.provider,
              email: item.email,
            })),
            folder,
            messages: messages.map((message) => ({
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
        const account = deps.mailAccounts().find(
          (item) => item.id === accountId,
        )
        if (!account) throw new Error('找不到这个邮箱账户。')
        const to = text(args.to, 'to', 2000)
        const recipientError = mailRecipientError(to)
        if (recipientError) throw new Error(recipientError)
        const subject = text(args.subject, 'subject', mailSubjectLimit)
        const body = text(args.body, 'body', mailBodyLimit)
        const cc = optionalText(args.cc, 2000)
        const bcc = optionalText(args.bcc, 2000)
        if (cc && mailRecipientError(cc)) throw new Error(mailRecipientError(cc))
        if (bcc && mailRecipientError(bcc))
          throw new Error(mailRecipientError(bcc))
        const ids = Array.isArray(args.attachmentFileIds)
          ? args.attachmentFileIds
              .filter((id): id is string => typeof id === 'string')
              .slice(0, 10)
          : []
        const files = deps.shelfFiles()
        const attachments = []
        for (const id of ids) {
          const file = files.find((item) => item.id === id)
          if (!file) throw new Error(`置物架里没有文件 ${id}。`)
          attachments.push({
            path: await deps.resolveShelfFile(id),
            name: file.name,
            size: file.size,
          })
        }
        if (
          attachments.reduce((total, item) => total + item.size, 0) >
          25 * 1024 * 1024
        )
          throw new Error('附件总大小不能超过 25 MB。')
        const secret = await deps.mailSecret(account.id)
        if (!secret) throw new Error('邮箱授权已失效，请重新授权。')
        const result = await sendMailMessage({
          account,
          secret,
          to,
          ...(cc ? { cc } : {}),
          ...(bcc ? { bcc } : {}),
          subject,
          body,
          attachments,
        })
        return {
          ok: true,
          text: `邮件已发送给 ${to}${attachments.length ? `，附件 ${attachments.length} 个` : ''}。${
            result.savedToSent ? '' : '未能保存到已发送。'
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
        await deps.revealFile(id)
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
        const saved = await deps.saveCopy(id)
        if (!saved) return { ok: false, text: '已取消另存。' }
        return { ok: true, text: `已另存到 ${saved}` }
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
        const file = deps.shelfFiles().find((item) => item.id === id)
        if (!file) throw new Error('置物架里没有这个文件。')
        await deps.removeFromShelf(id)
        return {
          ok: true,
          text: `已把 ${file.name} 移出置物架；源文件保留。`,
        }
      },
    },
    {
      name: 'convert_start',
      description:
        '把置物架里的文件转换成指定格式。音视频需要 FFmpeg，Office 需要 LibreOffice；缺少引擎时会在设置中提示。PDF 加密/解密需要 password。',
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
        return {
          ok: true,
          text: await deps.convertFiles(ids, action, password),
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
        return {
          ok: true,
          text: await deps.archiveFiles(
            ids,
            args.format as ArchiveFormat,
          ),
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
        const count = await deps.extractFiles(ids)
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
        if (!ids.length) throw new Error('没有可重命名的文件。')
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
        const count = await deps.renameFiles(ids, config)
        if (!count) return { ok: false, text: '没有文件被重命名。' }
        return { ok: true, text: `已重命名 ${count} 个文件。` }
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
        if (!deps.mailAccounts().some((item) => item.id === accountId))
          throw new Error('找不到这个邮箱账户。')
        const uid = mailUidArg(args.uid)
        const folder = mailFolderArg(args.folder)
        const detail = await deps.mailRead(accountId, uid, folder)
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
        const subject = await deps.mailMove(
          accountId,
          folder,
          uid,
          'archive',
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
        const subject = await deps.mailMove(
          accountId,
          folder,
          uid,
          'delete',
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
        const subject = await deps.mailMove(
          accountId,
          folder,
          uid,
          'move',
          targetFolder,
        )
        return {
          ok: true,
          text: `已把「${subject}」移动到 ${targetFolder}。`,
        }
      },
    },
    {
      name: 'todo_update',
      description:
        '修改一条待办。dueAt 使用 ISO 8601 时间；传 null 表示清除截止时间。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办 ID' },
          text: { type: 'string', description: '新的待办内容' },
          dueAt: {
            type: 'string',
            description:
              'ISO 8601 截止时间；传空字符串表示清除截止时间',
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
        const todo = deps.todos().find((item) => item.id === id)
        if (!todo) throw new Error('找不到这条待办。')
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
          if (args.dueAt === null || args.dueAt === '') {
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
        if (args.repeat !== undefined) {
          if (
            typeof args.repeat !== 'string' ||
            !(todoRepeats as readonly string[]).includes(args.repeat)
          )
            throw new Error('不支持的重复规则。')
          patch.repeat = args.repeat as TodoRepeat
        }
        if (!Object.keys(patch).length)
          return { ok: false, text: '没有需要修改的字段。' }
        deps.updateTodo(id, patch)
        return { ok: true, text: `已更新待办：${todo.text}` }
      },
    },
    {
      name: 'todo_remove',
      description: '删除一条待办；不能删除重复待办生成的整组记录。',
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
        const todo = deps.todos().find((item) => item.id === id)
        if (!todo) throw new Error('找不到这条待办。')
        deps.removeTodo(id)
        return { ok: true, text: `已删除待办：${todo.text}` }
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
        const count = deps.clearDoneTodos()
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
        deps.addTodoList(name)
        return { ok: true, text: `已新建清单：${name}` }
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
        const state = deps.focusControl(action)
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
        const { count, goal } = deps.waterDrink()
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
        deps.waterSnooze(minutes)
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
        deps.breakSnooze(kind, minutes)
        return {
          ok: true,
          text: `${kind === 'eyes' ? '护眼' : '久坐'}提醒已延后 ${minutes} 分钟。`,
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
        if (!deps.clipboard().entries.some((entry) => entry.id === id))
          throw new Error('剪贴板里没有这条记录。')
        await deps.clipboardCopy(id)
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
        if (!deps.clipboard().entries.some((entry) => entry.id === id))
          throw new Error('剪贴板里没有这条记录。')
        deps.clipboardPin(id, pinned)
        return {
          ok: true,
          text: pinned ? '已固定该记录。' : '已取消固定。',
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
        if (!ctx.workspace)
          throw new Error('请先选择 shell 工作区，再执行命令。')
        const timeout = (numberArg(args.timeoutSeconds, 1, 120) ?? 30) * 1000
        return runShell(command, ctx.workspace, timeout, ctx.signal)
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
        deps.openPanel(panel as AgentPanelTarget)
        return { ok: true, text: `已打开面板：${panel}` }
      },
    },
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
