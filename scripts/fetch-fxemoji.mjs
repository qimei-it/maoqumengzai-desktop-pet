/**
 * Downloads the complete official Firefox Emoji (FxEmojis) artwork used by the
 * list icon picker. Source: https://github.com/mozilla/fxemoji
 * Visual design: CC BY 4.0. Code: Apache-2.0.
 *
 * The repository archive is downloaded once so the sync does not depend on
 * 1,000+ individual asset requests. Several upstream SVGs embed an unused
 * Illustrator font and an NYT metadata text block; those blocks are removed,
 * while artwork paths and real text stay unchanged.
 *
 * Re-run with `npm run sync:fxemoji` (requires curl and tar).
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const target = new URL('../src/renderer/assets/fxemoji/', import.meta.url)
const licenseTarget = new URL(
  '../resources/licenses/fxemoji-LICENSE.md',
  import.meta.url,
)
const archive = join(tmpdir(), 'fxemoji-master.tar.gz')
const extract = join(tmpdir(), 'fxemoji-master')
const repository = join(extract, 'fxemoji-master')
const archiveUrl =
  'https://codeload.github.com/mozilla/fxemoji/tar.gz/refs/heads/master'

const categoryOrder = [
  ['nature', '自然'],
  ['objects', '物品'],
  ['people', '人物'],
  ['places', '地点'],
  ['symbols', '符号'],
  ['flags', '旗帜'],
  ['other', '其他'],
]
const officialCategories = [
  'flags',
  'nature',
  'objects',
  'people',
  'places',
  'symbols',
]

/** Preserve artwork text, but strip the upstream font/NYT metadata blocks. */
function clean(svg) {
  let value = svg.replace(/^\uFEFF/, '')
  value = value.replace(/<\?xml[\s\S]*?\?>/gi, '')
  value = value.replace(/<!--[\s\S]*?-->/g, '')
  value = value.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
  value = value.replace(/<style[\s\S]*?<\/style>/gi, (block) =>
    /@font-face/i.test(block) ? '' : block,
  )
  value = value.replace(/<font[\s\S]*?<\/font>/gi, '')
  value = value.replace(/<text[\s\S]*?<\/text>/gi, (block) =>
    /nyt_|MyriadPro/i.test(block) ? '' : block,
  )
  value = value.replace(/<g[^>]*nyt_[^>]*>\s*<\/g>/gi, '')
  value = value.replace(/>\s+</g, '><')
  value = value.replace(/\s{2,}/g, ' ')
  value = value.replace(/\s+\/>/g, '/>')
  return value.trim()
}

const existing = new Map()
try {
  const previous = JSON.parse(
    await readFile(new URL('manifest.json', target), 'utf8'),
  )
  for (const entry of previous) existing.set(entry.id, entry)
} catch {
  // First sync: no previous manifest to preserve Chinese labels from.
}

console.log('Downloading the official FxEmoji archive...')
execFileSync('curl', [
  '-L',
  '--retry',
  '3',
  '--connect-timeout',
  '30',
  '--max-time',
  '900',
  '-o',
  archive,
  archiveUrl,
])
await rm(extract, { recursive: true, force: true })
await mkdir(extract, { recursive: true })
execFileSync('tar', ['-xzf', archive, '-C', extract])

const codeCategories = new Map()
const nameCategories = new Map()
for (const category of officialCategories) {
  const data = JSON.parse(
    await readFile(
      join(repository, 'dist', category, `${category}.json`),
      'utf8',
    ),
  )
  for (const item of data) {
    const glyph = item.icon?.glyph
    if (!glyph) continue
    const code = String(glyph.code ?? '')
      .replace(/^u/i, '')
      .toUpperCase()
    const name = String(glyph.name ?? '').toLowerCase()
    if (code && !codeCategories.has(code)) codeCategories.set(code, category)
    if (name && !nameCategories.has(name)) nameCategories.set(name, category)
  }
}

const svgDirectory = join(repository, 'svgs', 'FirefoxEmoji')
const stems = (await readdir(svgDirectory))
  .filter((file) => file.endsWith('.svg') && !file.includes('.layer'))
  .map((file) => file.slice(0, -4))
  .sort()
if (!stems.length) throw new Error('No Firefox Emoji SVGs found')
await mkdir(target, { recursive: true })

const order = new Map(categoryOrder.map(([id], index) => [id, index]))
const manifest = []
for (const stem of stems) {
  const svg = clean(await readFile(join(svgDirectory, `${stem}.svg`), 'utf8'))
  if (!svg.startsWith('<svg')) throw new Error(`${stem}: invalid SVG`)
  await writeFile(new URL(`${stem}.svg`, target), `${svg}\n`, 'utf8')

  const code =
    stem.match(/^u([0-9A-Fa-f]+)(?:-|$)/)?.[1]?.toUpperCase() ?? ''
  const name = stem.replace(/^u[0-9A-Fa-f]+-/, '')
  const category =
    (code ? codeCategories.get(code) : undefined) ??
    nameCategories.get(name.toLowerCase()) ??
    'other'
  const previous = existing.get(stem)
  manifest.push({
    id: stem,
    name,
    code,
    label: previous?.label ?? name,
    category,
    common: Boolean(previous?.common),
    keywords: previous?.keywords ?? [name, code].filter(Boolean),
  })
}
manifest.sort(
  (left, right) =>
    Number(right.common) - Number(left.common) ||
    (order.get(left.category) ?? 99) - (order.get(right.category) ?? 99) ||
    left.label.localeCompare(right.label, 'zh-CN'),
)
await writeFile(
  new URL('manifest.json', target),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)
await writeFile(
  licenseTarget,
  await readFile(join(repository, 'LICENSE.md'), 'utf8'),
  'utf8',
)

const counts = {}
for (const entry of manifest)
  counts[entry.category] = (counts[entry.category] ?? 0) + 1
console.log(`Wrote ${manifest.length} Firefox Emoji SVGs to ${target.pathname}`)
console.log(counts)
