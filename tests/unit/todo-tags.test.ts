import { describe, expect, test } from 'vitest'
import {
  normalizeTag,
  removeTagFromList,
  renameTagInList,
} from '../../src/shared/todo-tags'

describe('todo tags', () => {
  test('normalizes a tag name', () => {
    expect(normalizeTag('  #工作 ')).toBe('工作')
    expect(normalizeTag('##生活')).toBe('生活')
    expect(normalizeTag('x'.repeat(30))).toHaveLength(20)
    expect(normalizeTag('   ')).toBe('')
  })

  test('renames every occurrence and keeps the list unique', () => {
    expect(renameTagInList(['工作', '生活'], '工作', '项目')).toEqual([
      '项目',
      '生活',
    ])
    expect(renameTagInList(['工作', '项目'], '工作', '项目')).toEqual(['项目'])
  })

  test('caps a todo at ten tags', () => {
    const tags = Array.from({ length: 12 }, (_, index) => `t${index}`)
    expect(renameTagInList(tags, 't0', 'renamed')).toHaveLength(10)
    expect(renameTagInList(tags, 't0', 'renamed')[0]).toBe('renamed')
  })

  test('removes a tag from a list', () => {
    expect(removeTagFromList(['工作', '生活', '项目'], '生活')).toEqual([
      '工作',
      '项目',
    ])
    expect(removeTagFromList(['工作'], '不存在')).toEqual(['工作'])
  })
})
