import { isAbsolute } from 'node:path'
import { z } from 'zod'

/** A shelf entry is either a regular file or a directory kept by reference. */
export type ShelfKind = 'file' | 'folder'

export type ShelfRecord = {
  id: string
  name: string
  path: string
  size: number
  modifiedAt: number
  device: number
  inode: number
  kind: ShelfKind
  /** macOS Finder alias; kept for files only. */
  shortcut?: boolean
  status: 'shelved'
}

/**
 * Version 1 only knew regular files, so `kind` is optional and defaults to
 * `file`; version 2 writes it for every entry. Both versions are accepted so a
 * shelf index written by an older build still restores.
 */
const shelfRecordSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().max(4096),
    path: z.string().max(4096).refine(isAbsolute),
    size: z.number().nonnegative(),
    modifiedAt: z.number().finite(),
    device: z.number(),
    inode: z.number(),
    kind: z.enum(['file', 'folder']).default('file'),
    shortcut: z.boolean().optional(),
    status: z.literal('shelved'),
  })
  .strict()

const shelfIndexSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    files: z.array(shelfRecordSchema).max(100),
  })
  .strict()

export function parseShelfIndex(raw: unknown): ShelfRecord[] {
  return shelfIndexSchema.parse(raw).files
}

export function serializeShelfIndex(records: ShelfRecord[]): string {
  return JSON.stringify({ version: 2, files: records })
}
