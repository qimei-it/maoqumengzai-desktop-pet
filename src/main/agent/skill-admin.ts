/**
 * Skill administration for the agent: install from a path or URL, scan the
 * result, enable/disable with a security gate, and uninstall user skills.
 */

import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type {
  AgentSkillScan,
  AgentSkillView,
} from '../../shared/agent'
import { resolveSkillSource } from './skill-source'
import { scanSkillDirectory } from './skill-scanner'
import type { SkillStore } from './skills'

const maxInstallSkills = 20

type StoredScan = {
  id: string
  status: AgentSkillScan['status']
  summary: string
  at: number
}

type StoredScans = {
  version: 1
  scans: StoredScan[]
}

export type SkillAdminInstall = {
  installed: AgentSkillView[]
  scans: Array<{ skill: AgentSkillView; scan: AgentSkillScan }>
}

export type SkillAdmin = {
  list(): AgentSkillView[]
  find(target: string): AgentSkillView
  scan(target: string): Promise<AgentSkillScan>
  /** Throws when the skill is known to be unsafe to enable. */
  ensureCanEnable(target: string): Promise<void>
  setEnabled(target: string, enabled: boolean): Promise<AgentSkillView>
  installLocal(path: string): Promise<SkillAdminInstall>
  installUrl(url: string): Promise<SkillAdminInstall>
  remove(target: string): Promise<boolean>
}

type SkillAdminOptions = {
  store: SkillStore
  /** Where the last scan result per skill is persisted. */
  scansPath: string
  /** Absolute path to the bundled skill-scanner script, when available. */
  scannerScript?: string
  /** Electron net.fetch in production so system proxies apply. */
  fetch?: typeof fetch
  resolve?: typeof resolveSkillSource
  scanDirectory?: typeof scanSkillDirectory
  /** Runs after install, enable/disable or uninstall changes the library. */
  onChange?: () => void
}

async function loadScans(path: string): Promise<Map<string, StoredScan>> {
  const scans = new Map<string, StoredScan>()
  const parsed = JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as
    | StoredScans
    | null
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.scans)) return scans
  for (const scan of parsed.scans) {
    if (
      !scan ||
      typeof scan.id !== 'string' ||
      !scan.id ||
      typeof scan.summary !== 'string' ||
      typeof scan.at !== 'number'
    )
      continue
    if (!['safe', 'warn', 'blocked', 'error'].includes(scan.status)) continue
    scans.set(scan.id, scan)
  }
  return scans
}

async function saveScans(
  path: string,
  scans: Map<string, StoredScan>,
): Promise<void> {
  const value: StoredScans = {
    version: 1,
    scans: [...scans.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 })
  await rename(`${path}.tmp`, path)
}

export async function createSkillAdmin(
  options: SkillAdminOptions,
): Promise<SkillAdmin> {
  const { store } = options
  const resolve =
    options.resolve ??
    ((value: string) =>
      resolveSkillSource(
        value,
        options.fetch ? { fetch: options.fetch } : {},
      ))
  const scanDirectory = options.scanDirectory ?? scanSkillDirectory
  const scans = await loadScans(options.scansPath)

  const find = (target: string): AgentSkillView => {
    const value = target.trim()
    if (!value) throw new Error('缺少技能名称或 ID。')
    const all = store.list()
    const exact = all.find((skill) => skill.id === value)
    if (exact) return exact
    const named = all.filter(
      (skill) => skill.name.toLowerCase() === value.toLowerCase(),
    )
    if (named.length === 1) return named[0]
    if (named.length > 1)
      throw new Error(`有多个技能都叫“${value}”，请改用技能 ID。`)
    throw new Error(`没有找到技能“${value}”。`)
  }

  const persist = () => saveScans(options.scansPath, scans).catch(() => {})
  const changed = (): void => options.onChange?.()

  const runScan = async (view: AgentSkillView): Promise<AgentSkillScan> => {
    if (view.builtin && view.id === 'builtin-sentry-skill-scanner') {
      return {
        status: 'safe',
        scanner: '内置技能',
        summary: '内置扫描器包含规则示例，跳过自扫描。',
        findings: [],
      }
    }
    const location = store.locate(view.id)
    if (!location) throw new Error('技能不存在。')
    let directory = location.directory
    let temporary: string | null = null
    if (location.isFile) {
      temporary = await mkdtemp(join(tmpdir(), 'mqmz-skill-scan-'))
      await copyFile(location.file, join(temporary, 'SKILL.md'))
      directory = temporary
    }
    try {
      return await scanDirectory(directory, {
        ...(options.scannerScript
          ? { scriptPath: options.scannerScript }
          : {}),
      })
    } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true })
    }
  }

  const recordScan = (view: AgentSkillView, scan: AgentSkillScan): void => {
    scans.set(view.id, {
      id: view.id,
      status: scan.status,
      summary: scan.summary,
      at: Date.now(),
    })
  }

  const blockedMessage = (view: AgentSkillView, scan: AgentSkillScan): string =>
    `技能“${view.name}”未通过安全检查，不能启用：${scan.summary}`

  const scan = async (target: string): Promise<AgentSkillScan> => {
    const view = find(target)
    const result = await runScan(view)
    recordScan(view, result)
    await persist()
    return result
  }

  const ensureCanEnable = async (target: string): Promise<void> => {
    const view = find(target)
    if (view.builtin) return
    const stored = scans.get(view.id)
    if (stored?.status === 'blocked')
      throw new Error(
        `技能“${view.name}”上次安全检查未通过，不能启用。重新运行 skill_scan 检查通过后再启用。`,
      )
    if (stored) return
    const result = await runScan(view)
    recordScan(view, result)
    await persist()
    if (result.status === 'blocked')
      throw new Error(blockedMessage(view, result))
  }

  const viewOf = (id: string): AgentSkillView => {
    const view = store.list().find((skill) => skill.id === id)
    if (!view) throw new Error('技能不存在。')
    return view
  }

  const setEnabled = async (
    target: string,
    enabled: boolean,
  ): Promise<AgentSkillView> => {
    const view = find(target)
    if (enabled) await ensureCanEnable(view.id)
    const skill = await store.setEnabled(view.id, enabled)
    changed()
    return skill
  }

  const finishInstall = async (
    details: Array<{ id: string }>,
  ): Promise<SkillAdminInstall> => {
    const results: SkillAdminInstall['scans'] = []
    for (const detail of details) {
      const view = viewOf(detail.id)
      const result = await runScan(view)
      recordScan(view, result)
      await store.setEnabled(view.id, result.status !== 'blocked')
      results.push({ skill: viewOf(view.id), scan: result })
    }
    await persist()
    changed()
    return {
      installed: results.map((item) => item.skill),
      scans: results,
    }
  }

  const install = async (
    sourcePath: string,
  ): Promise<SkillAdminInstall> => {
    const details = await store.install(sourcePath, {
      maxSkills: maxInstallSkills,
    })
    return finishInstall(details)
  }

  return {
    list: () => store.list(),
    find,
    scan,
    ensureCanEnable,
    setEnabled,
    installLocal: (path) => install(path),
    installUrl: async (url) => {
      const source = await resolve(url)
      try {
        return await install(source.path)
      } finally {
        await source.cleanup().catch(() => {})
      }
    },
    remove: async (target) => {
      const view = find(target)
      const removed = await store.remove(view.id)
      scans.delete(view.id)
      await persist()
      changed()
      return removed
    },
  }
}
