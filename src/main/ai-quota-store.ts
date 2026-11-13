/** Local, secret-free cache of the last successful AI quota snapshot. */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  emptyAiQuotaState,
  type AiQuotaState,
} from '../shared/ai-quota'

const windowSchema = z
  .object({
    key: z.enum(['fiveHour', 'week']),
    label: z.string().max(40),
    remaining: z.number().finite().min(0).max(100),
    resetAt: z.number().finite().optional(),
  })
  .strict()

const balanceSchema = z
  .object({
    currency: z.string().max(8),
    total: z.number().finite(),
    granted: z.number().finite(),
    toppedUp: z.number().finite(),
    available: z.boolean(),
  })
  .strict()

const providerSchema = z
  .object({
    configured: z.boolean(),
    status: z.enum(['missing', 'loading', 'ready', 'stale', 'error']),
    windows: z.array(windowSchema).max(4),
    balance: balanceSchema.optional(),
    plan: z.string().max(40).optional(),
    error: z.string().max(500).optional(),
    updatedAt: z.number().finite().optional(),
  })
  .strict()

const cacheSchema = z
  .object({
    version: z.literal(1),
    openai: providerSchema,
    deepseek: providerSchema,
  })
  .strict()

export async function loadAiQuotaCache(path: string): Promise<AiQuotaState> {
  try {
    const stored = cacheSchema.parse(
      JSON.parse(await readFile(path, 'utf8')),
    )
    const markStale = (provider: typeof stored.openai) =>
      provider.configured &&
      (provider.windows.length > 0 || Boolean(provider.balance))
        ? { ...provider, status: 'stale' as const, error: undefined }
        : provider
    const openai = markStale(stored.openai)
    const deepseek = markStale(stored.deepseek)
    return {
      visible: openai.configured || deepseek.configured,
      loading: false,
      openai,
      deepseek,
    }
  } catch {
    return emptyAiQuotaState()
  }
}

let queue = Promise.resolve()

export async function saveAiQuotaCache(
  path: string,
  state: AiQuotaState,
): Promise<void> {
  const value = JSON.stringify(
    cacheSchema.parse({
      version: 1,
      openai: state.openai,
      deepseek: state.deepseek,
    }),
  )
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, value, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
