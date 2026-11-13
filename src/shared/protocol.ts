import type { ClipboardConfig, ClipboardState } from './clipboard'
import type { FfmpegEngineState } from './ffmpeg'
import type { FocusSession, WaterEntry } from './focus'
import type { AiQuotaState } from './ai-quota'
import type {
  MailAlert,
  MailAttachmentPick,
  MailComposeDraft,
  MailComposeState,
  MailConfig,
  MailPanelState,
  MailProvider,
  MailState,
} from './mail'
import type { RenameConfig } from './rename'
import type { SettingsState } from './settings'
export type { ClipboardConfig, ClipboardEntry, ClipboardState } from './clipboard'
export type { FfmpegEngineState, FfmpegEngineStatus } from './ffmpeg'
export type {
  MailAccount,
  MailAttachmentInfo,
  MailConfig,
  MailMessageDetail,
  MailMessageSummary,
  MailPanelState,
  MailProvider,
  MailState,
} from './mail'

export const channels = {
  snapshot: 'mqmz:prototype:snapshot',
  updated: 'mqmz:prototype:updated',
  command: 'mqmz:prototype:command',
  mask: 'mqmz:pet:hit-mask',
  pointer: 'mqmz:pet:pointer',
  hover: 'mqmz:pet:hover',
  selectFiles: 'mqmz:files:select',
  receiveFiles: 'mqmz:files:receive',
  startDrag: 'mqmz:files:start-drag',
  capture: 'mqmz:capture:preview',
  saveCapture: 'mqmz:capture:save-preview',
  mailSecret: 'mqmz:mail:secret',
  mailAttachments: 'mqmz:mail:attachments',
} as const

export type Rect = { x: number; y: number; width: number; height: number }
export type HitMask = {
  rect: Rect
  width: number
  height: number
  alpha: number[]
}
export type DisplayInfo = {
  id: number
  label: string
  bounds: Rect
  workArea: Rect
  scaleFactor: number
}
export type LocalFile = {
  id: string
  name: string
  size: number
  modifiedAt: number
  status: 'received' | 'shelved'
}
export type ReceivedFolder = { id: string; name: string }
export type ReceivedBatch = {
  token: number
  fileIds: string[]
  folders: ReceivedFolder[]
  skippedFolders: string[]
}
export type BellyEntry = {
  id: string
  name: string
  size: number
  kind: 'file' | 'folder'
  eatenAt: number
  expiresAt: number
}
export type LabEvent = { time: string; message: string }
export type MusicState = {
  playing: boolean
  title?: string
  artist?: string
  source?: 'apple' | 'system'
  shuffle?: boolean
  repeat?: 'off' | 'all' | 'one'
  muted?: boolean
  volume?: number
  duration?: number
  position?: number
  positionAt?: number
  positionReliable?: boolean
  album?: string
  genre?: string
  cover?: string
  appName?: string
}
export type LyricsState = {
  key: string
  synced: string | null
  plain: string | null
  instrumental: boolean
  missing?: boolean
  version?: number
}
export type BubbleState = {
  text: string
  mood: string
  ai?: boolean
}
export type AiMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
}
export type AiFile = { id: string; name: string; size: number }
export const archiveFormats = [
  'zip',
  '7z',
  'tar',
  'tgz',
  'gz',
  'bz2',
  'xz',
] as const
export type ArchiveFormat = (typeof archiveFormats)[number]
export const archiveFormatLabels: Record<ArchiveFormat, string> = {
  zip: 'ZIP',
  '7z': '7Z',
  tar: 'TAR',
  tgz: 'TGZ',
  gz: 'GZ',
  bz2: 'BZ2',
  xz: 'XZ',
}
export const multiFileArchiveFormats = [
  'zip',
  '7z',
  'tar',
  'tgz',
] as const satisfies readonly ArchiveFormat[]
export const singleFileArchiveFormats = [
  'gz',
  'bz2',
  'xz',
] as const satisfies readonly ArchiveFormat[]
export type ArchiveFile = {
  id: string
  name: string
  size: number
  kind: 'file' | 'folder'
}
export type ArchiveOutcome = {
  count: number
  name: string
  size: number
  format: ArchiveFormat
  folderCount?: number
}
export type ArchiveState = {
  busy: boolean
  files: ArchiveFile[]
  outcome?: ArchiveOutcome
  notice?: string
  canReveal: boolean
}
export type ConvertFile = { id: string; name: string; size: number }
export type ConvertAction =
  | 'jpg'
  | 'png'
  | 'webp'
  | 'mp4'
  | 'mov'
  | 'mkv'
  | 'webm'
  | 'gif'
  | 'webp-anim'
  | 'mp3'
  | 'wav'
  | 'm4a'
  | 'flac'
  | 'ogg'
  | 'pdf-png'
  | 'pdf-jpg'
  | 'pdf-txt'
  | 'office-pdf'
  | 'office-docx'
  | 'office-xlsx'
  | 'office-pptx'
  | 'ofd-pdf'
  | 'ofd-png'
  | 'ofd-jpg'
  | 'csv-xlsx'
  | 'document-pdf'
  | 'pdf'
  | 'merge-pdf'
  | 'split-pdf'
  | 'pdf-encrypt'
  | 'pdf-decrypt'
export type ConvertTargetGroup = 'image' | 'video' | 'audio' | 'pdf'
export type ConvertTarget = {
  id: ConvertAction
  label: string
  group: ConvertTargetGroup
}
export type ConvertOutputKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'office'
  | 'pdf'
export type ConvertOutput = {
  id: string
  name: string
  size: number
  format: string
  kind: ConvertOutputKind
  preview?: string
}
export type ConvertProgress = {
  done: number
  total: number
  percent?: number
}
export type ConvertOutcome = {
  converted: number
  failed: number
  messages: string[]
  outputs: ConvertOutput[]
}
export type FocusPhase = 'focus' | 'short' | 'long'
export type TodoListColor =
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'sky'
  | 'pink'
  | 'brown'
  | 'gray'
  | 'slate'
export const todoListColors: readonly TodoListColor[] = [
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'teal',
  'blue',
  'sky',
  'pink',
  'brown',
  'gray',
  'slate',
]
export const defaultTodoListIcon = 'u1F4CB-clipboard'
export type TodoRepeat =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'yearly'
export const todoRepeats: readonly TodoRepeat[] = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'yearly',
]
export type FocusTodo = {
  id: string
  text: string
  done: boolean
  listId: string | null
  dueAt: number | null
  urgent: boolean
  flagged: boolean
  notes: string
  tags: string[]
  repeat: TodoRepeat
  repeatFromId: string | null
}
export type TodoList = {
  id: string
  name: string
  groupId: string | null
  color: TodoListColor
  icon: string
}
export type TodoGroup = { id: string; name: string }
export type BreakKind = 'sitting' | 'eyes'
export type SettingsSection =
  | 'appearance'
  | 'desktop'
  | 'data'
  | 'profile'
  | 'clipboard'
  | 'shelf'
  | 'conversion'
  | 'mail'
  | 'music'
  | 'ai'
  | 'about'
export type FocusState = {
  phase: FocusPhase
  running: boolean
  remaining: number
  completed: number
  focusMinutes: number
  shortMinutes: number
  longMinutes: number
  focusSeconds: number
  shortSeconds: number
  longSeconds: number
  water: boolean
  waterInterval: number
  waterStart: number
  waterEnd: number
  waterNextAt?: number
  waterGoal: number
  breakSitting: boolean
  breakSittingInterval: number
  breakSittingNextAt?: number
  breakEyes: boolean
  breakEyesInterval: number
  breakEyesNextAt?: number
  breakDnd: boolean
  breakDndStart: number
  breakDndEnd: number
  todos: FocusTodo[]
  todoLists: TodoList[]
  todoGroups: TodoGroup[]
  todoTags: string[]
  sessions: FocusSession[]
  waterLog: WaterEntry[]
}
export type RenameFile = { id: string; name: string }
export type RenameState = {
  busy: boolean
  files: RenameFile[]
}
export type ConvertState = {
  mode: 'convert' | 'audio'
  busy: boolean
  files: ConvertFile[]
  targets: ConvertTarget[]
  progress: ConvertProgress
  outcome?: ConvertOutcome
  notice?: string
  canReveal: boolean
}
export type AiTestState = {
  status: 'idle' | 'testing' | 'ok' | 'error'
  latencyMs?: number
  error?: string
}
export type AiState = {
  configured: boolean
  busy: boolean
  files: AiFile[]
  messages: AiMessage[]
  test: AiTestState
}
export type LocalEngineState = {
  status: 'missing' | 'ready' | 'error'
  source: string
  version?: string
  error?: string
}
export type Snapshot = {
  runtime: { platform: string; arch: string; electron: string; version: string }
  petBounds: Rect
  displays: DisplayInfo[]
  scale: number
  dropMode: boolean
  wheelOpen: boolean
  passthrough: boolean
  maskReady: boolean
  screenPermission: string
  shortcutRegistered: boolean
  files: LocalFile[]
  received?: ReceivedBatch
  belly: BellyEntry[]
  events: LabEvent[]
  blockedRequests: number
  music: MusicState
  barVisible: boolean
  lyricsOpen: boolean
  lyrics?: LyricsState
  lyricsAvailable?: boolean
  bubble?: BubbleState
  musicAiCache: {
    count: number
    bytes: number
    today: number
    limit: number
  }
  toast?: string
  mailAlert?: MailAlert
  aiOpen: boolean
  ai: AiState
  aiQuota: AiQuotaState
  convertOpen: boolean
  convert: ConvertState
  archiveOpen: boolean
  archive: ArchiveState
  renameOpen: boolean
  rename: RenameState
  settingsOpen: boolean
  settings: SettingsState
  settingsSection: SettingsSection
  mail: MailState
  mailPanel: MailPanelState
  mailCompose: MailComposeState
  pomodoroOpen: boolean
  waterOpen: boolean
  breakOpen: boolean
  todoOpen: boolean
  profileOpen: boolean
  clipboardOpen: boolean
  clipboard: ClipboardState
  shelfFolders: string[]
  shelfInvalidCount: number
  engines: {
    ffmpeg: FfmpegEngineState
    libreoffice: LocalEngineState
    builtin: Record<
      string,
      { status: 'ready' | 'error'; version: string; error?: string }
    >
  }
  focus: FocusState
}
export type Command =
  | { type: 'recover' }
  | { type: 'show-lab' }
  | { type: 'show-pocket' }
  | { type: 'hide-pocket' }
  | { type: 'drop-mode'; enabled: boolean }
  | { type: 'scale'; scale: number }
  | { type: 'move-display'; displayId: number }
  | { type: 'remove-file'; fileId: string }
  | { type: 'reveal-file'; fileId: string }
  | { type: 'save-copy'; fileId: string }
  | { type: 'wheel'; open: boolean }
  | { type: 'eat-files'; fileIds: string[]; folderIds: string[] }
  | { type: 'restore-eaten'; entryId: string }
  | {
      type: 'music-control'
      action: 'previous' | 'toggle' | 'next' | 'shuffle' | 'repeat' | 'mute'
    }
  | { type: 'music-ai-clear' }
  | { type: 'bar-toggle' }
  | { type: 'lyrics' }
  | { type: 'lyrics-width'; width: number }
  | { type: 'ai-open'; fileIds: string[] }
  | { type: 'ai-close' }
  | { type: 'ai-config'; apiKey: string; test?: boolean }
  | { type: 'ai-clear' }
  | { type: 'ai-delete' }
  | { type: 'ai-test'; apiKey?: string }
  | { type: 'ai-quota-refresh' }
  | {
      type: 'ai-quota-config'
      patch: {
        enabled?: boolean
        refreshMinutes?: number
        openaiPath?: string
      }
    }
  | { type: 'ai-quota-choose-openai' }
  | { type: 'ai-send'; prompt: string }
  | { type: 'ai-keys' }
  | { type: 'extract-audio'; fileIds: string[] }
  | { type: 'convert-open'; fileIds: string[] }
  | { type: 'convert-start'; action: ConvertAction; password?: string }
  | { type: 'convert-cancel' }
  | { type: 'convert-move-file'; fileId: string; direction: 'up' | 'down' }
  | { type: 'convert-remove-file'; fileId: string }
  | { type: 'convert-output-open'; outputId: string }
  | { type: 'convert-close' }
  | { type: 'convert-reveal' }
  | { type: 'notify'; text: string }
  | { type: 'rename-open'; fileIds: string[] }
  | { type: 'rename-apply'; config: RenameConfig }
  | { type: 'rename-close' }
  | { type: 'archive-open'; fileIds: string[]; folderIds: string[] }
  | { type: 'archive-start'; format: ArchiveFormat }
  | { type: 'archive-remove-file'; fileId: string }
  | { type: 'archive-close' }
  | { type: 'archive-reveal' }
  | { type: 'extract-archives'; fileIds: string[] }
  | { type: 'shrink-files'; fileIds: string[] }
  | { type: 'settings-open' }
  | { type: 'settings-close' }
  | { type: 'settings-section'; section: SettingsSection }
  | {
      type: 'settings-update'
      patch: Partial<SettingsState>
    }
  | { type: 'settings-open-data' }
  | { type: 'settings-clear-cache' }
  | { type: 'settings-clear-belly' }
  | { type: 'settings-open-licenses' }
  | { type: 'hover-mode'; active: boolean }
  | { type: 'pomodoro-open' }
  | { type: 'pomodoro-close' }
  | { type: 'water-open' }
  | { type: 'water-close' }
  | { type: 'water-drink' }
  | { type: 'todo-open' }
  | { type: 'todo-close' }
  | { type: 'focus-start' }
  | { type: 'focus-pause' }
  | { type: 'focus-reset' }
  | { type: 'focus-skip' }
  | { type: 'focus-phase'; phase: FocusPhase }
  | { type: 'focus-water'; enabled: boolean }
  | {
      type: 'focus-water-config'
      interval: number
      start: number
      end: number
    }
  | {
      type: 'focus-durations'
      focus: number
      short: number
      long: number
      focusSeconds: number
      shortSeconds: number
      longSeconds: number
    }
  | {
      type: 'focus-duration-bump'
      unit: 'minutes' | 'seconds'
      delta: number
    }
  | { type: 'water-goal'; goal: number }
  | { type: 'water-snooze'; minutes?: number }
  | { type: 'break-open' }
  | { type: 'break-close' }
  | { type: 'profile-open' }
  | { type: 'profile-close' }
  | { type: 'clipboard-open' }
  | { type: 'clipboard-close' }
  | { type: 'clipboard-copy'; id: string }
  | { type: 'clipboard-pin'; id: string; pinned: boolean }
  | { type: 'clipboard-remove'; id: string }
  | { type: 'clipboard-clear' }
  | { type: 'clipboard-config'; patch: Partial<ClipboardConfig> }
  | { type: 'shelf-scan' }
  | { type: 'shelf-clear-invalid' }
  | { type: 'engine-install'; id: 'ffmpeg' }
  | { type: 'engine-cancel'; id: 'ffmpeg' }
  | { type: 'engine-recheck'; id: 'ffmpeg' }
  | { type: 'engine-use-local'; id: 'ffmpeg' | 'libreoffice' }
  | { type: 'engine-remove'; id: 'ffmpeg' | 'libreoffice' }
  | { type: 'engine-self-check' }
  | {
      type: 'mail-add-account'
      provider: MailProvider
      email: string
      secret: string
      displayName?: string
    }
  | {
      type: 'mail-reauthorize'
      accountId: string
      secret: string
      displayName?: string
    }
  | { type: 'mail-remove-account'; accountId: string }
  | {
      type: 'mail-help'
      provider: MailProvider
      target?: 'client' | 'app-password'
    }
  | { type: 'mail-sync'; accountId?: string }
  | { type: 'mail-load-more' }
  | { type: 'mail-search'; query: string }
  | {
      type: 'mail-compose-open'
      accountId?: string
      draftId?: string
      draft?: MailComposeDraft
    }
  | { type: 'mail-compose-close' }
  | {
      type: 'mail-draft-save'
      draftId?: string
      accountId: string
      to: string
      cc: string
      bcc: string
      subject: string
      body: string
      bodyHtml: string
      attachmentIds: string[]
    }
  | { type: 'mail-draft-delete'; id: string }
  | { type: 'mail-remove-attachment'; id: string }
  | { type: 'mail-archive'; uid: number }
  | { type: 'mail-delete'; uid: number }
  | { type: 'mail-move'; uid: number; folder: string }
  | { type: 'mail-alert-copy' }
  | { type: 'mail-alert-open' }
  | { type: 'mail-alert-dismiss' }
  | {
      type: 'mail-send'
      accountId: string
      draftId?: string
      to: string
      cc?: string
      bcc?: string
      subject: string
      body: string
      bodyHtml?: string
      attachmentIds: string[]
    }
  | { type: 'mail-update-config'; patch: Partial<MailConfig> }
  | { type: 'mail-clear-cache' }
  | { type: 'mail-choose-attachment-dir' }
  | { type: 'mail-open-attachment-dir' }
  | { type: 'mail-open'; accountId?: string; folder?: string }
  | { type: 'mail-folder'; accountId: string; folder: string }
  | { type: 'mail-close' }
  | { type: 'mail-refresh' }
  | { type: 'mail-select'; uid: number }
  | {
      type: 'mail-save-attachment'
      uid: number
      part: string
      open?: boolean
    }
  | { type: 'break-toggle'; kind: BreakKind; enabled: boolean }
  | { type: 'break-interval'; kind: BreakKind; minutes: number }
  | { type: 'break-snooze'; kind: BreakKind; minutes?: number }
  | { type: 'break-dnd'; enabled: boolean; start: number; end: number }
  | {
      type: 'todo-add'
      text: string
      listId?: string | null
      dueAt?: number | null
      urgent?: boolean
      flagged?: boolean
      tags?: string[]
      repeat?: TodoRepeat
    }
  | { type: 'todo-toggle'; id: string }
  | { type: 'todo-remove'; id: string }
  | { type: 'todo-clear-done'; ids?: string[] }
  | {
      type: 'todo-update'
      id: string
      patch: {
        text?: string
        dueAt?: number | null
        urgent?: boolean
        flagged?: boolean
        notes?: string
        tags?: string[]
        repeat?: TodoRepeat
      }
    }
  | {
      type: 'todo-list-add'
      name: string
      groupId?: string | null
      color?: TodoListColor
      icon?: string
    }
  | {
      type: 'todo-list-update'
      id: string
      name?: string
      color?: TodoListColor
      icon?: string
    }
  | { type: 'todo-list-remove'; id: string }
  | { type: 'todo-group-add'; name: string }
  | { type: 'todo-group-update'; id: string; name: string }
  | { type: 'todo-group-remove'; id: string }
  | {
      type: 'panel-control'
      action: 'minimize' | 'maximize' | 'close'
    }
  | { type: 'volume-popup'; show: boolean }
  | { type: 'volume'; value: number }
  | { type: 'refresh' }
  | { type: 'open-data' }
  | { type: 'screen-settings' }
  | { type: 'quit' }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
export type CapturePreview = { id: string; name: string; dataUrl: string }
export interface PrototypeApi {
  readonly bridgeStatus: {
    readonly sandboxed: boolean
    readonly contextIsolated: boolean
  }
  snapshot(): Promise<Result<Snapshot>>
  command(command: Command): Promise<Result<Snapshot>>
  setHitMask(mask: HitMask): Promise<Result<void>>
  pointer(phase: 'down' | 'up' | 'cancel'): Promise<Result<void>>
  selectFiles(): Promise<Result<Snapshot>>
  receiveFiles(files: File[]): Promise<Result<Snapshot>>
  startDrag(fileId: string): void
  capturePreview(): Promise<Result<CapturePreview[]>>
  saveCapture(id: string): Promise<Result<Snapshot>>
  mailSecret(accountId: string): Promise<Result<string>>
  mailChooseAttachments(): Promise<Result<MailAttachmentPick[]>>
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
  onHover(listener: () => void): () => void
}
