/** Limits and the legacy text-only reader for one agent turn. */

import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { AgentAttachmentInput } from '../../shared/agent'

export const agentAttachmentLimit = 8
export const agentAttachmentFileChars = 12_000
export const agentAttachmentTotalChars = 30_000
export const agentAttachmentFileBytes = 2 * 1024 * 1024

export type AgentDraftAttachment = AgentAttachmentInput & { path: string }

/**
 * Reads one plain text attachment. The attachment pipeline handles documents,
 * images, media and archives; this stays as a small text-only fallback.
 */
export async function readAgentAttachment(
  path: string,
  remaining: number,
): Promise<AgentDraftAttachment | null> {
  if (remaining <= 0) return null
  const info = await stat(path).catch(() => null)
  if (!info?.isFile() || info.size > agentAttachmentFileBytes) return null
  const buffer = await readFile(path).catch(() => null)
  if (!buffer || buffer.includes(0)) return null
  const raw = buffer.toString('utf8')
  if (!raw.trim()) return null
  const text = raw.slice(0, Math.min(agentAttachmentFileChars, remaining))
  return {
    id: randomUUID(),
    name: basename(path),
    size: info.size,
    kind: 'text',
    mode: 'text',
    needsModelUpload: false,
    detail: '本地文本',
    text,
    truncated: text.length < raw.length,
    path,
  }
}
