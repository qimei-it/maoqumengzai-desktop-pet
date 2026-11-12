/** Mail preferences stored beside the local mail database. */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { MailConfig } from '../shared/mail'

const schema = z
  .object({
    version: z.literal(1),
    syncMinutes: z.number().int().min(0).max(1440),
    notify: z.boolean(),
    unreadBadge: z.boolean(),
    attachmentDir: z.string().min(1),
    retentionDays: z.number().int().min(0).max(3650),
  })
  .strict()

export function defaultMailConfig(downloads: string): MailConfig {
  return {
    syncMinutes: 15,
    notify: true,
    unreadBadge: true,
    attachmentDir: join(downloads, 'maoqumengzai', 'attachments'),
    retentionDays: 90,
  }
}

export async function loadMailConfig(
  path: string,
  downloads: string,
): Promise<MailConfig> {
  try {
    const stored = schema.parse(JSON.parse(await readFile(path, 'utf8')))
    return {
      syncMinutes: stored.syncMinutes,
      notify: stored.notify,
      unreadBadge: stored.unreadBadge,
      attachmentDir: stored.attachmentDir,
      retentionDays: stored.retentionDays,
    }
  } catch {
    return defaultMailConfig(downloads)
  }
}

export async function saveMailConfig(
  path: string,
  config: MailConfig,
): Promise<void> {
  const value = schema.parse({ version: 1, ...config })
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 })
  await rename(`${path}.tmp`, path)
}
