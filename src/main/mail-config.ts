/** Mail preferences stored beside the local mail database. */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  mailSyncOptions,
  type MailConfig,
} from '../shared/mail'

const schema = z
  .object({
    version: z.literal(1),
    syncMinutes: z
      .number()
      .int()
      .refine((value) =>
        (mailSyncOptions as readonly number[]).includes(value),
      ),
    notify: z.boolean(),
    unreadBadge: z.boolean(),
    attachmentDir: z.string().min(1),
    retentionDays: z.number().int().min(0).max(3650),
  })
  .strict()

export function defaultMailConfig(attachmentDir: string): MailConfig {
  return {
    syncMinutes: 15,
    notify: true,
    unreadBadge: true,
    attachmentDir,
    retentionDays: 90,
  }
}

export async function loadMailConfig(
  path: string,
  defaultAttachmentDir: string,
): Promise<MailConfig> {
  try {
    const stored = schema.parse(JSON.parse(await readFile(path, 'utf8')))
    return {
      syncMinutes: (mailSyncOptions as readonly number[]).includes(
        stored.syncMinutes,
      )
        ? stored.syncMinutes
        : 15,
      notify: stored.notify,
      unreadBadge: stored.unreadBadge,
      attachmentDir: stored.attachmentDir,
      retentionDays: stored.retentionDays,
    }
  } catch {
    return defaultMailConfig(defaultAttachmentDir)
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
