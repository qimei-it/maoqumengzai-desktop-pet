import { z } from 'zod'
import {
  agentApprovalModes,
  agentModes,
  agentReasoningLevels,
} from '../shared/agent'
import {
  archiveFormats,
  todoListColors,
  todoRepeats,
} from '../shared/protocol'
import {
  isAgentModelId,
  modelInfo,
  type AgentModelId,
  type AgentModelKind,
} from '../shared/agent-models'
import {
  musicAiDailyLimits,
  musicBarStyles,
  petScales,
  themeIds,
} from '../shared/settings'
import { petPoseIds } from '../shared/pet-style'
import { maxPetNameChars } from '../shared/pet-name'
import { maxPetPromptChars } from '../shared/pet-prompt'
import { petSpeciesOptions } from '../shared/pet-species'
import {
  hoverActions,
  maxWheelActions,
  minWheelActions,
  sliceActionCatalog,
} from '../shared/donut'
import {
  mailDisplayNameError,
  mailRecipientError,
} from '../shared/mail'

const wheelActions = <T extends string>(catalog: readonly T[]) =>
  z
    .array(z.enum(catalog))
    .min(minWheelActions)
    .max(maxWheelActions)
    .refine(
      (actions) => new Set(actions).size === actions.length,
      '轮盘选项不能重复',
    )

const modelOfKind = (kind: AgentModelKind) =>
  z.custom<AgentModelId | ''>(
    (value) => value === '' || modelInfo(value as string)?.kind === kind,
  )

const mailDisplayName = z
  .string()
  .trim()
  .max(80)
  .refine((value) => !mailDisplayNameError(value))

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
  z.object({ type: z.literal('drop-arm'), armed: z.boolean() }).strict(),
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
  z.object({ type: z.literal('clear-shelf') }).strict(),
  z.object({ type: z.literal('reveal-file'), fileId }).strict(),
  z.object({ type: z.literal('save-copy'), fileId }).strict(),
  z
    .object({
      type: z.literal('copy-to'),
      fileIds: z.array(fileId).max(32).default([]),
      folderIds: z.array(fileId).max(32).default([]),
      destination: z.string().trim().min(1).max(4096),
    })
    .strict(),
  z
    .object({
      type: z.literal('move-to'),
      fileIds: z.array(fileId).max(32).default([]),
      folderIds: z.array(fileId).max(32).default([]),
      destination: z.string().trim().min(1).max(4096),
    })
    .strict(),
  z.object({ type: z.literal('wheel'), open: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('eat-files'),
      fileIds: z.array(fileId).max(32).default([]),
      folderIds: z.array(fileId).max(32).default([]),
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
  z.object({ type: z.literal('music-ai-clear') }).strict(),
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
      test: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal('ai-clear') }).strict(),
  z.object({ type: z.literal('ai-delete') }).strict(),
  z.object({ type: z.literal('ai-quota-refresh') }).strict(),
  z
    .object({
      type: z.literal('ai-quota-config'),
      patch: z
        .object({
          enabled: z.boolean().optional(),
          refreshMinutes: z.number().int().min(1).max(1440).optional(),
          openaiPath: z.string().max(1024).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('ai-quota-choose-openai') }).strict(),
  z
    .object({
      type: z.literal('ai-send'),
      prompt: z.string().min(1).max(8000),
    })
    .strict(),
  z.object({ type: z.literal('ai-keys') }).strict(),
  z
    .object({
      type: z.literal('ai-test'),
      apiKey: z.string().min(1).max(400).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('ai-models'),
      apiKey: z.string().min(1).max(400).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('minimax-config'),
      apiKey: z.string().min(1).max(400),
      test: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('minimax-test'),
      apiKey: z.string().min(1).max(400).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('minimax-delete'),
    })
    .strict(),
  z
    .object({
      type: z.literal('volcano-config'),
      apiKey: z.string().min(1).max(400),
      test: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('volcano-test'),
      apiKey: z.string().min(1).max(400).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('volcano-models'),
      apiKey: z.string().min(1).max(400).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('volcano-delete'),
    })
    .strict(),
  z
    .object({
      type: z.literal('extract-audio'),
      fileIds: z.array(z.string().uuid()).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal('convert-open'),
      fileIds: z.array(z.string().uuid()).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal('convert-start'),
      action: z.enum([
        'jpg',
        'png',
        'webp',
        'mp4',
        'mov',
        'mkv',
        'webm',
        'gif',
        'webp-anim',
        'mp3',
        'wav',
        'm4a',
        'flac',
        'ogg',
        'pdf-png',
        'pdf-jpg',
        'pdf-txt',
        'office-pdf',
        'office-docx',
        'office-xlsx',
        'office-pptx',
        'ofd-pdf',
        'ofd-png',
        'ofd-jpg',
        'csv-xlsx',
        'document-pdf',
        'pdf',
        'merge-pdf',
        'split-pdf',
        'pdf-encrypt',
        'pdf-decrypt',
      ]),
      password: z.string().max(256).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('convert-remove-file'),
      fileId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('convert-output-open'),
      outputId: z.string().uuid(),
    })
    .strict(),
  z.object({ type: z.literal('convert-cancel') }).strict(),
  z
    .object({
      type: z.literal('convert-move-file'),
      fileId: z.string().min(1),
      direction: z.enum(['up', 'down']),
    })
    .strict(),
  z.object({ type: z.literal('convert-close') }).strict(),
  z.object({ type: z.literal('convert-reveal') }).strict(),
  z
    .object({
      type: z.literal('notify'),
      text: z.string().min(1).max(500),
      parts: z
        .array(
          z
            .object({
              text: z.string().min(1).max(500),
              code: z.boolean().optional(),
            })
            .strict(),
        )
        .max(20)
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('rename-open'),
      fileIds: z.array(fileId).max(32).default([]),
      folderIds: z.array(fileId).max(32).default([]),
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
  z.object({ type: z.literal('rename-undo') }).strict(),
  z.object({ type: z.literal('rename-close') }).strict(),
  z
    .object({
      type: z.literal('archive-open'),
      fileIds: z.array(fileId).max(32).default([]),
      folderIds: z.array(fileId).max(32).default([]),
    })
    .strict(),
  z
    .object({
      type: z.literal('archive-start'),
      format: z.enum(archiveFormats),
    })
    .strict(),
  z
    .object({
      type: z.literal('archive-remove-file'),
      fileId: z.string().uuid(),
    })
    .strict(),
  z.object({ type: z.literal('archive-close') }).strict(),
  z.object({ type: z.literal('archive-reveal') }).strict(),
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
      type: z.literal('settings-section'),
      section: z.enum([
        'appearance',
        'desktop',
        'data',
        'profile',
        'clipboard',
        'shelf',
        'conversion',
        'mail',
        'music',
        'ai',
        'about',
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal('settings-update'),
      patch: z
        .object({
          petName: z.string().trim().min(1).max(maxPetNameChars).optional(),
          theme: z.enum(themeIds).optional(),
          scale: z.union(petScales.map((value) => z.literal(value))).optional(),
          launchAtLogin: z.boolean().optional(),
          statusBubbles: z.boolean().optional(),
          musicBubbles: z.boolean().optional(),
          musicAiEnabled: z.boolean().optional(),
          musicAiDailyLimit: z
            .union(musicAiDailyLimits.map((value) => z.literal(value)))
            .optional(),
          musicBarStyle: z.enum(musicBarStyles).optional(),
          shelfAutoScreenshots: z.boolean().optional(),
          shelfClipboardImages: z.boolean().optional(),
          shelfScreenshotBubble: z.boolean().optional(),
          shelfMaxRecords: z.number().int().min(50).max(500).optional(),
          aiModel: z
            .custom<AgentModelId>((value) => isAgentModelId(value))
            .optional(),
          agentDefaultChatModel: modelOfKind('text').optional(),
          aiImageModel: modelOfKind('image').optional(),
          agentDefaultVideoModel: modelOfKind('video').optional(),
          agentDefaultAudioModel: modelOfKind('speech').optional(),
          aiQuotaEnabled: z.boolean().optional(),
          aiQuotaAlerts: z.boolean().optional(),
          aiQuotaRefreshMinutes: z.number().int().min(1).max(1440).optional(),
          aiQuotaOpenAIPath: z.string().max(1024).optional(),
          agentAttachmentDir: z.string().trim().max(4096).optional(),
          hoverWheelActions: wheelActions(hoverActions).optional(),
          fileWheelActions: wheelActions(sliceActionCatalog).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('settings-open-data') }).strict(),
  z
    .object({
      type: z.literal('settings-auto-backup'),
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('settings-backup-export') }).strict(),
  z
    .object({
      type: z.literal('settings-backup-restore'),
      snapshot: z.string().trim().min(1).max(200).optional(),
    })
    .strict(),
  z.object({ type: z.literal('settings-choose-agent-dir') }).strict(),
  z.object({ type: z.literal('settings-open-agent-dir') }).strict(),
  z.object({ type: z.literal('settings-clear-cache') }).strict(),
  z.object({ type: z.literal('settings-clear-belly') }).strict(),
  z.object({ type: z.literal('settings-open-licenses') }).strict(),
  z
    .object({
      type: z.literal('hover-mode'),
      active: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('pomodoro-open') }).strict(),
  z.object({ type: z.literal('pomodoro-close') }).strict(),
  z.object({ type: z.literal('water-open') }).strict(),
  z.object({ type: z.literal('water-close') }).strict(),
  z.object({ type: z.literal('water-drink') }).strict(),
  z
    .object({
      type: z.literal('todo-open'),
      todoId: z.string().uuid().optional(),
      listId: z.string().uuid().nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('todo-focus-ack'),
      nonce: z.number().int(),
    })
    .strict(),
  z.object({ type: z.literal('todo-close') }).strict(),
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
      type: z.literal('focus-water-config'),
      interval: z.number().int().min(5).max(240),
      start: z.number().int().min(0).max(23),
      end: z.number().int().min(1).max(24),
    })
    .strict(),
  z
    .object({
      type: z.literal('focus-durations'),
      focus: z.number().int().min(1).max(180),
      short: z.number().int().min(1).max(180),
      long: z.number().int().min(1).max(180),
      focusSeconds: z.number().int().min(0).max(59),
      shortSeconds: z.number().int().min(0).max(59),
      longSeconds: z.number().int().min(0).max(59),
    })
    .strict(),
  z
    .object({
      type: z.literal('focus-duration-bump'),
      unit: z.enum(['minutes', 'seconds']),
      delta: z.number().int().min(-60).max(60),
    })
    .strict(),
  z
    .object({ type: z.literal('water-goal'), goal: z.number().int().min(1).max(30) })
    .strict(),
  z
    .object({
      type: z.literal('water-snooze'),
      minutes: z.number().int().min(1).max(60).optional(),
    })
    .strict(),
  z.object({ type: z.literal('break-open') }).strict(),
  z.object({ type: z.literal('break-close') }).strict(),
  z.object({ type: z.literal('profile-open') }).strict(),
  z.object({ type: z.literal('profile-close') }).strict(),
  z.object({ type: z.literal('pet-poke') }).strict(),
  z.object({ type: z.literal('clipboard-open') }).strict(),
  z.object({ type: z.literal('clipboard-close') }).strict(),
  z
    .object({
      type: z.literal('clipboard-copy'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('clipboard-pin'),
      id: z.string().uuid(),
      pinned: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('clipboard-remove'),
      id: z.string().uuid(),
    })
    .strict(),
  z.object({ type: z.literal('clipboard-clear') }).strict(),
  z.object({ type: z.literal('shelf-scan') }).strict(),
  z.object({ type: z.literal('shelf-clear-invalid') }).strict(),
  z
    .object({
      type: z.literal('engine-install'),
      id: z.union([z.literal('ffmpeg'), z.literal('libreoffice')]),
    })
    .strict(),
  z
    .object({
      type: z.literal('engine-cancel'),
      id: z.literal('ffmpeg'),
    })
    .strict(),
  z
    .object({
      type: z.literal('engine-recheck'),
      id: z.literal('ffmpeg'),
    })
    .strict(),
  z
    .object({
      type: z.literal('engine-detect'),
      id: z.union([z.literal('ffmpeg'), z.literal('libreoffice')]),
    })
    .strict(),
  z
    .object({
      type: z.literal('engine-use-local'),
      id: z.union([z.literal('ffmpeg'), z.literal('libreoffice')]),
    })
    .strict(),
  z
    .object({
      type: z.literal('engine-remove'),
      id: z.union([z.literal('ffmpeg'), z.literal('libreoffice')]),
    })
    .strict(),
  z.object({ type: z.literal('engine-self-check') }).strict(),
  z
    .object({
      type: z.literal('mail-add-account'),
      provider: z.enum(['qq', '163', 'gmail']),
      email: z.string().email().max(254),
      secret: z.string().min(1).max(512),
      displayName: mailDisplayName.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-reauthorize'),
      accountId: z.string().uuid(),
      secret: z.string().min(1).max(512),
      displayName: mailDisplayName.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-remove-account'),
      accountId: z.string().uuid(),
    })
    .strict(),
  z.object({ type: z.literal('mail-load-more') }).strict(),
  z
    .object({
      type: z.literal('mail-search'),
      query: z.string().max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-compose-open'),
      accountId: z.string().uuid().optional(),
      draftId: z.string().uuid().optional(),
      draft: z
        .object({
          to: z.string().max(1000).optional(),
          cc: z.string().max(1000).optional(),
          bcc: z.string().max(1000).optional(),
          subject: z.string().max(500).optional(),
          body: z.string().max(1_000_000).optional(),
          bodyHtml: z.string().max(1_000_000).optional(),
          attachments: z
            .array(
              z
                .object({
                  path: z.string().min(1).max(1024),
                  name: z.string().min(1).max(255),
                  size: z.number().int().nonnegative(),
                })
                .strict(),
            )
            .max(20)
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal('mail-compose-close') }).strict(),
  z
    .object({
      type: z.literal('mail-draft-save'),
      draftId: z.string().uuid().optional(),
      accountId: z.string().uuid(),
      to: z.string().max(1000),
      cc: z.string().max(1000),
      bcc: z.string().max(1000),
      subject: z.string().max(500),
      body: z.string().max(1_000_000),
      bodyHtml: z.string().max(1_000_000),
      attachmentIds: z.array(z.string().uuid()).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-draft-delete'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-remove-attachment'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-archive'),
      uid: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-delete'),
      uid: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-move'),
      uid: z.number().int().nonnegative(),
      folder: z.string().min(1).max(500),
    })
    .strict(),
  z.object({ type: z.literal('mail-alert-copy') }).strict(),
  z.object({ type: z.literal('mail-alert-open') }).strict(),
  z.object({ type: z.literal('mail-alert-dismiss') }).strict(),
  z
    .object({
      type: z.literal('mail-send'),
      accountId: z.string().uuid(),
      draftId: z.string().uuid().optional(),
      to: z
        .string()
        .min(1)
        .max(1000)
        .refine((value) => !mailRecipientError(value, true)),
      cc: z
        .string()
        .max(1000)
        .optional()
        .refine((value) => !mailRecipientError(value ?? '')),
      bcc: z
        .string()
        .max(1000)
        .optional()
        .refine((value) => !mailRecipientError(value ?? '')),
      subject: z.string().max(500),
      body: z.string().max(1_000_000),
      bodyHtml: z.string().max(1_000_000).optional(),
      attachmentIds: z.array(z.string().uuid()).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-help'),
      provider: z.enum(['qq', '163', 'gmail']),
      target: z.enum(['client', 'app-password']).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-sync'),
      accountId: z.string().uuid().optional(),
    })
    .strict(),
  z.object({ type: z.literal('mail-clear-cache') }).strict(),
  z
    .object({
      type: z.literal('mail-update-config'),
      patch: z
        .object({
          syncMinutes: z.number().int().min(0).max(1440).optional(),
          notify: z.boolean().optional(),
          unreadBadge: z.boolean().optional(),
          attachmentDir: z.string().max(1024).optional(),
          retentionDays: z.number().int().min(0).max(3650).optional(),
          proxyMode: z.enum(['auto', 'manual', 'off']).optional(),
          proxyUrl: z.string().max(300).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('mail-choose-attachment-dir') }).strict(),
  z.object({ type: z.literal('mail-open-attachment-dir') }).strict(),
  z
    .object({
      type: z.literal('mail-compose-files'),
      fileIds: z.array(fileId).min(1).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-open'),
      accountId: z.string().uuid().optional(),
      folder: z.string().min(1).max(500).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-folder'),
      accountId: z.string().uuid(),
      folder: z.string().min(1).max(500),
    })
    .strict(),
  z.object({ type: z.literal('mail-close') }).strict(),
  z.object({ type: z.literal('mail-refresh') }).strict(),
  z
    .object({
      type: z.literal('mail-select'),
      uid: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('mail-save-attachment'),
      uid: z.number().int().positive(),
      part: z.string().min(1).max(120),
      open: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('clipboard-config'),
      patch: z
        .object({
          enabled: z.boolean().optional(),
          maxItems: z.number().int().min(10).max(500).optional(),
          retentionDays: z.number().int().min(0).max(3650).optional(),
          ignoreSensitive: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('break-toggle'),
      kind: z.enum(['sitting', 'eyes']),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('break-interval'),
      kind: z.enum(['sitting', 'eyes']),
      minutes: z.number().int().min(5).max(240),
    })
    .strict(),
  z
    .object({
      type: z.literal('break-snooze'),
      kind: z.enum(['sitting', 'eyes']),
      minutes: z.number().int().min(1).max(60).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('break-dnd'),
      enabled: z.boolean(),
      start: z.number().int().min(0).max(23),
      end: z.number().int().min(1).max(24),
    })
    .strict(),
  z
    .object({
      type: z.literal('todo-add'),
      text: z.string().trim().min(1).max(200),
      listId: z.string().uuid().nullable().optional(),
      dueAt: z.number().finite().nullable().optional(),
      urgent: z.boolean().optional(),
      flagged: z.boolean().optional(),
      tags: z.array(z.string().trim().min(1).max(20)).max(10).optional(),
      repeat: z.enum(todoRepeats).optional(),
    })
    .strict(),
  z.object({ type: z.literal('todo-toggle'), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('todo-update'),
      id: z.string().uuid(),
      patch: z
        .object({
          text: z.string().trim().min(1).max(200).optional(),
          dueAt: z.number().finite().nullable().optional(),
          urgent: z.boolean().optional(),
          flagged: z.boolean().optional(),
          notes: z.string().max(2000).optional(),
          tags: z.array(z.string().trim().min(1).max(20)).max(10).optional(),
          repeat: z.enum(todoRepeats).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('todo-remove'), id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('todo-clear-done'),
      ids: z.array(z.string().uuid()).max(500).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('todo-list-add'),
      name: z.string().trim().min(1).max(40),
      groupId: z.string().uuid().nullable().optional(),
      color: z.enum(todoListColors).optional(),
      icon: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('todo-list-update'),
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(40).optional(),
      color: z.enum(todoListColors).optional(),
      icon: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('todo-list-remove'), id: z.string().uuid() })
    .strict(),
  z
    .object({
      type: z.literal('todo-group-add'),
      name: z.string().trim().min(1).max(40),
    })
    .strict(),
  z
    .object({
      type: z.literal('todo-group-update'),
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(40),
    })
    .strict(),
  z
    .object({ type: z.literal('todo-group-remove'), id: z.string().uuid() })
    .strict(),
  z
    .object({
      type: z.literal('panel-control'),
      action: z.enum(['minimize', 'maximize', 'close', 'toggle-default']),
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
  z.object({ type: z.literal('agent-open') }).strict(),
  z.object({ type: z.literal('agent-close') }).strict(),
  z
    .object({
      type: z.literal('agent-send'),
      prompt: z.string().trim().min(1).max(8000),
      attachmentIds: z.array(z.string().uuid()).max(16).optional(),
      skills: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
      generation: z
        .object({
          image: z
            .object({
              count: z.number().int().min(1).max(10),
              area: z.enum(['1K', '2K', '4K']),
              ratio: z.enum([
                'auto',
                '21:9',
                '16:9',
                '4:3',
                '1:1',
                '3:4',
                '9:16',
              ]),
              format: z.enum(['jpeg', 'png', 'webp']),
            })
            .strict(),
          video: z
            .object({
              resolution: z.enum(['480P', '768P', '2K']),
              duration: z.number().int().min(4).max(15),
              ratio: z.enum([
                '21:9',
                '16:9',
                '4:3',
                '1:1',
                '3:4',
                '9:16',
              ]),
            })
            .strict(),
          speech: z
            .object({
              voiceId: z.string().min(1).max(120),
              speed: z.number().min(0.5).max(2),
              emotion: z.enum([
                '',
                'happy',
                'sad',
                'angry',
                'fearful',
                'disgusted',
                'surprised',
                'calm',
              ]),
              format: z.enum(['mp3', 'wav']),
            })
            .strict(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal('agent-retry') }).strict(),
  z.object({ type: z.literal('agent-message-regenerate') }).strict(),
  z
    .object({
      type: z.literal('agent-message-edit'),
      id: z.string().uuid(),
      prompt: z.string().trim().min(1).max(8000),
    })
    .strict(),
  z.object({ type: z.literal('agent-cancel') }).strict(),
  z
    .object({ type: z.literal('agent-approve'), id: z.string().uuid() })
    .strict(),
  z
    .object({ type: z.literal('agent-approve-same'), id: z.string().uuid() })
    .strict(),
  z
    .object({ type: z.literal('agent-deny'), id: z.string().uuid() })
    .strict(),
  z.object({ type: z.literal('agent-session-new') }).strict(),
  z
    .object({
      type: z.literal('agent-project-new'),
      projectId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-project-create'),
      name: z.string().trim().max(200),
      workspace: z.string().trim().min(1).max(4096),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-project-update'),
      id: z.string().uuid(),
      name: z.string().trim().max(200).optional(),
      workspace: z.string().trim().min(1).max(4096).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-project-delete'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-project-pin'),
      id: z.string().uuid(),
      pinned: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-project-policy'),
      id: z.string().uuid(),
      policy: z.enum(['ask', 'allow', 'deny']),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-project-reveal'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-session-rename'),
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-session-pin'),
      id: z.string().uuid(),
      pinned: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-session-move'),
      id: z.string().uuid(),
      projectId: z.string().uuid().nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-session-select'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-session-delete'),
      id: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-session-archive'),
      id: z.string().uuid(),
      archived: z.boolean(),
    })
    .strict(),
  z
    .object({ type: z.literal('agent-session-clear'), id: z.string().uuid() })
    .strict(),
  z
    .object({
      type: z.literal('agent-mode'),
      mode: z.enum(agentModes),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-model'),
      model: z.custom<AgentModelId>((value) => isAgentModelId(value)),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-generation-model'),
      kind: z.enum(['image', 'video', 'speech']),
      model: z.custom<AgentModelId>((value) => isAgentModelId(value)),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-approval-mode'),
      mode: z.enum(agentApprovalModes),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-reasoning'),
      reasoning: z.enum(agentReasoningLevels),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-workspace'),
      projectId: z.string().uuid().nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('agent-config'),
      apiKey: z.string().trim().min(10).max(400),
    })
    .strict(),
  z.object({ type: z.literal('agent-keys') }).strict(),
  z.object({ type: z.literal('profile-create') }).strict(),
  z.object({ type: z.literal('profile-bind') }).strict(),
  z.object({ type: z.literal('pet-create-open') }).strict(),
  z.object({ type: z.literal('pet-create-close') }).strict(),
  z.object({ type: z.literal('pet-create-pick-photos') }).strict(),
  z
    .object({
      type: z.literal('pet-create-remove-photo'),
      id: z.string().min(1).max(80),
    })
    .strict(),
  z
    .object({
      type: z.literal('pet-create-species'),
      species: z.enum(petSpeciesOptions),
    })
    .strict(),
  z
    .object({
      type: z.literal('pet-create-start'),
      name: z.string().trim().min(1).max(maxPetNameChars),
      species: z.enum(petSpeciesOptions),
      prompt: z.string().trim().max(maxPetPromptChars),
    })
    .strict(),
  z
    .object({
      type: z.literal('pet-create-retry'),
      pose: z.enum(petPoseIds),
    })
    .strict(),
  z.object({ type: z.literal('pet-create-cancel') }).strict(),
  z.object({ type: z.literal('pet-create-save') }).strict(),
  z
    .object({
      type: z.literal('pet-prompt-save'),
      prompt: z.string().trim().max(maxPetPromptChars),
    })
    .strict(),
  z.object({ type: z.literal('update-check') }).strict(),
  z.object({ type: z.literal('update-download') }).strict(),
  z.object({ type: z.literal('update-install') }).strict(),
  z
    .object({
      type: z.literal('dirty-state'),
      scope: z.enum(['mail-compose', 'agent-input']),
      dirty: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('pet-default') }).strict(),
  z
    .object({ type: z.literal('pet-select'), id: z.string().min(1).max(80) })
    .strict(),
])
export const pathsSchema = z.array(z.string().min(1).max(4096)).min(1).max(32)
export const fileIdSchema = fileId
export const pointerSchema = z.enum(['down', 'up', 'cancel'])
export const captureIdSchema = z.string().min(1).max(200)
