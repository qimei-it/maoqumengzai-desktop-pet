import { describe, expect, test } from 'vitest'
import { defaultFocus, parseFocus } from '../../src/main/focus-store'
import { isSameLocalDay } from '../../src/shared/todo-time'

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
    expect(migrated.version).toBe(5)
    expect(migrated.todos).toEqual([
      {
        id: todoId,
        text: '旧待办',
        done: true,
        listId: null,
        dueAt: null,
        urgent: false,
        flagged: false,
        notes: '',
        tags: [],
        repeat: 'none',
        repeatFromId: null,
      },
    ])
    expect(migrated.todoLists).toEqual([])
    expect(migrated.todoGroups).toEqual([])
    expect(migrated.todoTags).toEqual([])
  })

  test('migrates a version 2 today flag into an end-of-day due date', () => {
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
    expect(parsed.version).toBe(5)
    expect(parsed.todos[0]).toMatchObject({
      listId,
      urgent: true,
      flagged: true,
      notes: '',
      tags: [],
    })
    expect(parsed.todos[0].dueAt).not.toBeNull()
    expect(isSameLocalDay(parsed.todos[0].dueAt!, Date.now())).toBe(true)
    expect(new Date(parsed.todos[0].dueAt!).getHours()).toBe(23)
    expect(new Date(parsed.todos[0].dueAt!).getMinutes()).toBe(59)
    expect(parsed.todoLists[0]).toEqual({
      id: listId,
      name: '工作',
      groupId,
      color: 'blue',
      icon: 'u1F4CB-clipboard',
    })
    expect(parsed.todoGroups[0]).toEqual({ id: groupId, name: '生活' })
  })

  test('migrates version 3 due dates and keeps Firefox Emoji metadata', () => {
    const dueAt = new Date(2026, 10, 13, 13, 44).getTime()
    const parsed = parseFocus({
      ...base,
      version: 3,
      todos: [
        {
          id: todoId,
          text: '截止日期',
          done: false,
          listId: null,
          dueAt,
          urgent: false,
          flagged: false,
        },
      ],
      todoLists: [
        {
          id: listId,
          name: '旅行',
          groupId: null,
          color: 'green',
          icon: 'u2708-airplane',
        },
      ],
      todoGroups: [],
    })
    expect(parsed.version).toBe(5)
    expect(parsed.todos[0]).toMatchObject({
      dueAt,
      notes: '',
      tags: [],
    })
    expect(parsed.todoLists[0]).toMatchObject({
      color: 'green',
      icon: 'u2708-airplane',
    })
    expect(parsed.todoTags).toEqual([])
  })

  test('migrates version 4 and drops attachment records', () => {
    const dueAt = new Date(2026, 10, 13, 13, 44).getTime()
    const attachmentId = '6c3a1b2d-7e5f-4a6b-8c9d-0e1f2a3b4c5d'
    const parsed = parseFocus({
      ...base,
      version: 4,
      todos: [
        {
          id: todoId,
          text: '有备注的待办',
          done: false,
          listId: null,
          dueAt,
          urgent: false,
          flagged: false,
          notes: '记得带证件',
          tags: ['工作', '出差'],
          attachments: [
            {
              id: attachmentId,
              name: 'brief.pdf',
              path: '/tmp/brief.pdf',
              size: 123,
            },
          ],
        },
      ],
      todoLists: [],
      todoGroups: [],
      todoTags: ['工作', '出差'],
    })
    expect(parsed.version).toBe(5)
    expect(parsed.todos[0]).toMatchObject({
      notes: '记得带证件',
      tags: ['工作', '出差'],
      repeat: 'none',
      repeatFromId: null,
    })
    expect('attachments' in parsed.todos[0]).toBe(false)
    expect(parsed.todoTags).toEqual(['工作', '出差'])
  })

  test('keeps custom list colors and Firefox Emoji icons', () => {
    const parsed = parseFocus({
      ...base,
      version: 2,
      todos: [],
      todoLists: [
        {
          id: listId,
          name: '旅行',
          groupId: null,
          color: 'green',
          icon: 'u2708-airplane',
        },
      ],
      todoGroups: [],
    })
    expect(parsed.todoLists[0]).toMatchObject({
      color: 'green',
      icon: 'u2708-airplane',
    })
  })

  test('falls back to defaults for unknown or invalid data', () => {
    expect(parseFocus({ version: 99 })).toEqual(defaultFocus())
    expect(parseFocus(null)).toEqual(defaultFocus())
  })
})
