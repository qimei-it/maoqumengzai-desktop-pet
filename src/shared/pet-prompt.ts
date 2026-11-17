/** User-written companion note saved with a custom pet. */

export const maxPetPromptChars = 1000

export function normalizePetPrompt(value: string): string {
  return Array.from(value.trim()).slice(0, maxPetPromptChars).join('')
}

/** Counts characters by code point so emoji count once, matching storage. */
export function petPromptLength(value: string): number {
  return Array.from(value).length
}
