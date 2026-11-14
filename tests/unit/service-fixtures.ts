import type { ServiceContext } from '../../src/main/services/context'
import { defaultSettings } from '../../src/shared/settings'

export const shelfFileId = '11111111-1111-4111-8111-111111111111'
export const todoId = '22222222-2222-4222-8222-222222222222'
export const clipboardId = 'clip-1'
export const accountId = 'acc-1'

export function makeContext(
  calls: string[] = [],
  overrides: Partial<ServiceContext> = {},
): ServiceContext {
  const context: ServiceContext = {
    shelfFiles: () => [
      {
        id: shelfFileId,
        name: 'note.txt',
        size: 10,
        status: 'shelved',
      },
    ],
    resolveShelfFile: async () => '/tmp/note.txt',
    revealFile: async () => {},
    saveCopy: async () => '/tmp/copy.txt',
    removeFromShelf: async () => {},
    convertFiles: async (ids, action) => {
      calls.push(`convert:${ids.length}:${action}`)
      return {
        converted: 1,
        failed: 0,
        outputs: [{ name: 'note.pdf', size: 10 }],
        messages: [],
      }
    },
    archiveFiles: async (ids, format) => {
      calls.push(`archive:${ids.length}:${format}`)
      return { name: 'archive.zip', size: 1024, count: 1, format }
    },
    extractFiles: async () => 2,
    renameFiles: async () => 2,
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
    todoLists: () => [],
    todoGroups: () => [],
    addTodo: () => 'new-todo-id',
    toggleTodo: () => true,
    updateTodo: () => {},
    removeTodo: () => {},
    clearDoneTodos: () => 3,
    addTodoList: () => {},
    music: () => ({ playing: false }),
    lyrics: () => undefined,
    controlMusic: () => {},
    getSettings: () => ({ ...defaultSettings }),
    updateSettings: async () => {},
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
    clipboardCopy: async () => {},
    clipboardPin: () => {},
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
    mailRead: async (account, uid) => ({
      uid,
      folder: 'INBOX',
      subject: '测试邮件',
      from: 'a@b.c',
      body: '正文',
      attachments: [],
    }),
    mailMove: async () => '测试邮件',
    mailSend: async (input) => ({
      accountId: input.accountId,
      to: input.to,
      subject: input.subject,
      attachments: input.attachmentFileIds?.length ?? 0,
      savedToSent: true,
    }),
    focusControl: (action) => ({
      phase: 'focus',
      running: action === 'start',
    }),
    waterDrink: () => ({ count: 3, goal: 8 }),
    waterSnooze: () => {},
    breakSnooze: () => {},
    openPanel: () => {},
  }
  return { ...context, ...overrides }
}
