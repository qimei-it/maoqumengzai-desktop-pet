import type { Services } from '../../src/main/services/contracts'
import type { SettingsSnapshot } from '../../src/main/services/contracts'
import { defaultSettings } from '../../src/shared/settings'

export const shelfFileId = '11111111-1111-4111-8111-111111111111'
export const todoId = '22222222-2222-4222-8222-222222222222'
export const clipboardId = 'clip-1'
export const accountId = 'acc-1'

function settingsSnapshot(): SettingsSnapshot {
  return {
    petName: defaultSettings.petName,
    theme: defaultSettings.theme,
    scale: defaultSettings.scale,
    musicBarStyle: defaultSettings.musicBarStyle,
    statusBubbles: defaultSettings.statusBubbles,
    musicBubbles: defaultSettings.musicBubbles,
    shelfAutoScreenshots: defaultSettings.shelfAutoScreenshots,
    shelfClipboardImages: defaultSettings.shelfClipboardImages,
    launchAtLogin: defaultSettings.launchAtLogin,
  }
}

export function makeServices(calls: string[] = []): Services {
  return {
    shelf: {
      list: async () => ({
        ok: true,
        value: [
          {
            id: shelfFileId,
            name: 'note.txt',
            size: 10,
            status: 'shelved',
          },
        ],
      }),
      read: async () => ({
        ok: true,
        value: { name: 'note.txt', text: 'hello', truncated: false },
      }),
      reveal: async () => {
        calls.push('shelf:reveal')
        return { ok: true, value: null }
      },
      saveCopy: async () => {
        calls.push('shelf:saveCopy')
        return { ok: true, value: { path: '/tmp/copy.txt' } }
      },
      remove: async () => {
        calls.push('shelf:remove')
        return { ok: true, value: { name: 'note.txt' } }
      },
    },
    convert: {
      run: async (ids, action) => {
        calls.push(`convert:${ids.length}:${action}`)
        return {
          ok: true,
          value: {
            converted: 1,
            failed: 0,
            outputs: [{ name: 'note.pdf', size: 10 }],
            messages: [],
          },
        }
      },
    },
    archive: {
      create: async (ids, format) => {
        calls.push(`archive:${ids.length}:${format}`)
        return {
          ok: true,
          value: { name: 'archive.zip', size: 1024, count: 1, format },
        }
      },
      extract: async (ids) => {
        calls.push(`extract:${ids.length}`)
        return { ok: true, value: { count: 2 } }
      },
    },
    rename: {
      run: async (ids) => {
        calls.push(`rename:${ids.length}`)
        return { ok: true, value: { count: 2 } }
      },
    },
    todo: {
      list: async (includeDone) => ({
        ok: true,
        value: {
          lists: [
            {
              id: 'list-1',
              name: '日常',
              groupId: null,
              color: 'blue' as const,
              icon: 'u1F4CB-clipboard',
            },
          ],
          groups: [],
          todos: includeDone
            ? []
            : [
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
                  repeat: 'none' as const,
                  repeatFromId: null,
                },
              ],
        },
      }),
      create: async (input) => {
        calls.push(`addTodo:${input.text}`)
        return { ok: true, value: { id: todoId, text: input.text } }
      },
      complete: async () => ({
        ok: true,
        value: { text: '买猫粮', changed: true },
      }),
      update: async (id) => {
        calls.push(`updateTodo:${id}`)
        return { ok: true, value: { text: '买猫粮' } }
      },
      remove: async (id) => {
        calls.push(`removeTodo:${id}`)
        return { ok: true, value: { text: '买猫粮' } }
      },
      clearDone: async () => ({ ok: true, value: { count: 2 } }),
      createList: async (name) => {
        calls.push(`addTodoList:${name}`)
        return { ok: true, value: { name } }
      },
    },
    music: {
      status: async () => ({
        ok: true,
        value: { playing: false, muted: false },
      }),
      control: async (action) => {
        calls.push(`music:${action}`)
        return { ok: true, value: { action } }
      },
    },
    settings: {
      read: async () => ({ ok: true, value: settingsSnapshot() }),
      update: async (patch) => {
        calls.push(`settings:${JSON.stringify(patch)}`)
        return { ok: true, value: settingsSnapshot() }
      },
    },
    clipboard: {
      list: async () => ({
        ok: true,
        value: [
          {
            id: clipboardId,
            kind: 'text' as const,
            text: 'hello',
            createdAt: Date.now(),
            pinned: false,
          },
        ],
      }),
      copy: async (id) => {
        calls.push(`clipboardCopy:${id}`)
        return { ok: true, value: null }
      },
      pin: async (id, pinned) => {
        calls.push(`clipboardPin:${id}:${pinned}`)
        return { ok: true, value: null }
      },
    },
    mail: {
      list: async () => ({
        ok: true,
        value: {
          accounts: [
            {
              id: accountId,
              provider: 'gmail' as const,
              email: 'test@example.com',
              authType: 'password' as const,
              status: 'ready' as const,
              unread: 0,
              createdAt: Date.now(),
            },
          ],
          folder: 'INBOX',
          messages: [],
        },
      }),
      read: async (account, uid) => {
        calls.push(`mailRead:${account}:${uid}`)
        return {
          ok: true,
          value: {
            uid,
            folder: 'INBOX',
            subject: '测试邮件',
            from: 'a@b.c',
            body: '正文',
            attachments: [],
          },
        }
      },
      send: async (input) => {
        calls.push(`mailSend:${input.accountId}:${input.to}`)
        return {
          ok: true,
          value: {
            accountId: input.accountId,
            to: input.to,
            subject: input.subject,
            attachments: input.attachmentFileIds?.length ?? 0,
            savedToSent: true,
          },
        }
      },
      archive: async (account, folder, uid) => {
        calls.push(`mailArchive:${account}:${folder}:${uid}`)
        return { ok: true, value: { subject: '测试邮件' } }
      },
      remove: async (account, folder, uid) => {
        calls.push(`mailDelete:${account}:${folder}:${uid}`)
        return { ok: true, value: { subject: '测试邮件' } }
      },
      move: async (account, folder, uid, target) => {
        calls.push(`mailMove:${account}:${folder}:${uid}:${target}`)
        return { ok: true, value: { subject: '测试邮件' } }
      },
    },
    focus: {
      control: async (action) => {
        calls.push(`focus:${action}`)
        return {
          ok: true,
          value: { phase: 'focus', running: action === 'start' },
        }
      },
      drink: async () => ({
        ok: true,
        value: { count: 3, goal: 8 },
      }),
      snoozeWater: async (minutes) => {
        calls.push(`waterSnooze:${minutes}`)
        return { ok: true, value: { minutes } }
      },
      snoozeBreak: async (kind, minutes) => {
        calls.push(`breakSnooze:${kind}:${minutes}`)
        return { ok: true, value: { kind, minutes } }
      },
    },
    panel: {
      open: async (target) => {
        calls.push(`panel:${target}`)
        return { ok: true, value: null }
      },
    },
  }
}
