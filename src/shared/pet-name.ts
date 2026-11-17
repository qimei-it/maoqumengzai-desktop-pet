/** Shared pet-name comparison so the wizard and main process agree. */

export const maxPetNameChars = 20

export const petNameConflictError = '已经有同名桌宠，请换一个。'

export function normalizePetName(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase()
}

/** Counts characters by code point so emoji count once, matching prompts. */
export function petNameLength(value: string): number {
  return Array.from(value).length
}

export function petNameConflict(
  name: string,
  existing: readonly string[],
): boolean {
  const value = normalizePetName(name)
  if (!value) return false
  return existing.some((item) => normalizePetName(item) === value)
}
