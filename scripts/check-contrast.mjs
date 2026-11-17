#!/usr/bin/env node
/**
 * WCAG contrast audit for the semantic colour tokens.
 *
 * Reads src/renderer/styles/tokens.css, resolves var() chains for each theme
 * block and prints the ratio for the text/background pairs the UI relies on.
 *
 *   node scripts/check-contrast.mjs
 */

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const css = await readFile(
  join(root, 'src/renderer/styles/tokens.css'),
  'utf8',
)

function block(selector) {
  const index = css.indexOf(selector)
  if (index < 0) return ''
  const open = css.indexOf('{', index)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return ''
}

function declarations(text) {
  const map = new Map()
  for (const match of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi))
    map.set(match[1], match[2].trim())
  return map
}

const desktop = await readFile(
  join(root, 'src/renderer/styles/desktop-tokens.css'),
  'utf8',
)
const baseValues = declarations(block(':root {'))
for (const [key, value] of declarations(
  desktop.slice(desktop.indexOf(':root {')),
))
  baseValues.set(key, value)
const patterns = await readFile(
  join(root, 'src/renderer/styles/patterns.css'),
  'utf8',
)
for (const [key, value] of declarations(patterns))
  if (key.startsWith('--mqmz-')) baseValues.set(key, value)

function themeValues(selector) {
  const merged = new Map(baseValues)
  for (const [key, value] of declarations(block(selector))) merged.set(key, value)
  for (const [key, value] of declarations(
    desktop.slice(desktop.indexOf(selector)),
  ))
    merged.set(key, value)
  return merged
}

const themes = [
  { name: 'default', values: baseValues },
  { name: 'halloween', values: themeValues('.theme-halloween {') },
  { name: 'christmas', values: themeValues('.theme-christmas {') },
]

function resolveVar(name, layer, stack = []) {
  if (stack.includes(name)) return undefined
  const raw = layer.get(name) ?? themes[0].values.get(name)
  if (!raw) return undefined
  const ref = /^var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)$/i.exec(raw)
  if (!ref) return raw
  return (
    resolveVar(ref[1], layer, [...stack, name]) ??
    (ref[2] ? ref[2].trim() : undefined)
  )
}

function parseColor(value) {
  if (!value) return undefined
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((char) => char + char)
            .join('')
        : hex[1]
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    }
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => Number(part.trim()))
    if (parts.length < 3 || parts.some((part) => Number.isNaN(part)))
      return undefined
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }
  return undefined
}

function channel(value) {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(color) {
  return (
    0.2126 * channel(color.r) +
    0.7152 * channel(color.g) +
    0.0722 * channel(color.b)
  )
}

function ratio(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  const light = Math.max(a, b)
  const dark = Math.min(a, b)
  return (light + 0.05) / (dark + 0.05)
}

const pairs = [
  ['--color-ink', '--color-canvas', 4.5, '正文 / 画布'],
  ['--color-ink', '--color-surface', 4.5, '正文 / 卡片'],
  ['--color-muted', '--color-surface', 4.5, '次要文字 / 卡片'],
  ['--color-muted', '--color-canvas', 4.5, '次要文字 / 画布'],
  ['--color-subtle', '--color-surface', 4.5, '弱化文字 / 卡片'],
  ['--color-on-brand', '--mqmz-action-background', 4.5, '主按钮文字'],
  ['--color-brand-on-soft', '--color-brand-soft', 4.5, '品牌标签'],
  ['--color-danger', '--color-surface', 4.5, '危险文字 / 卡片'],
  ['--color-warning', '--color-surface', 4.5, '警告文字 / 卡片'],
  ['--color-success', '--color-surface', 4.5, '成功文字 / 卡片'],
  ['--color-info', '--color-surface', 4.5, '信息文字 / 卡片'],
  ['--color-danger', '--color-danger-soft', 4.5, '危险提示'],
  ['--color-warning', '--color-warning-soft', 4.5, '警告提示'],
  ['--color-success', '--color-success-soft', 4.5, '成功提示'],
  ['--color-info', '--color-info-soft', 4.5, '信息提示'],
  ['--color-disabled-text', '--color-disabled-bg', null, '禁用文字（仅参考）'],
]

let failures = 0
for (const theme of themes) {
  console.log(`\n${theme.name}`)
  for (const [fgToken, bgToken, min, label] of pairs) {
    const fg = parseColor(resolveVar(fgToken, theme.values))
    const bg = parseColor(resolveVar(bgToken, theme.values))
    if (!fg || !bg || fg.a < 1 || bg.a < 1) {
      console.log(`  ?  ${label}: 无法计算（${fgToken} / ${bgToken}）`)
      continue
    }
    const value = ratio(fg, bg)
    if (min === null) {
      console.log(`  ·  ${label}: ${value.toFixed(2)}（WCAG 对禁用态豁免）`)
      continue
    }
    const ok = value >= min
    if (!ok) failures += 1
    console.log(
      `  ${ok ? '✓' : '✗'} ${label}: ${value.toFixed(2)} (需要 ${min})`,
    )
  }
}

console.log(
  failures
    ? `\n${failures} 组未达到 WCAG AA，请检查。`
    : '\n全部达到 WCAG AA。',
)
process.exit(failures ? 1 : 0)
