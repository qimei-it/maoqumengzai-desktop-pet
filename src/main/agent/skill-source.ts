/** Resolves a direct URL or GitHub repo/tree URL into a local skill source. */

import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path'
import { extractArchive } from '../archive-zip'

const maxBytes = 50 * 1024 * 1024
const archiveLimit = {
  inputBytes: 50 * 1024 * 1024,
  entries: 1000,
  expandedBytes: 200 * 1024 * 1024,
}

export type SkillSource = {
  path: string
  cleanup: () => Promise<void>
}

type ResolveOptions = {
  fetch?: typeof fetch
}

function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    host === '0.0.0.0'
  )
    return true
  if (/^(fc|fd|fe80)/.test(host)) return true
  const parts = host.split('.')
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    const [first, second] = parts.map(Number)
    if (first === 0 || first === 127 || first === 10) return true
    if (first === 169 && second === 254) return true
    if (first === 192 && second === 168) return true
    if (first === 172 && second >= 16 && second <= 31) return true
  }
  return false
}

function validateUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('Skill 地址格式不正确。')
  }
  if (url.protocol !== 'https:') throw new Error('只支持 https 地址。')
  if (url.username || url.password) throw new Error('地址不能包含账号信息。')
  if (privateHost(url.hostname)) throw new Error('不能从本机或内网地址安装。')
  return url
}

function extensionFor(url: URL, contentType: string): string {
  const name = basename(decodeURIComponent(url.pathname)).toLowerCase()
  if (name.endsWith('.tar.gz')) return '.tar.gz'
  if (name.endsWith('.tgz')) return '.tgz'
  const ext = extname(name).toLowerCase()
  if (
    ['.md', '.markdown', '.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz'].includes(
      ext,
    )
  )
    return ext
  if (contentType.includes('markdown')) return '.md'
  if (contentType.includes('zip')) return '.zip'
  return ''
}

async function download(
  request: typeof fetch,
  url: string,
): Promise<{ bytes: Uint8Array; type: string; finalUrl: string }> {
  const response = await request(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null)
  if (!response) throw new Error('下载 Skill 失败，请检查网络。')
  if (!response.ok)
    throw new Error(`下载 Skill 失败（${response.status}）。`)
  const finalUrl = response.url || url
  validateUrl(finalUrl)
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new Error('Skill 下载内容超过 50 MB。')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maxBytes) throw new Error('Skill 下载内容超过 50 MB。')
  return {
    bytes,
    type: response.headers.get('content-type') ?? '',
    finalUrl,
  }
}

/**
 * Accepts direct Markdown/archive URLs and GitHub repo or tree URLs.
 * The caller must always run cleanup().
 */
export async function resolveSkillSource(
  value: string,
  options: ResolveOptions = {},
): Promise<SkillSource> {
  const url = validateUrl(value)
  const request = options.fetch ?? fetch
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-skill-download-'))
  const cleanup = () => rm(directory, { recursive: true, force: true })
  try {
    const github = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/([^/]+)(?:\/(.+))?)?\/?$/.exec(
      url.href,
    )
    if (github) {
      const owner = github[1]
      const repo = github[2].replace(/\.git$/, '')
      const branch = github[3]
      const path = github[4]
      let zip: { bytes: Uint8Array; finalUrl: string } | null = null
      for (const candidate of branch ? [branch] : ['main', 'master']) {
        const result = await download(
          request,
          `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${candidate}`,
        ).catch(() => null)
        if (result) {
          zip = result
          break
        }
      }
      if (!zip) throw new Error('无法下载 GitHub 仓库，请检查地址或分支。')
      const copy = join(directory, `${repo}.zip`)
      await writeFile(copy, zip.bytes)
      const { folder } = await extractArchive(copy, archiveLimit)
      const top = await readdir(folder, { withFileTypes: true }).catch(() => [])
      let target =
        top.length === 1 && top[0].isDirectory()
          ? join(folder, top[0].name)
          : folder
      if (path) {
        target = join(target, path)
        const root = relative(folder, target)
        if (root.startsWith('..') || isAbsolute(root))
          throw new Error('GitHub 路径超出仓库范围。')
        const info = await stat(target).catch(() => null)
        if (!info) throw new Error('GitHub 仓库中不存在这个路径。')
        if (info.isFile() && /skill\.md$/i.test(target))
          target = dirname(target)
      }
      return { path: target, cleanup }
    }

    const downloaded = await download(request, url.href)
    const extension = extensionFor(new URL(downloaded.finalUrl), downloaded.type)
    if (!extension)
      throw new Error('只支持 SKILL.md、Markdown 或常见压缩包地址。')
    const file = join(directory, `skill${extension}`)
    await writeFile(file, downloaded.bytes)
    return { path: file, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
