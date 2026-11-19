/**
 * Short companion lines for moments where the pet answers something the user
 * just did. Status bubbles use a first-person pet voice; reminders keep their
 * own 「主人，」 wording in `reminder-lines.ts`.
 */

export type ShelfKind = 'screenshot' | 'clipboard'

export type SnoozeKind = 'water' | 'sitting' | 'eyes'

export type MusicAiFallbackReason =
  | 'key'
  | 'balance'
  | 'rate'
  | 'network'
  | 'other'

export function shelfReceivedLine(kind: ShelfKind): string {
  return kind === 'screenshot'
    ? '截图我收进置物架啦'
    : '图片我收进置物架啦'
}

export function clipboardCapturedLine(): string {
  return '复制好啦，我记下来了'
}

export function reminderSnoozeLine(
  kind: SnoozeKind,
  minutes: number,
): string {
  const delay = Math.min(60, Math.max(1, Math.round(minutes)))
  if (kind === 'water') return `好，${delay} 分钟后我再来叫你喝水`
  if (kind === 'sitting') return `好，${delay} 分钟后我再来叫你起来`
  return `好，${delay} 分钟后我喊你看远处`
}

export function fileEatenLine(): string {
  return '吃掉啦，7 天内到置物架找我'
}

export function fileTransferLine(
  action: 'copy' | 'move',
  name: string,
  count: number,
  target: string,
): string {
  const verb = action === 'copy' ? '复制到' : '移动到'
  const source = count > 1 ? `「${name}」等 ${count} 项` : `「${name}」`
  return `我把${source}${verb}「${target}」啦`
}

export function saveCopyLine(): string {
  return '副本保存好啦'
}

export function musicAiFallbackLine(reason: MusicAiFallbackReason): string {
  if (reason === 'key') return 'DeepSeek Key 失效，我先用自己的话陪你听'
  if (reason === 'balance') return 'DeepSeek 余额不足，我先用自己的话陪你听'
  if (reason === 'rate') return 'DeepSeek 请求过多，我先用自己的话陪你听'
  if (reason === 'network') return '连不上 DeepSeek，我先用自己的话陪你听'
  return 'AI 生成失败，我先用自己的话陪你听'
}

export function musicAiDailyLimitLine(): string {
  return '今天 AI 互动够了，我先用自己的话陪你听'
}

export function todoDoneLine(todo: string): string {
  const text = Array.from(todo.trim()).slice(0, 9).join('')
  return text ? `「${text}」完成啦，真棒` : '又完成一件，真棒'
}

export function mailArrivalLine(): string {
  return '主人，来邮件啦'
}
