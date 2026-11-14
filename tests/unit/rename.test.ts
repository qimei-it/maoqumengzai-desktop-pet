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

  test('replace text is case-insensitive and may change the extension', () => {
    expect(
      previewRename(
        ['Draft 1.txt'],
        config({ mode: 'replace', find: 'draft', replace: 'final' }),
      ),
    ).toEqual(['final 1.txt'])
    expect(
      previewRename(
        ['Draft 1.txt'],
        config({ mode: 'replace', find: 'txt', replace: 'md' }),
      ),
    ).toEqual(['Draft 1.md'])
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
    ).toEqual(['文件 1.jpg', '文件 2.jpg'])
    expect(
      previewRename(names, config({
        mode: 'format',
        text: '文件',
        format: 'counter',
        start: 10,
      })),
    ).toEqual(['文件 00010.jpg', '文件 00011.jpg'])
    expect(
      previewRename(names, config({
        mode: 'format',
        text: '文件',
        format: 'date',
        position: 'before',
      }), new Date(2026, 10, 10, 9, 6, 11)),
    ).toEqual(['2026-11-10 上午9.06.11 文件.jpg', '2026-11-10 上午9.06.11 文件 (2).jpg'])
  })

  test('duplicate preview names get a suffix and illegal characters are replaced', () => {
    expect(
      previewRename(['a.png', 'a.png'], config({ mode: 'format', text: '同名' })),
    ).toEqual(['同名 1.png', '同名 2.png'])
    expect(sanitizeStem('合同/附件:*?')).toBe('合同_附件___')
  })

  test('folder names are renamed as a whole without extension splitting', () => {
    expect(
      previewRename(
        [
          { name: '素材.v2', kind: 'folder' },
          { name: '报告.txt', kind: 'file' },
        ],
        config({ mode: 'format', text: '项目', format: 'index' }),
      ),
    ).toEqual(['项目 1', '项目 2.txt'])
    expect(
      previewRename(
        [{ name: '素材.v2', kind: 'folder' }],
        config({ mode: 'add', text: '2026 ', position: 'before' }),
      ),
    ).toEqual(['2026 素材.v2'])
  })

  test('splitName keeps dotfiles intact', () => {
    expect(splitName('a.tar.gz')).toEqual({ stem: 'a.tar', extension: '.gz' })
    expect(splitName('.env')).toEqual({ stem: '.env', extension: '' })
  })
})
