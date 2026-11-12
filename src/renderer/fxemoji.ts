import manifest from './assets/fxemoji/manifest.json'

type ManifestEntry = {
  id: string
  name: string
  code: string
  label: string
  category: string
  common: boolean
  keywords: string[]
}

const urls = import.meta.glob('./assets/fxemoji/*.svg', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
}) as Record<string, string>

export type FxEmoji = ManifestEntry & { url: string }

export const fxemoji: FxEmoji[] = (manifest as ManifestEntry[]).map(
  (entry) => ({
    ...entry,
    url: urls[`./assets/fxemoji/${entry.id}.svg`] ?? '',
  }),
)

export const fxemojiCategories = [
  { id: 'all', label: '全部' },
  { id: 'common', label: '常用' },
  { id: 'nature', label: '自然' },
  { id: 'objects', label: '物品' },
  { id: 'people', label: '人物' },
  { id: 'places', label: '地点' },
  { id: 'symbols', label: '符号' },
  { id: 'flags', label: '旗帜' },
  { id: 'other', label: '其他' },
] as const

export type FxEmojiCategory = (typeof fxemojiCategories)[number]['id']

export const defaultFxEmoji = 'u1F4CB-clipboard'

const byId = new Map(fxemoji.map((entry) => [entry.id, entry]))

export function fxemojiById(id: string): FxEmoji | undefined {
  return byId.get(id)
}

export function fxemojiUrl(id: string): string {
  return byId.get(id)?.url ?? byId.get(defaultFxEmoji)?.url ?? ''
}

export function filterFxemoji(
  query: string,
  category: FxEmojiCategory,
): FxEmoji[] {
  const value = query.trim().toLowerCase()
  return fxemoji.filter((entry) => {
    if (!value) {
      if (category === 'common' && !entry.common) return false
      if (
        category !== 'all' &&
        category !== 'common' &&
        entry.category !== category
      )
        return false
      return true
    }
    return (
      entry.label.toLowerCase().includes(value) ||
      entry.name.toLowerCase().includes(value) ||
      entry.code.toLowerCase().includes(value) ||
      entry.keywords.some((keyword) => keyword.toLowerCase().includes(value))
    )
  })
}
