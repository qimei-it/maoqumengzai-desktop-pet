/** Local persistence for agent projects and sessions. Atomic writes. */

import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { mediaUrl } from '../../shared/media'
import type {
  AgentApprovalMode,
  AgentAttachmentKind,
  AgentMessageView,
  AgentMode,
  AgentReasoning,
  AgentUsage,
} from '../../shared/agent'
import type { AgentModelId } from '../../shared/agent-models'
import {
  isAgentModelId,
  isGenerationModel,
  modelInfo,
} from '../../shared/agent-models'
import type { GenerationParams } from '../../shared/generation'
import { normalizeGenerationParams } from '../../shared/generation'
import type { ProviderMessage } from './provider'

export type StoredProject = {
  id: string
  name: string
  workspace: string
  pinned: boolean
  toolPolicy?: 'ask' | 'allow' | 'deny'
  createdAt: number
}

export type StoredFileRef = {
  id: string
  name: string
  path: string
  purpose: 'user_data' | 'text_recognition' | 'rich_layout_recognition'
  expiresAt: number | null
}

export type StoredSource = {
  id: string
  name: string
  path: string
  kind: 'attachment' | 'artifact'
}

export type StoredGenerationTurn = {
  prompt: string
  params: GenerationParams
  references: Array<{ path: string; kind: AgentAttachmentKind }>
  /** Rewritten script used for speech generation. */
  script?: string
}

export type StoredSession = {
  id: string
  title: string
  mode: AgentMode
  approvalMode?: AgentApprovalMode
  model: AgentModelId
  selectedModel?: AgentModelId
  imageModel?: AgentModelId
  videoModel?: AgentModelId
  audioModel?: AgentModelId
  reasoning: AgentReasoning
  workspace: string | null
  projectId: string | null
  pinned: boolean
  archived?: boolean
  createdAt: number
  updatedAt: number
  ui: AgentMessageView[]
  history: ProviderMessage[]
  files?: StoredFileRef[]
  sources?: StoredSource[]
  /** Tools approved for the rest of this session. */
  allowedTools?: string[]
  usage: AgentUsage
  /** Tokens used by the latest text request (input + output). */
  contextTokens?: number
  /** Number of older messages folded into the context summary. */
  compacted?: number
  /** Last generation request so retry/regenerate reuses its parameters. */
  lastGeneration?: StoredGenerationTurn
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
    ...(value.toolPolicy === 'allow' || value.toolPolicy === 'deny'
      ? { toolPolicy: value.toolPolicy }
      : {}),
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

function parseSource(value: unknown): StoredSource | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id) return null
  if (typeof value.name !== 'string' || !value.name) return null
  if (typeof value.path !== 'string' || !value.path) return null
  if (value.kind !== 'attachment' && value.kind !== 'artifact') return null
  return {
    id: value.id.slice(0, 200),
    name: value.name.slice(0, 300),
    path: value.path,
    kind: value.kind,
  }
}

const attachmentKinds = new Set<AgentAttachmentKind>([
  'text',
  'pdf',
  'office',
  'spreadsheet',
  'ofd',
  'image',
  'audio',
  'video',
  'archive',
  'ebook',
])

function parseGenerationTurn(value: unknown): StoredGenerationTurn | null {
  if (!isRecord(value)) return null
  if (typeof value.prompt !== 'string' || !value.prompt.trim()) return null
  const references = Array.isArray(value.references)
    ? value.references
        .filter(
          (item): item is { path: string; kind: AgentAttachmentKind } =>
            isRecord(item) &&
            typeof item.path === 'string' &&
            Boolean(item.path) &&
            attachmentKinds.has(item.kind as AgentAttachmentKind),
        )
        .map((item) => ({ path: item.path, kind: item.kind }))
        .slice(0, 16)
    : []
  return {
    prompt: value.prompt.slice(0, 32_000),
    params: normalizeGenerationParams(value.params),
    references,
    ...(typeof value.script === 'string' && value.script.trim()
      ? { script: value.script.slice(0, 4_000) }
      : {}),
  }
}

function parseSession(value: unknown): StoredSession | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id) return null
  if (typeof value.title !== 'string') return null
  if (value.mode !== 'plan' && value.mode !== 'build') return null
  if (!isAgentModelId(value.model)) return null
  if (!Array.isArray(value.ui) || !Array.isArray(value.history)) return null
  const usage = isRecord(value.usage) ? value.usage : {}
  const lastGeneration = parseGenerationTurn(value.lastGeneration)
  const imageModel =
    typeof value.imageModel === 'string' &&
    modelInfo(value.imageModel)?.kind === 'image'
      ? value.imageModel
      : undefined
  const videoModel =
    typeof value.videoModel === 'string' &&
    modelInfo(value.videoModel)?.kind === 'video'
      ? value.videoModel
      : undefined
  const audioModel =
    typeof value.audioModel === 'string' &&
    modelInfo(value.audioModel)?.kind === 'speech'
      ? value.audioModel
      : undefined
  return {
    id: value.id,
    title: value.title.slice(0, 60),
    mode: value.mode as AgentMode,
    approvalMode:
      value.approvalMode === 'auto' || value.approvalMode === 'full'
        ? value.approvalMode
        : 'ask',
    model: isGenerationModel(value.model) ? 'deepseek-flash' : value.model,
    selectedModel: isAgentModelId(value.selectedModel)
      ? value.selectedModel
      : isGenerationModel(value.model)
        ? 'deepseek-flash'
        : value.model,
    ...(imageModel ? { imageModel } : {}),
    ...(videoModel ? { videoModel } : {}),
    ...(audioModel ? { audioModel } : {}),
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
    ...(value.archived === true ? { archived: true } : {}),
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
    allowedTools: Array.isArray(value.allowedTools)
      ? value.allowedTools
          .filter((name): name is string => typeof name === 'string')
          .slice(-20)
      : undefined,
    sources: Array.isArray(value.sources)
      ? value.sources
          .map(parseSource)
          .filter((source): source is StoredSource => Boolean(source))
          .slice(-400)
      : [],
    usage: {
      input: typeof usage.input === 'number' ? usage.input : 0,
      output: typeof usage.output === 'number' ? usage.output : 0,
    },
    ...(typeof value.contextTokens === 'number' && value.contextTokens > 0
      ? { contextTokens: value.contextTokens }
      : {}),
    ...(typeof value.compacted === 'number' && value.compacted > 0
      ? { compacted: Math.min(value.compacted, maxHistoryEntries) }
      : {}),
    ...(lastGeneration ? { lastGeneration } : {}),
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

function relativeToBase(value: string, base: string): string | null {
  const normalizedValue = value.replace(/\\/g, '/')
  const normalizedBase = base.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalizedValue === normalizedBase) return ''
  if (!normalizedValue.startsWith(`${normalizedBase}/`)) return null
  return normalizedValue.slice(normalizedBase.length + 1)
}

function rewriteStoredPath(
  value: string | undefined,
  oldBase: string,
  newBase: string,
  renames: Map<string, string>,
): string | undefined {
  if (!value) return value
  const rel = relativeToBase(value, oldBase)
  if (rel === null) return value
  const mapped = renames.get(rel) ?? rel
  return mapped === '' ? newBase : join(newBase, ...mapped.split('/'))
}

/** Rewrites every stored path below a storage root, including renamed imports. */
export function relocateSessionPaths(
  session: StoredSession,
  oldBase: string,
  newBase: string,
  renames: Map<string, string> = new Map(),
): void {
  for (const file of session.files ?? []) {
    const path = rewriteStoredPath(file.path, oldBase, newBase, renames)
    if (path) file.path = path
  }
  for (const source of session.sources ?? []) {
    const path = rewriteStoredPath(source.path, oldBase, newBase, renames)
    if (path) source.path = path
  }
  for (const reference of session.lastGeneration?.references ?? [])
    reference.path =
      rewriteStoredPath(reference.path, oldBase, newBase, renames) ??
      reference.path
  for (const message of session.ui) {
    for (const part of message.parts) {
      if (part.type !== 'media') continue
      for (const item of part.items) {
        item.path = rewriteStoredPath(item.path, oldBase, newBase, renames)
        item.directory = item.path
          ? dirname(item.path)
          : rewriteStoredPath(
              item.directory,
              oldBase,
              newBase,
              renames,
            )
      }
      for (const reference of part.generation?.references ?? [])
        reference.path =
          rewriteStoredPath(reference.path, oldBase, newBase, renames) ??
          reference.path
    }
  }
}

/** Whether a session still points at a file under the given directory. */
export function sessionReferencesPath(
  session: StoredSession,
  base: string,
): boolean {
  const hit = (value: string | undefined) =>
    Boolean(value && relativeToBase(value, base) !== null)
  return (
    (session.files ?? []).some((file) => hit(file.path)) ||
    (session.sources ?? []).some((source) => hit(source.path)) ||
    (session.lastGeneration?.references ?? []).some((item) =>
      hit(item.path),
    ) ||
    session.ui.some((message) =>
      message.parts.some(
        (part) =>
          part.type === 'media' &&
          (part.items.some((item) => hit(item.path)) ||
            (part.generation?.references ?? []).some((item) =>
              hit(item.path),
            )),
      ),
    )
  )
}

/** Rewrites an agent store on disk before the runtime loads it. */
export async function relocateAgentStoreFile(
  path: string,
  oldBase: string,
  newBase: string,
  renames: Map<string, string> = new Map(),
): Promise<void> {
  const store = await loadAgentStore(path)
  for (const session of store.sessions)
    relocateSessionPaths(session, oldBase, newBase, renames)
  await saveAgentStore(path, store)
}

const legacyGeneratedPrefix = 'mqmz-media://generated/'

function legacyGeneratedName(url: string | undefined): string | undefined {
  if (!url?.startsWith(legacyGeneratedPrefix)) return undefined
  try {
    return decodeURIComponent(url.slice(legacyGeneratedPrefix.length))
  } catch {
    return undefined
  }
}

/** Whether the store still uses the retired flat generated-media folder. */
export function storeReferencesLegacyGenerated(
  store: AgentStore,
  base: string,
): boolean {
  return store.sessions.some(
    (session) =>
      sessionReferencesPath(session, base) ||
      session.ui.some((message) =>
        message.parts.some(
          (part) =>
            part.type === 'media' &&
            part.items.some((item) =>
              Boolean(legacyGeneratedName(item.url)),
            ),
        ),
      ),
  )
}

function migrateLegacyGeneratedSession(
  session: StoredSession,
  oldBase: string,
  newBase: string,
  renames: Map<string, string>,
): void {
  for (const message of session.ui) {
    for (const part of message.parts) {
      if (part.type !== 'media') continue
      for (const item of part.items) {
        const name = legacyGeneratedName(item.url)
        if (!name) continue
        const mapped = renames.get(name) ?? name
        const path = join(newBase, ...mapped.split('/'))
        item.path = path
        item.directory = dirname(path)
        item.url = mediaUrl(item.id)
        session.sources ??= []
        if (!session.sources.some((source) => source.id === item.id))
          session.sources.unshift({
            id: item.id,
            name: item.name || basename(path),
            path,
            kind: 'artifact',
          })
      }
    }
  }
  relocateSessionPaths(session, oldBase, newBase, renames)
}

/** Moves legacy flat generated media into the agent store's file tree. */
export async function migrateLegacyGeneratedStore(
  path: string,
  oldBase: string,
  newBase: string,
  renames: Map<string, string> = new Map(),
): Promise<void> {
  const store = await loadAgentStore(path)
  for (const session of store.sessions)
    migrateLegacyGeneratedSession(session, oldBase, newBase, renames)
  await saveAgentStore(path, store)
}

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
