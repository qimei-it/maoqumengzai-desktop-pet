import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  clipboardDefaults,
  clipboardTextLimit,
  type ClipboardConfig,
  type ClipboardKind,
} from '../shared/clipboard'

const entrySchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['text', 'image']),
    text: z.string().max(clipboardTextLimit).default(''),
    thumbnail: z.string().max(500_000).default(''),
    imagePath: z.string().max(1024).nullable().default(null),
    hash: z.string().min(1).max(128),
    createdAt: z.number().finite(),
    pinned: z.boolean().default(false),
  })
  .strict()

const configSchema = z
  .object({
    enabled: z.boolean(),
    maxItems: z.number().int().min(10).max(500),
    retentionDays: z.number().int().min(0).max(3650),
    ignoreSensitive: z.boolean(),
  })
  .strict()

const schema = z
  .object({
    version: z.literal(1),
    config: configSchema,
    entries: z.array(entrySchema).max(500),
  })
  .strict()

export type ClipboardStoredEntry = z.infer<typeof entrySchema> & {
  kind: ClipboardKind
}
export type ClipboardData = {
  version: 1
  config: ClipboardConfig
  entries: ClipboardStoredEntry[]
}

export const defaultClipboard = (): ClipboardData => ({
  version: 1,
  config: { ...clipboardDefaults },
  entries: [],
})

export async function loadClipboardFile(path: string): Promise<ClipboardData> {
  try {
    return schema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return defaultClipboard()
  }
}

let queue = Promise.resolve()

export async function saveClipboardFile(
  path: string,
  data: ClipboardData,
): Promise<void> {
  const value = JSON.stringify(schema.parse(data))
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, value, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
