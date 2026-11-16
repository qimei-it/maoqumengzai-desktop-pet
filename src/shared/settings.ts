/** User-facing settings shared by the main process and the settings panel. */

import {
  hoverActions,
  sliceActions,
  type DropAction,
  type HoverAction,
} from './donut'
import type { AgentModelId } from './agent-models'

export const themeIds = ['default', 'halloween', 'christmas'] as const
export type ThemeId = (typeof themeIds)[number]

export const musicBarStyles = ['compact', 'double', 'minimal'] as const
export type MusicBarStyle = (typeof musicBarStyles)[number]
export const musicBarStyleLabels: Record<MusicBarStyle, string> = {
  compact: '单行',
  double: '双行',
  minimal: '仅封面',
}

export const petScales = [0.75, 1, 1.5, 2] as const
export type PetScale = (typeof petScales)[number]

export const musicAiDailyLimits = [30, 45, 60, 90, 100] as const
export type MusicAiDailyLimit = (typeof musicAiDailyLimits)[number]

export const themeLabels: Record<ThemeId, string> = {
  default: '默认',
  halloween: '万圣节',
  christmas: '圣诞',
}

export type Settings = {
  version: 1
  petId: string
  petName: string
  theme: ThemeId
  scale: PetScale
  launchAtLogin: boolean
  statusBubbles: boolean
  musicBubbles: boolean
  musicAiEnabled: boolean
  musicAiDailyLimit: MusicAiDailyLimit
  musicBarStyle: MusicBarStyle
  shelfAutoScreenshots: boolean
  shelfClipboardImages: boolean
  shelfScreenshotBubble: boolean
  shelfMaxRecords: number
  aiModel: AgentModelId
  aiQuotaEnabled: boolean
  aiQuotaRefreshMinutes: number
  aiQuotaOpenAIPath: string
  agentAttachmentDir: string
  hoverWheelActions: HoverAction[]
  fileWheelActions: DropAction[]
}

export type SettingsState = Omit<Settings, 'version'>

export const defaultSettings: Settings = {
  version: 1,
  petId: '',
  petName: '麻薯',
  theme: 'default',
  scale: 1,
  launchAtLogin: false,
  statusBubbles: true,
  musicBubbles: true,
  musicAiEnabled: false,
  musicAiDailyLimit: 30,
  musicBarStyle: 'double',
  shelfAutoScreenshots: true,
  shelfClipboardImages: false,
  shelfScreenshotBubble: true,
  shelfMaxRecords: 100,
  aiModel: 'deepseek-flash',
  aiQuotaEnabled: true,
  aiQuotaRefreshMinutes: 5,
  aiQuotaOpenAIPath: '',
  agentAttachmentDir: '',
  hoverWheelActions: [...hoverActions],
  fileWheelActions: [...sliceActions],
}

export function isThemeId(value: string): value is ThemeId {
  return (themeIds as readonly string[]).includes(value)
}

export function isPetScale(value: number): value is PetScale {
  return (petScales as readonly number[]).includes(value)
}
