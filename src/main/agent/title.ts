/** Generates short conversation titles without punctuation. */

import { maxAgentNameChars } from '../../shared/agent'
import type { streamChat } from './provider'

const titlePrefix = /^\s*(?:标题|title)\s*[:：]\s*/i
const cjkGap = /(?<=[\u3400-\u9fff\uf900-\ufaff])\s+(?=[\u3400-\u9fff\uf900-\ufaff])/g

export function nameLength(value: string): number {
  return Array.from(value.trim()).length
}

/** Keeps a title on one line without punctuation and within the shared limit. */
export function cleanSessionTitle(value: string): string {
  const cleaned = value
    .replace(/```[a-zA-Z]*\s*/g, ' ')
    .replace(titlePrefix, '')
    .replace(/[\p{P}`]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(cjkGap, '')
    .trim()
  return Array.from(cleaned).slice(0, maxAgentNameChars).join('').trim()
}

/** One cheap Flash request; failures fall back to the local title. */
export async function generateSessionTitle(options: {
  stream: typeof streamChat
  key: string
  prompt: string
  signal: AbortSignal
}): Promise<string> {
  const result = await options.stream(options.key, {
    model: 'deepseek-flash',
    reasoning: 'off',
    maxTokens: 48,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: [
          '你是会话标题生成器。根据用户的第一条消息生成一个具体、简短的会话标题。',
          `要求：最多 ${maxAgentNameChars} 个字符；只输出标题本身；不要标点符号、引号、括号或省略号；不要“标题：”前缀；不要解释。`,
        ].join('\n'),
      },
      { role: 'user', content: options.prompt.slice(0, 1_000) },
    ],
    signal: options.signal,
  })
  return cleanSessionTitle(result.text)
}
