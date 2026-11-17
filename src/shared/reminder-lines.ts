/**
 * Local reminder copy spoken by the desktop pet. Every line starts with
 * 「主人，」, may mention the pet's name, and stays inside the small status
 * bubble. No model calls; `recent` keeps consecutive reminders from repeating.
 */

export type ReminderKind =
  | 'water'
  | 'sitting'
  | 'eyes'
  | 'focusDone'
  | 'breakDone'
  | 'todo'
  | 'quotaLow'
  | 'balanceLow'
  | 'quotaError'

export type ReminderVars = {
  name?: string
  /** Water cups finished today. */
  count?: number
  /** Water goal for today. */
  goal?: number
  /** Due todo text, clipped before it enters a line. */
  todo?: string
  /** How many todos are due at once; the multi-item line needs 2+. */
  more?: number
  /** Remaining quota percent or formatted money. */
  left?: string
  /** Provider label for quota errors, e.g. 「OpenAI 额度」 / 「DeepSeek 余额」. */
  service?: string
}

/** Bubble-safe length so one line still reads within three rows. */
export const reminderLineMaxChars = 22

const nameMaxChars = 6
const todoMaxChars = 9
const serviceMaxChars = 12

const templates: Record<ReminderKind, readonly string[]> = {
  water: [
    '主人，杯子空啦，去接一杯',
    '主人，喝口水，{name}看着你呢',
    '主人，今天第 {count} 杯了',
    '主人，水杯在等你，别让它等太久',
    '主人，嗓子干了吧，喝两口',
    '主人，一口水的时间还是有的',
    '主人，{name}陪你去接水',
    '主人，离 {goal} 杯又近一步',
  ],
  sitting: [
    '主人，坐太久了，起来晃两步',
    '主人，{name}想看你站起来伸个懒腰',
    '主人，腰在抗议了，走一走',
    '主人，离开椅子一会儿吧',
    '主人，站起来，看看窗外',
    '主人，动一动，回来更精神',
    '主人，椅子坐热了，换个姿势',
  ],
  eyes: [
    '主人，眼睛累了，看会儿远处',
    '主人，把视线挪开 20 秒',
    '主人，屏幕看久了，眨眨眼',
    '主人，{name}陪你看看窗外',
    '主人，眼睛也想歇一会儿',
    '主人，闭眼十秒，再睁开',
    '主人，看向最远的地方',
  ],
  focusDone: [
    '主人，这一段忙完了，歇一会儿',
    '主人，专注结束啦，起来动动',
    '主人，{name}陪你歇五分钟',
    '主人，先放下手里的，松松肩',
    '主人，做得好，先歇一会儿',
    '主人，时间到，抬头看看远处',
    '主人，这一段完成啦，来击掌',
    '主人，辛苦啦，{name}陪你歇会儿',
  ],
  breakDone: [
    '主人，休息够啦，回来继续',
    '主人，回来吧，{name}陪着你',
    '主人，歇好了就继续，别拖太久',
    '主人，准备好就回来吧',
    '主人，下一段开始，{name}在旁边',
  ],
  todo: [
    '主人，{todo}到时间了',
    '主人，别忘了，{todo}',
    '主人，{todo}还等着你',
    '主人，{name}提醒：{todo}',
    '主人，{todo} 等 {more} 件在等你',
    '主人，{todo}该动一动了',
  ],
  quotaLow: [
    '主人，额度只剩 {left} 了',
    '主人，这周额度只剩 {left}',
    '主人，5 小时额度剩 {left}',
    '主人，额度快见底了，还剩 {left}',
    '主人，{name}提醒你额度不多了',
    '主人，{left} 了，省着点用',
  ],
  balanceLow: [
    '主人，余额只剩 {left}，省着用',
    '主人，余额剩 {left}',
    '主人，快没钱了，余额 {left}',
    '主人，余额不多了，记得充一点',
    '主人，{name}看到余额不多了',
    '主人，只剩 {left} 了，悠着点',
  ],
  quotaError: [
    '主人，{service}读不到了，看看网络吧',
    '主人，{service}刷新失败，稍后再试',
    '主人，{name}连不上{service}服务了',
    '主人，{service}更新卡住了，检查网络',
  ],
}

/** Used only when a caller cannot fill the line's data slots. */
const fallbacks: Record<ReminderKind, string> = {
  water: '主人，该喝口水啦',
  sitting: '主人，起来活动一下',
  eyes: '主人，让眼睛歇一会儿',
  focusDone: '主人，这一段结束啦，歇一会儿',
  breakDone: '主人，休息够了就继续',
  todo: '主人，有件事到时间啦',
  quotaLow: '主人，额度不多了',
  balanceLow: '主人，余额不多了',
  quotaError: '主人，额度读不到了',
}

function clip(text: string, max: number): string {
  const chars = Array.from(text.trim())
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('')
}

function slotsReady(template: string, vars: ReminderVars): boolean {
  if (template.includes('{todo}') && !vars.todo?.trim()) return false
  if (template.includes('{count}') && !Number.isFinite(vars.count)) return false
  if (template.includes('{goal}') && !Number.isFinite(vars.goal)) return false
  if (template.includes('{more}') && !(Number(vars.more) > 1)) return false
  if (template.includes('{left}') && !vars.left?.trim()) return false
  if (template.includes('{service}') && !vars.service?.trim()) return false
  return true
}

function fill(template: string, vars: ReminderVars): string {
  const name = clip(vars.name ?? '我', nameMaxChars) || '我'
  return template
    .replaceAll('{name}', name)
    .replaceAll('{todo}', clip(vars.todo ?? '', todoMaxChars))
    .replaceAll('{count}', String(Math.max(0, Math.round(vars.count ?? 0))))
    .replaceAll('{goal}', String(Math.max(0, Math.round(vars.goal ?? 0))))
    .replaceAll('{more}', String(Math.max(2, Math.round(vars.more ?? 2))))
    .replaceAll('{left}', clip(vars.left ?? '', todoMaxChars))
    .replaceAll('{service}', clip(vars.service ?? '', serviceMaxChars))
}

/**
 * Pick one line for `kind`, preferring lines outside `recent` and wrapping back
 * to the whole pool once every line has been used.
 */
export function reminderLine(
  kind: ReminderKind,
  vars: ReminderVars = {},
  recent: readonly string[] = [],
  random: () => number = Math.random,
): string {
  const pool = templates[kind].filter((template) => slotsReady(template, vars))
  if (!pool.length) return fill(fallbacks[kind], vars)
  const fresh = pool.filter((template) => !recent.includes(fill(template, vars)))
  const source = fresh.length ? fresh : pool
  const index = Math.min(
    source.length - 1,
    Math.max(0, Math.floor(random() * source.length)),
  )
  return fill(source[index], vars)
}
