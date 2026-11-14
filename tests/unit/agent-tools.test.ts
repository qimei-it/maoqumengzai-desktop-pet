import { describe, expect, test } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createTools,
  permissionFor,
  safeTitle,
} from '../../src/main/agent/tools'
import {
  accountId,
  clipboardId,
  makeServices,
  shelfFileId,
  todoId,
} from './agent-fixtures'

const ctx = {
  workspace: '/tmp',
  signal: new AbortController().signal,
}

describe('agent tool registry', () => {
  test('every tool has a name, description and object schema', () => {
    const tools = createTools(makeServices())
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.name).toBe(name)
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.parameters).toMatchObject({ type: 'object' })
      expect(typeof tool.title).toBe('function')
    }
  })

  test('plan mode is read-only and build mode confirms writes', () => {
    const tools = createTools(makeServices())
    const readOnly = [
      'shelf_list',
      'file_read',
      'file_reveal',
      'todo_list',
      'music_status',
      'settings_read',
      'clipboard_list',
      'mail_list',
      'mail_read',
      'ui_open',
    ]
    for (const name of readOnly) {
      expect(permissionFor(tools[name], 'plan')).toBe('allow')
      expect(permissionFor(tools[name], 'build')).toBe('allow')
    }
    for (const name of [
      'shelf_remove',
      'file_save_copy',
      'convert_start',
      'archive_start',
      'extract_archive',
      'rename_files',
      'mail_archive',
      'mail_delete',
      'mail_move',
      'todo_create',
      'todo_update',
      'todo_remove',
      'todo_clear_done',
      'todo_list_create',
      'clipboard_copy',
      'clipboard_pin',
      'shell_run',
    ]) {
      expect(permissionFor(tools[name], 'plan')).toBe('deny')
      expect(permissionFor(tools[name], 'build')).toBe('ask')
    }
    for (const name of [
      'music_control',
      'focus_control',
      'water_drink',
      'water_snooze',
      'break_snooze',
    ]) {
      expect(permissionFor(tools[name], 'plan')).toBe('deny')
      expect(permissionFor(tools[name], 'build')).toBe('allow')
    }
    expect(permissionFor(undefined, 'build')).toBe('deny')
  })

  test('rejects missing or invalid arguments', async () => {
    const tools = createTools(makeServices())
    await expect(tools.todo_create.run({}, ctx)).rejects.toThrow('text')
    await expect(
      tools.convert_start.run(
        { fileIds: [shelfFileId], action: 'exe' },
        ctx,
      ),
    ).rejects.toThrow('不支持的转换目标')
    await expect(
      tools.rename_files.run(
        { fileIds: [shelfFileId, clipboardId], mode: 'replace' },
        ctx,
      ),
    ).rejects.toThrow('需要 find')
  })

  test('read and write tools reach the shared services', async () => {
    const calls: string[] = []
    const tools = createTools(makeServices(calls))
    const shelf = await tools.shelf_list.run({}, ctx)
    expect(shelf.text).toContain('note.txt')

    const created = await tools.todo_create.run(
      { text: '买猫粮' },
      ctx,
    )
    expect(created.ok).toBe(true)
    expect(calls).toContain('addTodo:买猫粮')

    const updated = await tools.todo_update.run(
      { id: todoId, text: '买猫砂', urgent: true },
      ctx,
    )
    expect(updated.ok).toBe(true)
    expect(calls.some((call) => call.startsWith(`updateTodo:${todoId}`))).toBe(
      true,
    )

    const convert = await tools.convert_start.run(
      { fileIds: [shelfFileId], action: 'pdf' },
      ctx,
    )
    expect(convert.text).toContain('已转换')
    expect(calls).toContain('convert:1:pdf')

    const mail = await tools.mail_read.run(
      { accountId, uid: 12 },
      ctx,
    )
    expect(mail.text).toContain('测试邮件')
    expect(calls).toContain(`mailRead:${accountId}:12`)

    const focus = await tools.focus_control.run({ action: 'start' }, ctx)
    expect(focus.ok).toBe(true)
    expect(calls).toContain('focus:start')

    const water = await tools.water_drink.run({}, ctx)
    expect(water.text).toContain('3/8')
  })

  test('safe titles stay short and fall back to the tool name', () => {
    const tools = createTools(makeServices())
    const tool = tools.shell_run
    expect(safeTitle(tool, { command: 'echo hi' })).toContain('echo hi')
    const broken = {
      ...tool,
      title: () => {
        throw new Error('boom')
      },
    }
    expect(safeTitle(broken, {})).toBe(tool.name)
  })
})

describe('shell tool', () => {
  test('runs in the session workspace and returns output', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'mqmz-shell-'))
    const tools = createTools(makeServices())
    const result = await tools.shell_run.run(
      { command: 'printf mqmz-shell-ok' },
      { workspace, signal: new AbortController().signal },
    )
    expect(result.ok).toBe(true)
    expect(result.text).toContain('mqmz-shell-ok')
    expect(result.text).toContain(workspace)
  })

  test('requires a workspace', async () => {
    const tools = createTools(makeServices())
    await expect(
      tools.shell_run.run(
        { command: 'echo hi' },
        { workspace: null, signal: new AbortController().signal },
      ),
    ).rejects.toThrow('工作区')
  })

  test('stops on timeout', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'mqmz-shell-'))
    const tools = createTools(makeServices())
    const started = Date.now()
    const result = await tools.shell_run.run(
      { command: 'sleep 3', timeoutSeconds: 1 },
      { workspace, signal: new AbortController().signal },
    )
    expect(result.text).toContain('命令超时')
    expect(Date.now() - started).toBeLessThan(2500)
  })

  test('truncates very large output', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'mqmz-shell-'))
    const tools = createTools(makeServices())
    const result = await tools.shell_run.run(
      { command: 'yes x | head -c 100000' },
      { workspace, signal: new AbortController().signal },
    )
    expect(result.text).toContain('输出过长，已截断')
  })
})
