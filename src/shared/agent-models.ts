/** Models exposed by the agent composer and their generation capabilities. */

import { hasVolcanoSeedreamModel, isVolcanoImageModel } from './volcano'

export type AgentProvider = 'deepseek' | 'minimax' | 'volcano'
export type AgentModelKind = 'text' | 'image' | 'video' | 'speech'
export type AgentModelBrand = 'deepseek' | 'minimax' | 'doubao' | 'kimi' | 'zhipu' | 'generic'

export type AgentModelInfo = {
  id: string
  label: string
  provider: AgentProvider
  kind: AgentModelKind
  /** Whether the model exposes a reasoning-effort setting. */
  reasoning: boolean
  /** Some models always think and cannot turn reasoning off. */
  reasoningRequired?: boolean
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
    id: 'doubao-seed-2-1-lite-260915',
    label: 'Doubao Seed 2.1 Lite',
    provider: 'volcano',
    kind: 'text',
    reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'doubao-seed-2-1-turbo-260628',
    label: 'Doubao Seed 2.1 Turbo',
    provider: 'volcano',
    kind: 'text',
    reasoning: true,
    contextWindow: 262_144,
  },
  {
    id: 'doubao-seed-evolving',
    label: 'Doubao Seed Evolving',
    provider: 'volcano',
    kind: 'text',
    reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'doubao-seed-2-0-lite-260428',
    label: 'Doubao Seed 2.0 Lite',
    provider: 'volcano',
    kind: 'text',
    reasoning: true,
    contextWindow: 262_144,
  },
  {
    id: 'doubao-seed-2-0-mini-260428',
    label: 'Doubao Seed 2.0 Mini',
    provider: 'volcano',
    kind: 'text',
    reasoning: true,
    contextWindow: 262_144,
  },
  {
    id: 'kimi-k3-1-pro-261024',
    label: 'Kimi-K3.1-Pro',
    provider: 'volcano', kind: 'text', reasoning: true, reasoningRequired: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'deepseek-v4-1-flash-economy-261017',
    label: 'DeepSeek-V4.1-Flash经济版',
    provider: 'volcano', kind: 'text', reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'deepseek-v4-1-flash-261017',
    label: 'DeepSeek-V4.1-Flash',
    provider: 'volcano', kind: 'text', reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'glm-5-3-flash-260828',
    label: 'GLM-5.3-Flash',
    provider: 'volcano', kind: 'text', reasoning: true, reasoningRequired: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'deepseek-v4-pro-ga-260813',
    label: 'DeepSeek-V4-Pro正式版',
    provider: 'volcano', kind: 'text', reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'deepseek-v4-flash-ga-260731',
    label: 'DeepSeek-V4-Flash正式版',
    provider: 'volcano', kind: 'text', reasoning: true,
    contextWindow: 1_048_576,
  },
  {
    id: 'glm-5-2-260617',
    label: 'GLM-5.2',
    provider: 'volcano', kind: 'text', reasoning: true,
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

/** The hosting provider and the model's brand can be different. */
export function agentModelBrand(model: AgentModelInfo): AgentModelBrand {
  const id = model.id.toLowerCase()
  if (id.startsWith('deepseek-')) return 'deepseek'
  if (id.startsWith('kimi-')) return 'kimi'
  if (id.startsWith('glm-')) return 'zhipu'
  if (id.startsWith('doubao-')) return 'doubao'
  if (model.provider === 'minimax') return 'minimax'
  if (model.provider === 'deepseek') return 'deepseek'
  return 'generic'
}

/** Migrate only the removed Ark IDs; the standalone DeepSeek ID is unaffected. */
export function migrateRemovedVolcanoModel(value: unknown): unknown {
  if (value === 'deepseek-v4-pro-260425') return 'deepseek-v4-pro-ga-260813'
  if (value === 'doubao-seed-2-0-code-preview-260215' || value === 'doubao-seed-2-0-pro-260215')
    return 'doubao-seed-2-1-pro-260915'
  return value
}

/** The Key preview lists only integrated models returned by Ark. */
export function integratedVolcanoModels(ids: readonly string[]): Array<{ id: string; label: string }> {
  return agentModels.flatMap((model) => {
    if (model.provider !== 'volcano') return []
    if (model.kind === 'text') return ids.includes(model.id) ? [{ id: model.id, label: model.label }] : []
    if (model.kind === 'image') {
      const id = ids.find((candidate) => hasVolcanoSeedreamModel([candidate]))
      return id ? [{ id, label: model.label }] : []
    }
    return []
  })
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

/** Whether a supported model is covered by the Ark key's listed model IDs. */
export function volcanoModelListed(
  model: AgentModelInfo,
  ids: readonly string[],
): boolean {
  if (model.provider !== 'volcano') return false
  if (model.kind === 'image') return ids.some((id) => isVolcanoImageModel(id))
  return ids.includes(model.id)
}

export function isTextModel(id: string): boolean {
  return modelInfo(id)?.kind === 'text'
}
