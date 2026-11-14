import { defaultSettings } from '../../src/shared/settings'
import type { AgentDeps } from '../../src/main/agent/tools'

export const shelfFileId = '11111111-1111-4111-8111-111111111111'
export const todoId = '22222222-2222-4222-8222-222222222222'
export const clipboardId = 'clip-1'
export const accountId = 'acc-1'

export function makeDeps(calls: string[] = []): AgentDeps {
  return {
    getSettings: () => ({ ...defaultSettings }),
    getPetProfile: () => ({
      id: 'ragdoll',
      name: '麻薯',
      species: '布偶猫',
      personality: '黏人',
    }),
    updateSettings: async (patch) => {
      calls.push(`settings:${JSON.stringify(patch)}`)
    },
    shelfFiles: () => [
      {
        id: shelfFileId,
        name: 'note.txt',
        size: 10,
        status: 'shelved',
      },
    ],
    resolveShelfFile: async () => '/tmp/note.txt',
    todos: () => [
      {
        id: todoId,
        text: '买猫粮',
        done: false,
        listId: null,
        dueAt: null,
        urgent: false,
        flagged: false,
        notes: '',
        tags: [],
        repeat: 'none',
        repeatFromId: null,
      },
    ],
    todoLists: () => [
      { id: 'list-1', name: '日常', groupId: null, color: 'blue', icon: 'u1F4CB-clipboard' },
    ],
    todoGroups: () => [],
    addTodo: (text) => {
      calls.push(`addTodo:${text}`)
    },
    toggleTodo: () => true,
    music: () => ({ playing: false }),
    lyrics: () => undefined,
    controlMusic: (action) => {
      calls.push(`music:${action}`)
    },
    clipboard: () => ({
      enabled: true,
      maxItems: 100,
      retentionDays: 30,
      ignoreSensitive: true,
      entries: [
        {
          id: clipboardId,
          kind: 'text',
          text: 'hello',
          createdAt: Date.now(),
          pinned: false,
        },
      ],
    }),
    revealFile: async (id) => {
      calls.push(`reveal:${id}`)
    },
    saveCopy: async (id) => {
      calls.push(`saveCopy:${id}`)
      return '/tmp/copy.txt'
    },
    removeFromShelf: async (id) => {
      calls.push(`removeFromShelf:${id}`)
    },
    convertFiles: async (ids, action) => {
      calls.push(`convert:${ids.length}:${action}`)
      return '已转换 1 个文件'
    },
    archiveFiles: async (ids, format) => {
      calls.push(`archive:${ids.length}:${format}`)
      return '已生成归档.zip（1 KB）'
    },
    extractFiles: async (ids) => {
      calls.push(`extract:${ids.length}`)
      return 2
    },
    renameFiles: async (ids) => {
      calls.push(`rename:${ids.length}`)
      return 2
    },
    mailAccounts: () => [
      {
        id: accountId,
        provider: 'gmail',
        email: 'test@example.com',
        authType: 'password',
        status: 'ready',
        unread: 0,
        createdAt: Date.now(),
      },
    ],
    mailMessages: () => [],
    mailSecret: async () => 'secret',
    mailRead: async (account, uid) => {
      calls.push(`mailRead:${account}:${uid}`)
      return {
        subject: '测试邮件',
        from: 'a@b.c',
        body: '正文',
        attachments: [],
      }
    },
    mailMove: async (account, folder, uid, mode) => {
      calls.push(`mailMove:${account}:${folder}:${uid}:${mode}`)
      return '测试邮件'
    },
    updateTodo: (id, patch) => {
      calls.push(`updateTodo:${id}:${JSON.stringify(patch)}`)
    },
    removeTodo: (id) => {
      calls.push(`removeTodo:${id}`)
    },
    clearDoneTodos: () => 2,
    addTodoList: (name) => {
      calls.push(`addTodoList:${name}`)
    },
    focusControl: (action) => {
      calls.push(`focus:${action}`)
      return { phase: 'focus', running: action === 'start' }
    },
    waterDrink: () => {
      calls.push('waterDrink')
      return { count: 3, goal: 8 }
    },
    waterSnooze: (minutes) => {
      calls.push(`waterSnooze:${minutes}`)
    },
    breakSnooze: (kind, minutes) => {
      calls.push(`breakSnooze:${kind}:${minutes}`)
    },
    clipboardCopy: async (id) => {
      calls.push(`clipboardCopy:${id}`)
    },
    clipboardPin: (id, pinned) => {
      calls.push(`clipboardPin:${id}:${pinned}`)
    },
    openPanel: (panel) => {
      calls.push(`panel:${panel}`)
    },
  }
}
