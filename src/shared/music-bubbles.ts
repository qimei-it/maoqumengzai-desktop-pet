/**
 * Local music-bubble copy. Picks a line by mood, inferred from genre and
 * title/album/lyric keywords. No model calls; lyrics are quoted verbatim so
 * Chinese, Japanese and English songs all read naturally.
 */

export type MusicMood =
  | 'tender'
  | 'hype'
  | 'upbeat'
  | 'night'
  | 'wistful'
  | 'instrumental'
  | 'generic'

export type BubbleCategory = 'title' | 'artist' | 'lyric' | 'company'

export type BubbleTrack = {
  title: string
  artist?: string
  album?: string
  genre?: string
  lyrics?: string
  instrumental?: boolean
}

export type BubbleDraft = {
  text: string
  category: BubbleCategory
  template: string
}

type Templates = Record<BubbleCategory, string[]>

const moodKeywords: Record<
  Exclude<MusicMood, 'instrumental' | 'generic'>,
  string[]
> = {
  tender: [
    '爱', '愛', '恋', '戀', '心', '想你', '抱', '温柔', '溫柔', '甜', '吻',
    '喜欢', '喜歡', '陪', '情歌', '告白', '心动', '心動',
    'love', 'heart', 'kiss', 'sweet', 'baby', 'darling', 'romance', 'adore',
    '好き', '恋', '愛', '抱きしめ', '君', '会いたい',
  ],
  hype: [
    '战', '戰', '燃', '火', '冲', '衝', '梦', '夢', '飞', '飛', '胜利',
    '勝利', '不屈', '热血', '熱血', '摇滚', '搖滾', '爆发', '爆發', '吼',
    'fight', 'fire', 'burn', 'run', 'rise', 'dream', 'power', 'alive',
    'strong', 'wild', 'scream', 'rock',
    '戦', '炎', '走れ', '夢', '叫べ', '拳', '燃え',
  ],
  upbeat: [
    '夏', '阳光', '陽光', '跳', '快乐', '快樂', '笑', '派对', '派對', '青春',
    '亮', '出发', '出發', '旅行', '晴天', '元气', '元氣',
    'summer', 'sun', 'dance', 'happy', 'smile', 'party', 'holiday', 'shine',
    'walk', 'light', 'fun', 'joy',
    '夏', '笑顔', '踊', 'キラキラ', '楽しい', 'はじまり',
  ],
  night: [
    '夜', '雨', '月', '星', '孤单', '孤單', '失眠', '安静', '安靜', '深夜',
    '灯', '燈', '晚', '凌晨', '风', '風', '睡',
    'night', 'rain', 'moon', 'star', 'alone', 'lonely', 'quiet', 'midnight',
    'sleep', 'wind', 'dark',
    '夜', '雨', '月', '星', '静か', '眠れない', '真夜中',
  ],
  wistful: [
    '泪', '淚', '别', '別', '离开', '離開', '从前', '從前', '回忆', '回憶',
    '遗憾', '遺憾', '旧', '舊', '故乡', '故鄉', '回家', '错过', '錯過',
    'tears', 'goodbye', 'memory', 'yesterday', 'miss', 'regret', 'old',
    'home', 'gone', 'past', 'sad',
    '涙', 'さよなら', '思い出', '別れ', '懐かしい', '帰り道',
  ],
}

const genreMoods: Array<[RegExp, MusicMood]> = [
  [/rock|metal|punk|grunge|hardcore|alternative|摇滚|搖滾|金属|金屬/i, 'hype'],
  [/hip.?hop|rap|trap|說唱|说唱|嘻哈/i, 'hype'],
  [/ballad|r&b|rnb|soul|acoustic|folk|singer.?songwriter|抒情|民谣|民謠|灵魂|靈魂/i, 'tender'],
  [/dance|edm|house|club|disco|electro|舞曲|电子|電子/i, 'upbeat'],
  [/pop|流行|偶像/i, 'upbeat'],
  [/classical|ambient|jazz|new.?age|score|古典|爵士|氛围|氛圍|轻音乐|輕音樂/i, 'night'],
  [/blues|country|reggae|gospel|soundtrack|anime|蓝调|藍調|乡村|鄉村|原声|原聲|动漫|動漫/i, 'wistful'],
  [/instrumental|纯音乐|純音樂|器乐|器樂/i, 'instrumental'],
]

const templates: Record<MusicMood, Templates> = {
  tender: {
    title: [
      '《{title}》像在耳边轻轻说话。',
      '《{title}》的旋律，软软的。',
      '这首《{title}》，适合慢慢听。',
      '《{title}》一响，心就安静下来。',
      '《{title}》的尾音，舍不得结束。',
      '把《{title}》再放一遍吧。',
    ],
    artist: [
      '{artist}这首歌，适合靠在一起听。',
      '{artist}的声音，很温柔。',
      '{artist}唱到这一句，心都软了。',
      '想听{artist}多唱一会儿。',
      '{artist}把温柔唱得很轻。',
      '{artist}一开口，就像有人在身边。',
    ],
    lyric: [
      '「{line}」——这句很温柔。',
      '「{line}」，像在耳边说。',
      '「{line}」——听到这句心软了。',
      '「{line}」，我记住了。',
      '「{line}」——刚好唱进心里。',
      '「{line}」，这句想再听一遍。',
    ],
    company: [
      '听到《{title}》，就想多陪你一会儿。',
      '你听歌，我就在旁边。',
      '这首《{title}》，我们一起听完。',
      '不用说话，听着就好。',
      '《{title}》慢一点，今晚也慢一点。',
      '靠过来一点，这首歌很长。',
    ],
  },
  hype: {
    title: [
      '这首《{title}》，副歌一响就想往前冲。',
      '《{title}》的鼓点，够燃。',
      '《{title}》适合把音量再开大一点。',
      '前奏一出来，《{title}》就赢了。',
      '《{title}》这节奏，坐不住。',
      '《{title}》一响，血脉就醒了。',
    ],
    artist: [
      '{artist}这一嗓子，够燃。',
      '{artist}的现场一定很炸。',
      '{artist}这首，适合跟着吼。',
      '{artist}一开口，血脉就醒了。',
      '{artist}把劲儿全使出来了。',
      '{artist}这段，够我燃一整晚。',
    ],
    lyric: [
      '「{line}」——这句像在往前跑。',
      '「{line}」，喊出来一定很爽。',
      '「{line}」——够燃。',
      '「{line}」，适合大声唱。',
      '「{line}」——听见就想站起来。',
      '「{line}」，这句有劲儿。',
    ],
    company: [
      '这首《{title}》，我陪你一起燃。',
      '音量再大一点也没关系。',
      '《{title}》一响，谁也别想安静。',
      '跟着节奏走，别停。',
      '《{title}》这种歌，就得放声听。',
      '我在旁边给你打拍子。',
    ],
  },
  upbeat: {
    title: [
      '《{title}》的节奏，跟着抖腿了。',
      '《{title}》听着就想出门。',
      '这首《{title}》，让今天轻了一点。',
      '《{title}》一响，心情就亮了。',
      '《{title}》是今天的背景音乐。',
      '《{title}》这拍子，走路都带风。',
    ],
    artist: [
      '{artist}这首，听着就想出门。',
      '{artist}的声音，很有夏天的味道。',
      '{artist}一唱，心情就轻了。',
      '跟着{artist}的节奏走。',
      '{artist}这首，适合单曲循环。',
      '{artist}把开心唱出来了。',
    ],
    lyric: [
      '「{line}」——这句很亮。',
      '「{line}」，听着就想笑。',
      '「{line}」——今天的主题曲。',
      '「{line}」，轻快得刚好。',
      '「{line}」——阳光都出来了。',
      '「{line}」，这句会传染。',
    ],
    company: [
      '《{title}》让今天轻了一点。',
      '听着这首，步子都轻了。',
      '要不要跟着晃两下？',
      '《{title}》配今天，刚好。',
      '这首一放，烦恼先靠边。',
      '我在旁边跟着点头。',
    ],
  },
  night: {
    title: [
      '《{title}》适合这个时间。',
      '夜里的《{title}》，刚刚好。',
      '《{title}》适合关灯听。',
      '这首《{title}》，陪你把夜拉长。',
      '《{title}》的声音，很轻。',
      '《{title}》放完，夜还很长。',
    ],
    artist: [
      '{artist}的声音，夜里听着刚好。',
      '{artist}这首，适合一个人听。',
      '{artist}唱得很轻，夜也很轻。',
      '{artist}的声音，陪到很晚。',
      '{artist}把夜唱安静了。',
      '{artist}这首，越晚越好听。',
    ],
    lyric: [
      '「{line}」——这句适合关灯听。',
      '「{line}」，夜里的回声。',
      '「{line}」——很安静的一句。',
      '「{line}」，适合慢慢想。',
      '「{line}」——听见窗外的风了。',
      '「{line}」，这句留在夜里。',
    ],
    company: [
      '夜还长，我陪你把这首听完。',
      '《{title}》适合这个点。',
      '灯关小一点，歌留在这儿。',
      '今晚就听这首吧。',
      '睡不着也没关系，我陪着。',
      '夜里安静，歌替我说话。',
    ],
  },
  wistful: {
    title: [
      '《{title}》有点旧时光的味道。',
      '《{title}》听着听着就安静了。',
      '这首《{title}》，适合想起一些人。',
      '《{title}》的尾音，有点舍不得。',
      '《{title}》像翻到旧照片。',
      '《{title}》适合在回家的路上听。',
    ],
    artist: [
      '{artist}这首，听着听着就安静了。',
      '{artist}的声音，有点旧。',
      '{artist}唱得像在讲一个故事。',
      '{artist}这首歌，适合慢慢放下。',
      '{artist}把遗憾唱得很轻。',
      '{artist}一开口，就想起从前。',
    ],
    lyric: [
      '「{line}」——这句有点戳。',
      '「{line}」，听得有点想家。',
      '「{line}」——旧旧的。',
      '「{line}」，像一封没寄出的信。',
      '「{line}」——听着就沉默了。',
      '「{line}」，这句先替我记得。',
    ],
    company: [
      '想起一些事也没关系，我在。',
      '《{title}》听完了，就翻篇。',
      '有些歌，适合慢慢放下。',
      '我陪你听完这一首。',
      '想说什么就说，不想说也没关系。',
      '这首歌里的事，慢慢来。',
    ],
  },
  instrumental: {
    title: [
      '《{title}》这段旋律，适合放空。',
      '没有歌词的《{title}》，反而更满。',
      '《{title}》像一段慢慢展开的画面。',
      '《{title}》的旋律，替我说了话。',
      '《{title}》适合边发呆边听。',
      '《{title}》一响，世界就静了。',
    ],
    artist: [
      '{artist}的编曲，很会留白。',
      '{artist}这段旋律，越听越有味道。',
      '{artist}把情绪都放进了音符里。',
      '{artist}的器乐，干净。',
      '{artist}没有写词，但什么都说了。',
      '{artist}这段，适合闭眼听。',
    ],
    lyric: [],
    company: [
      '这段旋律，我陪你一起放空。',
      '不说话，听音符就好。',
      '《{title}》适合发呆。',
      '让旋律替我们待一会儿。',
      '没有词，也很好听。',
      '就这样安静一会儿吧。',
    ],
  },
  generic: {
    title: [
      '《{title}》的旋律很舒服。',
      '这首《{title}》，我陪你听完。',
      '《{title}》今天也很耐听。',
      '《{title}》一响，就想多待一会儿。',
      '《{title}》这个调子，刚好。',
      '再听一遍《{title}》也不错。',
    ],
    artist: [
      '{artist}的声音，今天刚刚好。',
      '{artist}这首，我陪你听完。',
      '{artist}唱得很稳。',
      '{artist}的歌，总是耐听。',
      '{artist}这首，越听越顺。',
      '{artist}一开口，就有味道。',
    ],
    lyric: [
      '「{line}」——这句我喜欢。',
      '「{line}」，正好唱到现在。',
      '「{line}」——记住了。',
      '「{line}」，这句很耐听。',
      '「{line}」——刚好听见。',
      '「{line}」，有点意思。',
    ],
    company: [
      '听到《{title}》，就想在你旁边多待一会儿。',
      '这首《{title}》，我陪你听完。',
      '你听歌，我听着你。',
      '《{title}》放着，我就在。',
      '今天也一起听歌吧。',
      '我在旁边，慢慢听。',
    ],
  },
}

const instrumentalTitle = /instrumental|纯音乐|純音樂|off\s?vocal|karaoke|伴奏/i

function keywordScore(text: string, words: string[]): number {
  let score = 0
  for (const word of new Set(words)) if (text.includes(word)) score += 1
  return score
}

export function detectMood(track: BubbleTrack): MusicMood {
  if (
    track.instrumental ||
    instrumentalTitle.test(track.title) ||
    (track.genre ? /instrumental|纯音乐|純音樂|器乐|器樂/i.test(track.genre) : false)
  )
    return 'instrumental'
  const genre = track.genre?.toLowerCase() ?? ''
  // Regional pop / soundtrack tags are too broad to imply a mood; let the
  // title and lyric keywords decide instead.
  const broadGenre =
    /mandopop|cantopop|j-?pop|k-?pop|anime|soundtrack|原声|原聲|动漫|動漫/i
  if (genre && !broadGenre.test(genre)) {
    for (const [pattern, mood] of genreMoods) {
      if (pattern.test(genre)) return mood
    }
  }
  const title = track.title.toLowerCase()
  const album = track.album?.toLowerCase() ?? ''
  const lyrics = (track.lyrics ?? '').toLowerCase().slice(0, 4000)
  let best: MusicMood = 'generic'
  let bestScore = 0
  for (const [mood, words] of Object.entries(moodKeywords)) {
    const score =
      keywordScore(title, words) * 2 +
      keywordScore(album, words) +
      keywordScore(lyrics, words)
    if (score > bestScore) {
      bestScore = score
      best = mood as MusicMood
    }
  }
  return best
}

function cleanLine(line: string): string {
  return line
    .replace(/^\[\d{1,2}:\d{2}(?:\.\d+)?\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function lyricLine(
  lyrics: string | undefined,
  min = 4,
  max = 24,
): string | undefined {
  if (!lyrics) return undefined
  const lines = lyrics
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.length >= min && line.length <= max)
    .filter((line) => /[\p{L}\p{N}]/u.test(line))
  if (!lines.length) return undefined
  return lines[Math.floor(Math.random() * lines.length)]
}

function clip(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}

/** Categories that can actually render for this track. */
export function bubbleCategories(
  track: BubbleTrack,
  hasLyric: boolean,
): BubbleCategory[] {
  const categories: BubbleCategory[] = ['title', 'company']
  if (track.artist) categories.push('artist')
  if (hasLyric) categories.push('lyric')
  return categories
}

export const musicBubbleIntervalSeconds = 30
export const musicBubbleStageCount = 4

/** Next absolute 30-second boundary strictly after the elapsed time. */
export function nextMusicBubbleAt(elapsed: number): number {
  return (
    (Math.floor(Math.max(0, elapsed) / musicBubbleIntervalSeconds) + 1) *
    musicBubbleIntervalSeconds
  )
}

/** Map playback progress onto one of four stages. */
export function musicBubbleStage(elapsed: number, duration?: number): number {
  if (duration && duration > 0)
    return Math.min(
      musicBubbleStageCount - 1,
      Math.max(0, Math.floor((elapsed / duration) * musicBubbleStageCount)),
    )
  return Math.min(
    musicBubbleStageCount - 1,
    Math.max(0, Math.floor(elapsed / 90)),
  )
}

/**
 * Pick a line for one stage, preferring unused lines and avoiding an immediate
 * repeat. The used set is mutated so one play does not keep repeating.
 */
export function pickMusicAiLine(
  stages: string[][],
  stage: number,
  used: Set<string>,
  last?: string,
): string | undefined {
  const index = Math.max(0, Math.min(stages.length - 1, stage))
  const pool = stages[index] ?? []
  if (!pool.length) return undefined
  const unused = pool.filter((line) => !used.has(line))
  let candidates = unused.length ? unused : pool
  if (candidates.length > 1)
    candidates = candidates.filter((line) => line !== last)
  const line = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]
  used.add(line)
  return line
}

export function bubbleMoodLabel(mood: MusicMood): string {
  return {
    tender: '温柔抒情',
    hype: '热血',
    upbeat: '轻快',
    night: '深夜安静',
    wistful: '伤感怀旧',
    instrumental: '纯音乐',
    generic: '通用',
  }[mood]
}

/**
 * Pick one unused template in one unused category, then fill the track data.
 * `used` holds templates already used for this song, `recent` the last few
 * rendered lines so consecutive songs do not repeat either.
 */
export function pickBubble(
  track: BubbleTrack,
  mood: MusicMood,
  categories: BubbleCategory[],
  used: Set<string>,
  recent: string[] = [],
): BubbleDraft | undefined {
  const available = categories.filter(
    (category) => templates[mood][category].length > 0,
  )
  if (!available.length) return undefined
  const category = available[Math.floor(Math.random() * available.length)]
  const choices = templates[mood][category]
  const line = lyricLine(track.lyrics)
  const format = (template: string): string =>
    template
      .replaceAll('{title}', clip(track.title, 20))
      .replaceAll('{artist}', clip(track.artist ?? '', 16))
      .replaceAll('{line}', line ?? '')
  const fresh = choices.filter((choice) => !used.has(choice))
  const pool = fresh.length ? fresh : choices
  const unseen = pool.filter((choice) => !recent.includes(format(choice)))
  const template = (unseen.length ? unseen : pool)[
    Math.floor(Math.random() * (unseen.length ? unseen.length : pool.length))
  ]
  used.add(template)
  return { text: format(template), category, template }
}

export const bubbleMoodCount = Object.keys(templates).length
