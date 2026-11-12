import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  builtinEngines,
  optionalEngines,
} from '../../src/shared/conversion-engines'
import { ffmpegBuild, ffmpegBuildPlatforms } from '../../src/shared/ffmpeg'

const root = join(__dirname, '..', '..')

async function packageVersion(name: string): Promise<string | undefined> {
  try {
    const value = JSON.parse(
      await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'),
    ) as { version?: string }
    return value.version
  } catch {
    return undefined
  }
}

describe('conversion engine manifest', () => {
  it('pins exact versions for npm engines', async () => {
    const exact = new Map([
      ['sharp', '0.35.5'],
      ['pdf-lib', '1.17.1'],
      ['pdfjs-dist', '6.4.299'],
      ['easyofd', '1.2.1'],
      ['fflate', '0.8.2'],
    ])
    for (const [name, version] of exact) {
      expect(await packageVersion(name), name).toBe(version)
      const engine = builtinEngines.find(
        (item) => item.packageName === name,
      )
      expect(engine?.version, name).toBe(version)
    }
  })

  it('declares license and source for every engine', () => {
    for (const engine of [...builtinEngines, ...optionalEngines]) {
      expect(engine.license.length, engine.id).toBeGreaterThan(0)
      expect(engine.source.length, engine.id).toBeGreaterThan(0)
    }
  })

  it('keeps FFmpeg builds checksummed with size metadata', () => {
    expect(new Set(ffmpegBuildPlatforms)).toEqual(
      new Set(['darwin-arm64', 'darwin-x64', 'win32-x64']),
    )
    for (const target of ['darwin-arm64', 'darwin-x64', 'win32-x64']) {
      const [platform, arch] = target.split('-')
      const build = ffmpegBuild(platform, arch)
      expect(build, target).not.toBeNull()
      expect(build?.sha256, target).toMatch(/^[a-f0-9]{64}$/)
      expect(build?.compressedBytes ?? 0, target).toBeGreaterThan(0)
      expect(build?.installedBytes ?? 0, target).toBeGreaterThan(0)
      expect(build?.url, target).toMatch(/^https:\/\//)
    }
  })

  it('unpacks every native or binary engine from asar', async () => {
    const builder = await readFile(join(root, 'electron-builder.yml'), 'utf8')
    const packages = [
      'sharp',
      '@img',
      '@napi-rs',
      'easyofd',
      '7zip-bin',
      '7zip-min',
      'pdfjs-dist',
      'node-unrar-js',
      'heic-decode',
      'libheif-js',
    ]
    for (const name of packages)
      expect(builder, name).toContain(`node_modules/${name}/**`)
  })

  it('lists all optional engines in the supported matrix', () => {
    expect(optionalEngines.map((engine) => engine.id)).toEqual([
      'ffmpeg',
      'libreoffice',
      'qpdf',
    ])
    for (const engine of optionalEngines)
      expect(engine.platforms.length, engine.id).toBeGreaterThan(0)
  })
})
