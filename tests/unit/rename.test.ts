import { describe, expect, test } from 'vitest'
import {
  defaultRenameConfig,
  previewRename,
  sanitizeStem,
  splitName,
  type RenameConfig,
} from '../../src/shared/rename'

const config = (patch: Partial<RenameConfig>): RenameConfig => ({
  ...defaultRenameConfig,
  ...patch,
})

describe('batch rename preview', () => {
  test('replace text keeps the extension', () => {
    expect(
      previewRename(['合同_草稿.docx', '报价_草稿.pdf'], config({
        mode: 'replace',
        find: '_草稿',
        replace: '',
      })),
    ).toEqual(['合同.docx', '报价.pdf'])
  })

  test('add text before or after the stem', () => {
    const names = ['a.png', 'b.png']
    expect(
      previewRename(names, config({ mode: 'add', text: '2026 ', position: 'before' })),
    ).toEqual(['2026 a.png', '2026 b.png'])
    expect(
      previewRename(names, config({ mode: 'add', text: ' 终稿', position: 'after' })),
    ).toEqual(['a 终稿.png', 'b 终稿.png'])
  })

  test('format modes use index, counter or date', () => {
    const names = ['a.jpg', 'b.jpg']
    expect(
      previewRename(names, config({
        mode: 'format',
        text: '文件',
        format: 'index',
      })),
    ).toEqual(['文件1.jpg', '文件2.jpg'])
    expect(
      previewRename(names, config({
        mode: 'format',
        text: '文件',
        format: 'counter',
        start: 10,
      })),
    ).toEqual(['文件10.jpg', '文件11.jpg'])
    expect(
      previewRename(names, config({
        mode: 'format',
        text: '文件',
        format: 'date',
        position: 'before',
      }), new Date(2026, 10, 10)),
    ).toEqual(['2026-11-10文件.jpg', '2026-11-10文件 (2).jpg'])
  })

  test('duplicate preview names get a suffix and illegal characters are replaced', () => {
    expect(
      previewRename(['a.png', 'a.png'], config({ mode: 'format', text: '同名' })),
    ).toEqual(['同名1.png', '同名2.png'])
    expect(sanitizeStem('合同/附件:*?')).toBe('合同_附件___')
  })

  test('splitName keeps dotfiles intact', () => {
    expect(splitName('a.tar.gz')).toEqual({ stem: 'a.tar', extension: '.gz' })
    expect(splitName('.env')).toEqual({ stem: '.env', extension: '' })
  })
})
