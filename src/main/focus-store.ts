import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { focusDurations } from '../shared/focus'
import {
  defaultTodoListIcon,
  todoListColors,
  todoRepeats,
} from '../shared/protocol'
import { endOfLocalDay } from '../shared/todo-time'

const attachmentSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    path: z.string().min(1).max(1024),
    size: z.number().int().min(0),
  })
  .strict()

const tagSchema = z.string().trim().min(1).max(20)

const todoSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1).max(200),
    done: z.boolean(),
    listId: z.string().uuid().nullable().default(null),
    dueAt: z.number().finite().nullable().default(null),
    urgent: z.boolean().default(false),
    flagged: z.boolean().default(false),
    notes: z.string().max(2000).default(''),
    tags: z.array(tagSchema).max(20).default([]),
    repeat: z.enum(todoRepeats).default('none'),
    repeatFromId: z.string().uuid().nullable().default(null),
  })
  .strict()

const listSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(40),
    groupId: z.string().uuid().nullable().default(null),
    color: z.enum(todoListColors).default('blue'),
    icon: z.string().min(1).max(80).default(defaultTodoListIcon),
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

const baseShape = {
  phase: z.enum(['focus', 'short', 'long']),
  running: z.boolean(),
  endsAt: z.number().finite().nullable(),
  remaining: z.number().int().min(0).max(24 * 60 * 60),
  completed: z.number().int().min(0).max(100_000),
  focusMinutes: z.number().int().min(1).max(180).default(25),
  shortMinutes: z.number().int().min(1).max(180).default(5),
  longMinutes: z.number().int().min(1).max(180).default(15),
  focusSeconds: z.number().int().min(0).max(59).default(0),
  shortSeconds: z.number().int().min(0).max(59).default(0),
  longSeconds: z.number().int().min(0).max(59).default(0),
  water: z.boolean(),
  waterInterval: z.number().int().min(5).max(240).default(60),
  waterStart: z.number().int().min(0).max(23).default(9),
  waterEnd: z.number().int().min(1).max(24).default(22),
  waterNextAt: z.number().finite().nullable(),
  waterGoal: z.number().int().min(1).max(30).default(8),
  breakSitting: z.boolean().default(false),
  breakSittingInterval: z.number().int().min(5).max(240).default(45),
  breakSittingNextAt: z.number().finite().nullable().default(null),
  breakEyes: z.boolean().default(false),
  breakEyesInterval: z.number().int().min(5).max(240).default(20),
  breakEyesNextAt: z.number().finite().nullable().default(null),
  breakDnd: z.boolean().default(true),
  breakDndStart: z.number().int().min(0).max(23).default(22),
  breakDndEnd: z.number().int().min(1).max(24).default(8),
}

const schema = z
  .object({
    version: z.literal(5),
    ...baseShape,
    todos: z.array(todoSchema).max(500),
    todoLists: z.array(listSchema).max(100),
    todoGroups: z.array(groupSchema).max(40),
    todoTags: z.array(tagSchema).max(100).default([]),
    sessions: z.array(sessionSchema).max(300).default([]),
    waterLog: z.array(waterEntrySchema).max(500).default([]),
  })
  .strict()

/** Version 4 briefly supported local attachment records. */
const todoSchemaV4 = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1).max(200),
    done: z.boolean(),
    listId: z.string().uuid().nullable().default(null),
    dueAt: z.number().finite().nullable().default(null),
    urgent: z.boolean().default(false),
    flagged: z.boolean().default(false),
    notes: z.string().max(2000).default(''),
    tags: z.array(tagSchema).max(20).default([]),
    attachments: z.array(attachmentSchema).max(20).default([]),
  })
  .strict()

const schemaV4 = z
  .object({
    version: z.literal(4),
    ...baseShape,
    todos: z.array(todoSchemaV4).max(500),
    todoLists: z.array(listSchema).max(100),
    todoGroups: z.array(groupSchema).max(40),
    todoTags: z.array(tagSchema).max(100).default([]),
    sessions: z.array(sessionSchema).max(300).default([]),
    waterLog: z.array(waterEntrySchema).max(500).default([]),
  })
  .strict()

/** Version 3 introduced due dates but had no notes or tags. */
const todoSchemaV3 = z
  .object({
    id: z.string().uuid(),
    text: z.string().min(1).max(200),
    done: z.boolean(),
    listId: z.string().uuid().nullable().default(null),
    dueAt: z.number().finite().nullable().default(null),
    urgent: z.boolean().default(false),
    flagged: z.boolean().default(false),
  })
  .strict()

const schemaV3 = z
  .object({
    version: z.literal(3),
    ...baseShape,
    todos: z.array(todoSchemaV3).max(500),
    todoLists: z.array(listSchema).max(100),
    todoGroups: z.array(groupSchema).max(40),
    sessions: z.array(sessionSchema).max(300).default([]),
    waterLog: z.array(waterEntrySchema).max(500).default([]),
  })
  .strict()

/** Version 2 used a boolean `today` flag instead of a real due timestamp. */
const todoSchemaV2 = z
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

const schemaV2 = z
  .object({
    version: z.literal(2),
    ...baseShape,
    todos: z.array(todoSchemaV2).max(500),
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
    ...baseShape,
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
  version: 5,
  phase: 'focus',
  running: false,
  endsAt: null,
  remaining: focusDurations.focus,
  completed: 0,
  focusMinutes: 25,
  shortMinutes: 5,
  longMinutes: 15,
  focusSeconds: 0,
  shortSeconds: 0,
  longSeconds: 0,
  water: true,
  waterInterval: 60,
  waterStart: 9,
  waterEnd: 22,
  waterNextAt: null,
  waterGoal: 8,
  breakSitting: false,
  breakSittingInterval: 45,
  breakSittingNextAt: null,
  breakEyes: false,
  breakEyesInterval: 20,
  breakEyesNextAt: null,
  breakDnd: true,
  breakDndStart: 22,
  breakDndEnd: 8,
  todos: [],
  todoLists: [],
  todoGroups: [],
  todoTags: [],
  sessions: [],
  waterLog: [],
})

function emptyTodoExtras() {
  return {
    notes: '',
    tags: [],
    repeat: 'none' as const,
    repeatFromId: null,
  }
}

function migrateV4(data: z.infer<typeof schemaV4>): FocusData {
  return {
    ...data,
    version: 5,
    todos: data.todos.map(({ attachments, ...todo }) => ({
      ...todo,
      repeat: 'none',
      repeatFromId: null,
    })),
  }
}

function migrateV3(data: z.infer<typeof schemaV3>): FocusData {
  return {
    ...data,
    version: 5,
    todos: data.todos.map((todo) => ({ ...todo, ...emptyTodoExtras() })),
    todoTags: [],
  }
}

function migrateV2(data: z.infer<typeof schemaV2>): FocusData {
  const now = Date.now()
  return {
    ...data,
    version: 5,
    todos: data.todos.map(({ today, ...todo }) => ({
      ...todo,
      dueAt: today ? endOfLocalDay(now) : null,
      ...emptyTodoExtras(),
    })),
    todoTags: [],
  }
}

function migrateV1(data: z.infer<typeof schemaV1>): FocusData {
  return {
    ...data,
    version: 5,
    todos: data.todos.map((todo) => ({
      ...todo,
      listId: null,
      dueAt: null,
      urgent: false,
      flagged: false,
      ...emptyTodoExtras(),
    })),
    todoLists: [],
    todoGroups: [],
    todoTags: [],
    sessions: [],
    waterLog: [],
  }
}

export function parseFocus(raw: unknown): FocusData {
  const current = schema.safeParse(raw)
  if (current.success) return current.data
  const version4 = schemaV4.safeParse(raw)
  if (version4.success) return migrateV4(version4.data)
  const version3 = schemaV3.safeParse(raw)
  if (version3.success) return migrateV3(version3.data)
  const version2 = schemaV2.safeParse(raw)
  if (version2.success) return migrateV2(version2.data)
  const version1 = schemaV1.safeParse(raw)
  if (version1.success) return migrateV1(version1.data)
  return defaultFocus()
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
