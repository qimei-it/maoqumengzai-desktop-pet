export const channels = {
  snapshot: 'mqmz:prototype:snapshot',
  updated: 'mqmz:prototype:updated',
  command: 'mqmz:prototype:command',
  mask: 'mqmz:pet:hit-mask',
  pointer: 'mqmz:pet:pointer',
  selectFiles: 'mqmz:files:select',
  receiveFiles: 'mqmz:files:receive',
  startDrag: 'mqmz:files:start-drag',
  capture: 'mqmz:capture:preview',
  saveCapture: 'mqmz:capture:save-preview',
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
export type ReceivedBatch = { token: number; fileIds: string[] }
export type BellyEntry = {
  id: string
  name: string
  size: number
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
  album?: string
  genre?: string
}
export type LyricsState = {
  key: string
  synced: string | null
  plain: string | null
  instrumental: boolean
  missing?: boolean
}
export type BubbleState = {
  text: string
  mood: string
}
export type AiMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
}
export type AiFile = { id: string; name: string; size: number }
export type ConvertFile = { id: string; name: string; size: number }
export type ConvertOutcome = {
  converted: number
  failed: number
  messages: string[]
}
export type ConvertState = {
  busy: boolean
  files: ConvertFile[]
  targets: string[]
  progress: { done: number; total: number }
  outcome?: ConvertOutcome
  notice?: string
  canReveal: boolean
}
export type AiState = {
  configured: boolean
  busy: boolean
  files: AiFile[]
  messages: AiMessage[]
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
  aiOpen: boolean
  ai: AiState
  convertOpen: boolean
  convert: ConvertState
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
  | { type: 'stash-file'; fileId: string }
  | { type: 'save-copy'; fileId: string }
  | { type: 'wheel'; open: boolean }
  | { type: 'eat-files'; fileIds: string[] }
  | { type: 'restore-eaten'; entryId: string }
  | {
      type: 'music-control'
      action: 'previous' | 'toggle' | 'next' | 'shuffle' | 'repeat' | 'mute'
    }
  | { type: 'bar-toggle' }
  | { type: 'lyrics' }
  | { type: 'lyrics-width'; width: number }
  | { type: 'ai-open'; fileIds: string[] }
  | { type: 'ai-close' }
  | { type: 'ai-config'; apiKey: string }
  | { type: 'ai-clear' }
  | { type: 'ai-send'; prompt: string }
  | { type: 'ai-keys' }
  | { type: 'convert-open'; fileIds: string[] }
  | { type: 'convert-start'; format: 'jpg' | 'png' | 'webp' }
  | { type: 'convert-close' }
  | { type: 'convert-reveal' }
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
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
}
