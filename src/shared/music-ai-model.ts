/**
 * 文本模型解析：音乐互动与其它按「默认对话模型」取模型的功能共用。
 *
 * 规则：
 * 1. 默认对话模型指向的供应商有 Key → 用它；
 * 2. 否则按模型注册表顺序，找第一个有 Key 的文本模型；
 * 3. 都没有 → 返回 undefined，由调用方提示用户配置。
 */

import {
  agentModels,
  modelInfo,
  type AgentModelId,
  type AgentProvider,
} from './agent-models'

export type ProviderKeys = {
  deepseek?: string
  minimax?: string
  volcano?: string
}

export type TextModelChoice = {
  provider: AgentProvider
  model: AgentModelId
  key: string
}

export function resolveTextModel(
  preferred: string,
  keys: ProviderKeys,
): TextModelChoice | undefined {
  const keyFor = (provider: AgentProvider): string | undefined => {
    if (provider === 'minimax') return keys.minimax
    if (provider === 'volcano') return keys.volcano
    return keys.deepseek
  }
  if (preferred) {
    const info = modelInfo(preferred)
    if (info && info.kind === 'text') {
      const key = keyFor(info.provider)
      if (key) {
        return { provider: info.provider, model: info.id, key }
      }
    }
  }
  for (const model of agentModels) {
    if (model.kind !== 'text') continue
    const key = keyFor(model.provider)
    if (key) return { provider: model.provider, model: model.id, key }
  }
  return undefined
}
