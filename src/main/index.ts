import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  session,
  shell,
  systemPreferences,
  Tray,
} from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rename,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { channels } from '../shared/protocol'
import {
  bubbleCategories,
  detectMood,
  pickBubble,
  type BubbleCategory,
  type BubbleTrack,
  type MusicMood,
} from '../shared/music-bubbles'
import {
  localizeLyrics,
  localizeName,
  type LyricsMeta,
} from '../shared/lyrics-lang'
import type {
  BellyEntry,
  CapturePreview,
  HitMask,
  LabEvent,
  LocalFile,
  LyricsState,
  MusicState,
  Rect,
  Result,
  Snapshot,
} from '../shared/protocol'
import {
  fitToDisplays,
  hitOpaquePixel,
  movedBeyondThreshold,
} from '../shared/geometry'
import { basePetSize, donutWindowSize } from '../shared/donut'
import {
  captureIdSchema,
  commandSchema,
  fileIdSchema,
  maskSchema,
  pathsSchema,
  pointerSchema,
} from './schemas'

const here = dirname(fileURLToPath(import.meta.url))
const rendererPath = join(here, '../renderer/index.html')
const preloadPath = join(here, '../preload/index.cjs')
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
if (devUrl && new URL(devUrl).origin !== 'http://127.0.0.1:5173')
  throw new Error('Untrusted renderer origin')

app.setName('毛趣萌仔')
const base =
  process.platform === 'win32'
    ? process.env.LOCALAPPDATA
    : app.getPath('appData')
if (!base || !isAbsolute(base))
  throw new Error('Local application data directory unavailable')
const override = !app.isPackaged ? process.env.MQMZ_DATA_DIR : undefined
if (override && !isAbsolute(override))
  throw new Error('MQMZ_DATA_DIR must be absolute')
const dataRoot = override || join(base, 'mqmz-desktop')
mkdirSync(dataRoot, { recursive: true })
mkdirSync(join(dataRoot, 'session'), { recursive: true })
app.setPath('userData', dataRoot)
app.setPath('sessionData', join(dataRoot, 'session'))

let pet: BrowserWindow
let pocket: BrowserWindow
let notes: BrowserWindow | undefined
let pill: BrowserWindow | undefined
let eye: BrowserWindow | undefined
let lyricsWindow: BrowserWindow | undefined
let volumePopup: BrowserWindow | undefined
let volumeHideTimer: ReturnType<typeof setTimeout> | undefined
let lab: BrowserWindow | undefined
let tray: Tray | undefined
let scale = 1
let dropMode = false
let wheelOpen = false
let baseBounds: Rect | undefined
let passthrough = false
let mask: HitMask | undefined
let shortcutRegistered = false
let blockedRequests = 0
let shuttingDown = false
let drag:
  | {
      origin: { x: number; y: number }
      bounds: Rect
      moving: boolean
      startedAt: number
    }
  | undefined
let broadcastTimer: ReturnType<typeof setTimeout> | undefined
let pointerTimer: ReturnType<typeof setInterval> | undefined
let musicTimer: ReturnType<typeof setInterval> | undefined
let music: MusicState = { playing: false }
let barVisible = true
let volumeBeforeMute = 50
let lyricsOpen = false
let lyrics: LyricsState | undefined
let lyricsKey: string | undefined
let bubbleWindow: BrowserWindow | undefined
let bubbleText: string | undefined
let bubbleMood: MusicMood = 'generic'
let bubbleHideTimer: ReturnType<typeof setTimeout> | undefined
let bubbleTickTimer: ReturnType<typeof setInterval> | undefined
let bubbleTrackKey: string | undefined
let bubbleStep = 0
let bubbleElapsed = 0
let bubbleLastTick = 0
let bubbleUsed = new Set<string>()
let bubbleUsedCategories = new Set<BubbleCategory>()
let bubbleRecent: string[] = []
let bubbleLyrics: LyricsState | undefined
let bubbleLyricsKey: string | undefined
let musicSource: 'apple' | 'system' = 'system'
let persistQueue = Promise.resolve()
const events: LabEvent[] = []
const files = new Map<
  string,
  LocalFile & { path: string; device: number; inode: number }
>()
const previews = new Map<string, CapturePreview>()
const statePath = join(dataRoot, 'mqmz.window-state.json')
const shelfPath = join(dataRoot, 'mqmz.file-shelf.json')
const bellyPath = join(dataRoot, 'mqmz.belly.json')
const bellyDirectory = join(dataRoot, 'belly')
let shelfQueue = Promise.resolve()
let bellyQueue = Promise.resolve()
let belly: StoredBellyEntry[] = []
let received: { token: number; fileIds: string[] } | undefined
let receiveToken = 0

/** On-disk belly record; absolute paths never enter snapshots or logs. */
type StoredBellyEntry = BellyEntry & {
  originalPath: string
  storedPath: string
}
const bellyRetentionMs = 7 * 24 * 60 * 60 * 1000

function addEvent(message: string): void {
  events.unshift({ time: new Date().toISOString(), message })
  events.splice(20)
  broadcast()
}
function permission(): string {
  return process.platform === 'darwin'
    ? systemPreferences.getMediaAccessStatus('screen')
    : '需实际请求验证'
}
function snapshot(): Snapshot {
  return {
    runtime: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      version: app.getVersion(),
    },
    petBounds: pet.getBounds(),
    displays: screen.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label || `显示器 ${d.id}`,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
    })),
    scale,
    dropMode,
    wheelOpen,
    passthrough,
    maskReady: !!mask,
    screenPermission: permission(),
    shortcutRegistered,
    files: [...files.values()].map(
      ({ id, name, size, modifiedAt, status }) => ({
        id,
        name,
        size,
        modifiedAt,
        status,
      }),
    ),
    ...(received ? { received } : {}),
    belly: belly.map(({ id, name, size, eatenAt, expiresAt }) => ({
      id,
      name,
      size,
      eatenAt,
      expiresAt,
    })),
    events: [...events],
    blockedRequests,
    music,
    barVisible,
    lyricsOpen,
    lyrics,
    ...(bubbleText ? { bubble: { text: bubbleText, mood: bubbleMood } } : {}),
  }
}
function broadcast(): void {
  if (broadcastTimer || shuttingDown || !pet) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = undefined
    const state = snapshot()
    for (const window of [
      pet,
      pocket,
      lab,
      notes,
      pill,
      volumePopup,
      eye,
      lyricsWindow,
      bubbleWindow,
    ])
      if (window && !window.isDestroyed())
        window.webContents.send(channels.updated, state)
  }, 40)
}
function showLab(): void {
  if (!lab) return
  lab.show()
  lab.focus()
  broadcast()
}
function positionPocket(): void {
  if (!pocket || pocket.isDestroyed()) return
  const b = pet.getBounds()
  const a = screen.getDisplayMatching(b).workArea
  const height =
    (files.size === 0
      ? 320
      : files.size === 1
        ? [...files.values()][0].status === 'shelved'
          ? 456
          : 420
        : 488) + Math.min(belly.length, 3) * 46
  const left = b.x - 352 + 24
  const x = left >= a.x ? left : b.x + b.width - 24
  pocket.setBounds(
    fitToDisplays({ x, y: b.y + b.height - height, width: 352, height }, [a]),
  )
}
function positionEye(): void {
  if (!eye || eye.isDestroyed()) return
  const b = pet.getBounds()
  const size = 32
  const pillWidth = music.source === 'apple' ? 256 : 184
  const pillX = b.x + Math.round(b.width / 2) - pillWidth / 2
  const index = music.source === 'apple' ? 1 : 0
  const center = pillX + 20 + index * 36
  const x = Math.round(center - size / 2)
  const y = b.y + b.height - Math.round(22 * scale) - size - 6
  eye.setBounds(fitToDisplays({ x, y, width: size, height: size }, areas()))
}
function updateEyeWindow(): void {
  if (!eye || eye.isDestroyed()) return
  if (music.title && !dropMode) {
    positionEye()
    eye.showInactive()
    eye.moveTop()
  } else if (eye.isVisible()) {
    eye.hide()
  }
}
function syncOverlays(): void {
  updateNotesWindow()
  updatePillWindow()
  updateEyeWindow()
  updateLyricsWindow()
  updateBubbleWindow()
}
function positionLyrics(): void {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return
  const b = pet.getBounds()
  const width = 240
  const height = 88
  const x = Math.round(b.x + b.width / 2 - width / 2)
  const y = b.y - height - 10
  lyricsWindow.setBounds(fitToDisplays({ x, y, width, height }, areas()))
}
function updateLyricsWindow(): void {
  if (!lyricsWindow || lyricsWindow.isDestroyed()) return
  if (lyricsOpen && lyrics && music.title && !dropMode) {
    positionLyrics()
    lyricsWindow.showInactive()
    lyricsWindow.moveTop()
  } else if (lyricsWindow.isVisible()) {
    lyricsWindow.hide()
  }
}
function positionBubble(): void {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return
  const b = pet.getBounds()
  const width = 248
  const height = 104
  const x = Math.round(b.x + b.width / 2 - width / 2)
  const y = b.y + Math.round(9 * scale) - 6 - height
  bubbleWindow.setBounds(fitToDisplays({ x, y, width, height }, areas()))
}
function updateBubbleWindow(): void {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return
  if (bubbleText && !dropMode && barVisible && !lyricsOpen) {
    positionBubble()
    bubbleWindow.showInactive()
    bubbleWindow.moveTop()
  } else if (bubbleWindow.isVisible()) {
    bubbleWindow.hide()
  }
}
function positionNotes(): void {
  if (!notes || notes.isDestroyed()) return
  const b = pet.getBounds()
  const size = 240
  const x = Math.round(b.x + b.width / 2 - size / 2)
  const y = Math.round(b.y + 60 * scale - size)
  notes.setBounds(fitToDisplays({ x, y, width: size, height: size }, areas()))
}
function positionPill(): void {
  if (!pill || pill.isDestroyed()) return
  const b = pet.getBounds()
  const width = music.source === 'apple' ? 256 : 184
  const height = 40
  const x = Math.round(b.x + b.width / 2 - width / 2)
  const y = b.y + b.height - Math.round(22 * scale)
  pill.setBounds(fitToDisplays({ x, y, width, height }, areas()))
}
function updatePillWindow(): void {
  if (!pill || pill.isDestroyed()) return
  if (music.title && barVisible && !dropMode) {
    positionPill()
    pill.showInactive()
    pill.moveTop()
  } else if (pill.isVisible()) {
    pill.hide()
  }
}
function updateNotesWindow(): void {
  if (!notes || notes.isDestroyed()) return
  if (music.playing && !dropMode && !lyricsOpen && !bubbleText) {
    positionNotes()
    notes.showInactive()
    notes.moveTop()
  } else if (notes.isVisible()) {
    notes.hide()
  }
}
function showPocket(): void {
  positionPocket()
  pocket.show()
  pocket.focus()
  broadcast()
}
/**
 * Grow the transparent window symmetrically around the pet before the ring is
 * mounted. The window is invisible, so the swap is a single step: animating it
 * while the ring is drawn would clip the slices at the window edge.
 */
function openWheelWindow(): void {
  if (wheelOpen) return
  baseBounds = pet.getBounds()
  wheelOpen = true
  const size = donutWindowSize(scale)
  const width = Math.max(baseBounds.width, size.width)
  const height = Math.max(baseBounds.height, size.height)
  placePet(
    fitToDisplays(
      {
        x: baseBounds.x - Math.round((width - baseBounds.width) / 2),
        y: baseBounds.y - Math.round((height - baseBounds.height) / 2),
        width,
        height,
      },
      areas(),
    ),
  )
  mask = undefined
  setPassthrough(false)
  broadcast()
}
function closeWheelWindow(): void {
  if (!wheelOpen) return
  wheelOpen = false
  const target = baseBounds
    ? fitToDisplays(baseBounds, areas())
    : pet.getBounds()
  placePet(target)
  baseBounds = undefined
  mask = undefined
  setPassthrough(false)
  persist(target)
  broadcast()
}
async function saveBelly(): Promise<void> {
  const value = JSON.stringify({ version: 1, entries: belly })
  const operation = bellyQueue.then(async () => {
    await writeFile(`${bellyPath}.tmp`, value, { mode: 0o600 })
    await rename(`${bellyPath}.tmp`, bellyPath)
  })
  bellyQueue = operation.catch(() => {})
  await operation
}
async function restoreBelly(): Promise<void> {
  try {
    const stored = z
      .object({
        version: z.literal(1),
        entries: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                name: z.string().max(4096),
                size: z.number().nonnegative(),
                eatenAt: z.number().finite(),
                expiresAt: z.number().finite(),
                originalPath: z.string().max(4096).refine(isAbsolute),
                storedPath: z.string().max(4096).refine(isAbsolute),
              })
              .strict(),
          )
          .max(200),
      })
      .strict()
      .parse(JSON.parse(await readFile(bellyPath, 'utf8')))
    belly = stored.entries
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      addEvent('桌宠回收区索引读取失败；已保留原有文件。')
  }
}
/** Expired meals are removed from disk on launch; the pet never keeps them forever. */
async function purgeBelly(): Promise<void> {
  const now = Date.now()
  const kept: StoredBellyEntry[] = []
  let removed = 0
  for (const entry of belly) {
    if (entry.expiresAt > now) {
      kept.push(entry)
      continue
    }
    await rm(dirname(entry.storedPath), { recursive: true, force: true })
    removed++
  }
  belly = kept
  if (removed) {
    await saveBelly()
    addEvent(`回收区已清理 ${removed} 个到期文件。`)
  }
}
async function movePath(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await copyFile(source, destination)
    await unlink(source)
  }
}
async function freeRestorePath(original: string): Promise<string> {
  const candidate = async (path: string) => {
    try {
      await lstat(path)
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
      throw error
    }
  }
  if (await candidate(original)) return original
  const directory = dirname(original)
  const name = basename(original)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const suffix = dot > 0 ? name.slice(dot) : ''
  for (let index = 1; index <= 99; index++) {
    const path = join(directory, `${stem} (取回${index === 1 ? '' : ` ${index}`})${suffix}`)
    if (await candidate(path)) return path
  }
  throw new Error('原目录中找不到可用的取回位置。')
}
async function saveShelf(): Promise<void> {
  const value = JSON.stringify({
    version: 1,
    files: [...files.values()].filter((file) => file.status === 'shelved'),
  })
  const operation = shelfQueue.then(async () => {
    await writeFile(`${shelfPath}.tmp`, value, { mode: 0o600 })
    await rename(`${shelfPath}.tmp`, shelfPath)
  })
  shelfQueue = operation.catch(() => {})
  await operation
}
async function restoreShelf(): Promise<void> {
  try {
    const stored = z
      .object({
        version: z.literal(1),
        files: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                name: z.string().max(4096),
                path: z.string().max(4096).refine(isAbsolute),
                size: z.number().nonnegative(),
                modifiedAt: z.number().finite(),
                device: z.number(),
                inode: z.number(),
                status: z.literal('shelved'),
              })
              .strict(),
          )
          .max(100),
      })
      .strict()
      .parse(JSON.parse(await readFile(shelfPath, 'utf8')))
    for (const file of stored.files) files.set(file.id, file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      addEvent('置物架索引读取失败；源文件不受影响。')
  }
}
function setPassthrough(enabled: boolean): void {
  if (passthrough === enabled) return
  passthrough = enabled
  pet.setIgnoreMouseEvents(enabled, { forward: true })
  broadcast()
}
/**
 * macOS 播放状态：Apple Music 走 AppleScript（旧 MediaRemote 读不到它的新接口），
 * 其它播放器走自带 helper。任何一款在放就切听歌姿态。
 */
const musicScript = `if application "Music" is running then
  tell application "Music"
    set state to player state as text
    if state is "playing" or state is "paused" then
      return state & linefeed & (name of current track) & linefeed & (artist of current track) & linefeed & (shuffle enabled as text) & linefeed & (song repeat as text) & linefeed & (duration of current track as text) & linefeed & (player position as text) & linefeed & (genre of current track as text) & linefeed & (album of current track as text)
    end if
  end tell
end if
return "idle"`
function musicHelperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'helpers/mqmz-nowplaying')
    : join(app.getAppPath(), 'resources/helpers/mqmz-nowplaying')
}
function applyMusic(next: MusicState): void {
  if (
    music.playing === next.playing &&
    music.title === next.title &&
    music.artist === next.artist &&
    music.source === next.source &&
    music.shuffle === next.shuffle &&
    music.repeat === next.repeat &&
    music.muted === next.muted &&
    music.volume === next.volume &&
    music.duration === next.duration &&
    music.position === next.position &&
    music.album === next.album &&
    music.genre === next.genre
  )
    return
  const previousKey = currentBubbleKey()
  music = next
  const nextKey = currentBubbleKey()
  if (previousKey !== nextKey) {
    hideBubble()
    resetBubbleTrack()
  }
  if (!next.title) {
    lyricsOpen = false
    lyrics = undefined
    lyricsKey = undefined
  } else if (lyricsOpen) {
    const key = currentTrackKey()
    if (key && key !== lyricsKey) void loadLyricsFor(key)
  }
  broadcast()
  syncOverlays()
}
function readAudio(done: (audio: { muted: boolean; volume?: number }) => void): void {
  execFile(
    '/usr/bin/osascript',
    ['-e', 'get volume settings'],
    { timeout: 1000 },
    (error, stdout) => {
      if (error) {
        done({ muted: false })
        return
      }
      const volume = Number(/output volume:(\d+)/.exec(stdout)?.[1] ?? NaN)
      done({
        muted: /output muted:true/.test(stdout),
        volume: Number.isFinite(volume) ? volume : undefined,
      })
    },
  )
}
function pollMusic(): void {
  if (process.platform !== 'darwin') return
  execFile(
    '/usr/bin/osascript',
    ['-e', musicScript],
    { timeout: 1500 },
    (error, stdout) => {
      let apple = {
        state: 'idle',
        title: undefined as string | undefined,
        artist: undefined as string | undefined,
        shuffle: false,
        repeat: 'off' as 'off' | 'all' | 'one',
        duration: undefined as number | undefined,
        position: undefined as number | undefined,
        genre: undefined as string | undefined,
        album: undefined as string | undefined,
      }
      if (!error) {
        const [
          state,
          title,
          artist,
          shuffle,
          repeat,
          duration,
          position,
          genre,
          album,
        ] = stdout.trim().split('\n')
        const clean = (value: string | undefined) =>
          !value || value === 'missing value' ? undefined : value
        apple = {
          state,
          title,
          artist,
          shuffle: shuffle === 'true',
          repeat: repeat === 'all' || repeat === 'one' ? repeat : 'off',
          duration: Number(duration) || undefined,
          position: Number(position) || undefined,
          genre: clean(genre),
          album: clean(album),
        }
      }
      readAudio((audio) => {
        const { muted, volume } = audio
        if (apple.state === 'playing') {
          musicSource = 'apple'
          applyMusic({
            playing: true,
            title: apple.title,
            artist: apple.artist,
            source: 'apple',
            shuffle: apple.shuffle,
            repeat: apple.repeat,
            muted,
            volume,
            duration: apple.duration,
            position: apple.position,
            album: apple.album,
            genre: apple.genre,
          })
          return
        }
        pollSystemMusic((system) => {
          if (system) {
            musicSource = 'system'
            applyMusic({ ...system, source: 'system', muted, volume })
            return
          }
          if (apple.state === 'paused' && apple.title) {
            musicSource = 'apple'
            applyMusic({
              playing: false,
              title: apple.title,
              artist: apple.artist,
              source: 'apple',
              shuffle: apple.shuffle,
              repeat: apple.repeat,
              muted,
              volume,
              duration: apple.duration,
              position: apple.position,
              album: apple.album,
              genre: apple.genre,
            })
            return
          }
          applyMusic({ playing: false, muted, volume, position: 0 })
        })
      })
    },
  )
}
function pollSystemMusic(done: (state: MusicState | null) => void): void {
  execFile(musicHelperPath(), ['info'], { timeout: 2000 }, (error, stdout) => {
    if (error) {
      done(null)
      return
    }
    try {
      const parsed = JSON.parse(stdout.trim() || '{}') as {
        title?: string
        artist?: string
        rate?: number
        duration?: number
        elapsed?: number
      }
      if (!parsed.title) {
        done(null)
        return
      }
      done({
        playing: parsed.rate === 1,
        title: parsed.title,
        artist: parsed.artist,
        duration: parsed.duration,
        position: parsed.elapsed,
      })
    } catch {
      done(null)
    }
  })
}
type MusicAction =
  | 'previous'
  | 'toggle'
  | 'next'
  | 'shuffle'
  | 'repeat'
  | 'mute'
function lyricsDirectory(): string {
  return join(dataRoot, 'lyrics')
}
function currentTrackKey(): string | undefined {
  if (!music.title) return undefined
  return `${music.title}|${music.artist ?? ''}|${Math.round(music.duration ?? 0)}`
}
function currentBubbleKey(): string | undefined {
  if (!music.title) return undefined
  return `${music.title}|${music.artist ?? ''}`
}
function bubbleThresholds(): number[] {
  if (music.duration && music.duration > 0)
    return [0.2, 0.55, 0.85].map((fraction) => music.duration! * fraction)
  return [40, 120, 210]
}
function bubbleBlocked(): boolean {
  return dropMode || lyricsOpen || !barVisible || Boolean(drag?.moving)
}
async function loadBubbleLyrics(key: string): Promise<void> {
  bubbleLyricsKey = key
  const meta = lyricsMeta()
  const cached = await readCachedLyrics(key)
  if (cached) {
    if (bubbleLyricsKey === key)
      bubbleLyrics = localizeLyrics(cached, meta)
    return
  }
  try {
    const fetched = await fetchLyrics(key)
    if (bubbleLyricsKey === key)
      bubbleLyrics = localizeLyrics(fetched, meta)
  } catch {
    /* bubbles fall back to title/artist copy */
  }
}
function resetBubbleTrack(): void {
  bubbleTrackKey = currentBubbleKey()
  bubbleStep = 0
  bubbleUsed = new Set<string>()
  bubbleUsedCategories = new Set<BubbleCategory>()
  bubbleLyrics = undefined
  bubbleLyricsKey = undefined
  bubbleElapsed = Math.max(0, music.position ?? 0)
  if (!bubbleTrackKey) {
    bubbleElapsed = 0
    return
  }
  const thresholds = bubbleThresholds()
  bubbleStep = thresholds.filter((threshold) => bubbleElapsed >= threshold).length
  const key = currentTrackKey()
  if (key) void loadBubbleLyrics(key)
}
function hideBubble(): void {
  if (bubbleHideTimer) {
    clearTimeout(bubbleHideTimer)
    bubbleHideTimer = undefined
  }
  if (!bubbleText) return
  bubbleText = undefined
  syncOverlays()
  broadcast()
}
function showBubble(): void {
  if (!music.title || bubbleText) return
  const lyricText = bubbleLyrics?.plain ?? bubbleLyrics?.synced ?? undefined
  const track: BubbleTrack = {
    title: localizeName(music.title, lyricText, lyricsMeta()) ?? music.title,
    artist: localizeName(music.artist, lyricText, lyricsMeta()),
    album: localizeName(music.album, lyricText, lyricsMeta()),
    genre: music.genre,
    lyrics: lyricText,
    instrumental: bubbleLyrics?.instrumental,
  }
  const mood = detectMood(track)
  const hasLyric = Boolean(track.lyrics) && !track.instrumental
  const categories = bubbleCategories(track, hasLyric)
  const unused = categories.filter(
    (category) => !bubbleUsedCategories.has(category),
  )
  const draft = pickBubble(
    track,
    mood,
    unused.length ? unused : categories,
    bubbleUsed,
    bubbleRecent,
  )
  if (!draft) return
  bubbleStep += 1
  bubbleUsedCategories.add(draft.category)
  bubbleText = draft.text
  bubbleMood = mood
  bubbleRecent = [...bubbleRecent, draft.text].slice(-12)
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  bubbleHideTimer = setTimeout(hideBubble, 5200)
  syncOverlays()
  broadcast()
}
function bubbleTick(): void {
  const now = Date.now()
  const delta = bubbleLastTick
    ? Math.min(Math.max((now - bubbleLastTick) / 1000, 0), 3)
    : 0
  bubbleLastTick = now
  const key = currentBubbleKey()
  if (!key) {
    if (bubbleTrackKey) resetBubbleTrack()
    return
  }
  if (key !== bubbleTrackKey) resetBubbleTrack()
  if (!music.playing || bubbleText) return
  if (
    typeof music.position === 'number' &&
    bubbleElapsed > 10 &&
    music.position + 10 < bubbleElapsed
  ) {
    // Repeat-one or a manual restart: treat it as a fresh play of the song.
    resetBubbleTrack()
    return
  }
  if (typeof music.position === 'number' && music.position > bubbleElapsed)
    bubbleElapsed = music.position
  else bubbleElapsed += delta
  if (bubbleBlocked()) return
  const threshold = bubbleThresholds()[bubbleStep]
  if (threshold !== undefined && bubbleElapsed >= threshold) showBubble()
}
async function readCachedLyrics(key: string): Promise<LyricsState | undefined> {
  try {
    const file = join(
      lyricsDirectory(),
      `${createHash('sha1').update(key).digest('hex')}.json`,
    )
    const parsed = JSON.parse(await readFile(file, 'utf8')) as LyricsState
    return parsed.key === key ? parsed : undefined
  } catch {
    return undefined
  }
}
async function writeCachedLyrics(state: LyricsState): Promise<void> {
  await mkdir(lyricsDirectory(), { recursive: true })
  const file = join(
    lyricsDirectory(),
    `${createHash('sha1').update(state.key).digest('hex')}.json`,
  )
  await writeFile(file, JSON.stringify(state), { mode: 0o600 })
}
async function fetchLyrics(key: string): Promise<LyricsState> {
  const [title, artist, duration] = key.split('|')
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
  })
  if (Number(duration) > 0) params.set('duration', duration)
  const response = await fetch(`https://lrclib.net/api/get?${params}`, {
    headers: {
      'User-Agent':
        'maoqumengzai-desktop/0.0.1 (https://github.com/qimei-it/maoqumengzai-desktop-pet)',
    },
    signal: AbortSignal.timeout(5000),
  })
  if (response.status === 404) {
    const missing: LyricsState = {
      key,
      synced: null,
      plain: null,
      instrumental: false,
      missing: true,
    }
    await writeCachedLyrics(missing)
    return missing
  }
  if (!response.ok) throw new Error('歌词服务暂时不可用。')
  const data = (await response.json()) as {
    syncedLyrics?: string | null
    plainLyrics?: string | null
    instrumental?: boolean
  }
  const result: LyricsState = {
    key,
    synced: data.syncedLyrics ?? null,
    plain: data.plainLyrics ?? null,
    instrumental: Boolean(data.instrumental),
  }
  await writeCachedLyrics(result)
  return result
}
function lyricsMeta(): LyricsMeta {
  return { title: music.title, artist: music.artist, genre: music.genre }
}
async function loadLyricsFor(key: string): Promise<void> {
  lyricsKey = key
  const meta = lyricsMeta()
  const cached = await readCachedLyrics(key)
  if (lyricsKey !== key) return
  if (cached) {
    lyrics = localizeLyrics(cached, meta)
  } else {
    try {
      const fetched = await fetchLyrics(key)
      if (lyricsKey === key) lyrics = localizeLyrics(fetched, meta)
    } catch {
      if (lyricsKey === key) lyrics = undefined
    }
  }
  syncOverlays()
  broadcast()
}
async function toggleLyrics(): Promise<void> {
  if (lyricsOpen) {
    lyricsOpen = false
    syncOverlays()
    broadcast()
    return
  }
  const key = currentTrackKey()
  if (!key) return
  lyricsOpen = true
  syncOverlays()
  broadcast()
  if (lyricsKey === key && lyrics) return
  await loadLyricsFor(key)
}
function setVolume(value: number): void {
  if (process.platform !== 'darwin') return
  const next = Math.min(100, Math.max(0, Math.round(value)))
  volumeBeforeMute = next > 0 ? next : volumeBeforeMute
  applyMusic({ ...music, volume: next, muted: false })
  execFile(
    '/usr/bin/osascript',
    ['-e', `set volume output volume ${next}\nset volume output muted false`],
    () => setTimeout(pollMusic, 400),
  )
}
function setVolumePopup(show: boolean): void {
  if (!volumePopup || volumePopup.isDestroyed()) return
  if (show) {
    if (volumeHideTimer) clearTimeout(volumeHideTimer)
    volumeHideTimer = undefined
    positionVolumePopup()
    volumePopup.showInactive()
    volumePopup.moveTop()
    return
  }
  if (volumeHideTimer) clearTimeout(volumeHideTimer)
  volumeHideTimer = setTimeout(() => {
    volumeHideTimer = undefined
    volumePopup?.hide()
  }, 320)
}
function positionVolumePopup(): void {
  if (!volumePopup || volumePopup.isDestroyed() || !pill) return
  const b = pill.getBounds()
  const width = 40
  const height = 122
  const x = Math.round(b.x + b.width - 20 - width / 2)
  const y = b.y - height - 6
  volumePopup.setBounds(fitToDisplays({ x, y, width, height }, areas()))
}
function controlMusic(action: MusicAction): void {
  if (process.platform !== 'darwin') return
  if (action === 'mute') {
    if (music.muted) {
      const restore = volumeBeforeMute > 0 ? volumeBeforeMute : 50
      applyMusic({ ...music, muted: false, volume: restore })
      execFile(
        '/usr/bin/osascript',
        ['-e', `set volume output volume ${restore}\nset volume output muted false`],
        () => setTimeout(pollMusic, 500),
      )
    } else {
      if ((music.volume ?? 0) > 0) volumeBeforeMute = music.volume!
      applyMusic({ ...music, muted: true, volume: 0 })
      execFile(
        '/usr/bin/osascript',
        ['-e', 'set volume output muted true'],
        () => setTimeout(pollMusic, 500),
      )
    }
    return
  }
  if ((action === 'shuffle' || action === 'repeat') && music.source !== 'apple')
    return
  if (action === 'toggle') applyMusic({ ...music, playing: !music.playing })
  if (action === 'shuffle') applyMusic({ ...music, shuffle: !music.shuffle })
  if (action === 'repeat') {
    const next = music.repeat === 'off' ? 'all' : music.repeat === 'all' ? 'one' : 'off'
    applyMusic({ ...music, repeat: next })
  }
  if (musicSource === 'apple') {
    const script =
      action === 'shuffle'
        ? 'tell application "Music" to set shuffle enabled to not (shuffle enabled)'
        : action === 'repeat'
          ? 'tell application "Music"\nset r to song repeat as text\nif r is "off" then\nset song repeat to all\nelse if r is "all" then\nset song repeat to one\nelse\nset song repeat to off\nend if\nend tell'
          : action === 'previous'
            ? 'tell application "Music" to previous track'
            : action === 'toggle'
              ? 'tell application "Music" to playpause'
              : 'tell application "Music" to next track'
    execFile('/usr/bin/osascript', ['-e', script], () => setTimeout(pollMusic, 700))
    return
  }
  const command = action === 'previous' ? 'previous' : action === 'toggle' ? 'toggle' : 'next'
  execFile(musicHelperPath(), [command], () => setTimeout(pollMusic, 700))
}
function areas(): Rect[] {
  return screen.getAllDisplays().map((d) => d.workArea)
}
/** Place the pet at once. */
function placePet(bounds: Rect): void {
  if (!pet.isDestroyed()) pet.setBounds(bounds)
}
function persist(bounds = wheelOpen && baseBounds ? baseBounds : pet.getBounds()): void {
  const value = JSON.stringify({ version: 1, scale, bounds })
  persistQueue = persistQueue
    .then(async () => {
      await writeFile(`${statePath}.tmp`, value, { mode: 0o600 })
      await rename(`${statePath}.tmp`, statePath)
    })
    .catch(() => {
      addEvent('窗口位置保存失败；当前交互仍可使用。')
    })
}
function recover(): void {
  drag = undefined
  dropMode = false
  wheelOpen = false
  baseBounds = undefined
  received = undefined
  setPassthrough(false)
  const a = screen.getPrimaryDisplay().workArea
  placePet(
    fitToDisplays(
      {
        x: a.x + a.width - Math.round(basePetSize.width * scale) - 40,
        y: a.y + a.height - Math.round(basePetSize.height * scale) - 32,
        width: Math.round(basePetSize.width * scale),
        height: Math.round(basePetSize.height * scale),
      },
      [a],
    ),
  )
  pet.showInactive()
  persist()
  addEvent('已恢复标记位置与鼠标交互。')
}
function reconcileDisplays(): void {
  drag = undefined
  const current = pet.getBounds()
  // Shrinking back keeps the sprite where the user left it, because the
  // expanded window was grown symmetrically around the same center.
  const baseWidth = Math.round(basePetSize.width * scale)
  const baseHeight = Math.round(basePetSize.height * scale)
  placePet(
    fitToDisplays(
      wheelOpen
        ? {
            x: current.x + Math.round((current.width - baseWidth) / 2),
            y: current.y + Math.round((current.height - baseHeight) / 2),
            width: baseWidth,
            height: baseHeight,
          }
        : current,
      areas(),
    ),
  )
  wheelOpen = false
  baseBounds = undefined
  mask = undefined
  setPassthrough(false)
  persist()
  addEvent('显示环境变化：已重新约束窗口位置。')
}
function authorized(
  event: IpcMainInvokeEvent | IpcMainEvent,
  role: 'pet' | 'lab' | 'either' = 'either',
): void {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (
    !window ||
    (window !== pet &&
      window !== lab &&
      window !== pocket &&
      window !== pill &&
      window !== volumePopup &&
      window !== eye) ||
    event.senderFrame !== event.sender.mainFrame
  )
    throw new Error('请求来源未获授权。')
  if ((role === 'pet' && window !== pet) || (role === 'lab' && window !== lab))
    throw new Error('此窗口没有该操作权限。')
  const source = new URL(event.senderFrame.url)
  if (devUrl) {
    if (source.origin !== new URL(devUrl).origin)
      throw new Error('请求来源未获授权。')
  } else if (
    source.protocol !== 'file:' ||
    source.pathname !== new URL(pathToFileURL(rendererPath).href).pathname
  )
    throw new Error('请求来源未获授权。')
}
function handle<T>(
  channel: string,
  role: 'pet' | 'lab' | 'either',
  callback: (event: IpcMainInvokeEvent, payload: unknown) => Promise<T> | T,
): void {
  ipcMain.handle(channel, async (event, payload): Promise<Result<T>> => {
    try {
      authorized(event, role)
      return { ok: true, value: await callback(event, payload) }
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError
          ? '请求参数不符合约定。'
          : error instanceof Error && !('code' in error)
            ? error.message
            : '本地操作失败，请检查文件是否存在、权限和可用空间。'
      return { ok: false, error: errorMessage }
    }
  })
}
async function inspectFile(path: string): Promise<{
  path: string
  size: number
  modifiedAt: number
  device: number
  inode: number
}> {
  if (!isAbsolute(path)) throw new Error('只接受本地绝对路径。')
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('原型只接收普通文件；文件夹和符号链接暂不支持。')
  return {
    path: await realpath(path),
    size: info.size,
    modifiedAt: info.mtimeMs,
    device: info.dev,
    inode: info.ino,
  }
}
async function receivePaths(paths: string[]): Promise<void> {
  // Validate the complete batch before mutating the registry.
  const inspected = await Promise.all(paths.map(inspectFile))
  const known = new Set([...files.values()].map((file) => file.path))
  const additions = inspected.filter((item) => {
    if (known.has(item.path)) return false
    known.add(item.path)
    return true
  })
  if (files.size + additions.length > 100)
    throw new Error('当前原型最多保留 100 条文件记录，请先移除记录。')
  for (const item of additions) {
    const id = randomUUID()
    files.set(id, {
      ...item,
      id,
      name: basename(item.path),
      status: 'received',
    })
  }
  dropMode = false
  receiveToken += 1
  received = {
    token: receiveToken,
    fileIds: inspected
      .map(
        (item) =>
          [...files.values()].find((file) => file.path === item.path)?.id,
      )
      .filter((id): id is string => !!id),
  }
  addEvent(
    `已接收 ${inspected.length} 个本地文件；只登记索引，不读取正文或上传。`,
  )
}
async function eatFiles(fileIds: string[]): Promise<void> {
  const targets: { file: LocalFile; path: string }[] = []
  for (const id of fileIds) {
    const file = files.get(id)
    if (!file) throw new Error('文件记录不存在。')
    targets.push({ file, path: await registeredFile(id) })
  }
  if (!targets.length) throw new Error('没有可吃掉的文件。')
  await mkdir(bellyDirectory, { recursive: true, mode: 0o700 })
  const moved: StoredBellyEntry[] = []
  try {
    for (const target of targets) {
      const entryId = randomUUID()
      const folder = join(bellyDirectory, entryId)
      await mkdir(folder, { recursive: true, mode: 0o700 })
      const storedPath = join(folder, basename(target.path))
      await movePath(target.path, storedPath)
      moved.push({
        id: entryId,
        name: target.file.name,
        size: target.file.size,
        eatenAt: Date.now(),
        expiresAt: Date.now() + bellyRetentionMs,
        originalPath: target.path,
        storedPath,
      })
    }
  } catch (error) {
    // Put back everything that already moved so a partial batch is never lost.
    for (const entry of moved) {
      await movePath(entry.storedPath, entry.originalPath).catch(() => {})
      await rm(dirname(entry.storedPath), { recursive: true, force: true })
    }
    throw error
  }
  belly.push(...moved)
  for (const target of targets) files.delete(target.file.id)
  await saveBelly()
  await saveShelf()
  addEvent(`已吃掉 ${moved.length} 个文件；7 天内可在置物架取回。`)
}
async function restoreEaten(entryId: string): Promise<void> {
  const entry = belly.find((candidate) => candidate.id === entryId)
  if (!entry) throw new Error('这项已被取回或清理。')
  const destination = await freeRestorePath(entry.originalPath)
  await movePath(entry.storedPath, destination)
  belly = belly.filter((candidate) => candidate.id !== entryId)
  await rm(dirname(entry.storedPath), { recursive: true, force: true })
  await saveBelly()
  addEvent(`已取回「${entry.name}」；原文件已回到本地磁盘。`)
}
async function registeredFile(id: string): Promise<string> {
  const file = files.get(id)
  if (!file) throw new Error('文件记录不存在。')
  const current = await inspectFile(file.path)
  if (current.device !== file.device || current.inode !== file.inode)
    throw new Error('源文件已被替换，请重新投递。')
  return file.path
}
function trayImage(): Electron.NativeImage {
  const image = nativeImage.createFromPath(iconPath('trayTemplate.png'))
  if (image.isEmpty()) throw new Error('本地图标资源缺失。')
  image.setTemplateImage(process.platform === 'darwin')
  return image
}
function iconPath(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons', name)
    : join(app.getAppPath(), 'resources/icons', name)
}
function setupIpc(): void {
  handle(channels.snapshot, 'either', () => snapshot())
  handle(channels.mask, 'pet', (_event, payload) => {
    mask = maskSchema.parse(payload)
    broadcast()
  })
  handle(channels.pointer, 'pet', (_event, payload) => {
    const phase = pointerSchema.parse(payload)
    if (phase === 'down') {
      if (dropMode) return
      drag = {
        origin: screen.getCursorScreenPoint(),
        bounds: pet.getBounds(),
        moving: false,
        startedAt: Date.now(),
      }
      setPassthrough(false)
    } else if (drag) {
      const cursor = screen.getCursorScreenPoint()
      if (phase === 'up' && movedBeyondThreshold(drag.origin, cursor)) {
        drag.moving = true
      }
      const click = phase === 'up' && !drag.moving
      if (drag.moving) {
        // Include the release position even if the gesture finished between polling ticks.
        const releasedBounds =
          phase === 'up'
            ? {
                ...drag.bounds,
                x: drag.bounds.x + cursor.x - drag.origin.x,
                y: drag.bounds.y + cursor.y - drag.origin.y,
              }
            : pet.getBounds()
        placePet(fitToDisplays(releasedBounds, areas()))
        persist()
        addEvent('拖动结束，位置已保存。')
      }
      drag = undefined
      if (click) showPocket()
    }
  })
  handle(channels.command, 'either', async (event, payload) => {
    const command = commandSchema.parse(payload)
    const sharedActions = [
      'show-pocket',
      'hide-pocket',
      'drop-mode',
      'remove-file',
      'reveal-file',
      'stash-file',
      'save-copy',
      'wheel',
      'eat-files',
      'restore-eaten',
      'music-control',
      'volume-popup',
      'volume',
      'bar-toggle',
      'lyrics',
    ]
    if (command.type !== 'show-lab' && !sharedActions.includes(command.type))
      authorized(event, 'lab')
    if (command.type === 'show-lab' && app.isPackaged)
      throw new Error('开发诊断仅在开发版本可用。')
    switch (command.type) {
      case 'show-lab':
        showLab()
        break
      case 'show-pocket':
        showPocket()
        break
      case 'hide-pocket':
        pocket.hide()
        break
      case 'recover':
        recover()
        break
      case 'drop-mode':
        dropMode = command.enabled
        drag = undefined
        if (dropMode) {
          received = undefined
          closeWheelWindow()
        }
        setPassthrough(false)
        syncOverlays()
        addEvent(
          dropMode
            ? '文件投递模式已开启，整块接收区域可投递。'
            : '文件投递模式已关闭。',
        )
        break
      case 'scale': {
        scale = command.scale
        mask = undefined
        setPassthrough(false)
        wheelOpen = false
        baseBounds = undefined
        const old = pet.getBounds()
        const width = Math.round(basePetSize.width * scale)
        const height = Math.round(basePetSize.height * scale)
        placePet(
          fitToDisplays(
            {
              x: old.x + Math.round((old.width - width) / 2),
              y: old.y + Math.round((old.height - height) / 2),
              width,
              height,
            },
            areas(),
          ),
        )
        persist()
        addEvent(`显示比例切换为 ${scale} 倍。`)
        break
      }
      case 'move-display': {
        const display = screen
          .getAllDisplays()
          .find((d) => d.id === command.displayId)
        if (!display) throw new Error('该显示器已断开，请刷新环境。')
        closeWheelWindow()
        const a = display.workArea
        const width = Math.round(basePetSize.width * scale)
        const height = Math.round(basePetSize.height * scale)
        placePet(
          fitToDisplays(
            {
              x: a.x + a.width - width - 32,
              y: a.y + a.height - height - 32,
              width,
              height,
            },
            [a],
          ),
        )
        persist()
        addEvent('标记已移到所选显示器。')
        break
      }
      case 'remove-file': {
        const file = files.get(command.fileId)
        files.delete(command.fileId)
        try {
          await saveShelf()
        } catch (error) {
          if (file) files.set(file.id, file)
          throw error
        }
        addEvent('已移除文件索引；源文件保留。')
        break
      }
      case 'reveal-file':
        shell.showItemInFolder(await registeredFile(command.fileId))
        break
      case 'stash-file': {
        await registeredFile(command.fileId)
        const file = files.get(command.fileId)!
        const previous = file.status
        file.status = 'shelved'
        try {
          await saveShelf()
        } catch (error) {
          file.status = previous
          throw error
        }
        addEvent('已暂存到本地置物架；重启后可继续使用。')
        break
      }
      case 'wheel':
        if (command.open) openWheelWindow()
        else closeWheelWindow()
        break
      case 'eat-files':
        await eatFiles(command.fileIds)
        received = undefined
        closeWheelWindow()
        break
      case 'restore-eaten':
        await restoreEaten(command.entryId)
        break
      case 'music-control':
        controlMusic(command.action)
        break
      case 'lyrics':
        void toggleLyrics()
        break
      case 'bar-toggle':
        barVisible = !barVisible
        syncOverlays()
        broadcast()
        break
      case 'volume-popup':
        setVolumePopup(command.show)
        break
      case 'volume':
        setVolume(command.value)
        break
      case 'save-copy': {
        const original = await registeredFile(command.fileId)
        const owner = BrowserWindow.fromWebContents(event.sender)!
        const destination = await dialog.showSaveDialog(owner, {
          title: '另存文件副本',
          defaultPath: basename(original),
        })
        if (!destination.canceled && destination.filePath) {
          if (destination.filePath === original)
            throw new Error('请选择不同的保存位置，保留原文件。')
          try {
            if ((await realpath(destination.filePath)) === original)
              throw new Error('请选择不同的保存位置，保留原文件。')
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
          try {
            const [sourceInfo, targetInfo] = await Promise.all([
              lstat(original),
              lstat(destination.filePath),
            ])
            if (
              sourceInfo.dev === targetInfo.dev &&
              sourceInfo.ino === targetInfo.ino
            )
              throw new Error('请选择不同的保存位置，保留原文件。')
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          }
          await copyFile(original, destination.filePath)
          addEvent('文件副本已保存到所选位置。')
        }
        break
      }
      case 'refresh':
        addEvent('已刷新权限与显示器状态。')
        break
      case 'open-data': {
        const error = await shell.openPath(dataRoot)
        if (error) throw new Error('无法打开本地数据目录。')
        break
      }
      case 'screen-settings':
        if (process.platform === 'darwin')
          await shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
          )
        else throw new Error('请在系统设置中检查屏幕捕获权限。')
        break
      case 'quit':
        app.quit()
        break
    }
    if (pocket.isVisible()) positionPocket()
    broadcast()
    return snapshot()
  })
  handle(channels.selectFiles, 'either', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const selection = await dialog.showOpenDialog(owner!, {
      title: '选择本地文件',
      properties: ['openFile', 'multiSelections'],
    })
    if (!selection.canceled) {
      await receivePaths(pathsSchema.parse(selection.filePaths))
      // The shelf stays a separate surface; a drag onto the pet uses the donut.
      if (owner !== pet) showPocket()
    }
    return snapshot()
  })
  handle(channels.receiveFiles, 'either', async (event, payload) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    await receivePaths(pathsSchema.parse(payload))
    if (owner !== pet) showPocket()
    return snapshot()
  })
  ipcMain.on(channels.startDrag, async (event, payload) => {
    try {
      authorized(event)
      const path = await registeredFile(fileIdSchema.parse(payload))
      if (event.sender.isDestroyed()) return
      event.sender.startDrag({
        file: path,
        icon: nativeImage.createFromPath(iconPath('file-drag.png')),
      })
      addEvent('已调用系统文件拖出；是否落入目标应用需按原生投递结果核验。')
    } catch {
      addEvent('文件拖出失败：请检查源文件和文件记录。')
    }
  })
  handle(channels.capture, 'lab', async () => {
    previews.clear()
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 640, height: 360 },
      fetchWindowIcons: false,
    })
    for (const source of sources)
      if (!source.thumbnail.isEmpty())
        previews.set(source.id, {
          id: source.id,
          name: source.name,
          dataUrl: source.thumbnail.toDataURL(),
        })
    if (!previews.size)
      throw new Error('未获得可用屏幕预览，请检查系统屏幕录制权限并刷新。')
    addEvent(`已取得 ${previews.size} 个屏幕的权限验证缩略图；仅驻留内存。`)
    return [...previews.values()]
  })
  handle(channels.saveCapture, 'lab', async (_event, payload) => {
    const preview = previews.get(captureIdSchema.parse(payload))
    if (!preview) throw new Error('预览已失效，请重新获取。')
    const selection = await dialog.showSaveDialog(lab!, {
      title: '保存权限验证缩略图',
      defaultPath: 'mqmz-screen-preview.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
    if (!selection.canceled && selection.filePath) {
      await writeFile(
        selection.filePath,
        nativeImage.createFromDataURL(preview.dataUrl).toPNG(),
      )
      await receivePaths([selection.filePath])
      addEvent('验证缩略图已保存到用户选择的位置。')
    }
    return snapshot()
  })
}

function secureWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  )
  window.webContents.on('did-finish-load', broadcast)
  window.webContents.on('render-process-gone', () => {
    drag = undefined
    mask = undefined
    setPassthrough(false)
    addEvent('渲染进程异常，已恢复鼠标交互；请从托盘恢复或重启。')
  })
}
async function load(window: BrowserWindow, view: string): Promise<void> {
  if (devUrl) await window.loadURL(`${devUrl}/?view=${view}`)
  else await window.loadFile(rendererPath, { query: { view } })
}
async function createWindows(): Promise<void> {
  const primary = screen.getPrimaryDisplay().workArea
  let bounds: Rect = {
    x: primary.x + primary.width - 280,
    y: primary.y + primary.height - 280,
    width: basePetSize.width,
    height: basePetSize.height,
  }
  try {
    const saved = z
      .object({
        version: z.literal(1),
        scale: z.union([
          z.literal(0.75),
          z.literal(1),
          z.literal(1.5),
          z.literal(2),
        ]),
        bounds: z.object({
          x: z.number().finite(),
          y: z.number().finite(),
          width: z.number().positive().max(1000),
          height: z.number().positive().max(1000),
        }),
      })
      .parse(JSON.parse(await readFile(statePath, 'utf8')))
    scale = saved.scale
    bounds = {
      ...saved.bounds,
      width: Math.round(basePetSize.width * scale),
      height: Math.round(basePetSize.height * scale),
    }
  } catch {
    /* First launch or invalid local state: use safe defaults. */
  }
  pet = new BrowserWindow({
    ...fitToDisplays(bounds, areas()),
    title: '毛趣萌仔 · 交互标记',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.platform === 'darwin')
    pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  pocket = new BrowserWindow({
    width: 352,
    height: 438,
    title: '毛趣萌仔 · 文件置物架',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.platform === 'darwin')
    pocket.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  notes = new BrowserWindow({
    width: 240,
    height: 240,
    title: '毛趣萌仔 · 音符',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  notes.setIgnoreMouseEvents(true)
  if (process.platform === 'darwin') {
    notes.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    notes.setHiddenInMissionControl(true)
  }
  pill = new BrowserWindow({
    width: 256,
    height: 40,
    title: '毛趣萌仔 · 音乐控制',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.platform === 'darwin') {
    pill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    pill.setHiddenInMissionControl(true)
  }
  volumePopup = new BrowserWindow({
    width: 40,
    height: 122,
    title: '毛趣萌仔 · 音量',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.platform === 'darwin') {
    volumePopup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    volumePopup.setHiddenInMissionControl(true)
  }
  eye = new BrowserWindow({
    width: 32,
    height: 32,
    title: '毛趣萌仔 · 音乐开关',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.platform === 'darwin') {
    eye.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    eye.setHiddenInMissionControl(true)
  }
  lyricsWindow = new BrowserWindow({
    width: 240,
    height: 88,
    title: '毛趣萌仔 · 歌词',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  lyricsWindow.setIgnoreMouseEvents(true)
  if (process.platform === 'darwin') {
    lyricsWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    })
    lyricsWindow.setHiddenInMissionControl(true)
  }
  bubbleWindow = new BrowserWindow({
    width: 248,
    height: 104,
    title: '毛趣萌仔 · 气泡',
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  bubbleWindow.setIgnoreMouseEvents(true)
  if (process.platform === 'darwin') {
    bubbleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    bubbleWindow.setHiddenInMissionControl(true)
  }
  lab = !app.isPackaged
    ? new BrowserWindow({
        width: 1024,
        height: 800,
        minWidth: 720,
        minHeight: 560,
        title: '毛趣萌仔 · P0 验证台',
        show: false,
        backgroundColor: '#f5f4f0',
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
    : undefined
  for (const window of [pet, pocket, lab, notes, pill, volumePopup, eye, lyricsWindow, bubbleWindow]) if (window) secureWindow(window)
  pocket.on('close', (event) => {
    if (!shuttingDown) {
      event.preventDefault()
      pocket.hide()
    }
  })
  lab?.on('close', (event) => {
    if (!shuttingDown) {
      event.preventDefault()
      lab?.hide()
    }
  })
  pet.on('close', (event) => {
    if (!shuttingDown) {
      event.preventDefault()
      recover()
    }
  })
  pet.on('move', () => {
    broadcast()
    if (pocket.isVisible()) positionPocket()
    if (notes?.isVisible()) positionNotes()
    if (pill?.isVisible()) positionPill()
    if (eye?.isVisible()) positionEye()
  })
  pet.on('resize', () => {
    if (notes?.isVisible()) positionNotes()
    if (pill?.isVisible()) positionPill()
    if (eye?.isVisible()) positionEye()
  })
  await restoreShelf()
  await restoreBelly()
  await purgeBelly()
  setupIpc()
  await Promise.all([
    load(pet, 'pet'),
    load(pocket, 'pocket'),
    load(notes, 'notes'),
    load(pill, 'pill'),
    load(volumePopup, 'volume'),
    load(eye, 'eye'),
    load(lyricsWindow, 'lyrics'),
    load(bubbleWindow, 'bubble'),
    ...(lab ? [load(lab, 'lab')] : []),
  ])
  pet.showInactive()
  tray = new Tray(trayImage())
  tray.setToolTip('毛趣萌仔 · P0 交互原型')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开文件置物架', click: showPocket },
      {
        label: '开启文件投递',
        click: () => {
          dropMode = true
          setPassthrough(false)
          broadcast()
        },
      },
      { label: '恢复标记位置', click: recover },
      ...(!app.isPackaged
        ? [{ label: '开发诊断（非正式版页面）', click: showLab }]
        : []),
      { type: 'separator' },
      { label: '退出毛趣萌仔', click: () => app.quit() },
    ]),
  )
  tray.on('click', showPocket)
  shortcutRegistered = globalShortcut.register(
    'CommandOrControl+Shift+M',
    () => {
      recover()
      showPocket()
    },
  )
  if (!shortcutRegistered) addEvent('恢复快捷键注册失败，请使用托盘恢复入口。')
  screen.on('display-added', reconcileDisplays)
  screen.on('display-removed', reconcileDisplays)
  screen.on('display-metrics-changed', reconcileDisplays)
  powerMonitor.on('resume', () => {
    reconcileDisplays()
    addEvent('系统唤醒，已恢复交互。')
  })
  // ~60fps while dragging: the window follows the cursor from this loop, so a
  // slower tick reads as a low frame rate.
  pollMusic()
  musicTimer = setInterval(pollMusic, 2500)
  bubbleLastTick = Date.now()
  bubbleTickTimer = setInterval(bubbleTick, 1000)
  pointerTimer = setInterval(() => {
    if (pet.isDestroyed() || shuttingDown) return
    const cursor = screen.getCursorScreenPoint()
    if (drag) {
      if (Date.now() - drag.startedAt > 15_000) {
        drag = undefined
        reconcileDisplays()
        return
      }
      if (!drag.moving && movedBeyondThreshold(drag.origin, cursor))
        drag.moving = true
      if (drag.moving)
        pet.setPosition(
          Math.round(drag.bounds.x + cursor.x - drag.origin.x),
          Math.round(drag.bounds.y + cursor.y - drag.origin.y),
        )
      setPassthrough(false)
    } else {
      const b = pet.getBounds()
      const inside =
        cursor.x >= b.x &&
        cursor.y >= b.y &&
        cursor.x < b.x + b.width &&
        cursor.y < b.y + b.height
      setPassthrough(
        !dropMode &&
          !wheelOpen &&
          (!inside || !hitOpaquePixel(mask, cursor.x - b.x, cursor.y - b.y)),
      )
    }
  }, 16)
  addEvent('真实 Electron 窗口已启动；交互标记不代表正式角色素材。')
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (pocket) showPocket()
  })
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null)
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      )
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
        (details, callback) => {
          const url = new URL(details.url)
          const allowed =
            !!devUrl &&
            url.hostname === '127.0.0.1' &&
            url.port === '5173' &&
            ['http:', 'ws:'].includes(url.protocol)
          if (!allowed) {
            blockedRequests++
            broadcast()
          }
          callback({ cancel: !allowed })
        },
      )
      await mkdir(dataRoot, { recursive: true })
      await createWindows()
    })
    .catch(() => {
      dialog.showErrorBox('毛趣萌仔启动失败', '请检查本地资源与数据目录权限。')
      app.exit(1)
    })
  app.on('activate', () => {
    if (pet && !pet.isDestroyed()) pet.showInactive()
  })
  app.on('before-quit', () => {
    shuttingDown = true
    if (pointerTimer) clearInterval(pointerTimer)
    if (musicTimer) clearInterval(musicTimer)
    if (bubbleTickTimer) clearInterval(bubbleTickTimer)
    notes?.destroy()
    pill?.destroy()
    volumePopup?.destroy()
    eye?.destroy()
    lyricsWindow?.destroy()
    bubbleWindow?.destroy()
    if (broadcastTimer) clearTimeout(broadcastTimer)
    globalShortcut.unregisterAll()
    tray?.destroy()
  })
  app.on('window-all-closed', () => {
    if (shuttingDown) app.quit()
  })
}
