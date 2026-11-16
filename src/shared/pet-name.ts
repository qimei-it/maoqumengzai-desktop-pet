/** Shared pet-name comparison so the wizard and main process agree. */

export const petNameConflictError = '已经有同名桌宠，请换一个。'

export function normalizePetName(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase()
}

export function petNameConflict(
  name: string,
  existing: readonly string[],
): boolean {
  const value = normalizePetName(name)
  if (!value) return false
  return existing.some((item) => normalizePetName(item) === value)
}
