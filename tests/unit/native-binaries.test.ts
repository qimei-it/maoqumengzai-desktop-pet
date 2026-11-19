import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(__filename)
const { findProblems, pruneForeign } = require('../../scripts/native-binaries.cjs') as {
  findProblems: (dir: string, platform: string, arch: string) => string[]
  pruneForeign: (dir: string, platform: string, arch: string) => string[]
}

const sharpVersion = '0.35.5'

async function fixture(root: string, packages: Record<string, string>): Promise<void> {
  for (const [name, version] of Object.entries(packages)) {
    const directory = join(root, name)
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name, version }),
    )
  }
}

async function writeNative(root: string, relative: string): Promise<void> {
  const path = join(root, relative)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, '')
}

describe('原生模块校验', () => {
  let root = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mqmz-native-'))
    await mkdir(join(root, 'sharp'), { recursive: true })
    await writeFile(
      join(root, 'sharp', 'package.json'),
      JSON.stringify({
        name: 'sharp',
        version: sharpVersion,
        optionalDependencies: {
          '@img/sharp-darwin-arm64': sharpVersion,
          '@img/sharp-libvips-darwin-arm64': '1.3.4',
          '@img/sharp-win32-x64': sharpVersion,
        },
      }),
    )
    await mkdir(join(root, '@napi-rs', 'canvas'), { recursive: true })
    await writeFile(
      join(root, '@napi-rs', 'canvas', 'package.json'),
      JSON.stringify({
        name: '@napi-rs/canvas',
        version: '1.1.1',
        optionalDependencies: { '@napi-rs/canvas-win32-x64-msvc': '1.1.1' },
      }),
    )
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('缺少目标平台二进制时报告缺失', async () => {
    await fixture(root, { '@img/sharp-darwin-arm64': sharpVersion })
    await writeNative(root, '@img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node')

    const problems = findProblems(root, 'win32', 'x64')
    expect(problems).toContain(`@img/sharp-win32-x64 缺失（期望 ${sharpVersion}）`)
  })

  it('版本不一致时报告版本问题', async () => {
    await fixture(root, { '@img/sharp-win32-x64': '0.34.0' })
    await writeNative(root, '@img/sharp-win32-x64/lib/sharp-win32-x64.node')

    expect(findProblems(root, 'win32', 'x64')).toContain(
      `@img/sharp-win32-x64 版本 0.34.0，依赖期望 ${sharpVersion}`,
    )
  })

  it('目标平台二进制齐全时通过', async () => {
    await fixture(root, {
      '@img/sharp-win32-x64': sharpVersion,
      '@napi-rs/canvas-win32-x64-msvc': '1.1.1',
    })
    await writeNative(root, '@img/sharp-win32-x64/lib/sharp-win32-x64.node')
    await writeNative(root, '@napi-rs/canvas-win32-x64-msvc/skia.node')

    expect(findProblems(root, 'win32', 'x64')).toEqual([])
  })

  it('裁剪只移除其他平台的原生包', async () => {
    await fixture(root, {
      '@img/colour': '1.0.0',
      '@img/sharp-darwin-arm64': sharpVersion,
      '@img/sharp-libvips-darwin-arm64': '1.3.4',
      '@img/sharp-win32-x64': sharpVersion,
      '@napi-rs/canvas-darwin-arm64': '1.1.1',
      '@napi-rs/canvas-win32-x64-msvc': '1.1.1',
    })
    await writeNative(root, '@img/sharp-win32-x64/lib/sharp-win32-x64.node')

    const removed = pruneForeign(root, 'win32', 'x64')
    expect(removed).toEqual([
      '@img/sharp-darwin-arm64',
      '@img/sharp-libvips-darwin-arm64',
      '@napi-rs/canvas-darwin-arm64',
    ])
    expect(await readFile(join(root, '@img/colour/package.json'), 'utf8')).toContain('colour')
    expect(() => findProblems(root, 'win32', 'x64')).not.toThrow()
  })
})
