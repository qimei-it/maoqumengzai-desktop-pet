import { describe, expect, test } from 'vitest'
import {
  detectLyricsLanguage,
  localizeLyrics,
  localizeName,
  shouldSimplify,
  shouldSimplifyName,
  toSimplified,
} from '../../src/shared/lyrics-lang'
import type { LyricsState } from '../../src/shared/protocol'

const taiwanese: LyricsState = {
  key: '十年|陳奕迅|205',
  synced: '[00:12.30]如果那兩個字沒有顫抖\n[00:18.00]我不會發現 我難受',
  plain: '如果那兩個字沒有顫抖\n我不會發現 我難受',
  instrumental: false,
}

const japanese: LyricsState = {
  key: '夜に駆ける|YOASOBI|261',
  synced: '[00:12.30]沈むように溶けてゆくように\n[00:18.00]二人だけの空が広がる夜に',
  plain: '沈むように溶けてゆくように\n二人だけの空が広がる夜に',
  instrumental: false,
}

describe('lyrics language conversion', () => {
  test('phrase-aware traditional to simplified', () => {
    expect(toSimplified('如果那兩個字沒有顫抖，瞭解著名臺北頭髮乾杯')).toBe(
      '如果那两个字没有颤抖，了解著名台北头发干杯',
    )
  })

  test('Chinese lyrics are recognised without kana', () => {
    expect(detectLyricsLanguage(taiwanese.plain ?? '')).toBe('zh')
    expect(shouldSimplify(taiwanese.plain, { title: '十年' })).toBe(true)
  })

  test('any kana marks the song as Japanese', () => {
    expect(detectLyricsLanguage(japanese.plain ?? '')).toBe('ja')
    expect(shouldSimplify(japanese.plain, { title: '夜に駆ける' })).toBe(false)
    expect(
      detectLyricsLanguage('君の名前を呼ぶ 愛してる', { title: '愛' }),
    ).toBe('ja')
  })

  test('Japanese genre protects kanji-only metadata before lyrics load', () => {
    expect(
      detectLyricsLanguage(undefined, { title: '東京事変', genre: 'J-Pop' }),
    ).toBe('ja')
    expect(detectLyricsLanguage(undefined, { title: '十年', genre: 'Mandopop' })).toBe(
      'zh',
    )
  })

  test('Korean and English stay untouched', () => {
    expect(detectLyricsLanguage('사랑해 그대여')).toBe('ko')
    expect(detectLyricsLanguage('We were both young when I first saw you')).toBe(
      'other',
    )
  })

  test('synced and plain lyrics are converted with timestamps intact', () => {
    const localized = localizeLyrics(taiwanese, { title: '十年', artist: '陳奕迅' })
    expect(localized.key).toBe(taiwanese.key)
    expect(localized.synced).toBe(
      '[00:12.30]如果那两个字没有颤抖\n[00:18.00]我不会发现 我难受',
    )
    expect(localized.plain).toBe('如果那两个字没有颤抖\n我不会发现 我难受')
  })

  test('Japanese lyrics are returned byte-for-byte', () => {
    expect(localizeLyrics(japanese, { title: '夜に駆ける' })).toBe(japanese)
  })

  test('instrumental and missing states keep their flags', () => {
    const missing: LyricsState = {
      key: 'x|y|0',
      synced: null,
      plain: null,
      instrumental: false,
      missing: true,
    }
    expect(localizeLyrics(missing)).toBe(missing)
    expect(
      localizeLyrics({ ...missing, instrumental: true }, { title: '純音樂' }),
    ).toEqual({ ...missing, instrumental: true })
  })

  test('Chinese song and artist names are simplified', () => {
    expect(
      localizeName('陳奕迅', taiwanese.plain, { title: '十年' }),
    ).toBe('陈奕迅')
    expect(
      localizeName('周杰倫', '故事的小黃花', { title: '晴天' }),
    ).toBe('周杰伦')
    expect(localizeName('十年', taiwanese.plain, { title: '十年' })).toBe('十年')
  })

  test('Japanese names are not converted, even when they contain kanji', () => {
    expect(localizeName('夜に駆ける', japanese.plain, { title: '夜に駆ける' })).toBe(
      '夜に駆ける',
    )
    expect(
      localizeName('東京事変', undefined, { genre: 'J-Pop' }),
    ).toBe('東京事変')
    expect(
      localizeName('宇多田ヒカル', 'We were both young', { genre: 'J-Pop' }),
    ).toBe('宇多田ヒカル')
  })

  test('English names remain unchanged', () => {
    expect(localizeName('Taylor Swift', 'We were both young')).toBe(
      'Taylor Swift',
    )
  })

  test('ambiguous kanji-only names need Chinese evidence', () => {
    expect(
      shouldSimplifyName(undefined, { title: '東京事変', genre: 'Rock' }),
    ).toBe(false)
    expect(
      localizeName('東京事変', undefined, { title: '東京事変', genre: 'Rock' }),
    ).toBe('東京事変')
    expect(
      shouldSimplifyName(undefined, { title: '十年', genre: 'Mandopop' }),
    ).toBe(true)
    expect(localizeName('十年', undefined, { genre: 'Mandopop' })).toBe('十年')
    expect(localizeName('陳奕迅', undefined, { genre: 'Mandopop' })).toBe(
      '陈奕迅',
    )
  })
})
