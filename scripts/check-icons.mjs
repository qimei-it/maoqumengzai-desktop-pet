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
console.log(
  'Icon check passed: official Lucide SVG components, no hand-authored/glyph icons, native assets and full license.',
)
