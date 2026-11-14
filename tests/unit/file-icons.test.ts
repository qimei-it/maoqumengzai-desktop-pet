import { describe, expect, test } from 'vitest'
import { fileIconFor } from '../../src/renderer/file-icons'

describe('archive file icons', () => {
  test('7z uses its own icon; other archives share the generic icon', () => {
    expect(fileIconFor('归档.7z')).not.toBe(fileIconFor('归档.zip'))
    expect(fileIconFor('归档.zip')).toBe(fileIconFor('归档.rar'))
    expect(fileIconFor('归档.tar.gz')).toBe(fileIconFor('归档.tgz'))
    expect(fileIconFor('视频.mpg')).toBe(fileIconFor('视频.mp4'))
  })
})

describe('folder and office file icons', () => {
  test('folders use the folder artwork regardless of the name', () => {
    expect(fileIconFor('素材', 'folder')).toBe(fileIconFor('项目', 'folder'))
    expect(fileIconFor('素材', 'folder')).not.toBe(fileIconFor('素材.zip'))
    expect(fileIconFor('素材.txt')).toBe(fileIconFor('素材.txt', 'file'))
  })

  test('Finder aliases without an extension use the shortcut artwork', () => {
    const shortcut = fileIconFor('李焱', 'file', true)
    expect(shortcut).toBe(fileIconFor('李焱', 'file', true))
    expect(shortcut).not.toBe(fileIconFor('李焱'))
    expect(shortcut).toBe(fileIconFor('说明.txt', 'file', true))
    expect(fileIconFor('素材', 'folder', true)).toBe(
      fileIconFor('素材', 'folder'),
    )
  })

  test('spreadsheets, slides and documents each have their own artwork', () => {
    const set = [
      fileIconFor('预算.xlsx'),
      fileIconFor('数据.csv'),
      fileIconFor('汇报.pptx'),
      fileIconFor('说明.docx'),
      fileIconFor('设计.psd'),
      fileIconFor('配置.xml'),
      fileIconFor('安装包.exe'),
      fileIconFor('组件.vue'),
      fileIconFor('快捷方式.lnk'),
      fileIconFor('未知.zzz'),
    ]
    expect(new Set(set).size).toBe(set.length)
    expect(fileIconFor('预算.xls')).toBe(fileIconFor('预算.xlsx'))
    expect(fileIconFor('汇报.ppt')).toBe(fileIconFor('汇报.pptx'))
    expect(fileIconFor('说明.doc')).toBe(fileIconFor('说明.docx'))
    expect(fileIconFor('数据.tsv')).toBe(fileIconFor('数据.csv'))
  })

  test('TypeScript stays on the video icon because .ts is MPEG-TS', () => {
    expect(fileIconFor('播放列表.ts')).toBe(fileIconFor('片段.mp4'))
    expect(fileIconFor('组件.tsx')).not.toBe(fileIconFor('片段.mp4'))
  })
})
