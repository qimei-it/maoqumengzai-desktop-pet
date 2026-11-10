import { describe, expect, test } from 'vitest'
import {
  archiveEntryName,
  archiveFileName,
  archiveStem,
  compressedName,
  extractedFolderName,
  isZipFile,
  safeArchiveEntry,
} from '../../src/shared/archive'

describe('archive naming and safety', () => {
  test('a single file keeps its stem, a batch gets a timestamp', () => {
    const now = new Date(2026, 10, 10, 20, 30, 45)
    expect(archiveStem(['/tmp/报告.pdf'], now)).toBe('报告')
    expect(archiveStem(['/tmp/a.txt', '/tmp/b.txt'], now)).toBe(
      '归档-20261110-203045',
    )
    expect(
      archiveFileName(['/tmp/a.txt', '/tmp/b.txt'], 2, now),
    ).toBe('归档-20261110-203045 (2).zip')
  })

  test('archive entries stay unique case-insensitively', () => {
    const used = new Set<string>()
    expect(archiveEntryName('/a/报告.pdf', used)).toBe('报告.pdf')
    expect(archiveEntryName('/b/报告.pdf', used)).toBe('报告 (2).pdf')
    expect(archiveEntryName('/c/REPORT.txt', used)).toBe('REPORT.txt')
    expect(archiveEntryName('/d/report.txt', used)).toBe('report (2).txt')
  })

  test('unsafe archive paths are rejected', () => {
    expect(safeArchiveEntry('资料/报告.pdf')).toBe('资料/报告.pdf')
    expect(safeArchiveEntry('a\\b\\c.txt')).toBe('a/b/c.txt')
    expect(safeArchiveEntry('../escape.txt')).toBeNull()
    expect(safeArchiveEntry('a/../../escape.txt')).toBeNull()
    expect(safeArchiveEntry('/etc/passwd')).toBeNull()
    expect(safeArchiveEntry('C:/Windows/system.ini')).toBeNull()
    expect(safeArchiveEntry('')).toBeNull()
    expect(safeArchiveEntry('a/./b.txt')).toBe('a/b.txt')
  })

  test('extract folders and compressed names avoid collisions', () => {
    expect(isZipFile('a.ZIP')).toBe(true)
    expect(isZipFile('a.7z')).toBe(false)
    const existing = new Set(['/tmp/资料', '/tmp/资料 (2)'])
    expect(
      extractedFolderName('/tmp/资料.zip', (path) => existing.has(path)),
    ).toBe('/tmp/资料 (3)')
    expect(compressedName('/tmp/照片.PNG', 1)).toBe('照片-压缩.PNG')
    expect(compressedName('/tmp/照片.PNG', 3)).toBe('照片-压缩 (3).PNG')
  })
})
