import { describe, expect, test } from 'vitest'
import { emptyFfmpegState, ffmpegBuild } from '../../src/shared/ffmpeg'

describe('ffmpeg build manifest', () => {
  test('pins LGPL assets for supported targets', () => {
    const mac = ffmpegBuild('darwin', 'arm64')
    expect(mac?.version).toBe('9.0.2')
    expect(mac?.license).toBe('LGPL-3.0')
    expect(mac?.url).toContain('agentdvr-ffmpeg-build')
    expect(mac?.sha256).toHaveLength(64)
    expect(mac?.binaryPath).toBe('bin/ffmpeg')
    expect(ffmpegBuild('win32', 'x64')?.binaryPath).toBe('ffmpeg.exe')
    expect(ffmpegBuild('darwin', 'x64')?.installedBytes).toBe(36_861_715)
  })

  test('reports unsupported platforms without inventing a source', () => {
    expect(ffmpegBuild('win32', 'arm64')).toBeNull()
    expect(emptyFfmpegState(null).status).toBe('unsupported')
    expect(emptyFfmpegState(ffmpegBuild('darwin', 'arm64')).status).toBe(
      'missing',
    )
  })
})
