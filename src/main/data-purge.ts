/**
 * Local data wipe: the settings action writes a marker next to the data
 * directory, then the app restarts. The wipe runs before Electron opens the
 * session, so no file is still in use while the directory is removed.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'

export const purgeMarkerName = 'mqmz-data-purge.json'

const purgeFormat = 1

export type PurgeRequest = {
  app: 'mqmz'
  format: number
  dataRoot: string
  createdAt: number
}

export function purgeMarkerPath(dataRoot: string): string {
  return join(dirname(dataRoot), purgeMarkerName)
}

function isPurgeRequest(value: unknown): value is PurgeRequest {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.app === 'mqmz' &&
    record.format === purgeFormat &&
    typeof record.dataRoot === 'string' &&
    record.dataRoot.length > 0 &&
    typeof record.createdAt === 'number'
  )
}

export function readPurgeRequest(
  markerPath: string,
): PurgeRequest | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(markerPath, 'utf8'))
    return isPurgeRequest(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function requestDataPurge(
  markerPath: string,
  dataRoot: string,
  now = Date.now(),
): void {
  const request: PurgeRequest = {
    app: 'mqmz',
    format: purgeFormat,
    dataRoot: resolve(dataRoot),
    createdAt: now,
  }
  writeFileSync(markerPath, `${JSON.stringify(request, null, 2)}\n`, {
    mode: 0o600,
  })
}

function isInside(target: string, parent: string): boolean {
  const child = resolve(target)
  const root = resolve(parent)
  return child === root || child.startsWith(`${root}${sep}`)
}

/** Refuses roots, the home directory and folders that contain the marker. */
function deletable(target: string, markerPath: string): boolean {
  if (!isAbsolute(target)) return false
  const normalized = resolve(target)
  if (dirname(normalized) === normalized) return false
  if (normalized === resolve(homedir())) return false
  if (basename(normalized) === '') return false
  if (isInside(markerPath, normalized)) return false
  return true
}

/**
 * Removes the requested data directory and the given legacy directories.
 * A marker for a different data root (for example after MQMZ_DATA_DIR
 * changed) is discarded without deleting anything.
 */
export function consumePurgeRequest(options: {
  markerPath: string
  dataRoot: string
  extraRoots?: readonly string[]
}): boolean {
  if (!existsSync(options.markerPath)) return false
  const request = readPurgeRequest(options.markerPath)
  if (!request || resolve(request.dataRoot) !== resolve(options.dataRoot)) {
    rmSync(options.markerPath, { force: true })
    return false
  }
  for (const target of [options.dataRoot, ...(options.extraRoots ?? [])]) {
    if (!deletable(target, options.markerPath)) continue
    try {
      rmSync(target, { recursive: true, force: true })
    } catch {
      // Keep starting: a single locked file is not worth blocking the app.
    }
  }
  rmSync(options.markerPath, { force: true })
  return true
}