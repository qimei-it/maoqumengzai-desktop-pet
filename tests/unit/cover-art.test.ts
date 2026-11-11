import { describe, expect, test } from 'vitest'
import {
  coverKey,
  pickItunesArtwork,
  type ItunesResult,
} from '../../src/main/cover-art'

describe('cover matching', () => {
  test('requires both title and artist to match', () => {
    const results: ItunesResult[] = [
      {
        trackName: '白月光与朱砂痣',
        artistName: '大籽',
        collectionName: '白月光与朱砂痣 - Single',
        artworkUrl100: 'https://example.test/cover/100x100bb.jpg',
      },
      {
        trackName: '白月光与朱砂痣',
        artistName: '别人',
        artworkUrl100: 'https://example.test/wrong/100x100bb.jpg',
      },
    ]
    expect(
      pickItunesArtwork(
        {
          title: '白月光与朱砂痣',
          artist: '大籽',
          album: '白月光与朱砂痣 - Single',
        },
        results,
      ),
    ).toBe('https://example.test/cover/600x600bb.jpg')
  })

  test('does not use a cover when the artist is unrelated', () => {
    expect(
      pickItunesArtwork(
        { title: '紅蓮華', artist: 'LiSA' },
        [{ trackName: '紅蓮華', artistName: '别人' }],
      ),
    ).toBeUndefined()
  })

  test('prefers artworkUrl600 and ignores empty tracks', () => {
    expect(
      pickItunesArtwork(
        { title: 'Gurenge', artist: 'LiSA' },
        [
          { trackName: '', artistName: 'LiSA' },
          {
            trackName: 'Gurenge',
            artistName: 'LiSA',
            artworkUrl600: 'https://example.test/600.jpg',
          },
        ],
      ),
    ).toBe('https://example.test/600.jpg')
  })

  test('cache keys follow title, artist and album', () => {
    expect(coverKey({ title: 'A', artist: 'B', album: 'C' })).toBe(
      'a\u0000b\u0000c',
    )
    expect(coverKey({})).toBeUndefined()
  })
})
