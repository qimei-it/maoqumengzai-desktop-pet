/** Resolves shelf files into the attachment shape used by the mail composer. */

import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { MailDraftAttachment } from '../shared/mail'

export const maxMailAttachments = 20

/**
 * Reads one file from disk for a mail attachment. Missing paths and
 * directories are skipped instead of failing the whole batch.
 */
export async function mailAttachmentFor(
  path: string,
): Promise<MailDraftAttachment | undefined> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return undefined
  return { path, name: basename(path), size: info.size }
}

/** Keeps drop order while removing repeated paths. */
export function uniquePaths(paths: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const path of paths) {
    if (!path || seen.has(path)) continue
    seen.add(path)
    result.push(path)
  }
  return result
}

/**
 * Resolves shelf ids into composer attachments: folders, missing files and
 * duplicates are skipped, and the list is capped at the composer limit.
 */
export async function collectMailAttachments(
  fileIds: string[],
  resolvePath: (id: string) => Promise<string>,
): Promise<{ attachments: MailDraftAttachment[]; truncated: boolean }> {
  const paths = uniquePaths(
    await Promise.all(
      fileIds.map((id) => resolvePath(id).catch(() => undefined)),
    ),
  )
  const attachments = (
    await Promise.all(
      paths.slice(0, maxMailAttachments).map(mailAttachmentFor),
    )
  ).filter((item): item is MailDraftAttachment => Boolean(item))
  return { attachments, truncated: paths.length > maxMailAttachments }
}
