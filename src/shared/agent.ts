/** Shared agent types for the main-process harness and the panel view. */

import type { DeepSeekModel } from './deepseek'

export const agentModes = ['plan', 'build'] as const
export type AgentMode = (typeof agentModes)[number]

export const agentModeLabels: Record<AgentMode, string> = {
  plan: '计划',
  build: '执行',
}

export const agentReasoningLevels = ['off', 'low', 'high', 'max'] as const
export type AgentReasoning = (typeof agentReasoningLevels)[number]
export const agentReasoningLabels: Record<AgentReasoning, string> = {
  off: '关闭',
  low: '低',
  high: '高',
  max: '最高',
}

export type AgentToolStatus =
  | 'running'
  | 'awaiting'
  | 'done'
  | 'error'
  | 'denied'

export type AgentTextPart = { type: 'text'; text: string }

export type AgentToolPart = {
  type: 'tool'
  id: string
  name: string
  title: string
  args: string
  status: AgentToolStatus
  output?: string
  artifacts?: AgentArtifactView[]
}

export type AgentArtifactKind =
  | 'document'
  | 'audio'
  | 'image'
  | 'archive'
  | 'other'

export type AgentArtifactView = {
  id: string
  name: string
  kind: AgentArtifactKind
  size?: number
}

export type AgentPart = AgentTextPart | AgentToolPart

export const agentAttachmentKinds = [
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
] as const
export type AgentAttachmentKind = (typeof agentAttachmentKinds)[number]

/** How the attachment reaches the model. */
export const agentAttachmentModes = [
  'text',
  'vision',
  'document',
  'audio',
] as const
export type AgentAttachmentMode = (typeof agentAttachmentModes)[number]

export type AgentAttachmentView = {
  id: string
  name: string
  size: number
  /** True when the original source can still be saved locally. */
  canSave?: boolean
}

export type AgentSkillView = {
  id: string
  name: string
  description: string
  enabled: boolean
}

export type AgentSkillDetail = AgentSkillView & {
  content: string
}

export type AgentAttachmentPick = AgentAttachmentView & {
  kind: AgentAttachmentKind
  mode: AgentAttachmentMode
  /** True when the model must receive an uploaded image or document. */
  needsModelUpload: boolean
  /** One-line status shown in diagnostics and tooltips. */
  detail?: string
  /** Last upload/transcription failure for this draft. */
  uploadError?: string
  truncated: boolean
}

export type AgentAttachmentUpload = {
  path: string
  purpose: 'user_data' | 'text_recognition' | 'rich_layout_recognition'
  fileId?: string
  expiresAt?: number | null
}

export type AgentAttachmentInput = AgentAttachmentPick & {
  /** Original local path for later download/save. */
  sourcePath?: string
  /** Extracted local text. */
  text?: string
  /** Files that need a DeepSeek Files API upload. */
  upload?: AgentAttachmentUpload[]
  /** Temporary 16 kHz WAV chunks that need speech recognition. */
  audio?: string[]
}

export type AgentMessageView = {
  id: string
  role: 'user' | 'assistant'
  parts: AgentPart[]
  attachments?: AgentAttachmentView[]
}

export type AgentSessionSummary = {
  id: string
  title: string
  mode: AgentMode
  workspace: string | null
  projectId: string | null
  pinned: boolean
  updatedAt: number
}

export type AgentProjectView = {
  id: string
  name: string
  workspace: string
  pinned: boolean
  createdAt: number
}

export type AgentApproval = {
  id: string
  name: string
  title: string
  args: string
  reason: string
}

export type AgentUsage = {
  input: number
  output: number
}

/** Active pet persona. Only shapes tone; it never changes task rules. */
export type AgentPetProfile = {
  id: string
  name: string
  species?: string
  personality?: string
}

export type AgentState = {
  configured: boolean
  busy: boolean
  sessions: AgentSessionSummary[]
  projects: AgentProjectView[]
  sessionId: string | null
  mode: AgentMode
  model: DeepSeekModel
  reasoning: AgentReasoning
  workspace: string | null
  messages: AgentMessageView[]
  approval: AgentApproval | null
  usage: AgentUsage
  /** Older messages folded into the context summary for this session. */
  contextCompacted?: number
  /** Offers a retry or continue action for the last turn. */
  retryLabel?: '重试' | '继续'
  error?: string
}

export const agentEmptyState: AgentState = {
  configured: false,
  busy: false,
  sessions: [],
  projects: [],
  sessionId: null,
  mode: 'build',
  model: 'deepseek-flash',
  reasoning: 'high',
  workspace: null,
  messages: [],
  approval: null,
  usage: { input: 0, output: 0 },
}
