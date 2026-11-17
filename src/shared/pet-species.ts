/** Species chosen once when creating a desktop pet; it cannot be edited later. */
export const petSpeciesOptions = [
  // 常见
  '猫',
  '狗',
  '兔子',
  '鸟',
  '仓鼠',
  // 小型异宠
  '龙猫',
  '豚鼠',
  '花枝鼠',
  '松鼠',
  '刺猬',
  '蜜袋鼯',
  // 鸟类
  '鹦鹉',
  '文鸟',
  '八哥',
  '柯尔鸭',
  '鸡',
  // 爬宠与虫类
  '蜥蜴',
  '守宫',
  '蛇',
  '龟',
  '蛙',
  '蜘蛛',
  '蝎子',
  // 水族
  '鱼',
  '虾',
  '蟹',
  // 其他
  '雪貂',
  '狐狸',
  '浣熊',
  '迷你猪',
  '羊驼',
  '其他',
] as const

export type PetSpecies = (typeof petSpeciesOptions)[number]

export const petSpeciesGroups: ReadonlyArray<{
  label: string
  options: readonly PetSpecies[]
}> = [
  { label: '常见', options: ['猫', '狗', '兔子', '鸟', '仓鼠'] },
  {
    label: '小型异宠',
    options: ['龙猫', '豚鼠', '花枝鼠', '松鼠', '刺猬', '蜜袋鼯'],
  },
  { label: '鸟类', options: ['鹦鹉', '文鸟', '八哥', '柯尔鸭', '鸡'] },
  {
    label: '爬宠与虫类',
    options: ['蜥蜴', '守宫', '蛇', '龟', '蛙', '蜘蛛', '蝎子'],
  },
  { label: '水族', options: ['鱼', '虾', '蟹'] },
  {
    label: '其他',
    options: ['雪貂', '狐狸', '浣熊', '迷你猪', '羊驼', '其他'],
  },
]

export function isPetSpecies(value: unknown): value is PetSpecies {
  return (
    typeof value === 'string' &&
    (petSpeciesOptions as readonly string[]).includes(value)
  )
}

/**
 * Art groups drive pose wording and body-plan wording in the generation prompt.
 * Shrimp and crabs join the arthropods: they share an exoskeleton and many
 * legs, so mammal pose wording fails on them just as badly.
 */
export const petSpeciesGroupIds = [
  'mammal',
  'bird',
  'reptile',
  'arthropod',
  'aquatic',
  'other',
] as const

export type PetSpeciesGroup = (typeof petSpeciesGroupIds)[number]

const speciesGroupBySpecies: Record<PetSpecies, PetSpeciesGroup> = {
  猫: 'mammal',
  狗: 'mammal',
  兔子: 'mammal',
  鸟: 'bird',
  仓鼠: 'mammal',
  龙猫: 'mammal',
  豚鼠: 'mammal',
  花枝鼠: 'mammal',
  松鼠: 'mammal',
  刺猬: 'mammal',
  蜜袋鼯: 'mammal',
  鹦鹉: 'bird',
  文鸟: 'bird',
  八哥: 'bird',
  柯尔鸭: 'bird',
  鸡: 'bird',
  蜥蜴: 'reptile',
  守宫: 'reptile',
  蛇: 'reptile',
  龟: 'reptile',
  蛙: 'reptile',
  蜘蛛: 'arthropod',
  蝎子: 'arthropod',
  鱼: 'aquatic',
  虾: 'arthropod',
  蟹: 'arthropod',
  雪貂: 'mammal',
  狐狸: 'mammal',
  浣熊: 'mammal',
  迷你猪: 'mammal',
  羊驼: 'mammal',
  其他: 'other',
}

export function petSpeciesGroup(
  species: string | undefined | null,
): PetSpeciesGroup {
  if (!species || !isPetSpecies(species)) return 'other'
  return speciesGroupBySpecies[species]
}

export function isPetSpeciesGroup(value: unknown): value is PetSpeciesGroup {
  return (
    typeof value === 'string' &&
    (petSpeciesGroupIds as readonly string[]).includes(value)
  )
}
