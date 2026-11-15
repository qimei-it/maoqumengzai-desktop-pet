/** Runs the bundled skill-scanner, with a local static fallback. */

import { execFile } from 'node:child_process'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, join, relative, isAbsolute } from 'node:path'
import type {
  AgentSkillScan,
  AgentSkillScanFinding,
} from '../../shared/agent'

type ScanOptions = {
  /** Absolute path to the bundled skill-scanner script. */
  scriptPath?: string
  run?: (
    command: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>
}

function defaultRun(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout: 45_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              String(stderr || error.message || 'skill-scanner 执行失败'),
            ),
          )
          return
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })
}

function normalizeSeverity(value: unknown): AgentSkillScanFinding['severity'] {
  if (value === 'critical' || value === 'high' || value === 'medium')
    return value
  if (value === 'low' || value === 'info') return value
  return 'info'
}

function mapFindings(value: unknown): AgentSkillScanFinding[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      severity: normalizeSeverity(item.severity),
      category:
        typeof item.category === 'string' ? item.category : undefined,
      message:
        typeof item.message === 'string'
          ? item.message
          : typeof item.description === 'string'
            ? item.description
            : '未命名问题',
      file: typeof item.file === 'string' ? item.file : undefined,
      line: typeof item.line === 'number' ? item.line : undefined,
    }))
}

function scanStatus(findings: AgentSkillScanFinding[]): AgentSkillScan['status'] {
  if (findings.some((item) => item.severity === 'critical')) return 'blocked'
  if (findings.some((item) => item.severity === 'high')) return 'warn'
  if (findings.length) return 'warn'
  return 'safe'
}

function summarize(scan: Omit<AgentSkillScan, 'summary'>): string {
  if (scan.status === 'safe')
    return `安全检查通过（${scan.scanner}，无风险项）。`
  const critical = scan.findings.filter(
    (item) => item.severity === 'critical',
  ).length
  const high = scan.findings.filter((item) => item.severity === 'high').length
  const other = scan.findings.length - critical - high
  const parts = [
    critical ? `严重 ${critical}` : '',
    high ? `高风险 ${high}` : '',
    other ? `其他 ${other}` : '',
  ].filter(Boolean)
  return `安全检查${scan.status === 'blocked' ? '未通过' : '有警告'}（${scan.scanner}，${parts.join(
    ' / ',
  )}）。`
}

const fallbackPatterns: Array<{
  severity: AgentSkillScanFinding['severity']
  pattern: RegExp
  message: string
}> = [
  {
    severity: 'critical',
    pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    message: '疑似提示词注入：忽略之前的指令',
  },
  {
    severity: 'critical',
    pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
    message: '疑似提示词注入：忽略之前的规则',
  },
  {
    severity: 'critical',
    pattern: /rm\s+-rf\s+(\/|\$HOME|~)/i,
    message: '危险命令：递归删除根目录或主目录',
  },
  {
    severity: 'critical',
    pattern: /curl[^\n|]*\|\s*(sh|bash|zsh)/i,
    message: '危险命令：直接执行网络脚本',
  },
  {
    severity: 'critical',
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
    message: '疑似私钥泄露',
  },
  {
    severity: 'critical',
    pattern: /AKIA[0-9A-Z]{16}/,
    message: '疑似 AWS Access Key',
  },
  {
    severity: 'critical',
    pattern: /ghp_[0-9a-zA-Z]{36}/,
    message: '疑似 GitHub Token',
  },
  {
    severity: 'high',
    pattern: /<!\s*command\s*>/i,
    message: '疑似 Skill 加载时执行命令',
  },
  {
    severity: 'high',
    pattern: /PostToolUse|PreToolUse|SessionStart|Stop\s*:/,
    message: '疑似自动执行 Hook',
  },
  {
    severity: 'high',
    pattern: /(eval|new\s+Function)\s*\(/,
    message: '脚本包含动态代码执行',
  },
  {
    severity: 'high',
    pattern: /(child_process|subprocess\.(run|call|Popen)|os\.system)\s*\(/,
    message: '脚本包含系统命令调用',
  },
  {
    severity: 'medium',
    pattern: /(curl|wget)\s+/i,
    message: '脚本包含网络请求',
  },
]

async function fallbackScan(directory: string): Promise<AgentSkillScan> {
  const findings: AgentSkillScanFinding[] = []
  const files: string[] = []
  const stack = [directory]
  while (stack.length && files.length < 200) {
    const current = stack.pop()!
    for (const entry of await readdir(current, {
      withFileTypes: true,
    }).catch(() => [])) {
      if (entry.isSymbolicLink()) {
        const path = join(current, entry.name)
        const realRoot = await realpath(directory).catch(() => directory)
        const target = await realpath(path).catch(() => null)
        const rel = target ? relative(realRoot, target) : '..'
        if (!target || rel.startsWith('..') || isAbsolute(rel))
          findings.push({
            severity: 'high',
            category: '结构',
            message: `符号链接可能指向技能目录外：${relative(
              directory,
              path,
            )}`,
            file: relative(directory, path),
          })
        continue
      }
      if (entry.isDirectory()) {
        stack.push(join(current, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      const extension = extname(entry.name).toLowerCase()
      if (
        ![
          '.md',
          '.markdown',
          '.txt',
          '.py',
          '.sh',
          '.js',
          '.ts',
          '.json',
          '.yaml',
          '.yml',
        ].includes(extension)
      )
        continue
      files.push(join(current, entry.name))
    }
  }
  for (const path of files) {
    const info = await stat(path).catch(() => null)
    if (!info?.isFile() || info.size > 512 * 1024) continue
    const content = await readFile(path, 'utf8').catch(() => null)
    if (!content) continue
    const rel = relative(directory, path).split('\\').join('/')
    for (const rule of fallbackPatterns) {
      if (!rule.pattern.test(content)) continue
      findings.push({
        severity: rule.severity,
        category: '本地静态扫描',
        message: rule.message,
        file: rel,
      })
    }
    if (rel === 'package.json' && /"postinstall"\s*:/.test(content))
      findings.push({
        severity: 'high',
        category: '供应链',
        message: 'package.json 包含 postinstall 脚本',
        file: rel,
      })
  }
  const status = scanStatus(findings)
  const base = { status, scanner: '本地静态扫描', findings }
  return { ...base, summary: summarize(base) }
}

export async function scanSkillDirectory(
  directory: string,
  options: ScanOptions = {},
): Promise<AgentSkillScan> {
  const info = await stat(directory).catch(() => null)
  if (!info?.isDirectory())
    return {
      status: 'error',
      scanner: 'skill-scanner',
      summary: '技能目录不存在，无法安全检查。',
      findings: [],
    }
  const run = options.run ?? defaultRun
  const script = options.scriptPath
  if (script) {
    for (const command of ['uv', 'python3']) {
      try {
        const { stdout } = await run(command, [
          ...(command === 'uv' ? ['run'] : []),
          script,
          directory,
        ])
        const parsed = JSON.parse(stdout) as {
          findings?: unknown
          finding_counts?: Record<string, number>
          total_findings?: number
        }
        const findings = mapFindings(parsed.findings)
        const status = scanStatus(findings)
        const base = {
          status,
          scanner: command === 'uv' ? 'skill-scanner (uv)' : 'skill-scanner (python)',
          findings,
        }
        return { ...base, summary: summarize(base) }
      } catch {
        // Try the next interpreter, then the local fallback.
      }
    }
  }
  return fallbackScan(directory)
}

export function formatSkillScan(scan: AgentSkillScan): string {
  const lines = [scan.summary]
  for (const finding of scan.findings.slice(0, 8))
    lines.push(
      `- [${finding.severity}] ${finding.message}${
        finding.file ? `（${finding.file}${finding.line ? `:${finding.line}` : ''}）` : ''
      }`,
    )
  if (scan.findings.length > 8)
    lines.push(`- 其余 ${scan.findings.length - 8} 项已省略`)
  return lines.join('\n')
}
