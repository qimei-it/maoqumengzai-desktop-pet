import { describe, expect, test } from 'vitest'
import { defaultFocus, parseFocus } from '../../src/main/focus-store'

const base = {
  phase: 'focus',
  running: false,
  endsAt: null,
  remaining: 1500,
  completed: 0,
  water: true,
  waterInterval: 60,
  waterStart: 9,
  waterEnd: 22,
  waterNextAt: null,
}
const todoId = '3f0d9f6e-6a2b-4c1d-9e8f-2a1b3c4d5e6f'
const listId = '4a1e8f7d-5c3b-4d2e-8f9a-1b2c3d4e5f60'
const groupId = '5b2f9a8e-6d4c-4e3f-9a1b-2c3d4e5f6071'

describe('todo store', () => {
  test('migrates version 1 todos into the list and flag model', () => {
    const migrated = parseFocus({
      ...base,
      version: 1,
      todos: [{ id: todoId, text: '旧待办', done: true }],
    })
    expect(migrated.version).toBe(2)
    expect(migrated.todos).toEqual([
      {
        id: todoId,
        text: '旧待办',
        done: true,
        listId: null,
        today: false,
        urgent: false,
        flagged: false,
      },
    ])
    expect(migrated.todoLists).toEqual([])
    expect(migrated.todoGroups).toEqual([])
  })

  test('keeps custom groups, lists and smart categories', () => {
    const parsed = parseFocus({
      ...base,
      version: 2,
      todos: [
        {
          id: todoId,
          text: '今天处理',
          done: false,
          listId,
          today: true,
          urgent: true,
          flagged: true,
        },
      ],
      todoLists: [{ id: listId, name: '工作', groupId }],
      todoGroups: [{ id: groupId, name: '生活' }],
    })
    expect(parsed.todos[0]).toMatchObject({
      listId,
      today: true,
      urgent: true,
      flagged: true,
    })
    expect(parsed.todoLists[0]).toEqual({
      id: listId,
      name: '工作',
      groupId,
    })
    expect(parsed.todoGroups[0]).toEqual({ id: groupId, name: '生活' })
  })

  test('falls back to defaults for unknown or invalid data', () => {
    expect(parseFocus({ version: 99 })).toEqual(defaultFocus())
    expect(parseFocus(null)).toEqual(defaultFocus())
  })
})
