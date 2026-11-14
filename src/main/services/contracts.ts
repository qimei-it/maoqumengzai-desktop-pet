/**
 * Stable service contracts shared by the UI commands and the agent tools.
 *
 * Services never throw: they return `ServiceResult` so callers can decide
 * whether to show an error, send it to the model, or retry. Display text
 * belongs to the caller; services return structured data only.
 */

import type { ClipboardKind } from '../../shared/clipboard'
import type {
  ArchiveFormat,
  ConvertAction,
  FocusTodo,
  MailAccount,
  MailMessageSummary,
  TodoGroup,
  TodoList,
  TodoRepeat,
} from '../../shared/protocol'
import type { RenameConfig } from '../../shared/rename'
import type { SettingsState } from '../../shared/settings'

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export type ShelfFileInfo = {
  id: string
  name: string
  size: number
  kind: 'file' | 'folder'
  status: string
}

export type ShelfText = {
  name: string
  text: string
  truncated: boolean
}

export type ConvertSummary = {
  converted: number
  failed: number
  outputs: { name: string; size: number }[]
  messages: string[]
}

export type ArchiveSummary = {
  name: string
  size: number
  count: number
  format: ArchiveFormat
}

export type RenameSummary = { count: number }
export type ExtractSummary = { count: number }

export type CreateTodoInput = {
  text: string
  listId?: string | null
  dueAt?: number | null
  urgent?: boolean
  flagged?: boolean
  tags?: string[]
  repeat?: TodoRepeat
}

export type UpdateTodoPatch = {
  text?: string
  dueAt?: number | null
  urgent?: boolean
  flagged?: boolean
  notes?: string
  tags?: string[]
  repeat?: TodoRepeat
}

export type TodoSnapshot = {
  lists: TodoList[]
  groups: TodoGroup[]
  todos: FocusTodo[]
}

export type MailSnapshot = {
  accounts: MailAccount[]
  folder: string
  messages: MailMessageSummary[]
}

export type MailDetailData = {
  uid: number
  folder: string
  subject: string
  from: string
  date?: number
  body: string
  attachments: string[]
}

export type MailSendInput = {
  accountId: string
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  attachmentFileIds?: string[]
}

export type MailSendSummary = {
  accountId: string
  to: string
  subject: string
  attachments: number
  savedToSent: boolean
}

export type MailMutation = 'archive' | 'delete' | 'move'

export type MusicSnapshot = {
  playing: boolean
  title?: string
  artist?: string
  album?: string
  app?: string
  volume?: number
  muted: boolean
  shuffle?: boolean
  repeat?: string
  lyrics?: string
}

export type SettingsSnapshot = Pick<
  SettingsState,
  | 'petName'
  | 'theme'
  | 'scale'
  | 'musicBarStyle'
  | 'statusBubbles'
  | 'musicBubbles'
  | 'shelfAutoScreenshots'
  | 'shelfClipboardImages'
  | 'launchAtLogin'
>

export type SettingsPatch = Partial<
  Pick<
    SettingsState,
    | 'petName'
    | 'theme'
    | 'scale'
    | 'musicBarStyle'
    | 'statusBubbles'
    | 'musicBubbles'
    | 'launchAtLogin'
  >
>

export type ClipboardEntryInfo = {
  id: string
  kind: ClipboardKind
  text?: string
  createdAt: number
  pinned: boolean
}

export type FocusSnapshot = {
  phase: string
  running: boolean
}

export type WaterSnapshot = {
  count: number
  goal: number
}

export type ShellOutput = {
  command: string
  workspace: string
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
  aborted: boolean
}

export type PanelTarget =
  | 'todo'
  | 'mail'
  | 'shelf'
  | 'settings'
  | 'clipboard'
  | 'profile'
  | 'focus'
  | 'pomodoro'
  | 'water'
  | 'break'

export type ShelfService = {
  list(): Promise<ServiceResult<ShelfFileInfo[]>>
  read(id: string, maxChars: number): Promise<ServiceResult<ShelfText>>
  reveal(id: string): Promise<ServiceResult<null>>
  saveCopy(id: string): Promise<ServiceResult<{ path: string } | null>>
  remove(id: string): Promise<ServiceResult<{ name: string }>>
}

export type ConvertService = {
  run(
    fileIds: string[],
    action: ConvertAction,
    password?: string,
  ): Promise<ServiceResult<ConvertSummary>>
}

export type ArchiveService = {
  create(
    fileIds: string[],
    format: ArchiveFormat,
  ): Promise<ServiceResult<ArchiveSummary>>
  extract(fileIds: string[]): Promise<ServiceResult<ExtractSummary>>
}

export type RenameService = {
  run(
    fileIds: string[],
    config: RenameConfig,
  ): Promise<ServiceResult<RenameSummary>>
}

export type TodoService = {
  list(includeDone: boolean): Promise<ServiceResult<TodoSnapshot>>
  create(input: CreateTodoInput): Promise<ServiceResult<{ id: string; text: string }>>
  complete(id: string): Promise<ServiceResult<{ text: string; changed: boolean }>>
  update(id: string, patch: UpdateTodoPatch): Promise<ServiceResult<{ text: string }>>
  remove(id: string): Promise<ServiceResult<{ text: string }>>
  clearDone(): Promise<ServiceResult<{ count: number }>>
  createList(name: string): Promise<ServiceResult<{ name: string }>>
}

export type MusicService = {
  status(): Promise<ServiceResult<MusicSnapshot>>
  control(
    action: 'toggle' | 'previous' | 'next' | 'mute',
  ): Promise<ServiceResult<{ action: string }>>
}

export type SettingsService = {
  read(): Promise<ServiceResult<SettingsSnapshot>>
  update(patch: SettingsPatch): Promise<ServiceResult<SettingsSnapshot>>
}

export type ClipboardService = {
  list(limit: number): Promise<ServiceResult<ClipboardEntryInfo[]>>
  copy(id: string): Promise<ServiceResult<null>>
  pin(id: string, pinned: boolean): Promise<ServiceResult<null>>
}

export type MailService = {
  list(
    accountId: string | undefined,
    folder: string,
    limit: number,
  ): Promise<ServiceResult<MailSnapshot>>
  read(
    accountId: string,
    uid: number,
    folder: string,
  ): Promise<ServiceResult<MailDetailData>>
  send(input: MailSendInput): Promise<ServiceResult<MailSendSummary>>
  archive(
    accountId: string,
    folder: string,
    uid: number,
  ): Promise<ServiceResult<{ subject: string }>>
  remove(
    accountId: string,
    folder: string,
    uid: number,
  ): Promise<ServiceResult<{ subject: string }>>
  move(
    accountId: string,
    folder: string,
    uid: number,
    targetFolder: string,
  ): Promise<ServiceResult<{ subject: string }>>
}

export type FocusService = {
  control(
    action: 'start' | 'pause' | 'reset' | 'skip',
  ): Promise<ServiceResult<FocusSnapshot>>
  drink(): Promise<ServiceResult<WaterSnapshot>>
  snoozeWater(minutes: number): Promise<ServiceResult<{ minutes: number }>>
  snoozeBreak(
    kind: 'sitting' | 'eyes',
    minutes: number,
  ): Promise<ServiceResult<{ kind: string; minutes: number }>>
}

export type PanelService = {
  open(target: PanelTarget): Promise<ServiceResult<null>>
}

export type Services = {
  shelf: ShelfService
  convert: ConvertService
  archive: ArchiveService
  rename: RenameService
  todo: TodoService
  mail: MailService
  music: MusicService
  settings: SettingsService
  clipboard: ClipboardService
  focus: FocusService
  panel: PanelService
}
