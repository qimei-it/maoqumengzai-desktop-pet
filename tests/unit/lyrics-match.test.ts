import { describe, expect, test } from 'vitest'
import { pickLyricsCandidate } from '../../src/shared/lyrics-match'

describe('LRCLIB lyric selection', () => {
  test('prefers a synced submission over an exact-name plain submission', () => {
    const chosen = pickLyricsCandidate(
      { title: '普通到不普通的人生', artist: '华晨宇', duration: 261 },
      [
        {
          trackName: '普通到不普通的人生',
          artistName: '华晨宇',
          duration: 261,
          syncedLyrics: null,
          plainLyrics: '纯文本歌词',
        },
        {
          trackName: '普通到不普通的人生',
          artistName: 'Hua, Chenyu',
          duration: 261,
          syncedLyrics: '[00:01.42]同步歌词',
          plainLyrics: '纯文本歌词',
        },
      ],
    )
    expect(chosen?.syncedLyrics).toContain('同步歌词')
  })

  test('rejects a different title and tolerates punctuation and duration drift', () => {
    const chosen = pickLyricsCandidate(
      { title: '普通到不普通的人生', artist: '华晨宇', duration: 261 },
      [
        {
          trackName: '另一首歌',
          artistName: '华晨宇',
          duration: 261,
          syncedLyrics: '[00:01.00]错误',
        },
        {
          trackName: '普通到不普通的人生（Live）',
          artistName: '华晨宇',
          duration: 262,
          syncedLyrics: null,
          plainLyrics: '正确歌词',
        },
      ],
    )
    expect(chosen?.plainLyrics).toBe('正确歌词')
  })

  test('rejects same-title lyrics from a different artist and duration', () => {
    expect(
      pickLyricsCandidate(
        { title: '进退两难', artist: '弋川', duration: 210 },
        [
          {
            trackName: '进退两难',
            artistName: '蔡秋凤',
            duration: 187,
            syncedLyrics: '[00:01.00]另一首歌的歌词',
            plainLyrics: '另一首歌的歌词',
          },
        ],
      ),
    ).toBeUndefined()
  })

  test('accepts romanized artist when the duration matches', () => {
    const chosen = pickLyricsCandidate(
      { title: '普通到不普通的人生', artist: '华晨宇', duration: 261 },
      [
        {
          trackName: '普通到不普通的人生',
          artistName: 'Hua, Chenyu',
          duration: 261,
          syncedLyrics: '[00:01.42]同步歌词',
          plainLyrics: '纯文本歌词',
        },
      ],
    )
    expect(chosen?.syncedLyrics).toContain('同步歌词')
  })

  test('does not return empty submissions', () => {
    expect(
      pickLyricsCandidate(
        { title: '某首歌' },
        [{ trackName: '某首歌', syncedLyrics: '', plainLyrics: '' }],
      ),
    ).toBeUndefined()
  })
})
