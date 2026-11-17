import { describe, expect, test } from 'vitest'
import {
  compareVersions,
  pickUpdateAsset,
  updateAssetUrl,
  updateManifestSchema,
  updateManifestUrl,
} from '../../src/shared/update'

const digest = 'a'.repeat(64)

describe('update manifest', () => {
  test('accepts a manifest that only names bare files', () => {
    const parsed = updateManifestSchema.parse({
      version: '1.0.1',
      releasedAt: '2026-11-20T00:00:00.000Z',
      notes: '修复桌宠提示词',
      assets: {
        'darwin-arm64': { file: 'mqmz-1.0.1-arm64.dmg', size: 10, sha256: digest },
        'win32-x64': { file: 'mqmz-1.0.1-setup.exe', sha256: digest },
      },
    })
    expect(parsed.version).toBe('1.0.1')
    expect(Object.keys(parsed.assets)).toHaveLength(2)
  })

  test('rejects a file name that could escape the feed directory', () => {
    for (const file of [
      '../mqmz.dmg',
      '/etc/passwd',
      'nested/mqmz.dmg',
      'https://evil.example.com/mqmz.dmg',
      '.hidden.dmg',
    ]) {
      expect(() =>
        updateManifestSchema.parse({
          version: '1.0.1',
          assets: { darwin: { file, sha256: digest } },
        }),
      ).toThrow()
    }
  })

  test('requires a full SHA-256 digest', () => {
    expect(() =>
      updateManifestSchema.parse({
        version: '1.0.1',
        assets: { darwin: { file: 'a.dmg', sha256: 'abc' } },
      }),
    ).toThrow()
  })

  test('rejects a manifest without a version', () => {
    expect(() => updateManifestSchema.parse({ assets: {} })).toThrow()
  })

  test('prefers the architecture-specific asset', () => {
    const manifest = updateManifestSchema.parse({
      version: '1.0.1',
      assets: {
        darwin: { file: 'generic.dmg', sha256: digest },
        'darwin-arm64': { file: 'arm.dmg', sha256: digest },
      },
    })
    expect(pickUpdateAsset(manifest, 'darwin', 'arm64')?.file).toBe('arm.dmg')
    expect(pickUpdateAsset(manifest, 'darwin', 'x64')?.file).toBe('generic.dmg')
    expect(pickUpdateAsset(manifest, 'win32', 'x64')).toBeUndefined()
  })

  test('resolves asset URLs against the manifest directory', () => {
    expect(updateAssetUrl('mqmz-1.0.1-arm64.dmg')).toBe(
      'https://mqmz.qimeiit.cn/mqmz-1.0.1-arm64.dmg',
    )
    expect(updateManifestUrl).toBe('https://mqmz.qimeiit.cn/latest.json')
  })
})

describe('version comparison', () => {
  test('orders numeric releases', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('v1.2.0', '1.10.0')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
  })

  test('treats unparseable input as equal so it never loops', () => {
    expect(compareVersions('', '1.0.0')).toBe(0)
    expect(compareVersions('nightly', '1.0.0')).toBe(0)
  })
})
