import { describe, expect, test } from 'vitest'
import {
  MUSIC_AI_PROMPT_VERSION,
  aiMoodToMusicMood,
  musicAiCacheKey,
  parseMusicAiContent,
} from '../../src/main/music-ai'

function content() {
  return {
    version: 1,
    promptVersion: MUSIC_AI_PROMPT_VERSION,
    trackKey: '歌名|歌手|213',
    mood: '抒情',
    energy: 'low',
    stages: [
      { lines: ['一', '二'] },
      { lines: ['三'] },
      { lines: ['四'] },
      { lines: ['五'] },
    ],
    sources: [
      { title: '来源', url: 'https://example.com', site: '示例' },
      { title: 1, url: 'https://bad.example' },
    ],
    createdAt: 1,
  }
}

describe('music AI cache contract', () => {
  test('accepts four stages and drops malformed sources', () => {
    const parsed = parseMusicAiContent(content(), '歌名|歌手|213')
    expect(parsed).not.toBeNull()
    expect(parsed?.mood).toBe('抒情')
    expect(parsed?.stages).toHaveLength(4)
    expect(parsed?.sources).toEqual([
      { title: '来源', url: 'https://example.com', site: '示例' },
    ])
  })

  test('accepts the normalized cache shape with string arrays', () => {
    const raw = content()
    raw.stages = [['一'], ['二'], ['三'], ['四']] as never
    const parsed = parseMusicAiContent(raw, 'key')
    expect(parsed?.stages).toEqual([['一'], ['二'], ['三'], ['四']])
  })

  test('rejects incomplete stage sets', () => {
    const raw = content()
    raw.stages = raw.stages.slice(0, 3)
    expect(parseMusicAiContent(raw, '歌名|歌手|213')).toBeNull()
  })

  test('rejects empty stages and non-string lines', () => {
    const empty = content()
    empty.stages[0] = { lines: [] }
    expect(parseMusicAiContent(empty, 'key')).toBeNull()

    const bad = content()
    bad.stages[1] = { lines: [42 as unknown as string] }
    expect(parseMusicAiContent(bad, 'key')).toBeNull()
  })

  test('clips an overlong line without breaking the parser', () => {
    const raw = content()
    raw.stages[0] = { lines: ['字'.repeat(80)] }
    const parsed = parseMusicAiContent(raw, 'key')
    expect(Array.from(parsed!.stages[0][0])).toHaveLength(61)
    expect(parsed!.stages[0][0].endsWith('…')).toBe(true)
  })

  test('cache keys are stable and per-track', () => {
    expect(musicAiCacheKey('a|b|1')).toBe(musicAiCacheKey('a|b|1'))
    expect(musicAiCacheKey('a|b|1')).not.toBe(musicAiCacheKey('a|b|2'))
    expect(musicAiCacheKey('a|b|1')).toMatch(/^[0-9a-f]{40}$/)
  })

  test('mood strings map onto the local bubble moods', () => {
    expect(aiMoodToMusicMood('摇滚')).toBe('hype')
    expect(aiMoodToMusicMood('抒情')).toBe('tender')
    expect(aiMoodToMusicMood('电子')).toBe('upbeat')
    expect(aiMoodToMusicMood('深夜')).toBe('night')
    expect(aiMoodToMusicMood('伤感')).toBe('wistful')
    expect(aiMoodToMusicMood('纯音乐')).toBe('instrumental')
    expect(aiMoodToMusicMood('其他')).toBe('generic')
  })
})
