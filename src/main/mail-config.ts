/** Mail preferences stored beside the local mail database. */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  mailProxyModes,
  mailSyncOptions,
  type MailConfig,
} from '../shared/mail'

const sharedFields = {
  syncMinutes: z
    .number()
    .int()
    .refine((value) => (mailSyncOptions as readonly number[]).includes(value)),
  notify: z.boolean(),
  unreadBadge: z.boolean(),
  attachmentDir: z.string().min(1),
  retentionDays: z.number().int().min(0).max(3650),
}

const schemaV1 = z
  .object({
    version: z.literal(1),
    ...sharedFields,
  })
  .strict()

const schemaV2 = z
  .object({
    version: z.literal(2),
    ...sharedFields,
    proxyMode: z.enum(mailProxyModes),
    proxyUrl: z.string().max(300),
  })
  .strict()

export function defaultMailConfig(attachmentDir: string): MailConfig {
  return {
    syncMinutes: 15,
    notify: true,
    unreadBadge: true,
    attachmentDir,
    retentionDays: 90,
    proxyMode: 'auto',
    proxyUrl: '',
  }
}

/** Reads v1 or v2 preferences and fills the proxy defaults for old files. */
export function parseMailConfig(value: unknown): MailConfig {
  const stored = schemaV1.or(schemaV2).parse(value)
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
    proxyMode: stored.version === 1 ? 'auto' : stored.proxyMode,
    proxyUrl: stored.version === 1 ? '' : stored.proxyUrl,
  }
}

export async function loadMailConfig(
  path: string,
  defaultAttachmentDir: string,
): Promise<MailConfig> {
  try {
    return parseMailConfig(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return defaultMailConfig(defaultAttachmentDir)
  }
}

export async function saveMailConfig(
  path: string,
  config: MailConfig,
): Promise<void> {
  const value = schemaV2.parse({ version: 2, ...config })
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 })
  await rename(`${path}.tmp`, path)
}
