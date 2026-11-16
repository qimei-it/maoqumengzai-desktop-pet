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
