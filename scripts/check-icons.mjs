import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
// DonutMenu.vue draws the ring itself; it is geometry, not an icon set.
for (const file of ['src/renderer/App.vue', 'src/renderer/FilePocket.vue']) {
  const source = await readFile(new URL(file, root), 'utf8')
  assert(
    /from ["']@lucide\/vue["']/.test(source),
    `${file} must use the official Lucide package`,
  )
  assert(
    !/<(?:svg|path|circle)\b/.test(source),
    `${file} contains a hand-authored SVG icon`,
  )
  assert(
    !/[＋↳↗]/.test(source),
    `${file} contains a text glyph used as an icon`,
  )
}
for (const [name, size] of [
  ['trayTemplate.png', 20],
  ['trayTemplate@2x.png', 40],
  ['file-drag.png', 32],
  ['file-drag@2x.png', 64],
]) {
  const bytes = await readFile(new URL(`resources/icons/${name}`, root))
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  assert.equal(bytes.readUInt32BE(16), size)
  assert.equal(bytes.readUInt32BE(20), size)
}
const license = await readFile(
  new URL('resources/licenses/lucide-ISC.txt', root),
  'utf8',
)
assert(license.includes('ISC License') && license.includes('The MIT License'))

const emojiManifest = JSON.parse(
  await readFile(
    new URL('src/renderer/assets/fxemoji/manifest.json', root),
    'utf8',
  ),
)
assert(emojiManifest.length >= 100, 'FxEmoji set is unexpectedly small')
const emojiIds = new Set()
for (const entry of emojiManifest) {
  assert(entry.id && entry.label && entry.category, 'Invalid FxEmoji entry')
  assert(!emojiIds.has(entry.id), `Duplicate FxEmoji ${entry.id}`)
  emojiIds.add(entry.id)
  const svg = await readFile(
    new URL(`src/renderer/assets/fxemoji/${entry.id}.svg`, root),
    'utf8',
  )
  assert(
    svg.startsWith('<svg') &&
      /<(path|circle|rect|ellipse|polygon|line|text)\b/.test(svg),
    `Invalid FxEmoji SVG ${entry.id}`,
  )
  assert(
    !/nyt_|@font-face/i.test(svg),
    `FxEmoji metadata was not stripped from ${entry.id}`,
  )
}
const emojiLicense = await readFile(
  new URL('resources/licenses/fxemoji-LICENSE.md', root),
  'utf8',
)
assert(
  emojiLicense.includes('Creative Commons Attribution 4.0'),
  'Missing FxEmoji visual design license',
)
console.log(
  'Icon check passed: official Lucide SVG components, local FxEmoji artwork and licenses, native assets.',
)
