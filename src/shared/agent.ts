/** Shared agent types for the main-process harness and the panel view. */

import type { DeepSeekModel } from './deepseek'

export const agentModes = ['plan', 'build'] as const
export type AgentMode = (typeof agentModes)[number]

export const agentModeLabels: Record<AgentMode, string> = {
  plan: '计划',
  build: '执行',
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
}

export type AgentPart = AgentTextPart | AgentToolPart

export type AgentMessageView = {
  id: string
  role: 'user' | 'assistant'
  parts: AgentPart[]
}

export type AgentSessionSummary = {
  id: string
  title: string
  mode: AgentMode
  workspace: string | null
  updatedAt: number
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
  sessionId: string | null
  mode: AgentMode
  model: DeepSeekModel
  workspace: string | null
  messages: AgentMessageView[]
  approval: AgentApproval | null
  usage: AgentUsage
  error?: string
}

export const agentEmptyState: AgentState = {
  configured: false,
  busy: false,
  sessions: [],
  sessionId: null,
  mode: 'build',
  model: 'deepseek-flash',
  workspace: null,
  messages: [],
  approval: null,
  usage: { input: 0, output: 0 },
}
