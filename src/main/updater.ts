/**
 * In-app updates through a self-hosted manifest.
 *
 * The client reads `latest.json`, downloads the installer next to it, verifies
 * its SHA-256, opens it for the user and quits so the app bundle can be
 * replaced. On the next launch the downloaded installer is moved to the trash
 * once the running version has caught up.
 *
 * This replaces electron-updater on purpose: Squirrel.Mac refuses to replace an
 * unsigned bundle, and this build ships unsigned.
 */

import { app, dialog, shell } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  statSync,
} from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  compareVersions,
  pickUpdateAsset,
  updateAssetUrl,
  updateCheckTimeoutMs,
  updateDownloadTimeoutMs,
  updateManifestSchema,
  updateManifestUrl,
  type UpdateAsset,
  type UpdateState,
  type UpdateStatus,
} from '../shared/update'

const startupDelayMs = 15_000
const retryDelayMs = 6 * 60 * 60 * 1000
const progressIntervalMs = 500
/** Give the toast a moment to be read before the window disappears. */
const quitDelayMs = 1500

type PendingUpdate = {
  version: string
  path: string
  platform: string
  downloadedAt: number
}

let state: UpdateState = { status: 'idle' }
let initialized = false
let notifying: (() => void) | undefined
let messaging: ((text: string) => void) | undefined
let pending: { version: string; asset: UpdateAsset } | undefined
let startupTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let quitTimer: ReturnType<typeof setTimeout> | undefined
let unsavedReader: (() => string[]) | undefined

/** Human names for the windows that can hold work worth confirming. */
const unsavedLabels: Record<string, string> = {
  'mail-compose': '邮件撰写',
  'agent-input': '智能体输入框',
}

export function updatesEnabled(): boolean {
  return app.isPackaged
}

/** Copy sent to the renderer; never exposes the manifest URL. */
export function updateSnapshot(): UpdateState {
  return state
}

function setState(next: Partial<UpdateState> & { status: UpdateStatus }): void {
  state = next
  notifying?.()
}

function clearTimers(): void {
  if (startupTimer) clearTimeout(startupTimer)
  if (retryTimer) clearTimeout(retryTimer)
  startupTimer = undefined
  retryTimer = undefined
}

function scheduleRetry(): void {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    void checkForUpdates()
  }, retryDelayMs)
}

function message(text: string): void {
  messaging?.(text)
}

/* ---------------- pending marker ---------------- */

function markerPath(): string {
  return join(app.getPath('userData'), 'update-pending.json')
}

async function readPendingUpdate(): Promise<PendingUpdate | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(markerPath(), 'utf8'),
    ) as Partial<PendingUpdate>
    if (
      typeof parsed.version === 'string' &&
      typeof parsed.path === 'string' &&
      parsed.path.length > 0
    ) {
      return {
        version: parsed.version,
        path: parsed.path,
        platform:
          typeof parsed.platform === 'string' ? parsed.platform : process.platform,
        downloadedAt:
          typeof parsed.downloadedAt === 'number' ? parsed.downloadedAt : 0,
      }
    }
  } catch {
    // No marker, or a damaged one, both mean "nothing pending".
  }
  return undefined
}

async function writePendingUpdate(marker: PendingUpdate): Promise<void> {
  await writeFile(markerPath(), `${JSON.stringify(marker, null, 2)}\n`)
}

async function clearPendingUpdate(): Promise<void> {
  await rm(markerPath(), { force: true }).catch(() => {})
}

/** Moves the installer to the trash so the upgrade stays undoable. */
async function discardInstaller(file: string): Promise<boolean> {
  if (!existsSync(file)) return true
  try {
    await shell.trashItem(file)
    return true
  } catch {
    try {
      await rm(file, { force: true })
      return true
    } catch {
      return false
    }
  }
}

async function detachUpdateVolume(): Promise<void> {
  if (process.platform !== 'darwin') return
  const volume = `/Volumes/${app.getName()}`
  if (!existsSync(volume)) return
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('hdiutil', ['detach', volume], (error) =>
        error ? reject(error) : resolve(),
      )
    })
  } catch {
    // An already-ejected volume is fine.
  }
}

/**
 * Startup housekeeping: if the running version reached the version recorded in
 * the marker, the replacement worked, so drop the installer and the marker.
 * If the user did not install, keep everything for a later retry.
 */
async function finishPendingUpdate(): Promise<void> {
  const marker = await readPendingUpdate()
  if (!marker) return
  if (compareVersions(app.getVersion(), marker.version) < 0) return
  const removed = await discardInstaller(marker.path)
  if (!removed) return
  await clearPendingUpdate()
  await detachUpdateVolume()
  message(`已升级到 v${marker.version}，安装包已移到废纸篓`)
}

/* ---------------- check / download / install ---------------- */

export async function checkForUpdates(): Promise<UpdateState> {
  if (!updatesEnabled()) {
    setState({ status: 'unavailable' })
    return state
  }
  if (state.status === 'checking' || state.status === 'downloading') return state
  setState({ status: 'checking' })
  try {
    const url = new URL(updateManifestUrl)
    // Bypass any intermediate cache so a fresh release is seen immediately.
    url.searchParams.set('t', String(Date.now()))
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(updateCheckTimeoutMs),
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const manifest = updateManifestSchema.parse(await response.json())
    const current = app.getVersion()
    if (compareVersions(manifest.version, current) <= 0) {
      pending = undefined
      setState({ status: 'up-to-date', version: current })
      scheduleRetry()
      return state
    }
    const asset = pickUpdateAsset(manifest, process.platform, process.arch)
    if (!asset) {
      pending = undefined
      setState({
        status: 'error',
        version: manifest.version,
        error: '新版本没有提供适用于当前系统的安装包。',
      })
      return state
    }
    pending = { version: manifest.version, asset }
    setState({
      status: 'available',
      version: manifest.version,
      ...(manifest.notes ? { notes: manifest.notes } : {}),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : ''
    setState({
      status: 'error',
      error: detail ? `检查更新失败：${detail}` : '检查更新失败，请稍后重试。',
    })
    scheduleRetry()
  }
  return state
}

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

async function reuseDownloaded(
  file: string,
  asset: UpdateAsset,
): Promise<boolean> {
  if (!existsSync(file)) return false
  try {
    if (asset.size && statSync(file).size !== asset.size) return false
    return (await sha256File(file)).toLowerCase() === asset.sha256.toLowerCase()
  } catch {
    return false
  }
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!updatesEnabled()) {
    setState({ status: 'unavailable' })
    return state
  }
  if (!pending) {
    setState({ status: 'error', error: '请先检查更新。' })
    return state
  }
  if (state.status === 'downloading') return state
  const { version, asset } = pending
  const directory = app.getPath('downloads')
  const target = join(directory, asset.file)
  setState({ status: 'downloading', version, percent: 0 })

  try {
    await mkdir(directory, { recursive: true })
    if (!(await reuseDownloaded(target, asset))) {
      await rm(target, { force: true })
      const response = await fetch(updateAssetUrl(asset.file), {
        redirect: 'follow',
        signal: AbortSignal.timeout(updateDownloadTimeoutMs),
      })
      if (!response.ok || !response.body)
        throw new Error(`HTTP ${response.status}`)
      const total =
        Number(response.headers.get('content-length')) || asset.size || 0
      let received = 0
      let lastPercent = -1
      let lastEmit = 0
      const source = Readable.fromWeb(
        response.body as Parameters<typeof Readable.fromWeb>[0],
      )
      source.on('data', (chunk: Buffer) => {
        received += chunk.length
        const percent =
          total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
        const now = Date.now()
        if (percent !== lastPercent || now - lastEmit >= progressIntervalMs) {
          lastPercent = percent
          lastEmit = now
          setState({ status: 'downloading', version, percent })
        }
      })
      await pipeline(source, createWriteStream(target))
      if (asset.size && statSync(target).size !== asset.size)
        throw new Error('安装包大小与清单不一致。')
      if ((await sha256File(target)).toLowerCase() !== asset.sha256.toLowerCase())
        throw new Error('安装包校验失败，请重新下载。')
    }
  } catch (error) {
    await rm(target, { force: true }).catch(() => {})
    const detail = error instanceof Error ? error.message : ''
    setState({ status: 'error', error: detail || '下载安装包失败。' })
    return state
  }

  try {
    await writePendingUpdate({
      version,
      path: target,
      platform: process.platform,
      downloadedAt: Date.now(),
    })
  } catch {
    // The download still works without the marker; only cleanup is skipped.
  }
  setState({ status: 'downloaded', version, percent: 100 })
  return state
}

/** Open the verified installer and quit so the bundle can be replaced. */
export async function installUpdate(): Promise<UpdateState> {
  if (state.status !== 'downloaded') return state
  const marker = await readPendingUpdate()
  const target = marker?.path ?? ''
  if (!target || !existsSync(target)) {
    setState({ status: 'error', error: '安装包已不在下载目录，请重新下载。' })
    return state
  }

  const unsaved = unsavedReader?.() ?? []
  if (unsaved.length) {
    const names = unsaved
      .map((scope) => unsavedLabels[scope] ?? scope)
      .join('、')
    const choice = await dialog.showMessageBox({
      type: 'warning',
      title: '安装更新',
      message: `${names}里还有未完成的内容`,
      detail: '继续安装会退出毛趣萌仔，这些内容不会保留。',
      buttons: ['取消', '退出并安装'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (choice.response !== 1) {
      setState({
        status: 'downloaded',
        ...(state.version ? { version: state.version } : {}),
        percent: 100,
      })
      return state
    }
  }

  const openError = await shell.openPath(target)
  if (openError) {
    setState({ status: 'error', error: openError })
    return state
  }
  message('安装程序已打开，应用将在 2 秒后退出')
  if (quitTimer) clearTimeout(quitTimer)
  quitTimer = setTimeout(() => app.quit(), quitDelayMs)
  return state
}

export function initUpdater(
  onChange: () => void,
  onMessage?: (text: string) => void,
  onUnsaved?: () => string[],
): void {
  if (initialized) return
  initialized = true
  notifying = onChange
  messaging = onMessage
  unsavedReader = onUnsaved
  if (!updatesEnabled()) {
    setState({ status: 'unavailable' })
    return
  }
  setState({ status: 'idle' })
  void finishPendingUpdate().catch(() => {})
  startupTimer = setTimeout(() => {
    startupTimer = undefined
    void checkForUpdates()
  }, startupDelayMs)
}

export function disposeUpdater(): void {
  clearTimers()
  if (quitTimer) clearTimeout(quitTimer)
  quitTimer = undefined
}
