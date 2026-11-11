import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { focusDurations } from '../shared/focus'

const todoSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1).max(200),
    done: z.boolean(),
    listId: z.string().uuid().nullable().default(null),
    today: z.boolean().default(false),
    urgent: z.boolean().default(false),
    flagged: z.boolean().default(false),
  })
  .strict()

const listSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(40),
    groupId: z.string().uuid().nullable().default(null),
  })
  .strict()

const groupSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(40),
  })
  .strict()

const sessionSchema = z
  .object({
    id: z.string().uuid(),
    endedAt: z.number().finite(),
    minutes: z.number().int().min(1).max(240),
  })
  .strict()

const waterEntrySchema = z
  .object({
    id: z.string().uuid(),
    at: z.number().finite(),
  })
  .strict()

const schema = z
  .object({
    version: z.literal(2),
    phase: z.enum(['focus', 'short', 'long']),
    running: z.boolean(),
    endsAt: z.number().finite().nullable(),
    remaining: z.number().int().min(0).max(24 * 60 * 60),
    completed: z.number().int().min(0).max(100_000),
    water: z.boolean(),
    waterInterval: z.number().int().min(5).max(240).default(60),
    waterStart: z.number().int().min(0).max(23).default(9),
    waterEnd: z.number().int().min(1).max(24).default(22),
    waterNextAt: z.number().finite().nullable(),
    todos: z.array(todoSchema).max(500),
    todoLists: z.array(listSchema).max(100),
    todoGroups: z.array(groupSchema).max(40),
    sessions: z.array(sessionSchema).max(300).default([]),
    waterLog: z.array(waterEntrySchema).max(500).default([]),
  })
  .strict()

/** Version 1 stored flat todos without lists, flags or smart categories. */
const schemaV1 = z
  .object({
    version: z.literal(1),
    phase: z.enum(['focus', 'short', 'long']),
    running: z.boolean(),
    endsAt: z.number().finite().nullable(),
    remaining: z.number().int().min(0).max(24 * 60 * 60),
    completed: z.number().int().min(0).max(100_000),
    water: z.boolean(),
    waterInterval: z.number().int().min(5).max(240).default(60),
    waterStart: z.number().int().min(0).max(23).default(9),
    waterEnd: z.number().int().min(1).max(24).default(22),
    waterNextAt: z.number().finite().nullable(),
    todos: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            text: z.string().min(1).max(200),
            done: z.boolean(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict()

export type FocusData = z.infer<typeof schema>
export type FocusTodoData = z.infer<typeof todoSchema>
export type TodoListData = z.infer<typeof listSchema>
export type TodoGroupData = z.infer<typeof groupSchema>

export const defaultFocus = (): FocusData => ({
  version: 2,
  phase: 'focus',
  running: false,
  endsAt: null,
  remaining: focusDurations.focus,
  completed: 0,
  water: true,
  waterInterval: 60,
  waterStart: 9,
  waterEnd: 22,
  waterNextAt: null,
  todos: [],
  todoLists: [],
  todoGroups: [],
  sessions: [],
  waterLog: [],
})

export function parseFocus(raw: unknown): FocusData {
  const current = schema.safeParse(raw)
  if (current.success) return current.data
  const legacy = schemaV1.safeParse(raw)
  if (!legacy.success) return defaultFocus()
  return {
    ...legacy.data,
    version: 2,
    todos: legacy.data.todos.map((todo) => ({
      ...todo,
      listId: null,
      today: false,
      urgent: false,
      flagged: false,
    })),
    todoLists: [],
    todoGroups: [],
    sessions: [],
    waterLog: [],
  }
}

let queue = Promise.resolve()

export async function loadFocusFile(path: string): Promise<FocusData> {
  try {
    return parseFocus(JSON.parse(await readFile(path, 'utf8')))
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
