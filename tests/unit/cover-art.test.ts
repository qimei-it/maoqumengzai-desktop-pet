import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import { loadCover } from '../../src/main/cover-art'

describe('system artwork covers', () => {
  test('uses MediaRemote artwork before online fallbacks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-cover-'))
    try {
      const source = await sharp({
        create: {
          width: 32,
          height: 32,
          channels: 3,
          background: { r: 190, g: 80, b: 70 },
        },
      })
        .png()
        .toBuffer()
      const cover = await loadCover(
        directory,
        { title: '系统歌曲', artist: '测试歌手', album: '测试专辑' },
        source,
      )
      expect(cover?.source).toBe('system')
      expect(cover?.dataUrl.startsWith('data:image/webp;base64,')).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
