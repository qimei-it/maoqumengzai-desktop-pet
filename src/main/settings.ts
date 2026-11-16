import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  defaultSettings,
  musicAiDailyLimits,
  musicBarStyles,
  petScales,
  themeIds,
  type Settings,
} from '../shared/settings'
import {
  hoverActions,
  maxWheelActions,
  minWheelActions,
  sliceActionCatalog,
  sliceActions,
} from '../shared/donut'
import { deepseekModelIds } from '../shared/deepseek'
import {
  modelInfo,
  type AgentModelId,
  type AgentModelKind,
} from '../shared/agent-models'

const wheelActions = <T extends string>(
  catalog: readonly T[],
  defaults: readonly T[] = catalog,
) =>
  z
    .array(z.enum(catalog))
    .min(minWheelActions)
    .max(maxWheelActions)
    .refine(
      (actions) => new Set(actions).size === actions.length,
      '轮盘选项不能重复',
    )
    .default([...defaults])
    .catch([...defaults])

/** The hover order shipped before the shelf moved up beside the clipboard. */
const previousHoverActions = [
  'agent',
  'clipboard',
  'profile',
  'todo',
  'break',
  'water',
  'focus',
  'shelf',
  'mail',
  'settings',
] as const

/** The file orders shipped before the wheel copied a whole batch to a folder. */
const previousFileOrders = [
  [
    'stash',
    'convert',
    'archive',
    'extract',
    'shrink',
    'eat',
    'copy',
    'mail',
    'rename',
    'ask',
  ],
  [
    'ask',
    'stash',
    'archive',
    'extract',
    'shrink',
    'eat',
    'copy',
    'mail',
    'convert',
    'rename',
  ],
] as const

function matchesOrder<T extends string>(
  value: readonly T[],
  expected: readonly T[],
): boolean {
  return (
    value.length === expected.length &&
    value.every((action, index) => action === expected[index])
  )
}

function migrateSettings(
  value: Omit<Settings, 'version'> & { version: 1 | 2 },
): Settings {
  const previousHover = matchesOrder(value.hoverWheelActions, previousHoverActions)
  const previousFile = previousFileOrders.some((order) =>
    matchesOrder(value.fileWheelActions, order),
  )
  /** v1 shipped MiniMax H3 Image as the default image model. */
  const previousImage =
    value.version === 1 && value.aiImageModel === 'MiniMax-H3-Image'
  return {
    ...value,
    version: 2,
    ...(previousHover
      ? { hoverWheelActions: [...defaultSettings.hoverWheelActions] }
      : {}),
    ...(previousFile
      ? { fileWheelActions: [...defaultSettings.fileWheelActions] }
      : {}),
    ...(previousImage ? { aiImageModel: defaultSettings.aiImageModel } : {}),
  }
}

const modelOfKind = (kind: AgentModelKind) =>
  z.custom<AgentModelId | ''>(
    (value) => value === '' || modelInfo(value as string)?.kind === kind,
  )

const settingsSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    petId: z.string().trim().max(80).default(''),
    petName: z.string().trim().min(1).max(20).default('麻薯'),
    theme: z.enum(themeIds),
    scale: z.union(petScales.map((value) => z.literal(value))),
    launchAtLogin: z.boolean(),
    statusBubbles: z.boolean(),
    musicBubbles: z.boolean(),
    musicAiEnabled: z.boolean().default(false),
    musicAiDailyLimit: z
      .union(musicAiDailyLimits.map((value) => z.literal(value)))
      .default(30),
    musicBarStyle: z.enum(musicBarStyles).default('double'),
    shelfAutoScreenshots: z.boolean().default(true),
    shelfClipboardImages: z.boolean().default(false),
    shelfScreenshotBubble: z.boolean().default(true),
    shelfMaxRecords: z.number().int().min(50).max(500).default(100),
    aiModel: z.enum(deepseekModelIds).default('deepseek-flash'),
    agentDefaultChatModel: modelOfKind('text').optional().catch(undefined),
    aiImageModel: modelOfKind('image')
      .default('Doubao-Seedream-5.5')
      .catch('Doubao-Seedream-5.5'),
    agentDefaultVideoModel: modelOfKind('video')
      .default('MiniMax-H3')
      .catch('MiniMax-H3'),
    agentDefaultAudioModel: modelOfKind('speech')
      .default('speech-2.8-hd')
      .catch('speech-2.8-hd'),
    aiQuotaEnabled: z.boolean().default(true),
    aiQuotaAlerts: z.boolean().default(true),
    aiQuotaRefreshMinutes: z.number().int().min(1).max(1440).default(5),
    aiQuotaOpenAIPath: z.string().max(1024).default(''),
    agentAttachmentDir: z.string().trim().max(4096).default(''),
    archiveFormat: z.enum(['zip', '7z']).optional(),
    hoverWheelActions: wheelActions(hoverActions),
    fileWheelActions: wheelActions(sliceActionCatalog, sliceActions),
  })
  .strict()
  .transform(
    ({
      archiveFormat: _legacyArchiveFormat,
      agentDefaultChatModel,
      ...rest
    }) => ({
      ...rest,
      agentDefaultChatModel:
        agentDefaultChatModel ?? rest.aiModel ?? 'deepseek-flash',
    }),
  )

export type LoadedSettings = {
  settings: Settings
  existed: boolean
  /** The file on disk used an older schema and should be rewritten. */
  upgraded?: boolean
}

export async function loadSettingsFile(path: string): Promise<LoadedSettings> {
  try {
    const parsed = settingsSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    const settings = migrateSettings(parsed)
    return {
      settings,
      existed: true,
      upgraded: JSON.stringify(parsed) !== JSON.stringify(settings),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      return { settings: { ...defaultSettings }, existed: false }
    return { settings: { ...defaultSettings }, existed: false }
  }
}

let queue = Promise.resolve()

export async function saveSettingsFile(
  path: string,
  settings: Settings,
): Promise<void> {
  const value = JSON.stringify(settingsSchema.parse(settings))
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, value, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
