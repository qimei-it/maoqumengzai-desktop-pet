import { describe, expect, test } from 'vitest'
import {
  fileIconFor,
  isAppleDocumentPackage,
} from '../../src/renderer/file-icons'

describe('archive file icons', () => {
  test('7z uses its own icon; other archives share the generic icon', () => {
    expect(fileIconFor('归档.7z')).not.toBe(fileIconFor('归档.zip'))
    expect(fileIconFor('归档.zip')).toBe(fileIconFor('归档.rar'))
    expect(fileIconFor('归档.tar.gz')).toBe(fileIconFor('归档.tgz'))
    expect(fileIconFor('视频.mpg')).toBe(fileIconFor('视频.mp4'))
  })
})

describe('folder and office file icons', () => {
  test('markdown files use their own artwork', () => {
    expect(fileIconFor('notes.md')).not.toBe(fileIconFor('notes.txt'))
    expect(fileIconFor('README.markdown')).toBe(fileIconFor('notes.md'))
  })

  test('folders use the folder artwork regardless of the name', () => {
    expect(fileIconFor('素材', 'folder')).toBe(fileIconFor('项目', 'folder'))
    expect(fileIconFor('素材', 'folder')).not.toBe(fileIconFor('素材.zip'))
    expect(fileIconFor('素材.txt')).toBe(fileIconFor('素材.txt', 'file'))
  })

  test('Pages, Keynote and Numbers packages keep their own artwork', () => {
    const pages = fileIconFor('年度报告.pages', 'folder')
    const keynote = fileIconFor('产品演示.key', 'folder')
    const numbers = fileIconFor('预算.numbers', 'folder')
    expect(pages).toBe(fileIconFor('年度报告.pages'))
    expect(keynote).toBe(fileIconFor('产品演示.key'))
    expect(numbers).toBe(fileIconFor('预算.numbers'))
    expect(pages).not.toBe(fileIconFor('说明.docx'))
    expect(keynote).not.toBe(fileIconFor('汇报.pptx'))
    expect(numbers).not.toBe(fileIconFor('预算.xlsx'))
    expect(isAppleDocumentPackage('年度报告.pages')).toBe(true)
    expect(isAppleDocumentPackage('产品演示.key')).toBe(true)
    expect(isAppleDocumentPackage('预算.numbers')).toBe(true)
    expect(isAppleDocumentPackage('说明.docx')).toBe(false)
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

  test('audio files use their own artwork', () => {
    const audio = fileIconFor('歌曲.mp3')
    expect(audio).toBe(fileIconFor('录音.wav'))
    expect(audio).toBe(fileIconFor('无损.flac'))
    expect(audio).not.toBe(fileIconFor('说明.txt'))
    expect(audio).not.toBe(fileIconFor('未知.zzz'))
  })

  test('LibreOffice, ebook, subtitle and installer extensions stay mapped', () => {
    expect(fileIconFor('表格.ods')).toBe(fileIconFor('预算.xlsx'))
    expect(fileIconFor('演示.odp')).toBe(fileIconFor('汇报.pptx'))
    expect(fileIconFor('版式.ofd')).toBe(fileIconFor('说明.docx'))
    expect(fileIconFor('书.epub')).toBe(fileIconFor('说明.docx'))
    expect(fileIconFor('字幕.srt')).toBe(fileIconFor('说明.txt'))
    expect(fileIconFor('安装.ipa')).toBe(fileIconFor('安装包.exe'))
    expect(fileIconFor('图.drawio')).toBe(fileIconFor('配置.xml'))
    expect(fileIconFor('相机.dng')).toBe(fileIconFor('照片.jpg'))
  })
})
