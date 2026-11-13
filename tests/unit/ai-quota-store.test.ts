import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  emptyAiQuotaProvider,
  emptyAiQuotaState,
  type AiQuotaState,
} from '../../src/shared/ai-quota'
import {
  loadAiQuotaCache,
  saveAiQuotaCache,
} from '../../src/main/ai-quota-store'

function populated(): AiQuotaState {
  const state = emptyAiQuotaState()
  state.openai = {
    configured: true,
    status: 'ready',
    windows: [
      { key: 'fiveHour', label: '5 小时', remaining: 75 },
      { key: 'week', label: '本周', remaining: 40 },
    ],
    plan: 'plus',
    updatedAt: 100,
  }
  state.deepseek = {
    configured: true,
    status: 'ready',
    windows: [],
    balance: {
      currency: 'CNY',
      total: 41.36,
      granted: 0,
      toppedUp: 41.36,
      available: true,
    },
    updatedAt: 100,
  }
  state.visible = true
  return state
}

describe('AI quota cache', () => {
  test('restores the last successful values as stale', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-ai-quota-cache-'))
    const path = join(directory, 'cache.json')
    const state = populated()
    await saveAiQuotaCache(path, state)
    const raw = await readFile(path, 'utf8')
    expect(raw).not.toMatch(/access_token|apiKey|secret/i)
    const loaded = await loadAiQuotaCache(path)
    expect(loaded.visible).toBe(true)
    expect(loaded.openai.status).toBe('stale')
    expect(loaded.openai.windows).toEqual(state.openai.windows)
    expect(loaded.deepseek.status).toBe('stale')
    expect(loaded.deepseek.balance?.total).toBe(41.36)
    await rm(directory, { recursive: true, force: true })
  })

  test('ignores a corrupt cache and an empty provider', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-ai-quota-cache-'))
    const path = join(directory, 'cache.json')
    await writeFile(path, '{not json')
    const corrupt = await loadAiQuotaCache(path)
    expect(corrupt).toEqual(emptyAiQuotaState())

    await saveAiQuotaCache(path, {
      ...emptyAiQuotaState(),
      openai: {
        ...emptyAiQuotaProvider(),
        configured: true,
        status: 'error',
        windows: [],
      },
    })
    const empty = await loadAiQuotaCache(path)
    expect(empty.openai.configured).toBe(true)
    expect(empty.openai.status).toBe('error')
    expect(empty.visible).toBe(true)
    await rm(directory, { recursive: true, force: true })
  })
})
