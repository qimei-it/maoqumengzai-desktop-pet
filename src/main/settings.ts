import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  defaultSettings,
  musicBarStyles,
  archiveFormats,
  petScales,
  themeIds,
  type Settings,
} from '../shared/settings'

const settingsSchema = z
  .object({
    version: z.literal(1),
    petName: z.string().trim().min(1).max(20).default('麻薯'),
    theme: z.enum(themeIds),
    scale: z.union(petScales.map((value) => z.literal(value))),
    launchAtLogin: z.boolean(),
    statusBubbles: z.boolean(),
    musicBubbles: z.boolean(),
    musicBarStyle: z.enum(musicBarStyles).default('double'),
    shelfAutoScreenshots: z.boolean().default(true),
    shelfClipboardImages: z.boolean().default(false),
    shelfScreenshotBubble: z.boolean().default(true),
    shelfMaxRecords: z.number().int().min(50).max(500).default(100),
    archiveFormat: z.enum(archiveFormats).default('zip'),
  })
  .strict()

export type LoadedSettings = {
  settings: Settings
  existed: boolean
}

export async function loadSettingsFile(path: string): Promise<LoadedSettings> {
  try {
    const settings = settingsSchema.parse(
      JSON.parse(await readFile(path, 'utf8')),
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
