/** Pure LRCLIB candidate matching for synced-first lyric selection. */

export type LyricsCandidate = {
  trackName?: string
  artistName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
  instrumental?: boolean
}

export type LyricsQuery = {
  title: string
  artist?: string
  duration?: number
}

function normalize(value: string | undefined): string {
  return (value ?? '')
    .toLocaleLowerCase()
    .replace(/[（(][^)）]*[)）]/g, ' ')
    .replace(/[\s\-_/.,，。·:：'"“”‘’]/g, '')
}

function artistScore(query: string, candidate: string): number {
  if (!query || !candidate) return 0
  if (query === candidate) return 100
  if (query.includes(candidate) || candidate.includes(query)) return 40
  return 0
}

export function pickLyricsCandidate(
  query: LyricsQuery,
  candidates: readonly LyricsCandidate[],
): LyricsCandidate | undefined {
  const title = normalize(query.title)
  const artist = normalize(query.artist)
  if (!title) return undefined
  let best: { score: number; candidate: LyricsCandidate } | undefined
  for (const candidate of candidates) {
    if (normalize(candidate.trackName) !== title) continue
    const hasSynced = Boolean(candidate.syncedLyrics?.trim())
    const hasPlain = Boolean(candidate.plainLyrics?.trim())
    if (!hasSynced && !hasPlain && !candidate.instrumental) continue
    const candidateDuration =
      typeof candidate.duration === 'number' ? candidate.duration : undefined
    const durationDelta =
      typeof query.duration === 'number' && candidateDuration !== undefined
        ? Math.abs(query.duration - candidateDuration)
        : undefined
    const artistMatch = artistScore(artist, normalize(candidate.artistName))
    // Romanized artist names differ by language. Only accept that case when
    // the duration still identifies the same recording.
    if (artist && artistMatch === 0) {
      if (durationDelta === undefined || durationDelta > 5) continue
    }
    let score = hasSynced ? 1000 : 0
    score += artistMatch
    if (durationDelta !== undefined) {
      if (durationDelta <= 2) score += 30
      else if (durationDelta <= 5) score += 20
      else if (durationDelta <= 10) score += 10
    }
    if (!best || score > best.score) best = { score, candidate }
  }
  return best?.candidate
}
