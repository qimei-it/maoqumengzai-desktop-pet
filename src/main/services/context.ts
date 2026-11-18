/**
 * Low-level operations provided by the Electron main process.
 * Only the service factory uses this; tools see `Services` instead.
 */

import type { ClipboardState } from '../../shared/clipboard'
import type {
  ArchiveFormat,
  ConvertAction,
  FocusTodo,
  LyricsState,
  MailAccount,
  MailMessageSummary,
  MusicState,
  TodoGroup,
  TodoList,
  TodoRepeat,
} from '../../shared/protocol'
import type { RenameConfig } from '../../shared/rename'
import type { SettingsState } from '../../shared/settings'
import type {
  ArchiveSummary,
  ConvertSummary,
  MailDetailData,
  MailSendInput,
  MailSendSummary,
  PanelTarget,
  ShelfFileInfo,
  TodoSnapshot,
  UpdateTodoPatch,
} from './contracts'

export type ServiceContext = {
  shelfFiles(): ShelfFileInfo[]
  resolveShelfFile(id: string): Promise<string>
  revealFile(id: string): Promise<void>
  saveCopy(id: string): Promise<string | null>
  removeFromShelf(id: string): Promise<void>

  convertFiles(
    fileIds: string[],
    action: ConvertAction,
    password?: string,
  ): Promise<ConvertSummary>
  archiveFiles(
    fileIds: string[],
    format: ArchiveFormat,
  ): Promise<ArchiveSummary>
  extractFiles(fileIds: string[]): Promise<number>
  renameFiles(fileIds: string[], config: RenameConfig): Promise<number>

  todos(): FocusTodo[]
  todoLists(): TodoList[]
  todoGroups(): TodoGroup[]
  addTodo(
    text: string,
    listId?: string | null,
    flags?: {
      dueAt?: number | null
      urgent?: boolean
      flagged?: boolean
      tags?: string[]
      repeat?: TodoRepeat
    },
  ): string
  toggleTodo(id: string): boolean
  updateTodo(id: string, patch: UpdateTodoPatch): void
  removeTodo(id: string): void
  renameTodoTag(from: string, to: string): void
  removeTodoTag(tag: string): void
  clearDoneTodos(): number
  addTodoList(name: string): void

  music(): MusicState
  lyrics(): LyricsState | undefined
  controlMusic(action: 'previous' | 'toggle' | 'next' | 'mute'): void

  getSettings(): SettingsState
  updateSettings(patch: Partial<SettingsState>): Promise<void>

  clipboard(): ClipboardState
  clipboardCopy(id: string): Promise<void>
  clipboardPin(id: string, pinned: boolean): void

  mailAccounts(): MailAccount[]
  mailMessages(
    accountId: string,
    folder: string,
    limit: number,
  ): MailMessageSummary[]
  mailRead(
    accountId: string,
    uid: number,
    folder: string,
  ): Promise<MailDetailData>
  mailMove(
    accountId: string,
    folder: string,
    uid: number,
    mode: 'archive' | 'delete' | 'move',
    targetFolder?: string,
  ): Promise<string>
  mailSend(input: MailSendInput): Promise<MailSendSummary>

  focusControl(action: 'start' | 'pause' | 'reset' | 'skip'): {
    phase: string
    running: boolean
  }
  waterDrink(): { count: number; goal: number }
  waterSnooze(minutes: number): void
  breakSnooze(kind: 'sitting' | 'eyes', minutes: number): void

  openPanel(target: PanelTarget): void
}

export type { TodoSnapshot }
