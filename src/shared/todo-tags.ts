/** Tag names are stored without a leading #, trimmed, and capped at 20 chars. */
export function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, '').slice(0, 20)
}

/** Rewrites one tag across a todo's tag list and keeps the list unique. */
export function renameTagInList(
  tags: readonly string[],
  from: string,
  to: string,
): string[] {
  return [...new Set(tags.map((tag) => (tag === from ? to : tag)))].slice(0, 10)
}

export function removeTagFromList(
  tags: readonly string[],
  tag: string,
): string[] {
  return tags.filter((item) => item !== tag)
}
