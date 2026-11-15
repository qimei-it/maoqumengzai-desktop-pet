/** Local persistence for agent projects and sessions. Atomic writes. */

import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type {
  AgentMessageView,
  AgentMode,
  AgentReasoning,
  AgentUsage,
} from '../../shared/agent'
import type { DeepSeekModel } from '../../shared/deepseek'
import type { ProviderMessage } from './provider'

export type StoredProject = {
  id: string
  name: string
  workspace: string
  pinned: boolean
  createdAt: number
}

export type StoredFileRef = {
  id: string
  name: string
  path: string
  purpose: 'user_data' | 'text_recognition' | 'rich_layout_recognition'
  expiresAt: number | null
}

export type StoredSession = {
  id: string
  title: string
  mode: AgentMode
  model: DeepSeekModel
  reasoning: AgentReasoning
  workspace: string | null
  projectId: string | null
  pinned: boolean
  createdAt: number
  updatedAt: number
  ui: AgentMessageView[]
  history: ProviderMessage[]
  files?: StoredFileRef[]
  usage: AgentUsage
}

export type AgentStore = {
  sessions: StoredSession[]
  projects: StoredProject[]
}

export const maxAgentSessions = 30
export const maxAgentProjects = 50
export const maxSessionMessages = 200
export const maxHistoryEntries = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseProject(value: unknown): StoredProject | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id) return null
  if (typeof value.name !== 'string' || !value.name.trim()) return null
  if (typeof value.workspace !== 'string' || !value.workspace) return null
  return {
    id: value.id,
    name: value.name.slice(0, 40),
    workspace: value.workspace,
    pinned: value.pinned === true,
    createdAt:
      typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
  }
}

function parseFileRef(value: unknown): StoredFileRef | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id) return null
  if (typeof value.name !== 'string' || !value.name) return null
  if (typeof value.path !== 'string' || !value.path) return null
  if (
    value.purpose !== 'user_data' &&
    value.purpose !== 'text_recognition' &&
    value.purpose !== 'rich_layout_recognition'
  )
    return null
  return {
    id: value.id.slice(0, 200),
    name: value.name.slice(0, 300),
    path: value.path,
    purpose: value.purpose,
    expiresAt:
      typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
        ? value.expiresAt
        : null,
  }
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
    reasoning:
      value.reasoning === 'off' ||
      value.reasoning === 'low' ||
      value.reasoning === 'max'
        ? value.reasoning
        : 'high',
    workspace:
      typeof value.workspace === 'string' && value.workspace
        ? value.workspace
        : null,
    projectId:
      typeof value.projectId === 'string' && value.projectId
        ? value.projectId
        : null,
    pinned: value.pinned === true,
    createdAt:
      typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    updatedAt:
      typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    ui: (value.ui as AgentMessageView[]).slice(-maxSessionMessages),
    history: (value.history as ProviderMessage[]).slice(-maxHistoryEntries),
    files: Array.isArray(value.files)
      ? value.files
          .map(parseFileRef)
          .filter((ref): ref is StoredFileRef => Boolean(ref))
          .slice(-200)
      : [],
    usage: {
      input: typeof usage.input === 'number' ? usage.input : 0,
      output: typeof usage.output === 'number' ? usage.output : 0,
    },
  }
}

/** Version 1 had no projects; each distinct workspace becomes one. */
function migrateWorkspaces(sessions: StoredSession[]): StoredProject[] {
  const projects: StoredProject[] = []
  const byWorkspace = new Map<string, StoredProject>()
  for (const session of sessions) {
    if (!session.workspace || session.projectId) continue
    let project = byWorkspace.get(session.workspace)
    if (!project) {
      project = {
        id: randomUUID(),
        name: basename(session.workspace) || session.workspace,
        workspace: session.workspace,
        pinned: false,
        createdAt: Date.now(),
      }
      byWorkspace.set(session.workspace, project)
      projects.push(project)
    }
    session.projectId = project.id
  }
  return projects
}

function normalizeSessions(
  sessions: StoredSession[],
  projects: StoredProject[],
): StoredSession[] {
  const projectIds = new Set(projects.map((project) => project.id))
  return sessions.map((session) => ({
    ...session,
    projectId:
      session.projectId && projectIds.has(session.projectId)
        ? session.projectId
        : null,
  }))
}

export async function loadAgentStore(path: string): Promise<AgentStore> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (!isRecord(raw) || !Array.isArray(raw.sessions))
      return { sessions: [], projects: [] }

    const sessions = raw.sessions
      .map(parseSession)
      .filter((session): session is StoredSession => Boolean(session))

    if (raw.version === 1) {
      const projects = migrateWorkspaces(sessions)
      return {
        sessions: sessions.slice(0, maxAgentSessions),
        projects: projects.slice(0, maxAgentProjects),
      }
    }
    if (raw.version !== 2) return { sessions: [], projects: [] }

    const projects = Array.isArray(raw.projects)
      ? raw.projects
          .map(parseProject)
          .filter((project): project is StoredProject => Boolean(project))
          .slice(0, maxAgentProjects)
      : []
    return {
      sessions: normalizeSessions(
        sessions.slice(0, maxAgentSessions),
        projects,
      ),
      projects,
    }
  } catch {
    return { sessions: [], projects: [] }
  }
}

let queue = Promise.resolve()

export async function saveAgentStore(
  path: string,
  store: AgentStore,
): Promise<void> {
  const value = {
    version: 2,
    projects: store.projects.slice(0, maxAgentProjects),
    sessions: store.sessions.slice(0, maxAgentSessions),
  }
  const text = JSON.stringify(value)
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, text, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
