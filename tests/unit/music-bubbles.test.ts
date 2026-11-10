import { describe, expect, test } from 'vitest'
import {
  bubbleCategories,
  bubbleMoodCount,
  bubbleMoodLabel,
  detectMood,
  lyricLine,
  pickBubble,
  type BubbleTrack,
} from '../../src/shared/music-bubbles'

const track: BubbleTrack = {
  title: '白月光与朱砂痣',
  artist: '大籽',
  lyrics: '[00:12.30]从前的歌谣都在指尖绕\n[00:18.00]得不到的美好总在心间挠',
}

describe('music bubble mood detection', () => {
  test('genre wins over keywords', () => {
    expect(
      detectMood({ title: '夏夜晚风', genre: 'Rock', lyrics: '夏天 阳光' }),
    ).toBe('hype')
    expect(detectMood({ title: '空白', genre: 'Pop' })).toBe('upbeat')
    expect(detectMood({ title: '夜に駆ける', genre: 'J-Pop' })).toBe('night')
    expect(detectMood({ title: '空白', genre: 'Ballad' })).toBe('tender')
  })

  test('localised Chinese genre names work', () => {
    expect(detectMood({ title: 'x', genre: '摇滚' })).toBe('hype')
    expect(detectMood({ title: 'x', genre: '古典' })).toBe('night')
    expect(detectMood({ title: 'x', genre: '纯音乐' })).toBe('instrumental')
  })

  test('keywords cover Chinese, Japanese and English', () => {
    expect(detectMood({ title: '夜に駆ける' })).toBe('night')
    expect(detectMood({ title: 'Summertime Sadness' })).toBe('upbeat')
    expect(detectMood({ title: 'Fight Fire' })).toBe('hype')
    expect(detectMood({ title: 'さよならの向こう側' })).toBe('wistful')
    expect(detectMood({ title: '想你的夜' })).toBe('tender')
  })

  test('instrumental flags and titles are detected', () => {
    expect(detectMood({ title: 'River Flows', instrumental: true })).toBe(
      'instrumental',
    )
    expect(detectMood({ title: 'Track 01 (Instrumental)' })).toBe(
      'instrumental',
    )
    expect(detectMood({ title: '夜曲', genre: '纯音乐' })).toBe('instrumental')
  })

  test('unknown tracks fall back to generic', () => {
    expect(detectMood({ title: 'Track 07' })).toBe('generic')
  })

  test('every mood has a label and a template set', () => {
    expect(bubbleMoodCount).toBe(7)
    expect(bubbleMoodLabel('tender')).toBe('温柔抒情')
    expect(bubbleMoodLabel('instrumental')).toBe('纯音乐')
  })
})

describe('music bubble copy', () => {
  test('lyrics are cleaned and filtered by length', () => {
    const line = lyricLine('[00:01.00]从前的歌谣都在指尖绕\n[00:02.00]短\n[00:03.00]   ')
    expect(line).toBe('从前的歌谣都在指尖绕')
    expect(lyricLine(undefined)).toBeUndefined()
  })

  test('categories follow available data', () => {
    expect(bubbleCategories(track, true)).toEqual([
      'title',
      'company',
      'artist',
      'lyric',
    ])
    expect(bubbleCategories({ title: 'x' }, false)).toEqual(['title', 'company'])
    expect(bubbleCategories(track, false)).not.toContain('lyric')
  })

  test('each pick fills the track and uses a fresh template', () => {
    const used = new Set<string>()
    const categories = bubbleCategories(track, true)
    const picks = Array.from({ length: 3 }, () =>
      pickBubble(track, 'tender', categories, used),
    )
    for (const pick of picks) {
      expect(pick).toBeTruthy()
      expect(pick!.text).not.toContain('{')
      expect(pick!.text.length).toBeGreaterThan(4)
      expect(used.has(pick!.template)).toBe(true)
    }
    expect(new Set(picks.map((pick) => pick!.template)).size).toBe(3)
  })

  test('recent lines are skipped when an alternative exists', () => {
    const used = new Set<string>()
    const categories = bubbleCategories(track, true)
    const first = pickBubble(track, 'generic', ['title'], used)!
    const second = pickBubble(track, 'generic', ['title'], new Set(), [
      first.text,
      ...Array.from({ length: 8 }, () => first.text),
    ])
    expect(second?.text).not.toBe(first.text)
  })

  test('instrumental tracks never render lyric quotes', () => {
    const instrumental = { title: 'River Flows', artist: 'Yiruma' }
    const categories = bubbleCategories(instrumental, false)
    const used = new Set<string>()
    for (let index = 0; index < 12; index++) {
      const pick = pickBubble(instrumental, 'instrumental', categories, used)
      expect(pick?.category).not.toBe('lyric')
      expect(pick?.text).not.toContain('「')
    }
  })

  test('foreign titles are clipped without breaking the sentence', () => {
    const picked = pickBubble(
      { title: 'This Is A Very Long English Song Title That Should Clip' },
      'generic',
      ['title'],
      new Set(),
    )
    expect(picked?.text).toContain('…')
  })
})
