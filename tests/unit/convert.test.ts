import { describe, expect, test } from 'vitest'
import {
  availableConvertTargets,
  availableImageTargets,
  candidateOutputPath,
  isImageFile,
  mergedOutputName,
  outputDirectory,
  outputName,
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

  test('images also offer PDF; PDF batches merge or split', () => {
    expect(availableConvertTargets(['a.jpg'])).toEqual([
      { id: 'png', label: 'PNG' },
      { id: 'webp', label: 'WEBP' },
      { id: 'pdf', label: 'PDF' },
    ])
    expect(availableConvertTargets(['a.pdf'])).toEqual([
      { id: 'split-pdf', label: '拆分 PDF' },
    ])
    expect(availableConvertTargets(['a.pdf', 'b.pdf'])).toEqual([
      { id: 'merge-pdf', label: '合并 PDF' },
    ])
    expect(availableConvertTargets(['a.jpg', 'b.pdf'])).toEqual([])
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
  })
})
