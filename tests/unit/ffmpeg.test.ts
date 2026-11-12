import { describe, expect, test } from 'vitest'
import { emptyFfmpegState, ffmpegBuild } from '../../src/shared/ffmpeg'

describe('ffmpeg build manifest', () => {
  test('pins versioned mirror assets for supported targets', () => {
    const mac = ffmpegBuild('darwin', 'arm64')
    expect(mac?.version).toBe('6.0')
    expect(mac?.url).toContain('cdn.npmmirror.com')
    expect(mac?.sha256).toHaveLength(64)
    expect(ffmpegBuild('win32', 'x64')?.binaryName).toBe('ffmpeg.exe')
    expect(ffmpegBuild('darwin', 'x64')?.installedBytes).toBe(78_862_176)
  })

  test('reports unsupported platforms without inventing a source', () => {
    expect(ffmpegBuild('win32', 'arm64')).toBeNull()
    expect(emptyFfmpegState(null).status).toBe('unsupported')
    expect(emptyFfmpegState(ffmpegBuild('darwin', 'arm64')).status).toBe(
      'missing',
    )
  })
})
