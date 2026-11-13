/** Local persistence for agent sessions. One JSON file, atomic writes. */

import { readFile, rename, writeFile } from 'node:fs/promises'
import type {
  AgentMessageView,
  AgentMode,
  AgentUsage,
} from '../../shared/agent'
import type { DeepSeekModel } from '../../shared/deepseek'
import type { ProviderMessage } from './provider'

export type StoredSession = {
  id: string
  title: string
  mode: AgentMode
  model: DeepSeekModel
  workspace: string | null
  createdAt: number
  updatedAt: number
  ui: AgentMessageView[]
  history: ProviderMessage[]
  usage: AgentUsage
}

export const maxAgentSessions = 30
export const maxSessionMessages = 200
export const maxHistoryEntries = 200

type StoredFile = {
  version: 1
  sessions: StoredSession[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseSession(value: unknown): StoredSession | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id) return null
  if (typeof value.title !== 'string') return null
  if (value.mode !== 'plan' && value.mode !== 'build') return null
  if (value.model !== 'deepseek-flash' && value.model !== 'deepseek-v4-pro')
    return null
  if (!Array.isArray(value.ui) || !Array.isArray(value.history)) return null
  const usage = isRecord(value.usage) ? value.usage : {}
  return {
    id: value.id,
    title: value.title.slice(0, 60),
    mode: value.mode as AgentMode,
    model: value.model as DeepSeekModel,
    workspace:
      typeof value.workspace === 'string' && value.workspace
        ? value.workspace
        : null,
    createdAt:
      typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    updatedAt:
      typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    ui: (value.ui as AgentMessageView[]).slice(-maxSessionMessages),
    history: (value.history as ProviderMessage[]).slice(-maxHistoryEntries),
    usage: {
      input: typeof usage.input === 'number' ? usage.input : 0,
      output: typeof usage.output === 'number' ? usage.output : 0,
    },
  }
}

export async function loadAgentStore(path: string): Promise<StoredSession[]> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.sessions))
      return []
    return raw.sessions
      .map(parseSession)
      .filter((session): session is StoredSession => Boolean(session))
      .slice(0, maxAgentSessions)
  } catch {
    return []
  }
}

let queue = Promise.resolve()

export async function saveAgentStore(
  path: string,
  sessions: StoredSession[],
): Promise<void> {
  const value: StoredFile = {
    version: 1,
    sessions: sessions.slice(0, maxAgentSessions),
  }
  const text = JSON.stringify(value)
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, text, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
