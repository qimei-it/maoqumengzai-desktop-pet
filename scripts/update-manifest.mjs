/**
 * Builds `dist/latest.json` for the in-app updater.
 *
 *   node scripts/update-manifest.mjs
 *   node scripts/update-manifest.mjs --notes "修复了桌宠提示词"
 *   node scripts/update-manifest.mjs --dry-run
 *
 * Run it after `pack:mac` / `pack:win`, then upload `latest.json` plus the two
 * installers to the site root.
 *
 * 默认要求两个平台的安装包都在 dist/，缺任何一个都会失败，避免产出只含单平台的
 * 清单覆盖线上。`pack:mac` / `pack:win` 用 --if-complete：包不齐时静默跳过，
 * 两个包都齐的那次打包会自动刷新清单。
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const partial = args.includes('--partial')
const ifComplete = args.includes('--if-complete')
const notesIndex = args.indexOf('--notes')
const notes = notesIndex >= 0 ? args[notesIndex + 1]?.trim() : undefined

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function asset(file) {
  try {
    const info = await stat(file)
    return { file, size: info.size, sha256: await sha256(file) }
  } catch {
    return undefined
  }
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const version = pkg.version
const targets = [
  ['darwin-arm64', `mqmz-${version}-arm64.dmg`],
  ['win32-x64', `mqmz-${version}-setup.exe`],
]

const assets = {}
const missing = []
for (const [key, name] of targets) {
  const found = await asset(join(dist, name))
  if (!found) {
    missing.push(`dist/${name}`)
    continue
  }
  assets[key] = {
    file: name,
    size: found.size,
    sha256: found.sha256,
  }
}

if (missing.length && ifComplete && !partial) {
  console.warn(`安装包不齐（缺 ${missing.join('、')}），本次跳过生成 latest.json。`)
  process.exit(0)
}

if (missing.length && !partial) {
  console.error(
    `缺少 ${missing.join('、')}，无法生成完整清单。只发布单平台时请显式加 --partial。`,
  )
  process.exit(1)
}

if (!Object.keys(assets).length) {
  console.error('没有找到任何安装包，请先运行 npm run pack:mac 或 pack:win。')
  process.exit(1)
}

const manifest = {
  version,
  releasedAt: new Date().toISOString(),
  ...(notes ? { notes } : {}),
  assets,
}

const output = `${JSON.stringify(manifest, null, 2)}\n`
if (dryRun) {
  console.log(output)
} else {
  await writeFile(join(dist, 'latest.json'), output)
  console.log(`已写入 dist/latest.json（${version}）：`)
  for (const [key, value] of Object.entries(assets))
    console.log(
      `  ${key}  ${value.file}  ${(value.size / 1024 / 1024).toFixed(1)} MB  ${value.sha256}`,
    )
}
