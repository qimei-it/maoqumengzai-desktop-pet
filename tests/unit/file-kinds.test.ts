import { describe, expect, test } from 'vitest'
import {
  conversionEngineFor,
  conversionEngineForKinds,
  fileKind,
  fileKindFromMime,
  isAudioFile,
  isOfficeFile,
  isVideoFile,
} from '../../src/shared/file-kinds'

describe('conversion engine routing', () => {
  test('classifies files by the conversion family', () => {
    expect(fileKind('照片.JPG')).toBe('image')
    expect(fileKind('照片.HEIC')).toBe('image')
    expect(fileKind('扫描.bmp')).toBe('image')
    expect(fileKind('扫描.tiff')).toBe('image')
    expect(fileKind('动图.gif')).toBe('image')
    expect(fileKind('合同.pdf')).toBe('pdf')
    expect(fileKind('片段.MOV')).toBe('video')
    expect(fileKind('片段.FLV')).toBe('video')
    expect(fileKind('片段.ts')).toBe('video')
    expect(fileKind('录音.flac')).toBe('audio')
    expect(fileKind('报告.docx')).toBe('office')
    expect(fileKind('表格.csv')).toBe('document')
    expect(fileKind('说明.txt')).toBe('document')
    expect(fileKind('说明.md')).toBe('document')
    expect(fileKind('页面.html')).toBe('document')
    expect(fileKind('压缩包.zip')).toBe('other')
    expect(isVideoFile('clip.webm')).toBe(true)
    expect(isAudioFile('voice.m4a')).toBe(true)
    expect(isOfficeFile('sheet.xlsx')).toBe(true)
  })

  test('routes batches to bundled engines, FFmpeg or LibreOffice', () => {
    expect(conversionEngineFor(['a.jpg', 'b.pdf'])).toBe('builtin')
    expect(conversionEngineFor(['a.mp4', 'b.wav'])).toBe('ffmpeg')
    expect(conversionEngineFor(['a.docx'])).toBe('libreoffice')
    expect(conversionEngineFor(['a.csv', 'b.txt'])).toBe('builtin')
    expect(conversionEngineFor(['a.mp4', 'b.jpg'])).toBe('unsupported')
    expect(conversionEngineFor(['a.zip'])).toBe('unsupported')
    expect(conversionEngineFor([])).toBe('unsupported')
  })

  test('dragover MIME fallback classifies files before names are exposed', () => {
    expect(fileKindFromMime('video/mp4')).toBe('video')
    expect(fileKindFromMime('audio/mpeg')).toBe('audio')
    expect(fileKindFromMime('image/png')).toBe('image')
    expect(fileKindFromMime('application/pdf')).toBe('pdf')
    expect(fileKindFromMime('text/csv')).toBe('document')
    expect(fileKindFromMime('text/markdown')).toBe('document')
    expect(
      fileKindFromMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('office')
    expect(conversionEngineForKinds(['video', 'audio'])).toBe('ffmpeg')
    expect(conversionEngineForKinds(['image', 'pdf'])).toBe('builtin')
    expect(conversionEngineForKinds(['video', 'image'])).toBe('unsupported')
  })
})
