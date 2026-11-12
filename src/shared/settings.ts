/** User-facing settings shared by the main process and the settings panel. */

export const themeIds = ['default', 'halloween', 'christmas'] as const
export type ThemeId = (typeof themeIds)[number]

export const musicBarStyles = ['compact', 'double', 'minimal'] as const
export type MusicBarStyle = (typeof musicBarStyles)[number]
export const musicBarStyleLabels: Record<MusicBarStyle, string> = {
  compact: '单行',
  double: '双行',
  minimal: '仅封面',
}

export const archiveFormats = ['zip', '7z'] as const
export type ArchiveFormat = (typeof archiveFormats)[number]

export const petScales = [0.75, 1, 1.5, 2] as const
export type PetScale = (typeof petScales)[number]

export const themeLabels: Record<ThemeId, string> = {
  default: '默认',
  halloween: '万圣节',
  christmas: '圣诞',
}

export type Settings = {
  version: 1
  petName: string
  theme: ThemeId
  scale: PetScale
  launchAtLogin: boolean
  statusBubbles: boolean
  musicBubbles: boolean
  musicBarStyle: MusicBarStyle
  shelfAutoScreenshots: boolean
  shelfClipboardImages: boolean
  shelfScreenshotBubble: boolean
  shelfMaxRecords: number
  archiveFormat: ArchiveFormat
}

export type SettingsState = Omit<Settings, 'version'>

export const defaultSettings: Settings = {
  version: 1,
  petName: '麻薯',
  theme: 'default',
  scale: 1,
  launchAtLogin: false,
  statusBubbles: true,
  musicBubbles: true,
  musicBarStyle: 'double',
  shelfAutoScreenshots: true,
  shelfClipboardImages: false,
  shelfScreenshotBubble: true,
  shelfMaxRecords: 100,
  archiveFormat: 'zip',
}

export function isThemeId(value: string): value is ThemeId {
  return (themeIds as readonly string[]).includes(value)
}

export function isPetScale(value: number): value is PetScale {
  return (petScales as readonly number[]).includes(value)
}
