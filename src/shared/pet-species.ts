/** Species chosen once when creating a desktop pet; it cannot be edited later. */
export const petSpeciesOptions = [
  '猫',
  '狗',
  '兔子',
  '鸟',
  '仓鼠',
  '其他',
] as const

export type PetSpecies = (typeof petSpeciesOptions)[number]

export function isPetSpecies(value: unknown): value is PetSpecies {
  return (
    typeof value === 'string' &&
    (petSpeciesOptions as readonly string[]).includes(value)
  )
}
