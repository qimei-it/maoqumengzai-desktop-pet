/** Agent loop: streaming, tool calls, approvals, cancellation and sessions. */

import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import type {
  AgentApproval,
  AgentApprovalMode,
  AgentArtifactKind,
  AgentArtifactView,
  AgentAttachmentInput,
  AgentAttachmentView,
  AgentMediaGeneration,
  AgentMediaPart,
  AgentMediaView,
  AgentMessageView,
  AgentMode,
  AgentPetProfile,
  AgentReasoning,
  AgentReasoningPart,
  AgentState,
  AgentTextPart,
  AgentToolPart,
  AgentToolPolicy,
} from '../../shared/agent'
import { maxAgentNameChars } from '../../shared/agent'
import { searchWeb } from '../../shared/deepseek'
import type { AgentModelId } from '../../shared/agent-models'
import { isMiniMaxModel } from '../../shared/agent-models'
import type { GenerationParams } from '../../shared/generation'
import { defaultGenerationParams, normalizeGenerationParams } from '../../shared/generation'
import { mediaUrl } from '../../shared/media'
import {
  generationKindForModel,
  runMiniMaxGeneration,
  type GenerationReference,
} from './generation'
import { registerMediaPath } from './media-registry'
import { generationOutputDir } from './output-path'
import { streamMiniMaxChat } from './minimax-provider'
import { rewriteMiniMaxSpeechScript } from './minimax-api'
import type { SettingsState } from '../../shared/settings'
import {
  loadAgentStore,
  maxAgentProjects,
  maxHistoryEntries,
  maxSessionMessages,
  maxAgentSessions,
  saveAgentStore,
  type StoredFileRef,
  type StoredProject,
  type StoredSession,
  type StoredSource,
} from './store'
import {
  streamChat,
  type ProviderContentBlock,
  type ProviderMessage,
  type ProviderUserContent,
  type StreamResult,
} from './provider'
import {
  deleteAgentFile,
  transcribeAgentAudio,
  uploadAgentFile,
  type AgentFilePurpose,
} from './files'
import { readWebPage } from './web'
import { cleanSessionTitle, generateSessionTitle, nameLength } from './title'
import {
  createTools,
  permissionFor,
  safeTitle,
  toolDefinition,
  type AgentTool,
} from './tools'
import { formatSkillScan } from './skill-scanner'
import type { SkillAdmin } from './skill-admin'
import type { Services } from '../services/contracts'

export type AgentFilesClient = {
  upload(
    apiKey: string,
    path: string,
    purpose: AgentFilePurpose,
    signal: AbortSignal,
  ): Promise<{ id: string; expiresAt: number | null }>
  transcribe(
    apiKey: string,
    path: string,
    signal: AbortSignal,
  ): Promise<string>
  /** Removes an uploaded file from the remote account. */
  remove?(apiKey: string, id: string): Promise<void>
}

export type AgentSkillPrompt = {
  name: string
  description: string
  category?: string
  requires?: string
  content: string
  files?: string[]
}

export type AgentRuntimeDeps = {
  services: Services
  storePath: string
  /** Legacy folder for generated images, videos and audio. */
  generationDir?: string
  /** Root used for generated outputs, normally the attachment directory. */
  getAttachmentDir?(): string
  getKey(): string | undefined
  getSettings(): SettingsState
  getPetProfile(): AgentPetProfile
  broadcast(): void
  /** Injectable for tests; production uses the real streaming client. */
  stream?: typeof streamChat
  /** Title generation client; omitted in tests to keep scripted streams intact. */
  titleStream?: typeof streamChat
  /** MiniMax text streaming; injectable for tests. */
  minimaxStream?: typeof streamMiniMaxChat
  getMiniMaxKey?(): string | undefined
  /** Injectable for tests; production uses the DeepSeek Files/ASR APIs. */
  files?: AgentFilesClient
  /** Enabled skills exposed to the model as a catalog plus a loader tool. */
  loadSkills?(): Promise<AgentSkillPrompt[]>
  /** Reads one text file inside an enabled skill directory. */
  readSkillFile?(name: string, path: string): Promise<string>
  /** Lists text files inside an enabled skill directory. */
  listSkillFiles?(name: string): Promise<string[]>
  /** Skill administration used by the install/enable/uninstall tools. */
  getSkillAdmin?(): SkillAdmin | undefined
  /** Directory for recoverable file-edit backups. */
  backupRoot?: string
}

export type AgentRuntime = {
  load(): Promise<void>
  state(): AgentState
  send(
    prompt: string,
    attachments?: AgentAttachmentInput[],
    generation?: GenerationParams,
    skills?: string[],
  ): Promise<void>
  /** Continues the last turn after an error, stop or tool-step limit. */
  retry(): Promise<void>
  /** Re-runs the last turn from its user message. */
  regenerate(): Promise<void>
  /** Replaces a user message and resends it, dropping later turns. */
  editMessage(id: string, prompt: string): Promise<void>
  cancel(): void
  approve(id: string): void
  approveSame(id: string): void
  deny(id: string): void
  newSession(): void
  newSessionIn(projectId: string): void
  createProject(name: string, workspace: string): void
  updateProject(
    id: string,
    patch: { name?: string; workspace?: string },
  ): void
  deleteProject(id: string): void
  setProjectPinned(id: string, pinned: boolean): void
  setProjectToolPolicy(id: string, policy: AgentToolPolicy): void
  renameSession(id: string, title: string): void
  setSessionPinned(id: string, pinned: boolean): void
  setSessionArchived(id: string, archived: boolean): void
  clearSession(id: string): void
  moveSession(id: string, projectId: string | null): void
  select(id: string): void
  remove(id: string): void
  setMode(mode: AgentMode): void
  setApprovalMode(mode: AgentApprovalMode): void
  setModel(model: AgentModelId): void
  setReasoning(reasoning: AgentReasoning): void
  setWorkspace(projectId: string | null): void
  /** Resolve a saved attachment or artifact source for download. */
  source(id: string): { name: string; path: string } | null
  /** Serialize one session as Markdown for export. */
  sessionMarkdown(id: string): { title: string; text: string } | null
  flush(): Promise<void>
}

const maxSteps = 12
const maxShellHistory = 60
/** Kept behind the approval card even in 自动审批; 完全访问 skips all of them. */
const alwaysConfirmTools = new Set([
  'shell_run',
  'workspace_set',
  'skill_install_local',
  'skill_install_url',
  'skill_remove',
  'mail_send',
  'mail_delete',
])
const paidTools = new Set([
  'image_generate',
  'video_generate',
  'speech_generate',
])
function toolNumber(
  value: unknown,
  min: number,
  max: number,
  label: string,
  fallback: number,
): number {
  if (value === undefined || value === null || value === '') return fallback
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${label}必须是 ${min} 到 ${max} 之间的数字。`)
  return value
}

function toolChoice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  fallback: T,
): T {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw new Error(`${label}只支持：${allowed.join('、')}。`)
  return value as T
}

const maxHistoryChars = 96_000
const maxSummaryChars = 6_000

function now(): number {
  return Date.now()
}

function newSession(
  model: AgentModelId,
  projectId: string | null = null,
  workspace: string | null = null,
): StoredSession {
  const stamp = now()
  return {
    id: randomUUID(),
    title: '新会话',
    mode: 'build',
    approvalMode: 'ask',
    model,
    reasoning: 'high',
    workspace,
    projectId,
    pinned: false,
    createdAt: stamp,
    updatedAt: stamp,
    ui: [],
    history: [],
    files: [],
    sources: [],
    usage: { input: 0, output: 0 },
  }
}

function sessionTitle(prompt: string): string {
  return cleanSessionTitle(prompt) || '新会话'
}

function appendUserText(
  content: ProviderUserContent,
  text: string,
): ProviderUserContent {
  if (typeof content === 'string') return `${content}\n\n${text}`
  return [...content, { type: 'text', text }]
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n（已截断）`
}

function pushUi(
  session: StoredSession,
  message: AgentMessageView,
): void {
  session.ui.push(message)
  if (session.ui.length > maxSessionMessages)
    session.ui.splice(0, session.ui.length - maxSessionMessages)
}

function pushHistory(
  session: StoredSession,
  message: ProviderMessage,
): void {
  session.history.push(message)
  if (session.history.length > maxHistoryEntries)
    session.history.splice(0, session.history.length - maxHistoryEntries)
}

function ensureStoppedText(session: StoredSession): void {
  const last = session.ui.at(-1)
  if (last?.role === 'assistant') {
    const text = last.parts
      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join('')
    if (text.includes('已停止。')) return
    last.parts.push({ type: 'text', text: '已停止。' })
    return
  }
  pushUi(session, {
    id: randomUUID(),
    role: 'assistant',
    parts: [{ type: 'text', text: '已停止。' }],
  })
}

function trimContent(
  content: ProviderUserContent,
  limit: number,
): ProviderUserContent {
  if (typeof content === 'string') return truncate(content, limit)
  return content.map((block) =>
    block.type === 'text'
      ? { ...block, text: truncate(block.text, limit) }
      : block,
  )
}

type CompactedHistory = {
  messages: ProviderMessage[]
  summary: string
  summarized: number
}

function providerSize(message: ProviderMessage): number {
  if (message.role === 'user') {
    if (typeof message.content === 'string') return message.content.length
    return message.content.reduce(
      (sum, block) => sum + (block.type === 'text' ? block.text.length : 0),
      0,
    )
  }
  if (message.role === 'assistant')
    return (
      (message.content?.length ?? 0) +
      (message.tool_calls?.reduce(
        (sum, call) => sum + call.function.arguments.length,
        0,
      ) ?? 0)
    )
  return message.content.length
}

function summaryLine(message: ProviderMessage): string | null {
  if (message.role === 'user') {
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .map((block) =>
              block.type === 'text' ? block.text : '[附件]',
            )
            .join(' ')
    const value = text.replace(/\s+/g, ' ').trim()
    return value ? `用户：${truncate(value, 500)}` : null
  }
  if (message.role === 'assistant') {
    const value = (message.content ?? '').replace(/\s+/g, ' ').trim()
    const calls = message.tool_calls?.length
      ? `（调用 ${message.tool_calls
          .map((call) => call.function.name)
          .join('、')}）`
      : ''
    const line = `${value ? truncate(value, 400) : '已执行工具'}${calls}`
    return `助手：${line}`
  }
  const value = message.content.replace(/\s+/g, ' ').trim()
  return value ? `工具结果：${truncate(value, 200)}` : null
}

function summarizeOlder(messages: ProviderMessage[]): string {
  const lines: string[] = []
  let chars = 0
  let omitted = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const line = summaryLine(messages[index])
    if (!line) continue
    if (chars + line.length > maxSummaryChars) {
      omitted += 1
      continue
    }
    lines.unshift(line)
    chars += line.length
  }
  if (!lines.length) return ''
  if (omitted)
    lines.unshift(`（更早的 ${omitted} 条消息未写入摘要）`)
  return lines.join('\n')
}

/** Caps the request context and folds older turns into a compact summary. */
function compactHistory(
  history: ProviderMessage[],
  model: AgentModelId,
): CompactedHistory {
  let chars = 0
  let boundary = history.length
  while (boundary > 0) {
    const kept = history.length - boundary
    if (kept >= maxShellHistory) break
    const size = providerSize(history[boundary - 1])
    if (kept > 0 && chars + size > maxHistoryChars) break
    chars += size
    boundary -= 1
  }
  const latestUser = history.findLastIndex((message) => message.role === 'user')
  if (latestUser > 0 && boundary > latestUser) boundary = latestUser
  if (boundary === 0)
    return { messages: trimHistory(history, model), summary: '', summarized: 0 }
  const older = history.slice(0, boundary)
  const recent = history.slice(boundary)
  let leadingTools = 0
  while (recent[leadingTools]?.role === 'tool') leadingTools += 1
  return {
    messages: trimHistory(recent, model),
    summary: summarizeOlder(older),
    summarized: older.length + leadingTools,
  }
}

/** Keeps recent context and never starts on an orphan tool result. */
function trimHistory(
  history: ProviderMessage[],
  model: AgentModelId,
): ProviderMessage[] {
  const recent = history.slice(-maxShellHistory)
  while (recent.length && recent[0].role === 'tool') recent.shift()
  return recent.map((message) => {
    if (message.role === 'assistant') {
      return {
        ...message,
        content: message.content ? truncate(message.content, 8000) : null,
      }
    }
    if (message.role === 'tool')
      return { ...message, content: truncate(message.content, 8000) }
    if (message.role === 'user') {
      let content = message.content
      if (model === 'deepseek-v4-pro' && Array.isArray(content)) {
        content = content.map((block) =>
          block.type === 'file'
            ? {
                type: 'text' as const,
                text: '[当前模型无法读取之前上传的图片或文档附件]',
              }
            : block,
        )
      }
      return { role: 'user', content: trimContent(content, 40_000) }
    }
    return message
  })
}

function systemPrompt(
  mode: AgentMode,
  workspace: string | null,
  pet: AgentPetProfile,
  skills: AgentSkillPrompt[] = [],
): string {
  return [
    '你是“毛趣萌仔”桌面宠物里的个人助理智能体。默认使用中文，回答简洁直接。',
    '你可以调用工具处理待办、置物架文件、邮件、音乐、设置、应用面板、联网搜索、shell 与技能管理。',
    '工具调用会直接改到真实应用状态；不要声称完成了没有调用工具的事情。',
    '工具失败时如实说明原因，不要编造结果。',
    '用户给出本地路径要求安装技能时，直接用 skill_install_local，不要先用 shell 查看目录。',
    '任务明显需要某个未启用的技能时，先用 skill_list 搜索；找到后调用 skill_set_enabled 启用（会请求批准），不要直接放弃。',
    '技能标注需要外部依赖时，先说明缺什么；用户批准后可以帮忙安装或配置，再启用技能。',
    '需要 shell 或工作区文件工具但还没有工作区时，先调用 workspace_set 申请绑定目录；不要直接运行 shell_run。',
    mode === 'plan'
      ? '当前是计划模式：只允许只读工具。需要修改时，说明打算怎么做，让用户切换到执行模式。'
      : '当前是执行模式：写操作会请求用户确认，被拒绝时不要重复尝试同一条操作。',
    `当前时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    workspace ? `Shell 工作区：${workspace}` : 'Shell 工作区：尚未选择',
    '',
    '# 当前桌宠（只影响表达方式）',
    `名字：${pet.name}`,
    ...(pet.species ? [`种类：${pet.species}`] : []),
    ...(pet.personality ? [`性格：${pet.personality}`] : []),
    '回复时可以带一点这个角色的口吻，也可以用它自称。',
    '以上只影响称呼、语气和情绪表达；不得改变任务判断、工具选择、操作安全规则和事实陈述。',
    '执行用户交代的工作时，始终以上面的助理规则和模型自身的判断为准。',
    ...(skills.length
      ? [
          '',
          '# 已启用技能',
          skills.length > 60
            ? `当前启用了 ${skills.length} 个技能。先用 skill_search 检索相关技能，再用 skill_load 读取完整说明。`
            : '需要按某个技能执行时，先调用 skill_load 读取完整说明，再照做。',
          ...(skills.length > 60
            ? []
            : skills.map(
                (skill) =>
                  `- ${skill.name}${skill.requires ? `（需配置：${skill.requires}）` : ''}：${(skill.description || '无描述').slice(0, 160)}`,
              )),
        ]
      : []),
  ].join('\n')
}

function projectNameValue(name: string, workspace: string): string {
  const value = name.trim()
  if (value) {
    if (nameLength(value) > maxAgentNameChars)
      throw new Error(`项目名称最多 ${maxAgentNameChars} 个字符。`)
    return value
  }
  const fallback = basename(workspace) || '项目'
  return Array.from(fallback).slice(0, maxAgentNameChars).join('')
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function artifactKind(name: string): AgentArtifactKind {
  const extension = name.includes('.')
    ? name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    : ''
  if (
    ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'aiff'].includes(
      extension,
    )
  )
    return 'audio'
  if (
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'heic'].includes(
      extension,
    )
  )
    return 'image'
  if (
    ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(extension)
  )
    return 'archive'
  if (
    [
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'md',
      'markdown',
      'txt',
      'csv',
      'html',
      'htm',
      'epub',
      'ofd',
      'json',
    ].includes(extension)
  )
    return 'document'
  return 'other'
}

export function createAgentRuntime(deps: AgentRuntimeDeps): AgentRuntime {
  const stream = deps.stream ?? streamChat
  const minimaxStream = deps.minimaxStream ?? streamMiniMaxChat
  const files: AgentFilesClient = deps.files ?? {
    upload: (apiKey, path, purpose, signal) =>
      uploadAgentFile(apiKey, path, purpose, { signal }),
    transcribe: (apiKey, path, signal) =>
      transcribeAgentAudio(apiKey, path, { signal }),
    remove: (apiKey, id) => deleteAgentFile(apiKey, id),
  }
  const tools = createTools(deps.services, {
    search: (query, count) => {
      const key = deps.getKey()
      if (!key) throw new Error('请先在设置中配置 DeepSeek API Key。')
      return searchWeb(key, query, { count })
    },
    read: (url) => readWebPage(url),
  })
  const skillTool: AgentTool = {
    name: 'skill_load',
    description:
      '读取已启用技能的完整说明。需要遵循某个技能时先调用它，再按说明执行。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能名称' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    plan: 'allow',
    build: 'allow',
    title: (args) => `读取技能 ${String(args.name ?? '')}`.slice(0, 80),
    async run(args) {
      const name = String(args.name ?? '').trim()
      if (!name) return { ok: false, text: '缺少技能名称。' }
      const skills = await (deps.loadSkills?.() ?? Promise.resolve([]))
      const match =
        skills.find((skill) => skill.name === name) ??
        skills.find(
          (skill) => skill.name.toLowerCase() === name.toLowerCase(),
        )
      if (!match)
        return {
          ok: false,
          text: `没有找到技能“${name}”。先查看系统提示里已启用的技能列表。`,
        }
      const files = deps.listSkillFiles
        ? await deps.listSkillFiles(match.name).catch(() => [])
        : (match.files ?? [])
      const listing = files.length
        ? `\n\n技能目录文件（可用 skill_read 读取）：\n${files
            .slice(0, 60)
            .join('\n')}${files.length > 60 ? '\n…' : ''}`
        : ''
      return {
        ok: true,
        text: `${truncate(match.content, 20_000)}${listing}`.slice(0, 24_000),
      }
    },
  }
  const skillSearchTool: AgentTool = {
    name: 'skill_search',
    description: '按关键词搜索已启用技能，返回名称和用途，再用 skill_load 读取。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    plan: 'allow',
    build: 'allow',
    title: (args) => `搜索技能 ${String(args.query ?? '')}`.slice(0, 80),
    async run(args) {
      const query = String(args.query ?? '').trim().toLowerCase()
      if (!query) return { ok: false, text: '缺少搜索关键词。' }
      const skills = await (deps.loadSkills?.() ?? Promise.resolve([]))
      const matches = skills.filter((skill) =>
        `${skill.name}\n${skill.description}\n${skill.content}`
          .toLowerCase()
          .includes(query),
      )
      if (!matches.length)
        return { ok: true, text: `没有找到与“${query}”相关的技能。` }
      return {
        ok: true,
        text: matches
          .slice(0, 12)
          .map(
            (skill) =>
              `- ${skill.name}：${(skill.description || '无描述').slice(0, 160)}`,
          )
          .join('\n'),
      }
    },
  }
  const skillReadTool: AgentTool = {
    name: 'skill_read',
    description: '读取技能目录里的参考文件或脚本内容。先使用 skill_load 查看文件列表。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能名称' },
        path: { type: 'string', description: '技能目录内的相对文件路径' },
      },
      required: ['name', 'path'],
      additionalProperties: false,
    },
    plan: 'allow',
    build: 'allow',
    title: (args) => `读取技能文件 ${String(args.path ?? '')}`.slice(0, 80),
    async run(args) {
      if (!deps.readSkillFile)
        return { ok: false, text: '当前没有可读取的技能文件。' }
      const name = String(args.name ?? '').trim()
      const path = String(args.path ?? '').trim()
      if (!name || !path) return { ok: false, text: '缺少技能名称或文件路径。' }
      const content = await deps.readSkillFile(name, path)
      return { ok: true, text: truncate(content, 30_000) }
    },
  }
  const skillListTool: AgentTool = {
    name: 'skill_list',
    description:
      '列出技能库：名称、类目、启用状态、是否内置。管理技能前先用它确认目标。',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['all', 'enabled', 'disabled', 'user', 'builtin'],
          description: '筛选范围，默认 all',
        },
        category: { type: 'string', description: '按类目筛选' },
        query: { type: 'string', description: '按名称或描述搜索' },
      },
      additionalProperties: false,
    },
    plan: 'allow',
    build: 'allow',
    title: (args) =>
      `列出技能 ${String(args.category ?? args.query ?? args.scope ?? '')}`.trim().slice(0, 80),
    async run(args) {
      const admin = deps.getSkillAdmin?.()
      if (!admin) return { ok: false, text: '技能库尚未就绪。' }
      const scope = ['all', 'enabled', 'disabled', 'user', 'builtin'].includes(
        String(args.scope ?? ''),
      )
        ? String(args.scope)
        : 'all'
      const category = String(args.category ?? '').trim().toLowerCase()
      const query = String(args.query ?? '').trim().toLowerCase()
      const all = admin.list()
      const categoryCounts = new Map<string, { total: number; enabled: number }>()
      for (const skill of all) {
        const item = categoryCounts.get(skill.category) ?? {
          total: 0,
          enabled: 0,
        }
        item.total += 1
        if (skill.enabled) item.enabled += 1
        categoryCounts.set(skill.category, item)
      }
      const matches = all.filter((skill) => {
        if (scope === 'enabled' && !skill.enabled) return false
        if (scope === 'disabled' && skill.enabled) return false
        if (scope === 'user' && skill.builtin) return false
        if (scope === 'builtin' && !skill.builtin) return false
        if (category && !skill.category.toLowerCase().includes(category))
          return false
        if (
          query &&
          !`${skill.id}\n${skill.name}\n${skill.description}`
            .toLowerCase()
            .includes(query)
        )
          return false
        return true
      })
      matches.sort(
        (left, right) =>
          Number(left.builtin) - Number(right.builtin) ||
          Number(right.enabled) - Number(left.enabled) ||
          left.name.localeCompare(right.name, 'zh-CN'),
      )
      const lines = [
        `共 ${all.length} 个技能：已启用 ${
          all.filter((skill) => skill.enabled).length
        }，用户添加 ${all.filter((skill) => !skill.builtin).length}。`,
        [...categoryCounts.entries()]
          .map(
            ([name, item]) =>
              `${name} ${item.total}（启用 ${item.enabled}）`,
          )
          .join('、'),
        `本次筛选 ${matches.length} 个。`,
      ]
      const shown = matches.slice(0, 60)
      if (shown.length)
        lines.push(
          ...shown.map(
            (skill) =>
              `- ${skill.id}｜${skill.name}（${skill.category}，${
                skill.enabled ? '已启用' : '未启用'
              }，${skill.builtin ? '内置' : '用户添加'}）：${(
                skill.description || '无描述'
              ).slice(0, 120)}`,
          ),
        )
      if (matches.length > shown.length)
        lines.push(`其余 ${matches.length - shown.length} 个未显示，请缩小范围。`)
      return { ok: true, text: lines.join('\n') }
    },
  }
  const skillScanTool: AgentTool = {
    name: 'skill_scan',
    description:
      '用内置 skill-scanner 扫描一个技能，返回安全状态和风险项。安装或启用前可用它复查。',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '技能名称或 ID' },
      },
      required: ['target'],
      additionalProperties: false,
    },
    plan: 'allow',
    build: 'allow',
    title: (args) => `扫描技能 ${String(args.target ?? '')}`.slice(0, 80),
    async run(args) {
      const admin = deps.getSkillAdmin?.()
      if (!admin) return { ok: false, text: '技能库尚未就绪。' }
      const target = String(args.target ?? '').trim()
      if (!target) return { ok: false, text: '缺少技能名称或 ID。' }
      const scan = await admin.scan(target)
      return { ok: scan.status !== 'blocked', text: formatSkillScan(scan) }
    },
  }
  const skillToggleTool: AgentTool = {
    name: 'skill_set_enabled',
    description:
      '启用或禁用一个技能。启用用户添加的技能前会自动安全检查，未通过的技能不能启用。',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '技能名称或 ID' },
        enabled: { type: 'boolean', description: 'true 为启用，false 为禁用' },
      },
      required: ['target', 'enabled'],
      additionalProperties: false,
    },
    plan: 'deny',
    build: 'ask',
    title: (args) =>
      `${args.enabled === false ? '禁用' : '启用'}技能 ${String(
        args.target ?? '',
      )}`.slice(0, 80),
    async run(args) {
      const admin = deps.getSkillAdmin?.()
      if (!admin) return { ok: false, text: '技能库尚未就绪。' }
      const target = String(args.target ?? '').trim()
      if (!target) return { ok: false, text: '缺少技能名称或 ID。' }
      if (typeof args.enabled !== 'boolean')
        return { ok: false, text: '缺少 enabled 参数。' }
      const skill = await admin.setEnabled(target, args.enabled)
      return {
        ok: true,
        text: `${skill.enabled ? '已启用' : '已禁用'}技能“${skill.name}”。`,
      }
    },
  }
  const skillInstallTool = (
    name: string,
    source: 'local' | 'url',
  ): AgentTool => ({
    name,
    description:
      source === 'local'
        ? '从本地目录、SKILL.md 或压缩包安装技能，安装后自动安全检查。'
        : '从 https 链接安装技能，支持 SKILL.md、压缩包和 GitHub 仓库/tree 链接，安装后自动安全检查。',
    parameters: {
      type: 'object',
      properties: {
        [source === 'local' ? 'path' : 'url']: {
          type: 'string',
          description: source === 'local' ? '本地绝对路径' : 'https 链接',
        },
      },
      required: [source === 'local' ? 'path' : 'url'],
      additionalProperties: false,
    },
    plan: 'deny',
    build: 'ask',
    title: (args) =>
      `${source === 'local' ? '从本地安装' : '从链接安装'}技能 ${String(
        args[source === 'local' ? 'path' : 'url'] ?? '',
      )}`.slice(0, 80),
    async run(args) {
      const admin = deps.getSkillAdmin?.()
      if (!admin) return { ok: false, text: '技能库尚未就绪。' }
      const value = String(args[source === 'local' ? 'path' : 'url'] ?? '').trim()
      if (!value)
        return {
          ok: false,
          text: source === 'local' ? '缺少本地路径。' : '缺少链接。',
        }
      const result =
        source === 'local'
          ? await admin.installLocal(value)
          : await admin.installUrl(value)
      if (!result.installed.length)
        return { ok: false, text: '没有找到可安装的技能。' }
      const lines = [`已安装 ${result.installed.length} 个技能。`]
      for (const item of result.scans) {
        const blocked =
          item.scan.status === 'blocked'
            ? '，安全检查未通过，已保持禁用'
            : ''
        lines.push(
          `- ${item.skill.name}（${item.skill.id}${
            item.skill.enabled ? '，已启用' : '，未启用'
          }）${blocked}：${item.scan.summary}`,
        )
      }
      return { ok: true, text: lines.join('\n') }
    },
  })
  const skillInstallLocalTool = skillInstallTool(
    'skill_install_local',
    'local',
  )
  const skillInstallUrlTool = skillInstallTool('skill_install_url', 'url')
  const skillRemoveTool: AgentTool = {
    name: 'skill_remove',
    description: '卸载用户添加的技能。内置技能不能卸载，只能禁用。',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '技能名称或 ID' },
      },
      required: ['target'],
      additionalProperties: false,
    },
    plan: 'deny',
    build: 'ask',
    title: (args) => `卸载技能 ${String(args.target ?? '')}`.slice(0, 80),
    async run(args) {
      const admin = deps.getSkillAdmin?.()
      if (!admin) return { ok: false, text: '技能库尚未就绪。' }
      const target = String(args.target ?? '').trim()
      if (!target) return { ok: false, text: '缺少技能名称或 ID。' }
      let skill
      try {
        skill = admin.find(target)
      } catch {
        return {
          ok: true,
          text: `技能“${target}”已经不在技能库中，无需卸载。`,
        }
      }
      if (skill.builtin)
        return { ok: false, text: '内置技能不能卸载，可以改为禁用。' }
      await admin.remove(skill.id)
      return { ok: true, text: `已卸载技能“${skill.name}”。` }
    },
  }
  const workspaceSetTool: AgentTool = {
    name: 'workspace_set',
    description:
      '把当前会话的工作区绑定到一个本地目录。绑定后 Shell 与工作区文件工具都使用它；需要用户确认。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '本地目录的绝对路径' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    plan: 'deny',
    build: 'ask',
    title: (args) => `绑定工作区 ${String(args.path ?? '')}`.slice(0, 80),
    async run(args, ctx) {
      const value = String(args.path ?? '').trim()
      if (!value) return { ok: false, text: '缺少目录路径。' }
      if (!isAbsolute(value))
        return { ok: false, text: '请提供绝对目录路径。' }
      const real = await realpath(value).catch(() => null)
      if (!real) return { ok: false, text: '目录不存在。' }
      const info = await stat(real).catch(() => null)
      if (!info?.isDirectory())
        return { ok: false, text: '这个路径不是目录。' }
      ctx.bindWorkspace?.(real)
      return { ok: true, text: `已绑定工作区：${real}` }
    },
  }
  const imageGenerateTool: AgentTool = {
    name: 'image_generate',
    description:
      '根据用户要求生成图片。直接调用本工具，不要交给 subagent_run。当前用户消息里的图片附件会自动作为参考图，无需传路径。每次调用都需要用户确认并消耗额度。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '图片内容描述' },
        count: { type: 'number', description: '生成数量 1-10，默认 1' },
        area: {
          type: 'string',
          enum: ['1K', '2K', '4K'],
          description: '输出面积档，默认 2K',
        },
        ratio: {
          type: 'string',
          enum: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
          description: '画面比例，默认 auto',
        },
        format: {
          type: 'string',
          enum: ['jpeg', 'png', 'webp'],
          description: '输出格式，默认 jpeg',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    plan: 'deny',
    build: 'ask',
    title: (args) => `生成图像：${String(args.prompt ?? '').slice(0, 40)}`,
    async run(args, ctx) {
      const session = activeSession()
      if (!session) return { ok: false, text: '当前没有活动会话。' }
      const key = deps.getMiniMaxKey?.()
      if (!key) return { ok: false, text: '请先在设置中配置 MiniMax API Key。' }
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
      if (!prompt) return { ok: false, text: '缺少参数 prompt。' }
      const references = (ctx.references ?? []).filter(
        (item) => item.kind === 'image',
      )
      if ((ctx.references ?? []).some((item) => item.kind !== 'image'))
        return {
          ok: false,
          text: '图像生成工具只接受图片参考，请移除视频或音频附件。',
        }
      const params = normalizeGenerationParams({
        image: {
          count: toolNumber(args.count, 1, 10, '生成数量', 1),
          area: toolChoice(args.area, ['1K', '2K', '4K'], '输出尺寸', '2K'),
          ratio: toolChoice(
            args.ratio,
            ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
            '画面比例',
            'auto',
          ),
          format: toolChoice(
            args.format,
            ['jpeg', 'png', 'webp'],
            '输出格式',
            'jpeg',
          ),
        },
      })
      const outcome = await runMiniMaxGeneration({
        apiKey: key,
        model: 'MiniMax-H3-Image',
        prompt,
        params,
        references,
        outputDir: generationDirectory(session.id),
        signal: ctx.signal,
        onProgress: (text) => ctx.onProgress?.(text),
      })
      return {
        ok: true,
        text: `已生成 ${outcome.items.length} 张图片。${outcome.warnings.join('；')}`.trim(),
        media: outcome.items,
      }
    },
  }
  const videoGenerateTool: AgentTool = {
    name: 'video_generate',
    description:
      '根据用户要求生成视频。直接调用本工具，不要交给 subagent_run。当前用户消息里的图片、视频、音频附件会自动作为参考素材，无需传路径。当前模型 MiniMax-H3 支持 768P/2K、4-15 秒。每次调用都需要用户确认并消耗额度。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '视频内容和镜头描述' },
        resolution: {
          type: 'string',
          enum: ['768P', '2K'],
          description: '清晰度，默认 768P',
        },
        duration: {
          type: 'number',
          description: '时长秒数 4-15，默认 5',
        },
        ratio: {
          type: 'string',
          enum: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
          description: '画面比例，默认 16:9',
        },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    plan: 'deny',
    build: 'ask',
    title: (args) => `生成视频：${String(args.prompt ?? '').slice(0, 40)}`,
    async run(args, ctx) {
      const session = activeSession()
      if (!session) return { ok: false, text: '当前没有活动会话。' }
      const key = deps.getMiniMaxKey?.()
      if (!key) return { ok: false, text: '请先在设置中配置 MiniMax API Key。' }
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
      if (!prompt) return { ok: false, text: '缺少参数 prompt。' }
      const references = (ctx.references ?? []).filter(
        (item) =>
          item.kind === 'image' ||
          item.kind === 'video' ||
          item.kind === 'audio',
      )
      if ((ctx.references ?? []).some(
        (item) =>
          item.kind !== 'image' &&
          item.kind !== 'video' &&
          item.kind !== 'audio',
      ))
        return {
          ok: false,
          text: '视频生成工具只接受图片、视频或音频参考。',
        }
      const params = normalizeGenerationParams({
        video: {
          resolution: toolChoice(
            args.resolution,
            ['768P', '2K'],
            '清晰度',
            '768P',
          ),
          duration: toolNumber(args.duration, 4, 15, '视频时长', 5),
          ratio: toolChoice(
            args.ratio,
            ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
            '画面比例',
            '16:9',
          ),
        },
      })
      const outcome = await runMiniMaxGeneration({
        apiKey: key,
        model: 'MiniMax-H3',
        prompt,
        params,
        references,
        outputDir: generationDirectory(session.id),
        signal: ctx.signal,
        onProgress: (text) => ctx.onProgress?.(text),
      })
      return {
        ok: true,
        text: `已生成 1 个视频。${outcome.warnings.join('；')}`.trim(),
        media: outcome.items,
      }
    },
  }
  const speechGenerateTool: AgentTool = {
    name: 'speech_generate',
    description:
      '根据文本生成语音音频。直接调用本工具，不要交给 subagent_run。当前消息附件不会作为参考音频。支持 speech-2.8-hd / speech-2.8-turbo。每次调用都需要用户确认并消耗额度。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要朗读的最终文本' },
        voice_id: {
          type: 'string',
          description: '音色 ID，默认 male-qn-qingse',
        },
        speed: { type: 'number', description: '语速 0.5-2，默认 1' },
        emotion: {
          type: 'string',
          enum: ['', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm'],
          description: '情绪，默认自动',
        },
        format: {
          type: 'string',
          enum: ['mp3', 'wav'],
          description: '输出格式，默认 mp3',
        },
        quality: {
          type: 'string',
          enum: ['hd', 'turbo'],
          description: '模型档位，默认 hd',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    plan: 'deny',
    build: 'ask',
    title: (args) => `生成语音：${String(args.text ?? '').slice(0, 40)}`,
    async run(args, ctx) {
      const session = activeSession()
      if (!session) return { ok: false, text: '当前没有活动会话。' }
      const key = deps.getMiniMaxKey?.()
      if (!key) return { ok: false, text: '请先在设置中配置 MiniMax API Key。' }
      const text = typeof args.text === 'string' ? args.text.trim() : ''
      if (!text) return { ok: false, text: '缺少参数 text。' }
      if (ctx.references?.length)
        return { ok: false, text: '语音生成工具不接受参考附件。' }
      const params = normalizeGenerationParams({
        speech: {
          voiceId: args.voice_id,
          speed: toolNumber(args.speed, 0.5, 2, '语速', 1),
          emotion: toolChoice(
            args.emotion,
            ['', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm'],
            '情绪',
            '',
          ),
          format: toolChoice(args.format, ['mp3', 'wav'], '输出格式', 'mp3'),
        },
      })
      const quality = toolChoice(args.quality, ['hd', 'turbo'], '语音档位', 'hd')
      const outcome = await runMiniMaxGeneration({
        apiKey: key,
        model: quality === 'turbo' ? 'speech-2.8-turbo' : 'speech-2.8-hd',
        prompt: text,
        params,
        references: [],
        outputDir: generationDirectory(session.id),
        signal: ctx.signal,
        onProgress: (progress) => ctx.onProgress?.(progress),
      })
      return {
        ok: true,
        text: `已生成 1 个音频。${outcome.warnings.join('；')}`.trim(),
        media: outcome.items,
      }
    },
  }
  const toolList = [
    ...Object.values(tools),
    skillTool,
    skillSearchTool,
    skillReadTool,
    skillListTool,
    skillScanTool,
    skillToggleTool,
    skillInstallLocalTool,
    skillInstallUrlTool,
    skillRemoveTool,
    workspaceSetTool,
    imageGenerateTool,
    videoGenerateTool,
    speechGenerateTool,
  ]
  const subagentNames = new Set([
    'workspace_list',
    'workspace_read',
    'workspace_search',
    'shelf_list',
    'file_read',
    'web_search',
    'read_url',
  ])
  const subagentTools = toolList.filter((tool) =>
    subagentNames.has(tool.name),
  )
  const subagentMap = Object.fromEntries(
    subagentTools.map((tool) => [tool.name, tool]),
  )
  const subagentDefinitions = subagentTools.map(toolDefinition)
  const subagentTool: AgentTool = {
    name: 'subagent_run',
    description:
      '派一个只读子 Agent 调查代码或资料，返回结论和关键文件位置。子 Agent 不会修改文件。',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '交给子 Agent 的调查任务' },
      },
      required: ['task'],
      additionalProperties: false,
    },
    plan: 'allow',
    build: 'allow',
    title: (args) =>
      `子 Agent：${String(args.task ?? '')}`.slice(0, 80),
    async run(args, ctx) {
      const task = String(args.task ?? '').trim().slice(0, 1_000)
      if (!task) return { ok: false, text: '缺少子 Agent 任务。' }
      const key = deps.getKey()
      if (!key) return { ok: false, text: '请先配置 DeepSeek API Key。' }
      const messages: ProviderMessage[] = [
        {
          role: 'system',
          content: [
            '你是主智能体派出的只读子 Agent。',
            '只做调查、定位和总结，不修改任何文件。',
            `工作区：${ctx.workspace ?? '未选择'}`,
            '优先使用 workspace_list / workspace_read / workspace_search；需要外部资料时使用 web_search / read_url。',
            '最多 4 步，最后用简洁中文给出结论、关键文件路径和行号。',
          ].join('\n'),
        },
        { role: 'user', content: task },
      ]
      let summary = ''
      const subModel = ctx.model ?? deps.getSettings().aiModel
      const subMiniMax = isMiniMaxModel(subModel)
      const subKey = subMiniMax ? deps.getMiniMaxKey?.() : key
      const subStream = subMiniMax ? minimaxStream : stream
      if (!subKey) return { ok: false, text: '请先配置对应模型的 API Key。' }
      for (let step = 0; step < 4; step += 1) {
        if (ctx.signal.aborted) throw new Error('已停止。')
        ctx.onProgress?.(`第 ${step + 1} 步：分析任务`)
        const result = await subStream(subKey, {
          model: subModel,
          reasoning: ctx.reasoning ?? 'low',
          messages,
          tools: subagentDefinitions,
          signal: ctx.signal,
        })
        if (result.text.trim()) summary = result.text.trim()
        if (!result.toolCalls.length) break
        const calls = result.toolCalls.map((call) => ({
          id: call.id || `sub_${randomUUID()}`,
          name: call.name,
          arguments: call.arguments,
        }))
        messages.push({
          role: 'assistant',
          content: result.text.trim() ? result.text : null,
          ...(result.reasoning
            ? { reasoning_content: result.reasoning }
            : {}),
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: 'function',
            function: {
              name: call.name,
              arguments: call.arguments,
            },
          })),
        })
        for (const call of calls) {
          if (ctx.signal.aborted) throw new Error('已停止。')
          const tool = subagentMap[call.name]
          if (!tool) {
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: `子 Agent 不能使用工具 ${call.name}。`,
            })
            continue
          }
          let parsed: Record<string, unknown> = {}
          try {
            const value = JSON.parse(call.arguments || '{}') as unknown
            if (value && typeof value === 'object' && !Array.isArray(value))
              parsed = value as Record<string, unknown>
          } catch {
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: '工具参数不是有效的 JSON。',
            })
            continue
          }
          ctx.onProgress?.(`第 ${step + 1} 步：${tool.name}`)
          const outcome = await tool.run(parsed, {
            ...ctx,
            onProgress: (text) =>
              ctx.onProgress?.(`第 ${step + 1} 步：${text}`),
          })
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: truncate(outcome.text, 4_000),
          })
        }
      }
      return {
        ok: true,
        text: summary
          ? truncate(summary, 8_000)
          : '子 Agent 没有返回结论。',
      }
    },
  }
  const allTools = [...toolList, subagentTool]
  const toolMap = new Map(allTools.map((tool) => [tool.name, tool]))
  const buildDefinitions = allTools.map(toolDefinition)
  const planDefinitions = allTools
    .filter((tool) => tool.plan === 'allow')
    .map(toolDefinition)
  let sessions: StoredSession[] = []
  let projects: StoredProject[] = []
  const titleTasks = new Set<Promise<void>>()
  let activeId: string | null = null
  let busy = false
  let controller: AbortController | null = null
  let pending: {
    info: AgentApproval
    resolve: (allowed: boolean) => void
  } | null = null
  let errorText: string | undefined
  let loaded = false

  function persist(): void {
    void saveAgentStore(deps.storePath, { sessions, projects }).catch(() => {})
  }

  function rememberSource(
    session: StoredSession,
    source: StoredSource,
  ): void {
    session.sources ??= []
    session.sources = [
      source,
      ...session.sources.filter((item) => item.id !== source.id),
    ].slice(0, 400)
    registerMediaPath(source.id, source.path)
  }

  function activeSession(): StoredSession | undefined {
    return sessions.find((session) => session.id === activeId)
  }

  function removeRemoteFile(key: string, id: string): void {
    void files.remove?.(key, id).catch(() => {})
  }

  function releaseSessionFiles(session: StoredSession): void {
    const key = deps.getKey()
    if (!key || !session.files?.length) return
    const shared = new Set<string>()
    for (const other of sessions)
      if (other.id !== session.id)
        for (const ref of other.files ?? []) shared.add(ref.id)
    for (const ref of session.files)
      if (!shared.has(ref.id)) removeRemoteFile(key, ref.id)
    session.files = []
  }

  async function pruneOrphanFileRefs(): Promise<void> {
    const key = deps.getKey()
    if (!key) return
    const referenced = new Set<string>()
    for (const session of sessions)
      for (const message of session.history)
        if (message.role === 'user' && Array.isArray(message.content))
          for (const block of message.content)
            if (block.type === 'file') referenced.add(block.file_id)
    let changed = false
    for (const session of sessions) {
      const refs = session.files ?? []
      if (!refs.length) continue
      const keep = refs.filter((ref) => referenced.has(ref.id))
      if (keep.length === refs.length) continue
      for (const ref of refs)
        if (!referenced.has(ref.id)) removeRemoteFile(key, ref.id)
      session.files = keep
      changed = true
    }
    if (changed) persist()
  }

  function ensureSession(): StoredSession {
    const current = activeSession()
    if (current) return current
    const session = newSession(deps.getSettings().aiModel)
    sessions.unshift(session)
    activeId = session.id
    if (sessions.length > maxAgentSessions) {
      const evicted = sessions.splice(maxAgentSessions)
      for (const item of evicted) releaseSessionFiles(item)
    }
    return session
  }

  /** Fills in a generated title unless the user renamed the session meanwhile. */
  function scheduleTitle(
    session: StoredSession,
    fallback: string,
    prompt: string,
    key: string,
    signal: AbortSignal,
  ): void {
    const titleStream = deps.titleStream
    if (!titleStream) return
    const task: Promise<void> = generateSessionTitle({
      stream: titleStream,
      key,
      prompt,
      signal,
    })
      .then((title) => {
        if (!title || session.title !== fallback) return
        if (!sessions.includes(session)) return
        session.title = title
        persist()
        emit()
      })
      .catch(() => {})
      .finally(() => {
        titleTasks.delete(task)
      })
    titleTasks.add(task)
  }

  function emit(): void {
    deps.broadcast()
  }

  async function refreshFileRefs(
    session: StoredSession,
    key: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (session.model !== 'deepseek-flash') return
    const refs = session.files ?? []
    if (!refs.length) return
    let changed = false
    for (const message of session.history) {
      if (message.role !== 'user' || !Array.isArray(message.content)) continue
      for (let index = 0; index < message.content.length; index += 1) {
        const block = message.content[index]
        if (block.type !== 'file') continue
        const ref = refs.find((item) => item.id === block.file_id)
        if (!ref) continue
        if (
          ref.expiresAt === null ||
          ref.expiresAt - Date.now() > 60 * 60 * 1000
        )
          continue
        const info = await stat(ref.path).catch(() => null)
        if (!info?.isFile()) {
          message.content[index] = {
            type: 'text',
            text: `[附件 ${ref.name} 的源文件已不在了，无法再次读取]`,
          }
          changed = true
          continue
        }
        try {
          const uploaded = await files.upload(
            key,
            ref.path,
            ref.purpose,
            signal,
          )
          message.content[index] = {
            type: 'file',
            file_id: uploaded.id,
          }
          ref.id = uploaded.id
          ref.expiresAt = uploaded.expiresAt
        } catch {
          const expired = ref.expiresAt !== null && ref.expiresAt <= Date.now()
          message.content[index] = {
            type: 'text',
            text: expired
              ? `[附件 ${ref.name} 已过期，无法再次读取]`
              : `[附件 ${ref.name} 暂时无法读取]`,
          }
        }
        changed = true
      }
    }
    if (changed) {
      session.updatedAt = now()
      persist()
    }
  }

  async function buildUserContent(
    session: StoredSession,
    key: string,
    prompt: string,
    attachments: AgentAttachmentInput[],
    signal: AbortSignal,
  ): Promise<{ content: ProviderUserContent; views: AgentAttachmentView[] }> {
    const views = attachments.map(({ id, name, size }) => ({ id, name, size }))
    const textFiles = attachments.filter((item) => item.text?.trim())
    const uploads = attachments
      .flatMap((item) => (item.upload ?? []).map((file) => ({ item, file })))
      .filter(
        ({ item }) =>
          !(
            session.model === 'deepseek-v4-pro' && item.kind === 'video'
          ),
      )
    const audioFiles = attachments.flatMap((item) =>
      (item.audio ?? []).map((path) => ({ item, path })),
    )
    if (session.model === 'deepseek-v4-pro' && uploads.length)
      throw new Error(
        '当前模型只支持文字附件，请切换到 DeepSeek-V4.1-Flash。',
      )
    for (const item of attachments) delete item.uploadError

    const sections: string[] = [prompt]
    if (textFiles.length) {
      sections.push('以下是用户本次附加的文件内容，仅作为参考：')
      for (const file of textFiles) {
        sections.push(
          [
            `<attachment name="${escapeAttribute(file.name)}">`,
            file.text,
            '</attachment>',
            ...(file.truncated ? ['（文件内容过长，已截断）'] : []),
          ].join('\n'),
        )
      }
    }

    if (isMiniMaxModel(session.model)) {
      for (const item of attachments) delete item.uploadError
      const media = attachments.filter(
        (item) =>
          item.kind === 'image' ||
          item.kind === 'video' ||
          item.kind === 'audio',
      )
      if (media.length) {
        sections.push('用户附加了以下参考素材；调用生成工具时会自动带上这些附件：')
        for (const item of media) {
          const label =
            item.kind === 'image'
              ? '图片'
              : item.kind === 'video'
                ? '视频'
                : '音频'
          sections.push(`- ${label}：${item.name}`)
        }
      }
      return {
        content: sections.join('\n\n').slice(0, 80_000),
        views,
      }
    }

    const blocks: ProviderContentBlock[] = []
    const newRefs: StoredFileRef[] = []
    for (const { item, file } of uploads) {
      if (signal.aborted) throw new Error('已停止。')
      try {
        let fileId = file.fileId
        let expiresAt = file.expiresAt ?? null
        if (
          !fileId ||
          (expiresAt !== null && expiresAt - Date.now() < 60 * 60 * 1000)
        ) {
          const uploaded = await files.upload(
            key,
            file.path,
            file.purpose,
            signal,
          )
          fileId = uploaded.id
          expiresAt = uploaded.expiresAt
          file.fileId = fileId
          file.expiresAt = expiresAt
        }
        blocks.push({ type: 'file', file_id: fileId })
        newRefs.push({
          id: fileId,
          name: item.name,
          path: file.path,
          purpose: file.purpose,
          expiresAt,
        })
      } catch (error) {
        const message = errorMessage(error, '请稍后重试')
        item.uploadError = `上传失败：${message}`
        throw new Error(`附件 ${item.name} 上传失败：${message}`)
      }
    }

    let transcriptChars = 0
    for (const { item, path } of audioFiles) {
      if (signal.aborted) throw new Error('已停止。')
      if (transcriptChars >= 12_000) break
      try {
        const transcript = await files.transcribe(key, path, signal)
        const clipped = transcript.slice(0, 12_000 - transcriptChars)
        if (!clipped) continue
        sections.push(
          `<transcript name="${escapeAttribute(item.name)}">\n${clipped}\n</transcript>`,
        )
        transcriptChars += clipped.length
      } catch (error) {
        const message = errorMessage(error, '请稍后重试')
        item.uploadError = `转写失败：${message}`
        throw new Error(`音频 ${item.name} 转写失败：${message}`)
      }
    }

    if (newRefs.length) {
      session.files ??= []
      session.files.push(...newRefs)
    }
    const text = sections.join('\n\n').slice(0, 80_000)
    return {
      content: blocks.length
        ? [{ type: 'text', text }, ...blocks]
        : text,
      views,
    }
  }

  function requestApproval(
    tool: AgentTool,
    args: Record<string, unknown>,
    argsText: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const info: AgentApproval = {
        id: randomUUID(),
        name: tool.name,
        title: safeTitle(tool, args),
        args: truncate(argsText, 1500),
        reason:
          tool.name === 'shell_run'
            ? '每条命令都需要确认'
            : paidTools.has(tool.name)
              ? '生成媒体会消耗额度，每次都需要确认'
              : '执行模式下的写操作需要确认',
      }
      pending = { info, resolve }
      emit()
    })
  }

  function settleApproval(allowed: boolean): void {
    const current = pending
    pending = null
    current?.resolve(allowed)
    emit()
  }

  async function executeTool(
    session: StoredSession,
    tool: AgentTool,
    args: Record<string, unknown>,
    argsText: string,
    signal: AbortSignal,
    references: GenerationReference[] = [],
    onProgress?: (output: string) => void,
  ): Promise<{
    allowed: boolean
    text: string
    ok: boolean
    artifacts?: { name: string; path: string }[]
    media?: import('./generation').GeneratedMedia[]
  }> {
    let permission = permissionFor(tool, session.mode)
    const project = session.projectId
      ? projects.find((item) => item.id === session.projectId)
      : undefined
    const paid = paidTools.has(tool.name)
    if (permission === 'ask' && !paid && project?.toolPolicy === 'allow')
      permission = 'allow'
    else if (permission === 'ask' && project?.toolPolicy === 'deny')
      permission = 'deny'
    if (
      permission === 'ask' &&
      !paid &&
      (session.approvalMode === 'full' ||
        (session.approvalMode === 'auto' &&
          !alwaysConfirmTools.has(tool.name)))
    )
      permission = 'allow'
    if (permission === 'deny') {
      return {
        allowed: false,
        ok: false,
        text: project?.toolPolicy === 'deny' && tool.build === 'ask'
          ? `项目策略禁止 ${tool.name}。`
          : `工具 ${tool.name} 在当前模式下不可用。`,
      }
    }
    const unrestricted =
      session.approvalMode === 'full' && session.mode === 'build'
    const effectiveWorkspace =
      session.workspace ?? (unrestricted ? homedir() : null)
    if (tool.name === 'shell_run' && !effectiveWorkspace) {
      return {
        allowed: false,
        ok: false,
        text: '还没有绑定工作区，命令未执行。先调用 workspace_set 绑定目录，或让用户在输入框下方选择项目。',
      }
    }
    if (
      permission === 'ask' &&
      (paid || !(session.allowedTools ?? []).includes(tool.name))
    ) {
      const allowed = await requestApproval(tool, args, argsText)
      if (!allowed)
        return {
          allowed: false,
          ok: false,
          text: `用户拒绝了 ${tool.name}。`,
        }
    }
    try {
      const result = await tool.run(args, {
        workspace: effectiveWorkspace,
        signal,
        model: session.model,
        reasoning: session.reasoning,
        ...(deps.backupRoot ? { backupRoot: deps.backupRoot } : {}),
        ...(onProgress ? { onProgress } : {}),
        references,
        bindWorkspace: (path: string) => {
          if (session.projectId)
            throw new Error(
              '当前会话属于项目，请在项目设置里修改工作区。',
            )
          session.workspace = path
          session.updatedAt = now()
          persist()
          emit()
        },
      })
      return {
        allowed: true,
        ok: result.ok,
        text: result.text,
        ...(result.artifacts?.length
          ? { artifacts: result.artifacts }
          : {}),
        ...(result.media?.length ? { media: result.media } : {}),
      }
    } catch (error) {
      return {
        allowed: true,
        ok: false,
        text: error instanceof Error ? error.message : '工具执行失败。',
      }
    }
  }

  async function loop(
    session: StoredSession,
    key: string,
    signal: AbortSignal,
    references: GenerationReference[] = [],
  ): Promise<void> {
    await refreshFileRefs(session, key, signal).catch(() => {})
    const usingMiniMax = isMiniMaxModel(session.model)
    const activeKey = usingMiniMax ? deps.getMiniMaxKey?.() : key
    const activeStream = usingMiniMax ? minimaxStream : stream
    if (!activeKey)
      throw new Error(
        usingMiniMax
          ? '请先在设置中配置 MiniMax API Key。'
          : '请先配置 DeepSeek API Key。',
      )
    const skills = await (deps.loadSkills?.() ?? Promise.resolve([])).catch(
      () => [],
    )
    const pendingMedia: AgentMediaView[] = []
    let pendingMediaGeneration: AgentMediaGeneration | undefined
    const generationCalls = new Set<string>()
    for (let step = 0; step < maxSteps; step += 1) {
      if (signal.aborted) return
      const assistant: AgentMessageView = {
        id: randomUUID(),
        role: 'assistant',
        parts: [],
      }
      pushUi(session, assistant)
      emit()

      let textPart: AgentTextPart | null = null
      let reasoningPart: AgentReasoningPart | null = null
      let result: StreamResult | null = null
      const context = compactHistory(session.history, session.model)
      if (context.summarized) session.compacted = context.summarized
      else delete session.compacted
      try {
        result = await activeStream(activeKey, {
          model: session.model,
          reasoning: session.reasoning,
          messages: [
            {
              role: 'system',
              content: [
                systemPrompt(
                  session.mode,
                  session.workspace,
                  deps.getPetProfile(),
                  skills,
                ),
                ...(context.summary
                  ? [`\n\n本会话较早内容的摘要：\n${context.summary}`]
                  : []),
              ].join(''),
            },
            ...context.messages,
          ],
          tools:
            session.mode === 'plan' ? planDefinitions : buildDefinitions,
          signal,
          onText: (delta) => {
            if (!textPart) {
              textPart = { type: 'text', text: '' }
              assistant.parts.push(textPart)
            }
            const current: AgentTextPart = textPart
            current.text += delta
            emit()
          },
          onReasoning: (delta) => {
            if (!reasoningPart) {
              reasoningPart = { type: 'reasoning', text: '' }
              assistant.parts.push(reasoningPart)
            }
            if (reasoningPart.text.length >= 8_000) return
            reasoningPart.text += delta.slice(
              0,
              8_000 - reasoningPart.text.length,
            )
            emit()
          },
        })
      } catch (error) {
        if (signal.aborted) {
          assistant.parts.push({ type: 'text', text: '已停止。' })
          return
        }
        const message =
          error instanceof Error ? error.message : '请求失败，请稍后重试。'
        assistant.parts.push({ type: 'text', text: message })
        errorText = message
        session.updatedAt = now()
        persist()
        return
      }
      if (!result) return

      if (result.usage) {
        session.usage.input += result.usage.input
        session.usage.output += result.usage.output
        session.contextTokens =
          result.usage.input + result.usage.output
      }
      session.updatedAt = now()

      const calls = result.toolCalls
      if (!calls.length) {
        const text = result.text.trim()
        if (!textPart && !text) {
          assistant.parts.push({
            type: 'text',
            text: '模型没有返回内容，请换个说法再试。',
          })
        }
        if (result.finishReason === 'length')
          assistant.parts.push({
            type: 'text',
            text: '（输出达到长度上限，请继续指令让我接着写。）',
          })
        else if (result.finishReason === 'content_filter')
          assistant.parts.push({
            type: 'text',
            text: '（内容被安全策略截断。）',
          })
        if (pendingMedia.length)
          assistant.parts.push({
            type: 'media',
            status: 'done',
            items: pendingMedia.splice(0, pendingMedia.length),
            ...(pendingMediaGeneration
              ? { generation: pendingMediaGeneration }
              : {}),
          } satisfies AgentMediaPart)
        pushHistory(session, {
          role: 'assistant',
          content: text || '模型没有返回内容，请换个说法再试。',
          ...(result.reasoning
            ? { reasoning_content: result.reasoning }
            : {}),
        })
        persist()
        return
      }

      if (result.text.trim()) {
        // Text already streamed into the UI; keep history consistent.
      }
      const callEntries = calls.map((call) => ({
        id: call.id || `call_${randomUUID()}`,
        name: call.name,
        arguments: call.arguments,
      }))
      pushHistory(session, {
        role: 'assistant',
        content: result.text.trim() ? result.text : null,
        ...(result.reasoning ? { reasoning_content: result.reasoning } : {}),
        tool_calls: callEntries.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      })

      for (const call of callEntries) {
        if (signal.aborted) {
          ensureStoppedText(session)
          return
        }
        const tool = toolMap.get(call.name)
        let args: Record<string, unknown> = {}
        let parseError: string | undefined
        try {
          const parsed = JSON.parse(call.arguments || '{}') as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            args = parsed as Record<string, unknown>
          else parseError = '工具参数格式不正确。'
        } catch {
          parseError = '工具参数不是有效的 JSON。'
        }

        const part: AgentToolPart = {
          type: 'tool',
          id: call.id,
          name: call.name,
          title: tool ? safeTitle(tool, args) : call.name,
          args: truncate(call.arguments || '{}', 1500),
          status: 'running',
        }
        assistant.parts.push(part)
        emit()

        if (!tool) {
          part.status = 'error'
          part.output = `未知工具：${call.name}`
          pushHistory(session, {
            role: 'tool',
            tool_call_id: call.id,
            content: part.output,
          })
          continue
        }
        if (parseError) {
          part.status = 'error'
          part.output = parseError
          pushHistory(session, {
            role: 'tool',
            tool_call_id: call.id,
            content: parseError,
          })
          continue
        }

        if (paidTools.has(tool.name) && generationCalls.has(tool.name)) {
          part.status = 'error'
          part.output =
            '每轮每个生成工具最多调用一次；图片请用 count 生成多张。'
          pushHistory(session, {
            role: 'tool',
            tool_call_id: call.id,
            content: part.output,
          })
          emit()
          continue
        }
        if (permissionFor(tool, session.mode) === 'ask') {
          part.status = 'awaiting'
          emit()
        }
        const outcome = await executeTool(
          session,
          tool,
          args,
          call.arguments || '{}',
          signal,
          references,
          (progress) => {
            if (signal.aborted) return
            if (part.status === 'awaiting') part.status = 'running'
            part.output = truncate(progress, 6_000)
            emit()
          },
        )
        if (!outcome.allowed) {
          part.status = 'denied'
          part.output = outcome.text
        } else {
          part.status = outcome.ok ? 'done' : 'error'
          part.output = truncate(outcome.text, 6000)
        }
        if (outcome.ok && outcome.artifacts?.length) {
          part.artifacts = outcome.artifacts.map(({ name, path }) => {
            const id = randomUUID()
            rememberSource(session, {
              id,
              name,
              path,
              kind: 'artifact',
            })
            return { id, name, kind: artifactKind(name) }
          })
        }
        if (outcome.ok && outcome.media?.length) {
          if (paidTools.has(call.name)) {
            generationCalls.add(call.name)
            pendingMediaGeneration = {
              tool: call.name,
              args,
              ...(references.length ? { references } : {}),
            }
          }
          for (const item of outcome.media) {
            const id = randomUUID()
            rememberSource(session, {
              id,
              name: item.name,
              path: item.path,
              kind: 'artifact',
            })
            pendingMedia.push({
              id,
              name: item.name,
              kind: item.kind,
              status: 'done',
              url: mediaUrl(id),
              path: item.path,
              directory: dirname(item.path),
              ...(item.size ? { size: item.size } : {}),
              ...(item.width ? { width: item.width } : {}),
              ...(item.height ? { height: item.height } : {}),
              ...(item.durationSeconds
                ? { durationSeconds: item.durationSeconds }
                : {}),
            })
          }
        }
        pushHistory(session, {
          role: 'tool',
          tool_call_id: call.id,
          content: truncate(outcome.text, 8000),
        })
        emit()
        if (signal.aborted) {
          ensureStoppedText(session)
          return
        }
      }
      persist()
    }
    const current = session.ui[session.ui.length - 1]
    if (current?.role === 'assistant') {
      if (pendingMedia.length)
        current.parts.push({
          type: 'media',
          status: 'done',
          items: pendingMedia.splice(0, pendingMedia.length),
          ...(pendingMediaGeneration
            ? { generation: pendingMediaGeneration }
            : {}),
        } satisfies AgentMediaPart)
      current.parts.push({
        type: 'text',
        text: '已达到单轮工具调用上限，请继续指令让我接着做。',
      })
    }
    persist()
  }

  const generationFallbackDir =
    deps.generationDir ?? join(dirname(deps.storePath), 'generated')

  function generationDirectory(sessionId: string): string {
    const base = deps.getAttachmentDir?.() ?? generationFallbackDir
    return generationOutputDir(base, sessionId)
  }

  function generationPlaceholders(
    session: StoredSession,
    params: GenerationParams,
  ): AgentMediaView[] {
    const kind = generationKindForModel(session.model)
    if (!kind) return []
    const count = kind === 'image' ? params.image.count : 1
    const label =
      kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频'
    return Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      name: count > 1 ? `${label} ${index + 1}` : label,
      kind,
      status: 'running' as const,
    }))
  }

  async function runGenerationTurn(
    session: StoredSession,
    key: string,
    prompt: string,
    params: GenerationParams,
    attachments: AgentAttachmentInput[],
    appendUser: boolean,
  ): Promise<void> {
    const fallback = session.lastGeneration
    const normalized = normalizeGenerationParams(params ?? defaultGenerationParams)
    const references: GenerationReference[] = appendUser
      ? attachments.flatMap((item) =>
          item.sourcePath
            ? [{ path: item.sourcePath, kind: item.kind }]
            : [],
        )
      : (fallback?.references ?? [])
    if (session.model === 'speech-2.8-hd' || session.model === 'speech-2.8-turbo') {
      if (references.length) throw new Error('语音合成不需要参考附件。')
    }
    errorText = undefined
    busy = true
    controller = new AbortController()
    const signal = controller.signal
    const assistantId = randomUUID()
    session.lastGeneration = { prompt, params: normalized, references }
    try {
      if (appendUser) {
        for (const item of attachments) {
          if (!item.sourcePath) continue
          rememberSource(session, {
            id: item.id,
            name: item.name,
            path: item.sourcePath,
            kind: 'attachment',
          })
        }
        pushUi(session, {
          id: randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: prompt }],
          ...(attachments.length
            ? {
                attachments: attachments.map(
                  ({ id, name, size, sourcePath }) => ({
                    id,
                    name,
                    size,
                    ...(sourcePath ? { canSave: true } : {}),
                  }),
                ),
              }
            : {}),
        })
        pushHistory(session, {
          role: 'user',
          content: `[${session.model}] ${prompt}`,
        })
        if (session.title === '新会话') {
          const title = sessionTitle(prompt)
          session.title = title
          const titleKey = deps.getKey()
          if (titleKey)
            scheduleTitle(session, title, prompt, titleKey, signal)
        }
        session.updatedAt = now()
        emit()
      }
      const isSpeech = generationKindForModel(session.model) === 'audio'
      const cachedScript = appendUser ? undefined : fallback?.script
      const scriptPart: AgentTextPart | null = isSpeech
        ? {
            type: 'text',
            text: cachedScript ?? '正在撰写台词…',
          }
        : null
      const mediaPart: AgentMediaPart = {
        type: 'media',
        status: 'running',
        text: '正在准备生成…',
        items: generationPlaceholders(session, normalized),
      }
      const assistant: AgentMessageView = {
        id: assistantId,
        role: 'assistant',
        parts: scriptPart ? [scriptPart, mediaPart] : [mediaPart],
      }
      pushUi(session, assistant)
      emit()
      let generationPrompt = prompt
      if (isSpeech) {
        if (!cachedScript) {
          const script = await rewriteMiniMaxSpeechScript(key, prompt, {
            signal,
          })
          generationPrompt = script
          session.lastGeneration = {
            ...session.lastGeneration,
            prompt,
            params: normalized,
            references,
            script,
          }
          if (scriptPart) scriptPart.text = script
          emit()
        } else {
          generationPrompt = cachedScript
        }
      }
      const outcome = await runMiniMaxGeneration({
        apiKey: key,
        model: session.model,
        prompt: generationPrompt,
        params: normalized,
        references,
        outputDir: generationDirectory(session.id),
        signal,
        onProgress: (text) => {
          if (signal.aborted) return
          mediaPart.text = text
          emit()
        },
      })
      if (signal.aborted) throw new Error('已取消。')
      const part = assistant.parts.find(
        (value): value is AgentMediaPart => value.type === 'media',
      )
      if (!part) throw new Error('生成结果丢失。')
      part.status = 'done'
      part.text = outcome.warnings.length
        ? outcome.warnings.join('；')
        : undefined
      part.items = outcome.items.map((item) => {
        const id = randomUUID()
        rememberSource(session, {
          id,
          name: item.name,
          path: item.path,
          kind: 'artifact',
        })
        return {
          id,
          name: item.name,
          kind: item.kind,
          status: 'done' as const,
          url: mediaUrl(id),
          path: item.path,
          directory: dirname(item.path),
          ...(item.size ? { size: item.size } : {}),
          ...(item.width ? { width: item.width } : {}),
          ...(item.height ? { height: item.height } : {}),
          ...(item.durationSeconds
            ? { durationSeconds: item.durationSeconds }
            : {}),
        }
      })
      pushHistory(session, {
        role: 'assistant',
        content: `已生成 ${outcome.items.length} 个文件：${outcome.items
          .map((item) => item.name)
          .join('、')}`,
      })
      session.updatedAt = now()
      persist()
      emit()
    } catch (error) {
      const index = session.ui.findIndex(
        (message) =>
          message.id === assistantId &&
          message.role === 'assistant',
      )
      if (index >= 0) session.ui.splice(index, 1)
      if (!signal.aborted) {
        errorText = errorMessage(error, '生成失败，请稍后重试。')
      } else {
        pushUi(session, {
          id: randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: '已停止。' }],
        })
      }
    } finally {
      busy = false
      controller = null
      session.updatedAt = now()
      persist()
      emit()
    }
  }

  async function regenerateToolMedia(
    session: StoredSession,
    part: AgentMediaPart,
  ): Promise<void> {
    const generation = part.generation
    if (!generation) return
    const tool = toolMap.get(generation.tool)
    if (!tool) throw new Error('找不到对应的生成工具。')
    const previousItems = part.items
    const previousText = part.text
    errorText = undefined
    busy = true
    controller = new AbortController()
    const signal = controller.signal
    part.status = 'running'
    part.text = '正在重新生成…'
    emit()
    try {
      const outcome = await executeTool(
        session,
        tool,
        generation.args,
        JSON.stringify(generation.args),
        signal,
        generation.references ?? [],
        (progress) => {
          if (signal.aborted) return
          part.text = progress
          emit()
        },
      )
      if (!outcome.allowed) {
        part.items = previousItems
        part.status = 'done'
        part.text = previousText
        errorText = '已拒绝重新生成。'
        return
      }
      if (!outcome.ok || !outcome.media?.length) {
        part.items = previousItems
        part.status = 'done'
        part.text = previousText
        errorText = outcome.text
        return
      }
      const items: AgentMediaView[] = []
      for (const item of outcome.media) {
        const id = randomUUID()
        rememberSource(session, {
          id,
          name: item.name,
          path: item.path,
          kind: 'artifact',
        })
        items.push({
          id,
          name: item.name,
          kind: item.kind,
          status: 'done',
          url: mediaUrl(id),
          path: item.path,
          directory: dirname(item.path),
          ...(item.size ? { size: item.size } : {}),
          ...(item.width ? { width: item.width } : {}),
          ...(item.height ? { height: item.height } : {}),
          ...(item.durationSeconds
            ? { durationSeconds: item.durationSeconds }
            : {}),
        })
      }
      part.items = items
      part.status = 'done'
      part.text = undefined
    } finally {
      busy = false
      controller = null
      session.updatedAt = now()
      persist()
      emit()
    }
  }

  function retryLabelFor(session: StoredSession | undefined): '重试' | '继续' | undefined {
    if (busy || !session?.history.length) return undefined
    const last = session.history[session.history.length - 1]
    if (last.role !== 'user' && last.role !== 'tool') return undefined
    if (errorText) return '重试'
    const tail = session.ui[session.ui.length - 1]
    if (tail?.role !== 'assistant') return undefined
    const text = tail.parts
      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join('')
      .trim()
    if (text === '已停止。' || text.includes('已达到单轮工具调用上限'))
      return '继续'
    return undefined
  }

  async function runLoopTurn(session: StoredSession, key: string): Promise<void> {
    errorText = undefined
    busy = true
    controller = new AbortController()
    const signal = controller.signal
    try {
      await loop(session, key, signal)
    } catch (error) {
      if (!signal.aborted) {
        errorText = errorMessage(error, '执行失败，请稍后重试。')
        session.ui.push({
          id: randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: errorText }],
        })
      }
    } finally {
      busy = false
      controller = null
      if (pending) settleApproval(false)
      if (signal.aborted && session.ui.at(-1)?.role === 'user')
        session.ui.push({
          id: randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: '已停止。' }],
        })
      session.updatedAt = now()
      persist()
      emit()
    }
  }

  return {
    async load() {
      if (loaded) return
      loaded = true
      const store = await loadAgentStore(deps.storePath)
      sessions = store.sessions
      projects = store.projects
      activeId = sessions[0]?.id ?? null
      for (const session of sessions) {
        const sourcePaths = new Map(
          (session.sources ?? []).map((source) => [source.id, source.path]),
        )
        for (const source of session.sources ?? [])
          registerMediaPath(source.id, source.path)
        for (const message of session.ui)
          for (const part of message.parts) {
            if (part.type !== 'media') continue
            for (const item of part.items) {
              const path = sourcePaths.get(item.id)
              if (!item.path && path) {
                item.path = path
                item.directory = dirname(path)
              }
              if (part.status === 'running') {
                item.status = 'error'
                item.error = '生成已中断。'
              }
            }
            if (part.status !== 'running') continue
            part.status = 'error'
            part.text = part.items.length ? undefined : '生成已中断。'
          }
      }
      await pruneOrphanFileRefs()
    },
    state(): AgentState {
      const session = activeSession()
      const retryLabel = retryLabelFor(session)
      return {
        configured: Boolean(deps.getKey() || deps.getMiniMaxKey?.()),
        busy,
        sessions: sessions.map((item) => ({
          id: item.id,
          title: item.title,
          mode: item.mode,
          workspace: item.workspace,
          projectId: item.projectId,
          pinned: item.pinned,
          archived: item.archived === true,
          updatedAt: item.updatedAt,
        })),
        projects: [...projects]
          .sort(
            (left, right) =>
              Number(right.pinned) - Number(left.pinned) ||
              left.createdAt - right.createdAt,
          )
          .map((project) => ({
            id: project.id,
            name: project.name,
            workspace: project.workspace,
            pinned: project.pinned,
            toolPolicy: project.toolPolicy ?? 'ask',
            createdAt: project.createdAt,
          })),
        sessionId: session?.id ?? null,
        mode: session?.mode ?? 'build',
        approvalMode: session?.approvalMode ?? 'ask',
        model: session?.model ?? deps.getSettings().aiModel,
        reasoning: session?.reasoning ?? 'high',
        workspace: session?.workspace ?? null,
        messages: session?.ui.slice(-80) ?? [],
        approval: pending?.info ?? null,
        usage: session?.usage ?? { input: 0, output: 0 },
        contextTokens: session?.contextTokens ?? 0,
        ...(session?.compacted
          ? { contextCompacted: session.compacted }
          : {}),
        ...(retryLabel ? { retryLabel } : {}),
        ...(errorText ? { error: errorText } : {}),
      }
    },
    async send(
      prompt: string,
      attachments: AgentAttachmentInput[] = [],
      generation?: GenerationParams,
      requestedSkills: string[] = [],
    ) {
      const value = prompt.trim()
      if (!value) return
      if (busy) throw new Error('正在执行，请稍候。')
      const session = ensureSession()
      if (generationKindForModel(session.model)) {
        const generationKey = deps.getMiniMaxKey?.()
        if (!generationKey)
          throw new Error('请先在设置中配置 MiniMax API Key。')
        await runGenerationTurn(
          session,
          generationKey,
          value,
          generation ??
            session.lastGeneration?.params ??
            defaultGenerationParams,
          attachments.slice(0, 16),
          true,
        )
        return
      }
      const usingMiniMax = isMiniMaxModel(session.model)
      const key = usingMiniMax ? deps.getMiniMaxKey?.() : deps.getKey()
      if (!key)
        throw new Error(
          usingMiniMax
            ? '请先在设置中配置 MiniMax API Key。'
            : '请先配置 DeepSeek API Key。',
        )
      const files = attachments.slice(0, 8)
      if (
        session.model === 'deepseek-v4-pro' &&
        files.some(
          (item) =>
            item.kind !== 'video' && (item.upload?.length ?? 0) > 0,
        )
      )
        throw new Error(
          '当前模型只支持文字附件，请切换到 DeepSeek-V4.1-Flash。',
        )
      errorText = undefined
      busy = true
      controller = new AbortController()
      const signal = controller.signal
      try {
        const skillNames = [
          ...new Set(
            requestedSkills.map((name) => name.trim()).filter(Boolean),
          ),
        ].slice(0, 20)
        if (skillNames.length) {
          const available = await (deps.loadSkills?.() ?? Promise.resolve([]))
          const missing = skillNames.filter(
            (name) => !available.some((skill) => skill.name === name),
          )
          if (missing.length)
            throw new Error(`技能已停用或不存在：${missing.join('、')}`)
        }
        const built = await buildUserContent(
          session,
          key,
          value,
          files,
          signal,
        )
        const historyContent = skillNames.length
          ? appendUserText(
              built.content,
              `[用户明确引用了技能：${skillNames.join('、')}。回答前必须先调用 skill_load 读取这些技能的完整说明，并按说明执行。]`,
            )
          : built.content
        for (const file of files) {
          if (!file.sourcePath) continue
          rememberSource(session, {
            id: file.id,
            name: file.name,
            path: file.sourcePath,
            kind: 'attachment',
          })
        }
        const userMessage: AgentMessageView = {
          id: randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: value }],
          ...(files.length
            ? {
                attachments: files.map(
                  ({ id, name, size, sourcePath }) => ({
                    id,
                    name,
                    size,
                    ...(sourcePath ? { canSave: true } : {}),
                  }),
                ),
              }
            : {}),
        }
        pushUi(session, userMessage)
        pushHistory(session, { role: 'user', content: historyContent })
        if (session.title === '新会话') {
          const fallback = sessionTitle(value)
          session.title = fallback
          scheduleTitle(session, fallback, value, key, signal)
        }
        session.updatedAt = now()
        emit()
        await loop(
          session,
          key,
          signal,
          files.flatMap((file) =>
            file.sourcePath
              ? [{ path: file.sourcePath, kind: file.kind }]
              : [],
          ),
        )
      } catch (error) {
        if (!signal.aborted) {
          errorText = errorMessage(error, '执行失败，请稍后重试。')
          session.ui.push({
            id: randomUUID(),
            role: 'assistant',
            parts: [{ type: 'text', text: errorText }],
          })
        }
      } finally {
        busy = false
        controller = null
        if (pending) settleApproval(false)
        if (signal.aborted) ensureStoppedText(session)
        session.updatedAt = now()
        persist()
        emit()
      }
    },
    async retry() {
      if (busy) throw new Error('正在执行，请稍候。')
      const session = ensureSession()
      if (generationKindForModel(session.model)) {
        const key = deps.getMiniMaxKey?.()
        if (!key) throw new Error('请先在设置中配置 MiniMax API Key。')
        const last = session.lastGeneration
        if (!last) throw new Error('没有可以重试的生成任务。')
        const tail = session.ui[session.ui.length - 1]
        if (tail?.role === 'assistant' && tail.parts.length === 1) {
          const part = tail.parts[0]
          if (
            part.type === 'text' &&
            (part.text === '已停止。' || part.text === errorText)
          )
            session.ui.pop()
        }
        await runGenerationTurn(
          session,
          key,
          last.prompt,
          last.params,
          [],
          false,
        )
        return
      }
      const key = deps.getKey()
      if (!key) throw new Error('请先配置 DeepSeek API Key。')
      if (!session.history.length)
        throw new Error('没有可以继续的内容。')
      const tail = session.ui[session.ui.length - 1]
      if (tail?.role === 'assistant' && tail.parts.length === 1) {
        const part = tail.parts[0]
        if (
          part.type === 'text' &&
          (part.text === '已停止。' || part.text === errorText)
        )
          session.ui.pop()
      }
      await runLoopTurn(session, key)
    },
    async regenerate() {
      if (busy) throw new Error('正在执行，请稍候。')
      const session = ensureSession()
      if (generationKindForModel(session.model)) {
        const key = deps.getMiniMaxKey?.()
        if (!key) throw new Error('请先在设置中配置 MiniMax API Key。')
        const last = session.lastGeneration
        if (!last) throw new Error('没有可以重新生成的内容。')
        const lastUserIndex = session.ui.findLastIndex(
          (message) => message.role === 'user',
        )
        if (lastUserIndex < 0)
          throw new Error('没有可以重新生成的内容。')
        session.ui = session.ui.slice(0, lastUserIndex + 1)
        const lastHistory = session.history.at(-1)
        if (
          lastHistory?.role === 'assistant' &&
          typeof lastHistory.content === 'string' &&
          lastHistory.content.startsWith('已生成 ')
        )
          session.history.pop()
        await runGenerationTurn(
          session,
          key,
          last.prompt,
          last.params,
          [],
          false,
        )
        return
      }
      const lastAssistant = session.ui.at(-1)
      if (lastAssistant?.role === 'assistant') {
        const media = lastAssistant.parts.find(
          (part): part is AgentMediaPart =>
            part.type === 'media' && Boolean(part.generation),
        )
        if (media) {
          await regenerateToolMedia(session, media)
          return
        }
      }
      const key = deps.getKey()
      if (!key) throw new Error('请先配置 DeepSeek API Key。')
      const historyIndex = session.history.findLastIndex(
        (message) => message.role === 'user',
      )
      const uiIndex = session.ui.findLastIndex(
        (message) => message.role === 'user',
      )
      if (historyIndex < 0 || uiIndex < 0)
        throw new Error('没有可以重新生成的内容。')
      if (session.ui.at(-1)?.role === 'user')
        throw new Error('上一轮尚未完成，请先重试。')
      session.history = session.history.slice(0, historyIndex + 1)
      session.ui = session.ui.slice(0, uiIndex + 1)
      await runLoopTurn(session, key)
    },
    async editMessage(id: string, prompt: string) {
      const value = prompt.trim()
      if (!value) return
      if (busy) throw new Error('正在执行，请稍候。')
      const session = ensureSession()
      const uiIndex = session.ui.findIndex(
        (message) => message.id === id && message.role === 'user',
      )
      if (uiIndex < 0) throw new Error('找不到要编辑的消息。')
      const usersAfter = session.ui
        .slice(uiIndex + 1)
        .filter((message) => message.role === 'user').length
      let remaining = usersAfter + 1
      let historyIndex = -1
      for (let index = session.history.length - 1; index >= 0; index -= 1) {
        if (session.history[index].role !== 'user') continue
        remaining -= 1
        if (remaining === 0) {
          historyIndex = index
          break
        }
      }
      if (historyIndex < 0) throw new Error('无法重新发送这条消息。')
      session.history = session.history.slice(0, historyIndex)
      session.ui = session.ui.slice(0, uiIndex)
      await this.send(value)
    },
    cancel() {
      if (!busy && !pending) return
      settleApproval(false)
      controller?.abort()
      controller = null
    },
    approve(id: string) {
      if (pending?.info.id !== id) return
      settleApproval(true)
    },
    approveSame(id: string) {
      if (pending?.info.id !== id) return
      const session = activeSession()
      if (session) {
        const name = pending.info.name
        session.allowedTools = [
          ...(session.allowedTools ?? []).filter((item) => item !== name),
          name,
        ].slice(-20)
        persist()
      }
      settleApproval(true)
    },
    deny(id: string) {
      if (pending?.info.id !== id) return
      settleApproval(false)
    },
    newSession() {
      if (busy) this.cancel()
      const session = newSession(deps.getSettings().aiModel)
      sessions.unshift(session)
      if (sessions.length > maxAgentSessions) {
        const evicted = sessions.splice(maxAgentSessions)
        for (const item of evicted) releaseSessionFiles(item)
      }
      activeId = session.id
      errorText = undefined
      persist()
      emit()
    },
    newSessionIn(projectId: string) {
      const project = projects.find((item) => item.id === projectId)
      if (!project) return
      if (busy) this.cancel()
      const session = newSession(
        deps.getSettings().aiModel,
        project.id,
        project.workspace,
      )
      sessions.unshift(session)
      if (sessions.length > maxAgentSessions) {
        const evicted = sessions.splice(maxAgentSessions)
        for (const item of evicted) releaseSessionFiles(item)
      }
      activeId = session.id
      errorText = undefined
      persist()
      emit()
    },
    createProject(name: string, workspace: string) {
      const path = workspace.trim()
      if (!path) throw new Error('缺少项目文件夹。')
      if (projects.some((item) => item.workspace === path))
        throw new Error('这个文件夹已经是项目。')
      projects.push({
        id: randomUUID(),
        name: projectNameValue(name, path),
        workspace: path,
        pinned: false,
        createdAt: now(),
      })
      if (projects.length > maxAgentProjects)
        projects.splice(0, projects.length - maxAgentProjects)
      persist()
      emit()
    },
    updateProject(id, patch) {
      const project = projects.find((item) => item.id === id)
      if (!project) return
      let workspace = project.workspace
      if (patch.workspace !== undefined) {
        const value = patch.workspace.trim()
        if (!value) throw new Error('缺少项目文件夹。')
        if (
          projects.some(
            (item) => item.id !== id && item.workspace === value,
          )
        )
          throw new Error('这个文件夹已经是项目。')
        workspace = value
      }
      if (patch.name !== undefined)
        project.name = projectNameValue(patch.name, workspace)
      if (patch.workspace !== undefined) {
        project.workspace = workspace
        for (const session of sessions) {
          if (session.projectId === id) session.workspace = workspace
        }
      }
      persist()
      emit()
    },
    deleteProject(id: string) {
      const index = projects.findIndex((item) => item.id === id)
      if (index < 0) return
      projects.splice(index, 1)
      for (const session of sessions) {
        if (session.projectId === id) session.projectId = null
      }
      persist()
      emit()
    },
    setProjectPinned(id: string, pinned: boolean) {
      const project = projects.find((item) => item.id === id)
      if (!project) return
      project.pinned = pinned
      persist()
      emit()
    },
    setProjectToolPolicy(id: string, policy: AgentToolPolicy) {
      const project = projects.find((item) => item.id === id)
      if (!project) return
      if (policy === 'ask') delete project.toolPolicy
      else project.toolPolicy = policy
      persist()
      emit()
    },
    renameSession(id: string, title: string) {
      const session = sessions.find((item) => item.id === id)
      if (!session) return
      const value = title.trim()
      if (!value) throw new Error('缺少对话名称。')
      if (nameLength(value) > maxAgentNameChars)
        throw new Error(`标题最多 ${maxAgentNameChars} 个字符。`)
      session.title = value
      persist()
      emit()
    },
    setSessionPinned(id: string, pinned: boolean) {
      const session = sessions.find((item) => item.id === id)
      if (!session) return
      session.pinned = pinned
      persist()
      emit()
    },
    setSessionArchived(id: string, archived: boolean) {
      const session = sessions.find((item) => item.id === id)
      if (!session) return
      if (archived) session.archived = true
      else delete session.archived
      if (archived && activeId === id) {
        const next = sessions.find((item) => !item.archived)
        activeId = next?.id ?? null
      }
      session.updatedAt = now()
      errorText = undefined
      persist()
      emit()
    },
    clearSession(id: string) {
      const session = sessions.find((item) => item.id === id)
      if (!session) return
      if (busy && activeId === id) this.cancel()
      releaseSessionFiles(session)
      session.ui = []
      session.history = []
      session.files = []
      session.sources = []
      session.title = '新会话'
      session.usage = { input: 0, output: 0 }
      session.contextTokens = 0
      delete session.compacted
      session.updatedAt = now()
      errorText = undefined
      persist()
      emit()
    },
    moveSession(id: string, projectId: string | null) {
      const session = sessions.find((item) => item.id === id)
      if (!session) return
      const project = projectId
        ? projects.find((item) => item.id === projectId)
        : null
      if (projectId && !project) return
      session.projectId = project?.id ?? null
      if (project) session.workspace = project.workspace
      persist()
      emit()
    },
    select(id: string) {
      if (!sessions.some((session) => session.id === id)) return
      if (id === activeId) return
      if (busy) this.cancel()
      activeId = id
      errorText = undefined
      emit()
    },
    remove(id: string) {
      const index = sessions.findIndex((session) => session.id === id)
      if (index < 0) return
      if (busy && activeId === id) this.cancel()
      const removed = sessions[index]
      sessions.splice(index, 1)
      if (activeId === id) activeId = sessions[0]?.id ?? null
      releaseSessionFiles(removed)
      persist()
      emit()
    },
    setMode(mode: AgentMode) {
      if (busy) return
      const session = ensureSession()
      if (session.mode === mode) return
      session.mode = mode
      session.updatedAt = now()
      persist()
      emit()
    },
    setApprovalMode(mode: AgentApprovalMode) {
      const session = ensureSession()
      if (session.approvalMode === mode) return
      session.approvalMode = mode
      session.updatedAt = now()
      persist()
      emit()
    },
    setModel(model: AgentModelId) {
      if (busy) return
      const session = ensureSession()
      if (session.model === model) return
      session.model = model
      session.updatedAt = now()
      persist()
      emit()
    },
    setReasoning(reasoning: AgentReasoning) {
      if (busy) return
      const session = ensureSession()
      if (session.reasoning === reasoning) return
      session.reasoning = reasoning
      session.updatedAt = now()
      persist()
      emit()
    },
    setWorkspace(projectId: string | null) {
      if (busy) return
      const session = ensureSession()
      if (projectId) {
        const project = projects.find((item) => item.id === projectId)
        if (!project) return
        session.workspace = project.workspace
        session.projectId = project.id
      } else {
        session.workspace = null
        session.projectId = null
      }
      session.updatedAt = now()
      persist()
      emit()
    },
    source(id: string) {
      for (const session of sessions) {
        const source = session.sources?.find((item) => item.id === id)
        if (source) return { name: source.name, path: source.path }
      }
      return null
    },
    sessionMarkdown(id: string) {
      const session = sessions.find((item) => item.id === id)
      if (!session) return null
      const statusLabel = (status: string): string => {
        if (status === 'running') return '执行中'
        if (status === 'awaiting') return '待确认'
        if (status === 'done') return '完成'
        if (status === 'error') return '失败'
        if (status === 'denied') return '已拒绝'
        return status
      }
      const sections: string[] = [`# ${session.title}`]
      for (const message of session.ui) {
        const text = message.parts
          .filter((part): part is AgentTextPart => part.type === 'text')
          .map((part) => part.text)
          .join('\n\n')
          .trim()
        const tools = message.parts.filter(
          (part): part is AgentToolPart => part.type === 'tool',
        )
        const media = message.parts.filter(
          (part): part is AgentMediaPart => part.type === 'media',
        )
        if (message.role === 'user') {
          if (text) sections.push(`## 用户\n\n${text}`)
          if (message.attachments?.length)
            sections.push(
              `### 附件\n\n${message.attachments
                .map((item) => `- ${item.name}`)
                .join('\n')}`,
            )
          continue
        }
        if (text) sections.push(`## 助手\n\n${text}`)
        for (const part of media)
          if (part.items.length)
            sections.push(
              `### 生成文件\n\n${part.items
                .map((item) => `- ${item.name}`)
                .join('\n')}`,
            )
        for (const tool of tools) {
          const output = tool.output?.trim()
          const lines = [
            `> 工具：${tool.title}（${statusLabel(tool.status)}）`,
            ...(output
              ? [
                  '>',
                  ...output
                    .split('\n')
                    .map((line) => `> ${line}`),
                ]
              : []),
            ...(tool.artifacts?.length
              ? [
                  '>',
                  ...tool.artifacts.map(
                    (artifact) => `> 生成文件：${artifact.name}`,
                  ),
                ]
              : []),
          ]
          sections.push(lines.join('\n'))
        }
      }
      return {
        title: session.title,
        text: `${sections.join('\n\n')}\n`,
      }
    },
    async flush() {
      if (titleTasks.size) await Promise.allSettled([...titleTasks])
      await saveAgentStore(deps.storePath, { sessions, projects })
    },
  }
}
