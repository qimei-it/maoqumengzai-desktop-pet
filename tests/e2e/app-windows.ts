import { expect } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'

/** Panels that must exist before a test starts interacting with the app. */
export const requiredWindowTitles = [
  '验证台',
  '交互标记',
  '文件置物架',
  '智能体',
  '文件转换',
  '打包归档',
  '批量重命名',
  '设置',
  '邮件',
  '撰写',
  '番茄时钟',
  '喝水提醒',
  '休息提醒',
  '宠物档案',
  '剪贴板',
  '计时环',
  '待办清单',
  '音乐控制',
  '音符',
  '音量',
  '音乐开关',
  '歌词',
  '气泡',
  '提示',
] as const

/**
 * Waits for the fixed panel set instead of an exact window count.
 * The AI quota pill is created lazily, so it may temporarily add a window.
 */
export async function waitForAppWindows(
  application: ElectronApplication,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const titles = await Promise.all(
          application.windows().map((page) => page.title()),
        )
        return requiredWindowTitles.every((title) =>
          titles.some((value) => value.includes(title)),
        )
      },
      { timeout: 15_000 },
    )
    .toBe(true)
}
