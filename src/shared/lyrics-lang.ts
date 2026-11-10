/**
 * Lyrics language handling: convert Chinese (mainland, Taiwan, Hong Kong)
 * lyrics and names to Simplified Chinese, but leave Japanese untouched.
 *
 * Japanese songs always contain kana, so any kana in the lyrics or metadata
 * wins over everything else. Kanji-only text is treated as Chinese unless the
 * player reports a Japanese genre and no lyrics are available yet.
 */
import { Converter } from 'opencc-js/t2cn'
import type { LyricsState } from './protocol'

export type LyricsLanguage = 'zh' | 'ja' | 'ko' | 'other'

export type LyricsMeta = {
  title?: string
  artist?: string
  genre?: string
}

const kanaPattern = /[\u3040-\u30ff\u31f0-\u31ff]/g
const hangulPattern = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/g
const hanPattern = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
const japaneseGenre =
  /j-?pop|japanese|anison|anime|vocaloid|city ?pop|enka|邦楽|演歌|アニメ|ボカロ|日本/i
const chineseGenre =
  /mandopop|cantopop|华语|華語|国语|國語|粤语|粵語|chinese/i

let converter: ((text: string) => string) | undefined

/** Traditional-only characters keep going through the full vocabulary. */
function convert(): (text: string) => string {
  converter ??= Converter({ from: 't', to: 'cn' })
  return converter
}

export function toSimplified(text: string): string {
  if (!text) return text
  return convert()(text)
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

export function detectLyricsLanguage(
  lyrics: string | null | undefined,
  meta: LyricsMeta = {},
): LyricsLanguage {
  const sample = [lyrics ?? '', meta.title ?? '', meta.artist ?? ''].join('\n')
  if (countMatches(sample, kanaPattern) > 0) return 'ja'
  const hasLyrics = Boolean(lyrics?.trim())
  if (!hasLyrics && japaneseGenre.test(meta.genre ?? '')) return 'ja'
  if (!hasLyrics && chineseGenre.test(meta.genre ?? '')) return 'zh'
  if (countMatches(sample, hangulPattern) > 0) return 'ko'
  if (countMatches(sample, hanPattern) > 0) return 'zh'
  return 'other'
}

/** True when Chinese lyrics should be shown in Simplified Chinese. */
export function shouldSimplify(
  lyrics: string | null | undefined,
  meta: LyricsMeta = {},
): boolean {
  return detectLyricsLanguage(lyrics, meta) === 'zh'
}

/**
 * Names are trickier than lyrics: a kanji-only Japanese artist has no kana to
 * identify it. Require actual Chinese lyrics, or an explicit Chinese genre when
 * the lyrics are unavailable, before rewriting a name.
 */
export function shouldSimplifyName(
  lyrics: string | null | undefined,
  meta: LyricsMeta = {},
): boolean {
  if (!shouldSimplify(lyrics, meta)) return false
  if (lyrics?.trim()) return true
  return chineseGenre.test(meta.genre ?? '')
}

export function localizeLyrics(
  state: LyricsState,
  meta: LyricsMeta = {},
): LyricsState {
  const raw = state.synced ?? state.plain ?? ''
  if (!shouldSimplify(raw, meta)) return state
  return {
    ...state,
    synced: state.synced ? toSimplified(state.synced) : null,
    plain: state.plain ? toSimplified(state.plain) : null,
  }
}

/** Convert a display name only when the current song is Chinese. */
export function localizeName(
  name: string | undefined,
  lyrics: string | null | undefined,
  meta: LyricsMeta = {},
): string | undefined {
  if (!name) return name
  if (!shouldSimplifyName(lyrics, meta)) return name
  return toSimplified(name)
}
