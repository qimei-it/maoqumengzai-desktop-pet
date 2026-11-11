import { z } from 'zod'
import { petScales, themeIds } from '../shared/settings'

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
      action: z.enum(['previous', 'toggle', 'next', 'shuffle', 'repeat', 'mute']),
    })
    .strict(),
  z.object({ type: z.literal('bar-toggle') }).strict(),
  z.object({ type: z.literal('lyrics') }).strict(),
  z
    .object({
      type: z.literal('lyrics-width'),
      width: z.number().min(160).max(520),
    })
    .strict(),
  z
    .object({
      type: z.literal('ai-open'),
      fileIds: z.array(z.string().uuid()).max(32),
    })
    .strict(),
  z.object({ type: z.literal('ai-close') }).strict(),
  z
    .object({
      type: z.literal('ai-config'),
      apiKey: z.string().min(1).max(400),
    })
    .strict(),
  z.object({ type: z.literal('ai-clear') }).strict(),
  z
    .object({
      type: z.literal('ai-send'),
      prompt: z.string().min(1).max(8000),
    })
    .strict(),
  z.object({ type: z.literal('ai-keys') }).strict(),
  z
    .object({
      type: z.literal('convert-open'),
      fileIds: z.array(z.string().uuid()).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal('convert-start'),
      action: z.enum(['jpg', 'png', 'webp', 'pdf', 'merge-pdf', 'split-pdf']),
    })
    .strict(),
  z.object({ type: z.literal('convert-close') }).strict(),
  z.object({ type: z.literal('convert-reveal') }).strict(),
  z
    .object({
      type: z.literal('notify'),
      text: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal('rename-open'),
      fileIds: z.array(z.string().uuid()).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal('rename-apply'),
      config: z
        .object({
          mode: z.enum(['replace', 'add', 'format']),
          find: z.string().max(200),
          replace: z.string().max(200),
          text: z.string().max(200),
          position: z.enum(['before', 'after']),
          format: z.enum(['index', 'counter', 'date']),
          start: z.number().int().min(0).max(999999),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('rename-close') }).strict(),
  z
    .object({
      type: z.literal('archive-files'),
      fileIds: z.array(z.string().uuid()).min(1).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal('extract-archives'),
      fileIds: z.array(z.string().uuid()).min(1).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal('shrink-files'),
      fileIds: z.array(z.string().uuid()).min(1).max(32),
    })
    .strict(),
  z.object({ type: z.literal('settings-open') }).strict(),
  z.object({ type: z.literal('settings-close') }).strict(),
  z
    .object({
      type: z.literal('settings-update'),
      patch: z
        .object({
          theme: z.enum(themeIds).optional(),
          scale: z.union(petScales.map((value) => z.literal(value))).optional(),
          launchAtLogin: z.boolean().optional(),
          statusBubbles: z.boolean().optional(),
          musicBubbles: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('settings-open-data') }).strict(),
  z.object({ type: z.literal('settings-clear-cache') }).strict(),
  z.object({ type: z.literal('settings-clear-belly') }).strict(),
  z.object({ type: z.literal('settings-open-licenses') }).strict(),
  z
    .object({
      type: z.literal('focus-open'),
      tab: z.enum(['focus', 'water', 'todo']),
    })
    .strict(),
  z.object({ type: z.literal('focus-close') }).strict(),
  z.object({ type: z.literal('focus-start') }).strict(),
  z.object({ type: z.literal('focus-pause') }).strict(),
  z.object({ type: z.literal('focus-reset') }).strict(),
  z.object({ type: z.literal('focus-skip') }).strict(),
  z
    .object({
      type: z.literal('focus-phase'),
      phase: z.enum(['focus', 'short', 'long']),
    })
    .strict(),
  z
    .object({
      type: z.literal('focus-water'),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('todo-add'),
      text: z.string().trim().min(1).max(200),
    })
    .strict(),
  z.object({ type: z.literal('todo-toggle'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('todo-remove'), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('panel-control'),
      action: z.enum(['minimize', 'maximize', 'close']),
    })
    .strict(),
  z.object({ type: z.literal('volume-popup'), show: z.boolean() }).strict(),
  z
    .object({ type: z.literal('volume'), value: z.number().int().min(0).max(100) })
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
