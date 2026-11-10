import { z } from 'zod'

const coordinate = z.number().finite().min(-100_000).max(100_000)
const rect = z
  .object({
    x: coordinate,
    y: coordinate,
    width: z.number().positive().max(4096),
    height: z.number().positive().max(4096),
  })
  .strict()
export const maskSchema = z
  .object({
    rect,
    width: z.number().int().min(1).max(256),
    height: z.number().int().min(1).max(256),
    alpha: z.array(z.number().int().min(0).max(255)).max(65536),
  })
  .strict()
  .refine((m) => m.alpha.length === m.width * m.height, 'Invalid mask length')
const fileId = z.string().uuid()
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('recover') }).strict(),
  z.object({ type: z.literal('show-lab') }).strict(),
  z.object({ type: z.literal('show-pocket') }).strict(),
  z.object({ type: z.literal('hide-pocket') }).strict(),
  z.object({ type: z.literal('drop-mode'), enabled: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('scale'),
      scale: z.union([
        z.literal(0.75),
        z.literal(1),
        z.literal(1.5),
        z.literal(2),
      ]),
    })
    .strict(),
  z
    .object({ type: z.literal('move-display'), displayId: z.number().int() })
    .strict(),
  z.object({ type: z.literal('remove-file'), fileId }).strict(),
  z.object({ type: z.literal('reveal-file'), fileId }).strict(),
  z.object({ type: z.literal('stash-file'), fileId }).strict(),
  z.object({ type: z.literal('save-copy'), fileId }).strict(),
  z.object({ type: z.literal('wheel'), open: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('eat-files'),
      fileIds: z.array(fileId).min(1).max(32),
    })
    .strict(),
  z
    .object({ type: z.literal('restore-eaten'), entryId: z.string().uuid() })
    .strict(),
  z
    .object({
      type: z.literal('music-control'),
      action: z.enum(['previous', 'toggle', 'next']),
    })
    .strict(),
  z.object({ type: z.literal('refresh') }).strict(),
  z.object({ type: z.literal('open-data') }).strict(),
  z.object({ type: z.literal('screen-settings') }).strict(),
  z.object({ type: z.literal('quit') }).strict(),
])
export const pathsSchema = z.array(z.string().min(1).max(4096)).min(1).max(32)
export const fileIdSchema = fileId
export const pointerSchema = z.enum(['down', 'up', 'cancel'])
export const captureIdSchema = z.string().min(1).max(200)
