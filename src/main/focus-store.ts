import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { focusDurations } from '../shared/focus'

const todoSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1).max(200),
    done: z.boolean(),
  })
  .strict()

const schema = z
  .object({
    version: z.literal(1),
    phase: z.enum(['focus', 'short', 'long']),
    running: z.boolean(),
    endsAt: z.number().finite().nullable(),
    remaining: z.number().int().min(0).max(24 * 60 * 60),
    completed: z.number().int().min(0).max(100_000),
    water: z.boolean(),
    waterNextAt: z.number().finite().nullable(),
    todos: z.array(todoSchema).max(500),
  })
  .strict()

export type FocusData = z.infer<typeof schema>

export const defaultFocus = (): FocusData => ({
  version: 1,
  phase: 'focus',
  running: false,
  endsAt: null,
  remaining: focusDurations.focus,
  completed: 0,
  water: true,
  waterNextAt: null,
  todos: [],
})

let queue = Promise.resolve()

export async function loadFocusFile(path: string): Promise<FocusData> {
  try {
    return schema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return defaultFocus()
  }
}

export async function saveFocusFile(
  path: string,
  data: FocusData,
): Promise<void> {
  const value = JSON.stringify(schema.parse(data))
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, value, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
