/**
 * Risk hints for shell commands the agent wants to run.
 *
 * This is a warning layer, not a sandbox: it explains why a command deserves a
 * second look and feeds the approval card. It never decides on its own whether
 * something may run.
 */

export type ShellRisk = {
  /** `high` should be read before running; `medium` is worth a glance. */
  level: 'high' | 'medium'
  reasons: string[]
}

type Rule = {
  pattern: RegExp
  reason: string
  level: 'high' | 'medium'
}

const rules: Rule[] = [
  { pattern: /\brm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(?:\/|~|\$HOME|\*)/, reason: '递归删除根目录、家目录或通配符', level: 'high' },
  { pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r/, reason: '强制递归删除', level: 'high' },
  { pattern: /\bsudo\b/, reason: '请求管理员权限', level: 'high' },
  { pattern: /\b(?:mkfs|fdisk|diskutil\s+(?:erase|partition))\b/, reason: '格式化或分区磁盘', level: 'high' },
  { pattern: /\bdd\s+.*\bof=/, reason: '直接写入设备或文件', level: 'high' },
  { pattern: />\s*\/dev\/(?:sd|disk|nvme)/, reason: '写入块设备', level: 'high' },
  { pattern: /\b(?:shutdown|reboot|halt)\b/, reason: '关机或重启', level: 'high' },
  { pattern: /\bkill(?:all)?\s+-9\s+(?:-1|1)\b/, reason: '终止全部进程', level: 'high' },
  { pattern: /\bcrontab\s+-r\b/, reason: '清空定时任务', level: 'high' },
  { pattern: /\bchmod\s+-R\s+777\b/, reason: '递归放开全部权限', level: 'high' },
  { pattern: /\bchown\s+-R\b/, reason: '递归修改文件属主', level: 'medium' },
  { pattern: /\bgit\s+(?:push\s+.*--force|reset\s+--hard|clean\s+-[a-zA-Z]*f)/, reason: '覆盖或丢弃 git 历史', level: 'high' },
  { pattern: /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/, reason: '把网络内容直接交给 shell 执行', level: 'high' },
  { pattern: /\b(?:npm|pnpm|yarn)\s+publish\b/, reason: '发布公开包', level: 'medium' },
  { pattern: /\b(?:mv|cp)\b[^|]*\s\/\S+/, reason: '读写系统目录', level: 'medium' },
  { pattern: /\b:\(\)\s*\{\s*:\|:&\s*\};:/, reason: 'fork 炸弹', level: 'high' },
]

/** Matches are reported once per distinct reason, highest level first. */
export function shellRisk(command: string): ShellRisk {
  const text = command.replace(/\s+/g, ' ').trim()
  const reasons: string[] = []
  let level: ShellRisk['level'] = 'medium'
  for (const rule of rules) {
    if (!rule.pattern.test(text)) continue
    if (!reasons.includes(rule.reason)) reasons.push(rule.reason)
    if (rule.level === 'high') level = 'high'
  }
  return { level, reasons }
}
