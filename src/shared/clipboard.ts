/** Clipboard history types and pure helpers. */
export type ClipboardKind = 'text' | 'image'

export type ClipboardConfig = {
  enabled: boolean
  maxItems: number
  retentionDays: number
  ignoreSensitive: boolean
}

export type ClipboardEntry = {
  id: string
  kind: ClipboardKind
  text?: string
  thumbnail?: string
  createdAt: number
  pinned: boolean
}

export type ClipboardState = ClipboardConfig & {
  entries: ClipboardEntry[]
}

export const clipboardTextLimit = 10_000

export const clipboardDefaults: ClipboardConfig = {
  enabled: true,
  maxItems: 100,
  retentionDays: 30,
  ignoreSensitive: true,
}

const sensitivePatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/,
  /(?:password|passwd|pwd|密码|secret|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+/i,
]

export function looksSensitive(text: string): boolean {
  return sensitivePatterns.some((pattern) => pattern.test(text))
}

export function pruneClipboardEntries<
  T extends { createdAt: number; pinned: boolean },
>(
  entries: readonly T[],
  config: Pick<ClipboardConfig, 'maxItems' | 'retentionDays'>,
  now = Date.now(),
): T[] {
  const cutoff =
    config.retentionDays > 0
      ? now - config.retentionDays * 24 * 60 * 60 * 1000
      : 0
  const kept = entries.filter(
    (entry) => entry.pinned || entry.createdAt > cutoff,
  )
  const unpinned = kept
    .filter((entry) => !entry.pinned)
    .sort((left, right) => left.createdAt - right.createdAt)
  const excess = Math.max(0, unpinned.length - config.maxItems)
  const dropped = new Set(unpinned.slice(0, excess))
  return kept.filter((entry) => !dropped.has(entry))
}
