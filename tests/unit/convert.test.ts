import { describe, expect, test } from 'vitest'
import {
  availableConvertTargets,
  availableImageTargets,
  availableMediaTargets,
  candidateOutputPath,
  isImageFile,
  isMediaTarget,
  mergedOutputName,
  outputDirectory,
  outputName,
  pdfPageName,
  securedOutputName,
  splitOutputDirectory,
  splitPageName,
} from '../../src/shared/convert'

describe('image conversion targets', () => {
  test('single images offer the other image formats', () => {
    expect(availableImageTargets(['照片.jpg'])).toEqual(['PNG', 'WEBP'])
    expect(availableImageTargets(['照片.jpeg'])).toEqual(['PNG', 'WEBP'])
    expect(availableImageTargets(['照片.png'])).toEqual(['JPG', 'WEBP'])
    expect(availableImageTargets(['照片.webp'])).toEqual(['JPG', 'PNG'])
  })

  test('mixed batches share only mutual targets', () => {
    expect(availableImageTargets(['a.jpg', 'b.png'])).toEqual([
      'JPG',
      'PNG',
      'WEBP',
    ])
    expect(availableImageTargets(['a.jpg', 'b.pdf'])).toEqual([])
  })

  test('non-images are rejected', () => {
    expect(isImageFile('a.jpg')).toBe(true)
    expect(isImageFile('a.Jpeg')).toBe(true)
    expect(isImageFile('a.pdf')).toBe(false)
    expect(availableImageTargets([])).toEqual([])
  })

  test('qpdf unlocks password protection targets', () => {
    expect(availableConvertTargets(['a.pdf'], { qpdf: true })).toContainEqual({
      id: 'pdf-encrypt',
      label: '加密 PDF',
      group: 'pdf',
    })
    expect(availableConvertTargets(['a.pdf'], { qpdf: true })).toContainEqual({
      id: 'pdf-decrypt',
      label: '解除密码',
      group: 'pdf',
    })
    expect(
      availableConvertTargets(['a.pdf']).some(
        (target) => target.id === 'pdf-encrypt',
      ),
    ).toBe(false)
    expect(securedOutputName('/tmp/合同.pdf', 'pdf-encrypt', 1)).toBe(
      '合同-加密.pdf',
    )
    expect(securedOutputName('/tmp/合同.pdf', 'pdf-decrypt', 2)).toBe(
      '合同-解密 (2).pdf',
    )
  })

  test('images also offer PDF; PDF batches merge or split', () => {
    expect(availableConvertTargets(['a.jpg'])).toEqual([
      { id: 'png', label: 'PNG', group: 'image' },
      { id: 'webp', label: 'WEBP', group: 'image' },
      { id: 'pdf', label: 'PDF', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.pdf'])).toEqual([
      { id: 'split-pdf', label: '拆分 PDF', group: 'pdf' },
      { id: 'pdf-png', label: 'PNG', group: 'pdf' },
      { id: 'pdf-jpg', label: 'JPG', group: 'pdf' },
      { id: 'pdf-txt', label: 'TXT', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.pdf', 'b.pdf'])).toEqual([
      { id: 'merge-pdf', label: '合并 PDF', group: 'pdf' },
      { id: 'pdf-png', label: 'PNG', group: 'pdf' },
      { id: 'pdf-jpg', label: 'JPG', group: 'pdf' },
      { id: 'pdf-txt', label: 'TXT', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.jpg', 'b.pdf'])).toEqual([])
  })

  test('new image inputs and document/office targets', () => {
    expect(availableConvertTargets(['a.heic'])).toEqual([
      { id: 'jpg', label: 'JPG', group: 'image' },
      { id: 'png', label: 'PNG', group: 'image' },
      { id: 'webp', label: 'WEBP', group: 'image' },
      { id: 'pdf', label: 'PDF', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.bmp'])).toHaveLength(4)
    expect(availableConvertTargets(['a.tiff'])).toHaveLength(4)
    expect(availableConvertTargets(['a.gif'])).toHaveLength(4)
    expect(availableConvertTargets(['a.csv'])).toEqual([
      { id: 'document-pdf', label: 'PDF', group: 'pdf' },
      { id: 'csv-xlsx', label: 'XLSX', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.txt'])).toEqual([
      { id: 'document-pdf', label: 'PDF', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.md'])).toEqual([
      { id: 'document-pdf', label: 'PDF', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.html'])).toEqual([
      { id: 'document-pdf', label: 'PDF', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.docx'])).toEqual([
      { id: 'office-pdf', label: 'PDF', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.doc'])).toEqual([
      { id: 'office-pdf', label: 'PDF', group: 'pdf' },
      { id: 'office-docx', label: 'DOCX', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.xls'])).toEqual([
      { id: 'office-pdf', label: 'PDF', group: 'pdf' },
      { id: 'office-xlsx', label: 'XLSX', group: 'pdf' },
    ])
    expect(availableConvertTargets(['a.ppt'])).toEqual([
      { id: 'office-pdf', label: 'PDF', group: 'pdf' },
      { id: 'office-pptx', label: 'PPTX', group: 'pdf' },
    ])
  })

  test('media targets cover video containers and audio extraction', () => {
    const allVideo = [
      'mp4',
      'mov',
      'mkv',
      'webm',
      'gif',
      'webp-anim',
      'mp3',
      'wav',
      'm4a',
      'flac',
      'ogg',
    ]
    expect(availableMediaTargets(['clip.mov'])).toEqual(allVideo)
    expect(availableMediaTargets(['clip.mp4'])).toEqual(allVideo)
    expect(availableMediaTargets(['song.wav'])).toEqual([
      'mp3',
      'wav',
      'm4a',
      'flac',
      'ogg',
    ])
    expect(availableMediaTargets(['song.mp3'])).toEqual([
      'mp3',
      'wav',
      'm4a',
      'flac',
      'ogg',
    ])
    expect(availableMediaTargets(['clip.mp4', 'song.mp3'])).toEqual([
      'mp3',
      'wav',
      'm4a',
      'flac',
      'ogg',
    ])
    expect(
      availableConvertTargets(['clip.mov'], { ffmpeg: true }),
    ).toEqual([
      { id: 'mp4', label: 'MP4', group: 'video' },
      { id: 'mov', label: 'MOV', group: 'video' },
      { id: 'mkv', label: 'MKV', group: 'video' },
      { id: 'webm', label: 'WEBM', group: 'video' },
      { id: 'gif', label: 'GIF', group: 'video' },
      { id: 'webp-anim', label: 'WEBP', group: 'video' },
      { id: 'mp3', label: 'MP3', group: 'audio' },
      { id: 'wav', label: 'WAV', group: 'audio' },
      { id: 'm4a', label: 'M4A', group: 'audio' },
      { id: 'flac', label: 'FLAC', group: 'audio' },
      { id: 'ogg', label: 'OGG', group: 'audio' },
    ])
    expect(availableConvertTargets(['song.flac'], { ffmpeg: true })).toEqual([
      { id: 'mp3', label: 'MP3', group: 'audio' },
      { id: 'wav', label: 'WAV', group: 'audio' },
      { id: 'm4a', label: 'M4A', group: 'audio' },
      { id: 'flac', label: 'FLAC', group: 'audio' },
      { id: 'ogg', label: 'OGG', group: 'audio' },
    ])
    expect(availableConvertTargets(['clip.mov'])).toEqual([])
    expect(isMediaTarget('webp-anim')).toBe(true)
    expect(isMediaTarget('webp')).toBe(false)
    expect(isMediaTarget('pdf')).toBe(false)
  })
})

describe('conversion output paths', () => {
  test('single files stay beside the source and batches use convert_output', () => {
    expect(outputDirectory('/tmp/照片/a.jpg', false)).toBe('/tmp/照片')
    expect(outputDirectory('/tmp/照片/a.jpg', true)).toBe(
      '/tmp/照片/convert_output',
    )
  })

  test('names keep the original stem and add a numeric suffix on conflict', () => {
    expect(outputName('/tmp/a.jpg', 'png', 1)).toBe('a.png')
    expect(outputName('/tmp/a.jpg', 'png', 2)).toBe('a (2).png')
  })

  test('candidate paths skip taken names and never return the source', () => {
    const taken = new Set(['/tmp/a.png', '/tmp/a (2).png', '/tmp/a.jpg'])
    let candidate = candidateOutputPath('/tmp/a.jpg', 'jpg', false, (path) =>
      taken.has(path),
    )
    expect(candidate).toBe('/tmp/a (2).jpg')

    candidate = candidateOutputPath('/tmp/a.jpg', 'png', false, (path) =>
      taken.has(path),
    )
    expect(candidate).toBe('/tmp/a (3).png')
  })

  test('batch output uses convert_output', () => {
    const candidate = candidateOutputPath('/tmp/photos/a.jpg', 'webp', true, () => false)
    expect(candidate).toBe('/tmp/photos/convert_output/a.webp')
  })

  test('PDF merge and split names are deterministic', () => {
    expect(mergedOutputName('/tmp/合同.pdf', 1)).toBe('合同-合并.pdf')
    expect(mergedOutputName('/tmp/合同.pdf', 2)).toBe('合同-合并 (2).pdf')
    expect(splitOutputDirectory('/tmp/合同.pdf')).toBe(
      '/tmp/convert_output/合同',
    )
    expect(splitPageName(1, 1)).toBe('page-1.pdf')
    expect(splitPageName(3, 2)).toBe('page-3 (2).pdf')
    expect(pdfPageName(1, 'png', 1)).toBe('page-1.png')
    expect(pdfPageName(2, 'jpg', 2)).toBe('page-2 (2).jpg')
  })
})
