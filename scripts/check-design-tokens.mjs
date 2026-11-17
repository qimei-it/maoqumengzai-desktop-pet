import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(
  new URL('../src/renderer/styles/tokens.css', import.meta.url),
  'utf8',
)
const metadata = JSON.parse(
  await readFile(
    new URL('../docs/design/source.json', import.meta.url),
    'utf8',
  ),
)
assert(
  css.includes(metadata.sourceSha256),
  'Generated design source digest drifted',
)
assert(!/\d+rpx\b/.test(css), 'Mobile-only units leaked into desktop CSS')
assert(
  css.includes(':root {') &&
    css.includes('.theme-halloween') &&
    css.includes('.theme-christmas'),
)
const definitions = new Set(
  [...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
)
// Desktop-owned palette layer: values live here instead of the generated file.
const desktop = await readFile(
  new URL('../src/renderer/styles/desktop-tokens.css', import.meta.url),
  'utf8',
)
for (const match of desktop.matchAll(/(--[\w-]+)\s*:/g))
  definitions.add(match[1])
assert(
  !/var\(--p-/.test(desktop),
  'Desktop palette must reference semantic tokens, not primitives',
)
for (const file of [
  'src/renderer/FilePocket.vue',
  'src/renderer/style.css',
  'src/renderer/styles/patterns.css',
]) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  const style = file.endsWith('.vue') ? text.split('<style scoped>')[1] : text
  assert(style, `Missing styles in ${file}`)
  assert(
    !/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i.test(style),
    `Use semantic tokens instead of literal colors in ${file}`,
  )
  assert(!/var\(--p-/.test(style), `Primitive token referenced by ${file}`)
  for (const match of style.matchAll(/(--[\w-]+)\s*:/g))
    definitions.add(match[1])
}
for (const file of [
  'src/renderer/FilePocket.vue',
  'src/renderer/style.css',
  'src/renderer/styles/patterns.css',
]) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  for (const match of text.matchAll(/var\((--[\w-]+)/g))
    assert(definitions.has(match[1]), `Undefined token ${match[1]} in ${file}`)
}
console.log(
  'Design check passed: canonical source, three themes, desktop units, semantic colors and token references.',
)
