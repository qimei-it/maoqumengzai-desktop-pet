/** Agent loop: streaming, tool calls, approvals, cancellation and sessions. */

import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type {
  AgentApproval,
  AgentArtifactKind,
  AgentArtifactView,
  AgentAttachmentInput,
  AgentAttachmentView,
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
import { searchWeb } from '../../shared/deepseek'
import type { DeepSeekModel } from '../../shared/deepseek'
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
import {
  createTools,
  permissionFor,
  safeTitle,
  toolDefinition,
  type AgentTool,
} from './tools'
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
  content: string
}

export type AgentRuntimeDeps = {
  services: Services
  storePath: string
  getKey(): string | undefined
  getSettings(): SettingsState
  getPetProfile(): AgentPetProfile
  broadcast(): void
  pickWorkspace(): Promise<string | null>
  /** Injectable for tests; production uses the real streaming client. */
  stream?: typeof streamChat
  /** Injectable for tests; production uses the DeepSeek Files/ASR APIs. */
  files?: AgentFilesClient
  /** Enabled skills exposed to the model as a catalog plus a loader tool. */
  loadSkills?(): Promise<AgentSkillPrompt[]>
}

export type AgentRuntime = {
  load(): Promise<void>
  state(): AgentState
  send(prompt: string, attachments?: AgentAttachmentInput[]): Promise<void>
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
  setModel(model: DeepSeekModel): void
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
const maxHistoryChars = 96_000
const maxSummaryChars = 6_000

function now(): number {
  return Date.now()
}

function newSession(
  model: DeepSeekModel,
  projectId: string | null = null,
  workspace: string | null = null,
): StoredSession {
  const stamp = now()
  return {
    id: randomUUID(),
    title: '新会话',
    mode: 'build',
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
  const value = prompt.replace(/\s+/g, ' ').trim()
  return value.length > 22 ? `${value.slice(0, 22)}…` : value || '新会话'
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
  model: DeepSeekModel,
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
  model: DeepSeekModel,
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
    '你可以调用工具处理待办、置物架文件、邮件、音乐、设置、应用面板、联网搜索和 shell。',
    '工具调用会直接改到真实应用状态；不要声称完成了没有调用工具的事情。',
    '工具失败时如实说明原因，不要编造结果。',
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
          '需要按某个技能执行时，先调用 skill_load 读取完整说明，再照做。',
          ...skills
            .slice(0, 50)
            .map(
              (skill) =>
                `- ${skill.name}：${(skill.description || '无描述').slice(0, 160)}`,
            ),
        ]
      : []),
  ].join('\n')
}

function projectNameValue(name: string, workspace: string): string {
  const value = name.trim()
  if (value) return value.slice(0, 40)
  return (basename(workspace) || '项目').slice(0, 40)
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
      return { ok: true, text: truncate(match.content, 20_000) }
    },
  }
  const toolList = [...Object.values(tools), skillTool]
  const buildDefinitions = toolList.map(toolDefinition)
  const planDefinitions = toolList
    .filter((tool) => tool.plan === 'allow')
    .map(toolDefinition)
  let sessions: StoredSession[] = []
  let projects: StoredProject[] = []
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
  ): Promise<{
    allowed: boolean
    text: string
    ok: boolean
    artifacts?: { name: string; path: string }[]
  }> {
    let permission = permissionFor(tool, session.mode)
    const project = session.projectId
      ? projects.find((item) => item.id === session.projectId)
      : undefined
    if (permission === 'ask' && project?.toolPolicy === 'allow')
      permission = 'allow'
    else if (permission === 'ask' && project?.toolPolicy === 'deny')
      permission = 'deny'
    if (permission === 'deny') {
      return {
        allowed: false,
        ok: false,
        text: project?.toolPolicy === 'deny' && tool.build === 'ask'
          ? `项目策略禁止 ${tool.name}。`
          : `工具 ${tool.name} 在当前模式下不可用。`,
      }
    }
    if (tool.name === 'shell_run' && !session.workspace) {
      const picked = await deps.pickWorkspace()
      if (!picked)
        return {
          allowed: false,
          ok: false,
          text: '没有选择 shell 工作区，命令未执行。',
        }
      session.workspace = picked
      session.updatedAt = now()
      persist()
      emit()
    }
    if (
      permission === 'ask' &&
      !(session.allowedTools ?? []).includes(tool.name)
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
        workspace: session.workspace,
        signal,
      })
      return {
        allowed: true,
        ok: result.ok,
        text: result.text,
        ...(result.artifacts?.length
          ? { artifacts: result.artifacts }
          : {}),
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
  ): Promise<void> {
    await refreshFileRefs(session, key, signal).catch(() => {})
    const skills = await (deps.loadSkills?.() ?? Promise.resolve([])).catch(
      () => [],
    )
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
        result = await stream(key, {
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
        if (signal.aborted) return
        const tool =
          call.name === 'skill_load' ? skillTool : tools[call.name]
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
        pushHistory(session, {
          role: 'tool',
          tool_call_id: call.id,
          content: truncate(outcome.text, 8000),
        })
        emit()
        if (signal.aborted) return
      }
      persist()
    }
    const current = session.ui[session.ui.length - 1]
    if (current?.role === 'assistant')
      current.parts.push({
        type: 'text',
        text: '已达到单轮工具调用上限，请继续指令让我接着做。',
      })
    persist()
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
      await pruneOrphanFileRefs()
    },
    state(): AgentState {
      const session = activeSession()
      const retryLabel = retryLabelFor(session)
      return {
        configured: Boolean(deps.getKey()),
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
        model: session?.model ?? deps.getSettings().aiModel,
        reasoning: session?.reasoning ?? 'high',
        workspace: session?.workspace ?? null,
        messages: session?.ui.slice(-80) ?? [],
        approval: pending?.info ?? null,
        usage: session?.usage ?? { input: 0, output: 0 },
        ...(session?.compacted
          ? { contextCompacted: session.compacted }
          : {}),
        ...(retryLabel ? { retryLabel } : {}),
        ...(errorText ? { error: errorText } : {}),
      }
    },
    async send(prompt: string, attachments: AgentAttachmentInput[] = []) {
      const value = prompt.trim()
      if (!value) return
      if (busy) throw new Error('正在执行，请稍候。')
      const key = deps.getKey()
      if (!key) throw new Error('请先配置 DeepSeek API Key。')
      const session = ensureSession()
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
        const built = await buildUserContent(
          session,
          key,
          value,
          files,
          signal,
        )
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
        pushHistory(session, { role: 'user', content: built.content })
        if (session.title === '新会话') session.title = sessionTitle(value)
        session.updatedAt = now()
        emit()
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
    },
    async retry() {
      if (busy) throw new Error('正在执行，请稍候。')
      const key = deps.getKey()
      if (!key) throw new Error('请先配置 DeepSeek API Key。')
      const session = ensureSession()
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
      const key = deps.getKey()
      if (!key) throw new Error('请先配置 DeepSeek API Key。')
      const session = ensureSession()
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
      const value = title.trim().slice(0, 60)
      if (!value) throw new Error('缺少对话名称。')
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
    setModel(model: DeepSeekModel) {
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
      await saveAgentStore(deps.storePath, { sessions, projects })
    },
  }
}
