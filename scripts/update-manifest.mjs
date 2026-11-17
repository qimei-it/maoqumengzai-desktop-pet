/**
 * Builds `dist/latest.json` for the in-app updater.
 *
 *   node scripts/update-manifest.mjs
 *   node scripts/update-manifest.mjs --notes "修复了桌宠提示词"
 *   node scripts/update-manifest.mjs --dry-run
 *
 * Run it after `pack:mac` / `pack:win`, then upload `latest.json` plus the two
 * installers to the site root.
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
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
for (const [key, name] of targets) {
  const found = await asset(join(dist, name))
  if (!found) {
    console.warn(`跳过 ${key}：dist/${name} 不存在`)
    continue
  }
  assets[key] = {
    file: name,
    size: found.size,
    sha256: found.sha256,
  }
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
