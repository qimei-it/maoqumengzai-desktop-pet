/** Models exposed by the agent composer and their generation capabilities. */

export type AgentProvider = 'deepseek' | 'minimax' | 'volcano'
export type AgentModelKind = 'text' | 'image' | 'video' | 'speech'

export type AgentModelInfo = {
  id: string
  label: string
  provider: AgentProvider
  kind: AgentModelKind
  /** Whether the model exposes a reasoning-effort setting. */
  reasoning: boolean
  /** Text context window in tokens; omitted for generation models. */
  contextWindow?: number
}

export const agentModels: readonly AgentModelInfo[] = [
  {
    id: 'deepseek-flash',
    label: 'DeepSeek-V4.1-Flash',
    provider: 'deepseek',
    kind: 'text',
    reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek-V4-Pro',
    provider: 'deepseek',
    kind: 'text',
    reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'MiniMax-M3.1-Flash',
    label: 'MiniMax-M3.1-Flash',
    provider: 'minimax',
    kind: 'text',
    reasoning: true,
    contextWindow: 1_000_000,
  },
  {
    id: 'MiniMax-M3',
    label: 'MiniMax-M3',
    provider: 'minimax',
    kind: 'text',
    reasoning: false,
    contextWindow: 1_000_000,
  },
  {
    id: 'doubao-seed-2-1-pro-260915',
    label: 'Doubao Seed 2.1 Pro',
    provider: 'volcano',
    kind: 'text',
    reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'MiniMax-H3',
    label: 'MiniMax-H3',
    provider: 'minimax',
    kind: 'video',
    reasoning: false,
  },
  {
    id: 'MiniMax-H3-Image',
    label: 'MiniMax-H3-Image',
    provider: 'minimax',
    kind: 'image',
    reasoning: false,
  },
  {
    id: 'Doubao-Seedream-5.5',
    label: 'Doubao Seedream 5.5',
    provider: 'volcano',
    kind: 'image',
    reasoning: false,
  },
  {
    id: 'speech-2.8-hd',
    label: 'Speech-2.8-HD',
    provider: 'minimax',
    kind: 'speech',
    reasoning: false,
  },
  {
    id: 'speech-2.8-turbo',
    label: 'Speech-2.8-Turbo',
    provider: 'minimax',
    kind: 'speech',
    reasoning: false,
  },
] as const

export type AgentModelId = (typeof agentModels)[number]['id']

export const agentTextModels = agentModels.filter(
  (model) => model.kind === 'text',
)
export const agentImageModels = agentModels.filter(
  (model) => model.kind === 'image',
)

export const agentProviderLabels: Record<AgentProvider, string> = {
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  volcano: '火山方舟',
}

export const agentModelLabels: Record<string, string> = Object.fromEntries(
  agentModels.map((model) => [model.id, model.label]),
)

export function modelInfo(id: string): AgentModelInfo | undefined {
  return agentModels.find((model) => model.id === id)
}

export function isAgentModelId(value: unknown): value is AgentModelId {
  return typeof value === 'string' && agentModels.some((model) => model.id === value)
}

export function isMiniMaxModel(id: string): boolean {
  return modelInfo(id)?.provider === 'minimax'
}

export function isGenerationModel(id: string): boolean {
  const kind = modelInfo(id)?.kind
  return kind === 'image' || kind === 'video' || kind === 'speech'
}

export function isTextModel(id: string): boolean {
  return modelInfo(id)?.kind === 'text'
}
