import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

export type CoverTrack = {
  title?: string
  artist?: string
  album?: string
  source?: 'apple' | 'system'
}

export type CoverResult = {
  dataUrl: string
  source: 'apple' | 'itunes' | 'system'
}

export type ItunesResult = {
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
  artworkUrl600?: string
}

const coverSize = 320
const coverFolder = 'covers'

export function coverKey(track: CoverTrack): string | undefined {
  if (!track.title) return undefined
  return [track.title, track.artist ?? '', track.album ?? '']
    .join('\u0000')
    .toLocaleLowerCase()
}

function normalized(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[（(][^)）]*[)）]/g, ' ')
    .replace(/\b(feat|ft|remastered|remaster|live|version)\b/g, ' ')
    .replace(/[\s\-_/.,，。·:：'"“”‘’]/g, '')
}

/** Picks a result only when both the title and artist look like the same track. */
export function pickItunesArtwork(
  track: CoverTrack,
  results: readonly ItunesResult[],
): string | undefined {
  const title = normalized(track.title ?? '')
  const artist = normalized(track.artist ?? '')
  const album = normalized(track.album ?? '')
  if (!title || !artist) return undefined
  let best: { score: number; url: string } | undefined
  for (const result of results) {
    const resultTitle = normalized(result.trackName ?? '')
    const resultArtist = normalized(result.artistName ?? '')
    if (!resultTitle || !resultArtist) continue
    let score = 0
    if (resultTitle === title) score += 4
    else if (resultTitle.includes(title) || title.includes(resultTitle)) score += 2
    else continue
    if (resultArtist === artist) score += 3
    else if (
      resultArtist.includes(artist) ||
      artist.includes(resultArtist)
    )
      score += 1
    else continue
    if (album && normalized(result.collectionName ?? '') === album) score += 1
    const url =
      result.artworkUrl600 ??
      result.artworkUrl100?.replace(/100x100bb/, '600x600bb')
    if (url && (!best || score > best.score)) best = { score, url }
  }
  return best?.url
}

async function fetchImage(url: string): Promise<Buffer | undefined> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'MaoquMengzai/0.0.1' },
    })
    if (!response.ok) return undefined
    const type = response.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return undefined
    return Buffer.from(await response.arrayBuffer())
  } catch {
    return undefined
  }
}

const appleArtworkScript = `on run argv
  set target to POSIX file (item 1 of argv)
  set expectedTitle to item 2 of argv
  set expectedArtist to item 3 of argv
  tell application "Music"
    if player state is playing or player state is paused then
      set t to current track
      if (name of t as text) is not expectedTitle then return "none"
      if (artist of t as text) is not expectedArtist then return "none"
      if (count of artworks of t) > 0 then
        set art to raw data of artwork 1 of t
        set f to open for access target with write permission
        set eof f to 0
        write art to f
        close access f
        return "ok"
      end if
    end if
  end tell
  return "none"
end run`

async function readAppleArtwork(
  directory: string,
  track: CoverTrack,
): Promise<Buffer | undefined> {
  if (process.platform !== 'darwin') return undefined
  const target = join(directory, `.artwork-${randomUUID()}.jpg`)
  try {
    const ok = await new Promise<boolean>((resolve) => {
      execFile(
        '/usr/bin/osascript',
        ['-e', appleArtworkScript, target, track.title ?? '', track.artist ?? ''],
        { timeout: 5000 },
        (error, stdout) => resolve(!error && stdout.trim() === 'ok'),
      )
    })
    return ok ? await readFile(target) : undefined
  } catch {
    return undefined
  } finally {
    await rm(target, { force: true }).catch(() => {})
  }
}

async function searchItunes(
  track: CoverTrack,
  country: string,
): Promise<Buffer | undefined> {
  if (!track.title || !track.artist) return undefined
  try {
    const query = new URLSearchParams({
      term: `${track.title} ${track.artist}`,
      media: 'music',
      entity: 'song',
      limit: '5',
      country,
    })
    const response = await fetch(
      `https://itunes.apple.com/search?${query.toString()}`,
      {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'MaoquMengzai/0.0.1' },
      },
    )
    if (!response.ok) return undefined
    const data = (await response.json()) as { results?: ItunesResult[] }
    const url = pickItunesArtwork(track, data.results ?? [])
    return url ? fetchImage(url) : undefined
  } catch {
    return undefined
  }
}

async function itunesArtwork(track: CoverTrack): Promise<Buffer | undefined> {
  return (
    (await searchItunes(track, 'US')) ??
    (await searchItunes(track, 'JP'))
  )
}

/**
 * Reads the exact macOS Music artwork first, then falls back to iTunes.
 * Results are cached as small WebP files and returned as data URLs so the
 * sandboxed renderer never needs direct network or filesystem access.
 */
export async function loadCover(
  dataRoot: string,
  track: CoverTrack,
  provided?: Buffer,
): Promise<CoverResult | null> {
  const key = coverKey(track)
  if (!key) return null
  const directory = join(dataRoot, coverFolder)
  await mkdir(directory, { recursive: true })
  const digest = createHash('sha1').update(key).digest('hex')
  const cachePath = join(directory, `${digest}.webp`)
  const encode = async (
    original: Buffer,
    source: CoverResult['source'],
  ): Promise<CoverResult | null> => {
    try {
      const webp = await sharp(original, { limitInputPixels: 40_000_000 })
        .resize(coverSize, coverSize, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer()
      await writeFile(cachePath, webp, { mode: 0o600 })
      return {
        dataUrl: `data:image/webp;base64,${webp.toString('base64')}`,
        source,
      }
    } catch {
      return null
    }
  }
  if (provided) {
    const result = await encode(provided, 'system')
    if (result) return result
  }
  try {
    const cached = await readFile(cachePath)
    return {
      dataUrl: `data:image/webp;base64,${cached.toString('base64')}`,
      source: 'itunes',
    }
  } catch {
    /* Cache miss. */
  }

  let original = await readAppleArtwork(directory, track)
  let source: CoverResult['source'] = 'apple'
  if (!original) {
    original = await itunesArtwork(track)
    source = 'itunes'
  }
  if (!original) return null
  return encode(original, source)
}
