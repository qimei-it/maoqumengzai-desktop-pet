/** Agent loop: streaming, tool calls, approvals, cancellation and sessions. */

import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type {
  AgentApproval,
  AgentMessageView,
  AgentMode,
  AgentPetProfile,
  AgentState,
  AgentTextPart,
  AgentToolPart,
} from '../../shared/agent'
import type { DeepSeekModel } from '../../shared/deepseek'
import {
  loadAgentStore,
  maxHistoryEntries,
  maxSessionMessages,
  maxAgentSessions,
  saveAgentStore,
  type StoredSession,
} from './store'
import {
  streamChat,
  type ProviderMessage,
  type StreamResult,
} from './provider'
import {
  createTools,
  permissionFor,
  safeTitle,
  toolDefinition,
  type AgentDeps,
  type AgentTool,
} from './tools'

export type AgentRuntimeDeps = AgentDeps & {
  storePath: string
  getKey(): string | undefined
  broadcast(): void
  pickWorkspace(): Promise<string | null>
}

export type AgentRuntime = {
  load(): Promise<void>
  state(): AgentState
  send(prompt: string): Promise<void>
  cancel(): void
  approve(id: string): void
  deny(id: string): void
  newSession(): void
  select(id: string): void
  remove(id: string): void
  setMode(mode: AgentMode): void
  setModel(model: DeepSeekModel): void
  chooseWorkspace(): Promise<void>
  flush(): Promise<void>
}

const maxSteps = 12
const maxShellHistory = 60

function now(): number {
  return Date.now()
}

function newSession(model: DeepSeekModel): StoredSession {
  const stamp = now()
  return {
    id: randomUUID(),
    title: '新会话',
    mode: 'build',
    model,
    workspace: null,
    createdAt: stamp,
    updatedAt: stamp,
    ui: [],
    history: [],
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

/** Keeps recent context and never starts on an orphan tool result. */
function trimHistory(history: ProviderMessage[]): ProviderMessage[] {
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
    return { ...message, content: truncate(message.content, 8000) }
  })
}

function systemPrompt(
  mode: AgentMode,
  workspace: string | null,
  pet: AgentPetProfile,
): string {
  return [
    '你是“毛趣萌仔”桌面宠物里的个人助理智能体。默认使用中文，回答简洁直接。',
    '你可以调用工具处理待办、置物架文件、邮件、音乐、设置、应用面板和 shell。',
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
  ].join('\n')
}

export function createAgentRuntime(deps: AgentRuntimeDeps): AgentRuntime {
  const tools = createTools(deps)
  const toolList = Object.values(tools)
  const definitions = toolList.map(toolDefinition)
  let sessions: StoredSession[] = []
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
    void saveAgentStore(deps.storePath, sessions).catch(() => {})
  }

  function activeSession(): StoredSession | undefined {
    return sessions.find((session) => session.id === activeId)
  }

  function ensureSession(): StoredSession {
    const current = activeSession()
    if (current) return current
    const session = newSession(deps.getSettings().aiModel)
    sessions.unshift(session)
    activeId = session.id
    if (sessions.length > maxAgentSessions)
      sessions.splice(maxAgentSessions)
    return session
  }

  function emit(): void {
    deps.broadcast()
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
  ): Promise<{ allowed: boolean; text: string; ok: boolean }> {
    const permission = permissionFor(tool, session.mode)
    if (permission === 'deny') {
      return {
        allowed: false,
        ok: false,
        text: `工具 ${tool.name} 在当前模式下不可用。`,
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
    if (permission === 'ask') {
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
      return { allowed: true, ok: result.ok, text: result.text }
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
      let result: StreamResult | null = null
      try {
        result = await streamChat(key, {
          model: session.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt(
                session.mode,
                session.workspace,
                deps.getPetProfile(),
              ),
            },
            ...trimHistory(session.history),
          ],
          tools: definitions,
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
        if (!textPart && !result.text.trim()) {
          assistant.parts.push({
            type: 'text',
            text: '模型没有返回内容，请换个说法再试。',
          })
        }
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
        tool_calls: callEntries.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      })

      for (const call of callEntries) {
        if (signal.aborted) return
        const tool = tools[call.name]
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

  return {
    async load() {
      if (loaded) return
      loaded = true
      sessions = await loadAgentStore(deps.storePath)
      activeId = sessions[0]?.id ?? null
    },
    state(): AgentState {
      const session = activeSession()
      return {
        configured: Boolean(deps.getKey()),
        busy,
        sessions: sessions.map((item) => ({
          id: item.id,
          title: item.title,
          mode: item.mode,
          updatedAt: item.updatedAt,
        })),
        sessionId: session?.id ?? null,
        mode: session?.mode ?? 'build',
        model: session?.model ?? deps.getSettings().aiModel,
        workspace: session?.workspace ?? null,
        messages: session?.ui.slice(-80) ?? [],
        approval: pending?.info ?? null,
        usage: session?.usage ?? { input: 0, output: 0 },
        ...(errorText ? { error: errorText } : {}),
      }
    },
    async send(prompt: string) {
      const value = prompt.trim()
      if (!value) return
      if (busy) throw new Error('正在执行，请稍候。')
      const key = deps.getKey()
      if (!key) throw new Error('请先配置 DeepSeek API Key。')
      const session = ensureSession()
      errorText = undefined
      busy = true
      controller = new AbortController()
      const signal = controller.signal
      const userMessage: AgentMessageView = {
        id: randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text: value }],
      }
      pushUi(session, userMessage)
      pushHistory(session, { role: 'user', content: value })
      if (session.title === '新会话') session.title = sessionTitle(value)
      session.updatedAt = now()
      emit()
      try {
        await loop(session, key, signal)
      } catch (error) {
        if (!signal.aborted) {
          errorText =
            error instanceof Error ? error.message : '执行失败，请稍后重试。'
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
        session.updatedAt = now()
        persist()
        emit()
      }
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
    deny(id: string) {
      if (pending?.info.id !== id) return
      settleApproval(false)
    },
    newSession() {
      if (busy) this.cancel()
      const session = newSession(deps.getSettings().aiModel)
      sessions.unshift(session)
      if (sessions.length > maxAgentSessions)
        sessions.splice(maxAgentSessions)
      activeId = session.id
      errorText = undefined
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
      sessions.splice(index, 1)
      if (activeId === id) activeId = sessions[0]?.id ?? null
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
    async chooseWorkspace() {
      const picked = await deps.pickWorkspace()
      if (!picked) return
      const session = ensureSession()
      session.workspace = picked
      session.updatedAt = now()
      persist()
      emit()
    },
    async flush() {
      await saveAgentStore(deps.storePath, sessions)
    },
  }
}

export function workspaceLabel(path: string | null): string {
  if (!path) return '选择工作区'
  const name = basename(path)
  return name || path
}
