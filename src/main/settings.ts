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
  sliceActions,
} from '../shared/donut'
import { deepseekModelIds } from '../shared/deepseek'

const wheelActions = <T extends string>(catalog: readonly T[]) =>
  z
    .array(z.enum(catalog))
    .min(minWheelActions)
    .max(maxWheelActions)
    .refine(
      (actions) => new Set(actions).size === actions.length,
      '轮盘选项不能重复',
    )
    .default([...catalog])
    .catch([...catalog])

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

function migrateSettings(value: Settings): Settings {
  const matchesPrevious =
    value.hoverWheelActions.length === previousHoverActions.length &&
    value.hoverWheelActions.every(
      (action, index) => action === previousHoverActions[index],
    )
  if (!matchesPrevious) return value
  return {
    ...value,
    hoverWheelActions: [...defaultSettings.hoverWheelActions],
  }
}

const settingsSchema = z
  .object({
    version: z.literal(1),
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
    aiQuotaEnabled: z.boolean().default(true),
    aiQuotaRefreshMinutes: z.number().int().min(1).max(1440).default(5),
    aiQuotaOpenAIPath: z.string().max(1024).default(''),
    archiveFormat: z.enum(['zip', '7z']).optional(),
    hoverWheelActions: wheelActions(hoverActions),
    fileWheelActions: wheelActions(sliceActions),
  })
  .strict()
  .transform(({ archiveFormat: _legacyArchiveFormat, ...rest }) => rest)

export type LoadedSettings = {
  settings: Settings
  existed: boolean
}

export async function loadSettingsFile(path: string): Promise<LoadedSettings> {
  try {
    const settings = migrateSettings(
      settingsSchema.parse(JSON.parse(await readFile(path, 'utf8'))),
    )
    return { settings, existed: true }
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
