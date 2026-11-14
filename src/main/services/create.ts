/** Service implementations. Every method returns a structured result. */

import { readFile } from 'node:fs/promises'
import {
  mailBodyLimit,
  mailRecipientError,
  mailSubjectLimit,
} from '../../shared/mail'
import {
  musicBarStyles,
  petScales,
  themeIds,
  type SettingsState,
} from '../../shared/settings'
import type { ServiceContext } from './context'
import type {
  ArchiveSummary,
  ClipboardEntryInfo,
  MailDetailData,
  MailSendInput,
  MailSendSummary,
  MailSnapshot,
  MusicSnapshot,
  PanelTarget,
  ServiceResult,
  Services,
  SettingsPatch,
  SettingsSnapshot,
  ShelfFileInfo,
  TodoSnapshot,
} from './contracts'

function succeeded<T>(value: T): ServiceResult<T> {
  return { ok: true, value }
}

function failed(error: unknown): ServiceResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : '操作失败，请稍后重试。',
  }
}

async function guard<T>(
  run: () => Promise<T> | T,
): Promise<ServiceResult<T>> {
  try {
    return succeeded(await run())
  } catch (error) {
    return failed(error)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function accountOf(
  ctx: ServiceContext,
  accountId: string,
): ReturnType<ServiceContext['mailAccounts']>[number] {
  const account = ctx.mailAccounts().find((item) => item.id === accountId)
  if (!account) throw new Error('找不到这个邮箱账户。')
  return account
}

function folderOf(folder: string | undefined): string {
  const value = folder?.trim()
  if (!value) return 'INBOX'
  return value.toLowerCase() === 'inbox' ? 'INBOX' : value
}

function settingsSnapshot(value: SettingsState): SettingsSnapshot {
  return {
    petName: value.petName,
    theme: value.theme,
    scale: value.scale,
    musicBarStyle: value.musicBarStyle,
    statusBubbles: value.statusBubbles,
    musicBubbles: value.musicBubbles,
    shelfAutoScreenshots: value.shelfAutoScreenshots,
    shelfClipboardImages: value.shelfClipboardImages,
    launchAtLogin: value.launchAtLogin,
  }
}

function validateSettings(patch: SettingsPatch): SettingsPatch {
  const next: SettingsPatch = {}
  if (patch.petName !== undefined) {
    const name = patch.petName.trim()
    if (!name || name.length > 20)
      throw new Error('宠物名字需要在 1-20 字之间。')
    next.petName = name
  }
  if (patch.theme !== undefined) {
    if (!(themeIds as readonly string[]).includes(patch.theme))
      throw new Error('不支持的主题。')
    next.theme = patch.theme
  }
  if (patch.scale !== undefined) {
    if (!(petScales as readonly number[]).includes(patch.scale))
      throw new Error('不支持的缩放比例。')
    next.scale = patch.scale
  }
  if (patch.musicBarStyle !== undefined) {
    if (!(musicBarStyles as readonly string[]).includes(patch.musicBarStyle))
      throw new Error('不支持的音乐条样式。')
    next.musicBarStyle = patch.musicBarStyle
  }
  for (const key of [
    'statusBubbles',
    'musicBubbles',
    'launchAtLogin',
  ] as const) {
    if (patch[key] !== undefined) next[key] = patch[key]
  }
  if (!Object.keys(next).length) throw new Error('没有需要修改的设置。')
  return next
}

function validateMailSend(
  input: MailSendInput,
): MailSendInput {
  const account = input.accountId.trim()
  if (!account) throw new Error('缺少邮箱账户。')
  const to = input.to.trim()
  if (!to) throw new Error('缺少收件人。')
  const recipientError = mailRecipientError(to)
  if (recipientError) throw new Error(recipientError)
  const cc = input.cc?.trim()
  const bcc = input.bcc?.trim()
  if (cc && mailRecipientError(cc)) throw new Error(mailRecipientError(cc)!)
  if (bcc && mailRecipientError(bcc))
    throw new Error(mailRecipientError(bcc)!)
  const subject = input.subject.trim()
  if (!subject) throw new Error('缺少邮件主题。')
  if (subject.length > mailSubjectLimit) throw new Error('邮件主题过长。')
  const body = input.body.trim()
  if (!body) throw new Error('缺少邮件正文。')
  if (body.length > mailBodyLimit) throw new Error('邮件正文过长。')
  const attachmentFileIds = (input.attachmentFileIds ?? []).slice(0, 10)
  return {
    accountId: account,
    to,
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    subject,
    body,
    ...(attachmentFileIds.length ? { attachmentFileIds } : {}),
  }
}

export function createServices(ctx: ServiceContext): Services {
  return {
    shelf: {
      list: () => guard(() => ctx.shelfFiles()),
      read: (id, maxChars) =>
        guard(async () => {
          const file = ctx.shelfFiles().find((item) => item.id === id)
          if (!file) throw new Error('置物架里没有这个文件。')
          const path = await ctx.resolveShelfFile(id)
          const buffer = await readFile(path)
          if (buffer.includes(0))
            throw new Error('这不是文本文件，无法直接读取。')
          const limit = clamp(maxChars, 200, 20_000)
          const text = buffer.toString('utf8')
          return {
            name: file.name,
            text: text.slice(0, limit),
            truncated: text.length > limit,
          }
        }),
      reveal: (id) =>
        guard(async () => {
          await ctx.revealFile(id)
          return null
        }),
      saveCopy: (id) =>
        guard(async () => {
          const path = await ctx.saveCopy(id)
          return path ? { path } : null
        }),
      remove: (id) =>
        guard(async () => {
          const file = ctx.shelfFiles().find((item) => item.id === id)
          if (!file) throw new Error('置物架里没有这个文件。')
          await ctx.removeFromShelf(id)
          return { name: file.name }
        }),
    },
    convert: {
      run: (fileIds, action, password) =>
        guard(async () => {
          if (!fileIds.length) throw new Error('至少需要一个文件。')
          return ctx.convertFiles(fileIds, action, password)
        }),
    },
    archive: {
      create: (fileIds, format) =>
        guard(async () => {
          if (!fileIds.length) throw new Error('至少需要一个文件。')
          return ctx.archiveFiles(fileIds, format)
        }),
      extract: (fileIds) =>
        guard(async () => {
          if (!fileIds.length) throw new Error('至少需要一个压缩包。')
          const count = await ctx.extractFiles(fileIds)
          return { count }
        }),
    },
    rename: {
      run: (fileIds, config) =>
        guard(async () => {
          if (fileIds.length < 2) throw new Error('至少需要两个文件。')
          const count = await ctx.renameFiles(fileIds, config)
          if (!count) throw new Error('没有文件被重命名。')
          return { count }
        }),
    },
    todo: {
      list: (includeDone) =>
        guard(() => {
          const todos = ctx.todos()
          return {
            lists: ctx.todoLists(),
            groups: ctx.todoGroups(),
            todos: includeDone ? todos : todos.filter((todo) => !todo.done),
          } satisfies TodoSnapshot
        }),
      create: (input) =>
        guard(() => {
          const text = input.text.trim()
          if (!text) throw new Error('缺少待办内容。')
          if (text.length > 200) throw new Error('待办内容过长。')
          const id = ctx.addTodo(text, input.listId ?? null, {
            dueAt: input.dueAt ?? null,
            urgent: input.urgent === true,
            flagged: input.flagged === true,
            ...(input.tags?.length ? { tags: input.tags } : {}),
            ...(input.repeat ? { repeat: input.repeat } : {}),
          })
          return { id, text }
        }),
      complete: (id) =>
        guard(() => {
          const todo = ctx.todos().find((item) => item.id === id)
          if (!todo) throw new Error('找不到这条待办。')
          if (todo.done) return { text: todo.text, changed: false }
          const changed = ctx.toggleTodo(id)
          if (!changed) throw new Error('没有找到可完成的待办。')
          return { text: todo.text, changed: true }
        }),
      update: (id, patch) =>
        guard(() => {
          const todo = ctx.todos().find((item) => item.id === id)
          if (!todo) throw new Error('找不到这条待办。')
          if (!Object.keys(patch).length) throw new Error('没有需要修改的字段。')
          ctx.updateTodo(id, patch)
          return { text: todo.text }
        }),
      remove: (id) =>
        guard(() => {
          const todo = ctx.todos().find((item) => item.id === id)
          if (!todo) throw new Error('找不到这条待办。')
          ctx.removeTodo(id)
          return { text: todo.text }
        }),
      clearDone: () =>
        guard(() => ({ count: ctx.clearDoneTodos() })),
      createList: (name) =>
        guard(() => {
          const value = name.trim()
          if (!value) throw new Error('缺少清单名称。')
          if (value.length > 40) throw new Error('清单名称过长。')
          ctx.addTodoList(value)
          return { name: value }
        }),
    },
    music: {
      status: () =>
        guard((): MusicSnapshot => {
          const music = ctx.music()
          const lyrics = ctx.lyrics()
          return {
            playing: music.playing,
            ...(music.title ? { title: music.title } : {}),
            ...(music.artist ? { artist: music.artist } : {}),
            ...(music.album ? { album: music.album } : {}),
            ...(music.appName ? { app: music.appName } : {}),
            ...(music.volume !== undefined ? { volume: music.volume } : {}),
            muted: music.muted === true,
            ...(music.shuffle !== undefined ? { shuffle: music.shuffle } : {}),
            ...(music.repeat ? { repeat: music.repeat } : {}),
            ...(lyrics?.synced
              ? { lyrics: lyrics.synced }
              : lyrics?.plain
                ? { lyrics: lyrics.plain }
                : {}),
          }
        }),
      control: (action) =>
        guard(() => {
          ctx.controlMusic(action)
          return { action }
        }),
    },
    settings: {
      read: () => guard(() => settingsSnapshot(ctx.getSettings())),
      update: (patch) =>
        guard(async () => {
          const next = validateSettings(patch)
          await ctx.updateSettings(next)
          return settingsSnapshot(ctx.getSettings())
        }),
    },
    clipboard: {
      list: (limit) =>
        guard((): ClipboardEntryInfo[] => {
          const count = clamp(limit, 1, 50)
          return ctx
            .clipboard()
            .entries.slice(0, count)
            .map((entry) => ({
              id: entry.id,
              kind: entry.kind,
              ...(entry.kind === 'text'
                ? { text: entry.text ?? '' }
                : {}),
              createdAt: entry.createdAt,
              pinned: entry.pinned,
            }))
        }),
      copy: (id) =>
        guard(async () => {
          if (!ctx.clipboard().entries.some((entry) => entry.id === id))
            throw new Error('剪贴板里没有这条记录。')
          await ctx.clipboardCopy(id)
          return null
        }),
      pin: (id, pinned) =>
        guard(() => {
          if (!ctx.clipboard().entries.some((entry) => entry.id === id))
            throw new Error('剪贴板里没有这条记录。')
          ctx.clipboardPin(id, pinned)
          return null
        }),
    },
    mail: {
      list: (accountId, folder, limit) =>
        guard((): MailSnapshot => {
          const accounts = ctx.mailAccounts()
          if (!accounts.length)
            return { accounts, folder: 'INBOX', messages: [] }
          const account = accountId
            ? accountOf(ctx, accountId)
            : accounts[0]
          const targetFolder = folderOf(folder)
          const count = clamp(limit, 1, 30)
          return {
            accounts,
            folder: targetFolder,
            messages: ctx.mailMessages(account.id, targetFolder, count),
          }
        }),
      read: (accountId, uid, folder) =>
        guard((): Promise<MailDetailData> => {
          accountOf(ctx, accountId)
          if (!Number.isInteger(uid) || uid <= 0)
            throw new Error('邮件 uid 不正确。')
          return ctx.mailRead(accountId, uid, folderOf(folder))
        }),
      send: (input) =>
        guard(async (): Promise<MailSendSummary> => {
          accountOf(ctx, input.accountId)
          return ctx.mailSend(validateMailSend(input))
        }),
      archive: (accountId, folder, uid) =>
        guard(async () => {
          const subject = await ctx.mailMove(
            accountId,
            folderOf(folder),
            uid,
            'archive',
          )
          return { subject }
        }),
      remove: (accountId, folder, uid) =>
        guard(async () => {
          const subject = await ctx.mailMove(
            accountId,
            folderOf(folder),
            uid,
            'delete',
          )
          return { subject }
        }),
      move: (accountId, folder, uid, targetFolder) =>
        guard(async () => {
          if (!targetFolder.trim()) throw new Error('请选择目标文件夹。')
          const subject = await ctx.mailMove(
            accountId,
            folderOf(folder),
            uid,
            'move',
            targetFolder.trim(),
          )
          return { subject }
        }),
    },
    focus: {
      control: (action) =>
        guard(() => {
          if (
            action !== 'start' &&
            action !== 'pause' &&
            action !== 'reset' &&
            action !== 'skip'
          )
            throw new Error('不支持的番茄时钟操作。')
          return ctx.focusControl(action)
        }),
      drink: () => guard(() => ctx.waterDrink()),
      snoozeWater: (minutes) =>
        guard(() => {
          const value = clamp(minutes, 1, 60)
          ctx.waterSnooze(value)
          return { minutes: value }
        }),
      snoozeBreak: (kind, minutes) =>
        guard(() => {
          if (kind !== 'sitting' && kind !== 'eyes')
            throw new Error('不支持的提醒类型。')
          const value = clamp(minutes, 1, 60)
          ctx.breakSnooze(kind, value)
          return { kind, minutes: value }
        }),
    },
    panel: {
      open: (target) =>
        guard(() => {
          const allowed: PanelTarget[] = [
            'todo',
            'mail',
            'shelf',
            'settings',
            'clipboard',
            'profile',
            'focus',
            'pomodoro',
            'water',
            'break',
          ]
          if (!allowed.includes(target))
            throw new Error('不支持的面板。')
          ctx.openPanel(target)
          return null
        }),
    },
  }
}

export type { ShelfFileInfo, ArchiveSummary }
