import { describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MUSIC_AI_PROMPT_VERSION,
  aiMoodToMusicMood,
  clearMusicAiCache,
  getMusicAiCacheStats,
  incrementMusicAiUsage,
  musicAiCacheKey,
  parseMusicAiAnswer,
  parseMusicAiContent,
  pruneMusicAiCache,
  readMusicAiUsage,
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

  test('repairs stages that omit their opening brace', () => {
    const parsed = parseMusicAiAnswer(
      '{"mood":"抒情","energy":"low","stages":[{"lines":["a"]},"lines":["b"]},{"lines":["c"]},"lines":["d"]}]}',
    ) as { stages: Array<{ lines: string[] }> }
    expect(parsed.stages).toHaveLength(4)
    expect(parsed.stages.map((stage) => stage.lines[0])).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  test('salvages stages when the model repeats the stages key', () => {
    const parsed = parseMusicAiAnswer(
      '{"mood":"迷幻","energy":"medium","stages":[{"lines":["a"]},"stages":[{"lines":["b"]},{"lines":["c"]},{"lines":["d"]}]}]}',
    ) as { stages: Array<{ lines: string[] }> }
    expect(parsed.stages).toHaveLength(4)
    expect(parsed.stages.map((stage) => stage.lines[0])).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
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

describe('music AI usage and cache maintenance', () => {
  test('usage starts at zero, increments and keeps the local date', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mqmz-music-ai-'))
    try {
      expect((await readMusicAiUsage(root)).count).toBe(0)
      expect((await incrementMusicAiUsage(root)).count).toBe(1)
      const second = await incrementMusicAiUsage(root)
      expect(second.count).toBe(2)
      const stored = JSON.parse(
        await readFile(join(root, 'music-ai', 'usage.json'), 'utf8'),
      )
      expect(stored.count).toBe(2)
      expect(stored.date).toBe(second.date)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('an old usage file resets the daily counter', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mqmz-music-ai-'))
    try {
      const dir = join(root, 'music-ai')
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, 'usage.json'),
        JSON.stringify({ date: '2000-01-01', count: 99 }),
      )
      expect((await readMusicAiUsage(root)).count).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('pruning keeps current caches and usage, removes old prompt versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mqmz-music-ai-'))
    try {
      const dir = join(root, 'music-ai')
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, `${musicAiCacheKey('a')}.json`),
        JSON.stringify({ promptVersion: MUSIC_AI_PROMPT_VERSION }),
      )
      await writeFile(
        join(dir, `${musicAiCacheKey('b')}.json`),
        JSON.stringify({ promptVersion: MUSIC_AI_PROMPT_VERSION - 1 }),
      )
      await writeFile(
        join(dir, 'usage.json'),
        JSON.stringify({ date: 'x', count: 3 }),
      )
      await pruneMusicAiCache(root)
      const stats = await getMusicAiCacheStats(root)
      expect(stats.count).toBe(1)
      expect((await readMusicAiUsage(root)).count).toBe(0)
      expect(
        await readFile(join(dir, 'usage.json'), 'utf8').then(Boolean),
      ).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('clearing removes caches but keeps the usage counter', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mqmz-music-ai-'))
    try {
      const dir = join(root, 'music-ai')
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, `${musicAiCacheKey('a')}.json`),
        JSON.stringify({ promptVersion: MUSIC_AI_PROMPT_VERSION }),
      )
      await writeFile(
        join(dir, 'usage.json'),
        JSON.stringify({ date: 'x', count: 3 }),
      )
      expect(await clearMusicAiCache(root)).toBe(1)
      expect((await getMusicAiCacheStats(root)).count).toBe(0)
      expect(
        await readFile(join(dir, 'usage.json'), 'utf8').then(Boolean),
      ).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
