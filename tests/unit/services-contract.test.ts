import { describe, expect, test } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServices } from '../../src/main/services/create'
import {
  accountId,
  clipboardId,
  makeContext,
  shelfFileId,
  todoId,
} from './service-fixtures'

describe('service contracts', () => {
  test('successful calls return ok with structured values', async () => {
    const calls: string[] = []
    const services = createServices(makeContext(calls))

    const files = await services.shelf.list()
    expect(files).toEqual({
      ok: true,
      value: [
        {
          id: shelfFileId,
          name: 'note.txt',
          size: 10,
          status: 'shelved',
        },
      ],
    })

    const created = await services.todo.create({ text: '买猫粮' })
    expect(created).toEqual({
      ok: true,
      value: { id: 'new-todo-id', text: '买猫粮' },
    })

    const converted = await services.convert.run([shelfFileId], 'pdf')
    expect(converted.ok && converted.value.converted).toBe(1)

    const moved = await services.mail.move(
      accountId,
      'INBOX',
      7,
      'Archive',
    )
    expect(moved).toEqual({ ok: true, value: { subject: '测试邮件' } })

    const snoozed = await services.focus.snoozeWater(10)
    expect(snoozed).toEqual({ ok: true, value: { minutes: 10 } })
    expect(calls).toContain('convert:1:pdf')
  })

  test('domain errors are returned, never thrown', async () => {
    const services = createServices(
      makeContext([], { shelfFiles: () => [] }),
    )
    const missing = await services.shelf.read(shelfFileId, 1000)
    expect(missing).toEqual({
      ok: false,
      error: '置物架里没有这个文件。',
    })

    const emptyConvert = await services.convert.run([], 'pdf')
    expect(emptyConvert.ok).toBe(false)

    const oneFile = await services.rename.run([shelfFileId], {
      mode: 'replace',
      find: 'a',
      replace: 'b',
      text: '',
      position: 'after',
      format: 'index',
      start: 1,
    })
    expect(oneFile).toEqual({
      ok: false,
      error: '至少需要两个文件。',
    })

    const emptyTodo = await services.todo.create({ text: '   ' })
    expect(emptyTodo).toEqual({
      ok: false,
      error: '缺少待办内容。',
    })
  })

  test('settings are validated before reaching the app', async () => {
    const calls: string[] = []
    const services = createServices(
      makeContext(calls, {
        updateSettings: async (patch) => {
          calls.push(JSON.stringify(patch))
        },
      }),
    )
    const badTheme = await services.settings.update({
      theme: 'neon' as never,
    })
    expect(badTheme.ok).toBe(false)
    expect(badTheme.ok ? '' : badTheme.error).toContain('主题')

    const badName = await services.settings.update({ petName: '' })
    expect(badName.ok).toBe(false)

    const empty = await services.settings.update({})
    expect(empty.ok).toBe(false)

    const good = await services.settings.update({
      petName: '小白',
      theme: 'halloween',
      scale: 1.5,
    })
    expect(good.ok).toBe(true)
    expect(calls[0]).toContain('小白')
  })

  test('mail validates recipients and targets', async () => {
    const services = createServices(makeContext())
    const badRecipient = await services.mail.send({
      accountId,
      to: 'not-an-email',
      subject: '主题',
      body: '正文',
    })
    expect(badRecipient.ok).toBe(false)

    const badUid = await services.mail.read(accountId, 0, 'INBOX')
    expect(badUid.ok).toBe(false)

    const noTarget = await services.mail.move(
      accountId,
      'INBOX',
      1,
      '   ',
    )
    expect(noTarget).toEqual({
      ok: false,
      error: '请选择目标文件夹。',
    })

    const noAccounts = createServices(
      makeContext([], { mailAccounts: () => [] }),
    )
    const empty = await noAccounts.mail.list(undefined, 'INBOX', 10)
    expect(empty.ok && empty.value.messages.length).toBe(0)
  })

  test('clipboard and panel validate ids', async () => {
    const services = createServices(makeContext())
    const missing = await services.clipboard.copy('missing')
    expect(missing).toEqual({
      ok: false,
      error: '剪贴板里没有这条记录。',
    })

    const pinned = await services.clipboard.pin(clipboardId, true)
    expect(pinned.ok).toBe(true)

    const panel = await services.panel.open('nope' as never)
    expect(panel.ok).toBe(false)
  })

  test('completed todos report whether anything changed', async () => {
    const services = createServices(
      makeContext([], {
        todos: () => [
          {
            id: todoId,
            text: '已完成',
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
        ],
      }),
    )
    const done = await services.todo.complete(todoId)
    expect(done).toEqual({
      ok: true,
      value: { text: '已完成', changed: false },
    })
  })

  test('focus values are clamped', async () => {
    const services = createServices(makeContext())
    const tooSmall = await services.focus.snoozeWater(0)
    expect(tooSmall).toEqual({ ok: true, value: { minutes: 1 } })
    const tooLarge = await services.focus.snoozeBreak('eyes', 999)
    expect(tooLarge).toEqual({
      ok: true,
      value: { kind: 'eyes', minutes: 60 },
    })
  })

  test('shelf reads text and detects binary files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-service-'))
    const textPath = join(directory, 'note.txt')
    await writeFile(textPath, 'a'.repeat(300))
    const textServices = createServices(
      makeContext([], { resolveShelfFile: async () => textPath }),
    )
    const read = await textServices.shelf.read(shelfFileId, 200)
    expect(read.ok && read.value.text.length).toBe(200)
    expect(read.ok && read.value.truncated).toBe(true)

    const binaryPath = join(directory, 'image.bin')
    await writeFile(binaryPath, Buffer.from([1, 0, 2]))
    const binaryServices = createServices(
      makeContext([], { resolveShelfFile: async () => binaryPath }),
    )
    const binary = await binaryServices.shelf.read(shelfFileId, 1000)
    expect(binary.ok).toBe(false)
    expect(binary.ok ? '' : binary.error).toContain('文本文件')
  })
})
