/**
 * Direct-download update manifest and status.
 *
 * The client fetches one JSON file, compares versions and downloads a plain
 * installer next to it. No Squirrel metadata and no code signing are involved,
 * so an unsigned build can still ship updates: the installer is opened for the
 * user, the app quits, and the user drags the new copy into place.
 */

import { z } from 'zod'

export type UpdateStatus =
  /** Development build, or updates are disabled. */
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  /** Installer downloaded and verified, waiting for the user to install. */
  | 'downloaded'
  | 'error'

export type UpdateState = {
  status: UpdateStatus
  /** Version offered by the manifest, when known. */
  version?: string
  notes?: string
  /** Download progress, 0–100. */
  percent?: number
  error?: string
}

/**
 * `file` is a bare name, never a path or URL, so a manifest can only point at
 * files that sit next to it.
 */
export const updateAssetSchema = z.object({
  file: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  size: z
    .number()
    .int()
    .positive()
    .max(4 * 1024 * 1024 * 1024)
    .optional(),
  sha256: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/),
})

export const updateManifestSchema = z.object({
  version: z.string().trim().min(1).max(32),
  releasedAt: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(2000).optional(),
  assets: z.record(z.string().max(40), updateAssetSchema),
})

export type UpdateManifest = z.infer<typeof updateManifestSchema>
export type UpdateAsset = z.infer<typeof updateAssetSchema>

/** Manifest location. Self-built copies read it too; that is the official feed. */
export const updateManifestUrl = 'https://mqmz.qimeiit.cn/latest.json'

/** How long a check may take before it is treated as a failure. */
export const updateCheckTimeoutMs = 12_000
/** Installers are ~200 MB; allow a slow connection. */
export const updateDownloadTimeoutMs = 30 * 60_000

/** Numeric `x.y.z` comparison; unparseable input sorts below everything. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim())
    if (!match) return undefined
    return [Number(match[1]), Number(match[2]), Number(match[3])] as const
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!
  }
  return 0
}

/**
 * Pick the asset for this platform. `darwin-arm64` wins over `darwin`, so a
 * manifest can carry one entry per architecture when that becomes necessary.
 */
export function pickUpdateAsset(
  manifest: UpdateManifest,
  platform: string,
  arch: string,
): UpdateAsset | undefined {
  for (const key of [`${platform}-${arch}`, platform]) {
    const asset = manifest.assets[key]
    if (asset) return asset
  }
  return undefined
}

/** Absolute download URL for a validated bare file name. */
export function updateAssetUrl(file: string): string {
  return new URL(file, updateManifestUrl).toString()
}
