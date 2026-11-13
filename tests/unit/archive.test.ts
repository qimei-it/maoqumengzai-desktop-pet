import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createArchive, extractArchive } from '../../src/main/archive-zip'
import {
  archiveEntryName,
  archiveFileName,
  archiveStem,
  compressedName,
  extractedFolderName,
  is7zFile,
  isArchiveFile,
  isBz2File,
  isGzFile,
  isRarFile,
  isTarFile,
  isTgzFile,
  isXzFile,
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
    expect(
      archiveFileName(['/tmp/a.txt', '/tmp/b.txt'], 1, now, '7z'),
    ).toBe('归档-20261110-203045.7z')
    expect(archiveFileName(['/tmp/报告.txt'], 1, now, 'gz')).toBe(
      '报告.txt.gz',
    )
    expect(archiveFileName(['/tmp/报告.txt'], 2, now, 'bz2')).toBe(
      '报告 (2).txt.bz2',
    )
    expect(archiveFileName(['/tmp/README'], 1, now, 'xz')).toBe('README.xz')
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
    expect(is7zFile('a.7Z')).toBe(true)
    expect(isRarFile('a.RAR')).toBe(true)
    expect(isTarFile('a.TAR')).toBe(true)
    expect(isTgzFile('a.tgz')).toBe(true)
    expect(isTgzFile('a.tar.gz')).toBe(true)
    expect(isGzFile('a.gz')).toBe(true)
    expect(isGzFile('a.tar.gz')).toBe(false)
    expect(isBz2File('a.BZ2')).toBe(true)
    expect(isXzFile('a.XZ')).toBe(true)
    expect(isArchiveFile('a.rar')).toBe(true)
    expect(isArchiveFile('a.tar')).toBe(true)
    expect(isArchiveFile('a.tgz')).toBe(true)
    expect(isArchiveFile('a.tar.gz')).toBe(true)
    expect(isArchiveFile('a.gz')).toBe(true)
    expect(isArchiveFile('a.bz2')).toBe(true)
    expect(isArchiveFile('a.xz')).toBe(true)
    const existing = new Set(['/tmp/资料', '/tmp/资料 (2)'])
    expect(
      extractedFolderName('/tmp/资料.zip', (path) => existing.has(path)),
    ).toBe('/tmp/资料 (3)')
    expect(compressedName('/tmp/照片.PNG', 1)).toBe('照片-压缩.PNG')
    expect(compressedName('/tmp/照片.PNG', 3)).toBe('照片-压缩 (3).PNG')
  })
})

describe('archive round trips', () => {
  test('creates and extracts a 7z archive', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'mqmz-7z-test-'))
    try {
      const first = join(folder, 'a.txt')
      const second = join(folder, 'b.txt')
      await writeFile(first, 'alpha', 'utf8')
      await writeFile(second, 'beta', 'utf8')
      const archive = await createArchive(
        [first, second],
        '7z',
        new Date(2026, 10, 12, 12, 0, 0),
      )
      const result = await extractArchive(archive)
      expect(result.count).toBe(2)
      expect(await readFile(join(result.folder, 'a.txt'), 'utf8')).toBe('alpha')
      expect(await readFile(join(result.folder, 'b.txt'), 'utf8')).toBe('beta')
    } finally {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
    }
  })

  for (const format of ['tar', 'tgz'] as const) {
    test(`creates and extracts a ${format.toUpperCase()} archive`, async () => {
      const folder = await mkdtemp(join(tmpdir(), `mqmz-${format}-test-`))
      try {
        const first = join(folder, 'a.txt')
        const second = join(folder, 'b.txt')
        await writeFile(first, 'alpha', 'utf8')
        await writeFile(second, 'beta', 'utf8')
        const archive = await createArchive(
          [first, second],
          format,
          new Date(2026, 10, 12, 12, 0, 0),
        )
        const result = await extractArchive(archive)
        expect(result.count).toBe(2)
        expect(await readFile(join(result.folder, 'a.txt'), 'utf8')).toBe(
          'alpha',
        )
        expect(await readFile(join(result.folder, 'b.txt'), 'utf8')).toBe(
          'beta',
        )
      } finally {
        await rm(folder, { recursive: true, force: true }).catch(() => {})
      }
    })
  }

  test('packs a folder with its contents beside a file', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'mqmz-folder-zip-'))
    try {
      const video = join(folder, '片段.mp4')
      await writeFile(video, 'video', 'utf8')
      const source = join(folder, '素材')
      await mkdir(join(source, '子目录'), { recursive: true })
      await writeFile(join(source, '说明.txt'), '说明', 'utf8')
      await writeFile(join(source, '子目录', '画面.txt'), '画面', 'utf8')
      const archive = await createArchive(
        [video, source],
        'zip',
        new Date(2026, 10, 13, 12, 0, 0),
      )
      expect(archive.endsWith('.zip')).toBe(true)
      const result = await extractArchive(archive)
      expect(
        await readFile(join(result.folder, '素材', '说明.txt'), 'utf8'),
      ).toBe('说明')
      expect(
        await readFile(join(result.folder, '素材', '子目录', '画面.txt'), 'utf8'),
      ).toBe('画面')
      expect(await readFile(join(result.folder, '片段.mp4'), 'utf8')).toBe(
        'video',
      )
    } finally {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
    }
  })

  test('packs a folder into TAR without losing its structure', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'mqmz-folder-tar-'))
    try {
      const source = join(folder, '素材')
      await mkdir(join(source, '子目录'), { recursive: true })
      await writeFile(join(source, '说明.txt'), '说明', 'utf8')
      await writeFile(join(source, '子目录', '画面.txt'), '画面', 'utf8')
      const archive = await createArchive(
        [source],
        'tar',
        new Date(2026, 10, 13, 12, 0, 0),
      )
      const result = await extractArchive(archive)
      expect(
        await readFile(join(result.folder, '素材', '子目录', '画面.txt'), 'utf8'),
      ).toBe('画面')
    } finally {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
    }
  })

  test('skips symlinks inside a folder', async () => {
    if (process.platform === 'win32') return
    const folder = await mkdtemp(join(tmpdir(), 'mqmz-folder-link-'))
    try {
      const source = join(folder, '素材')
      await mkdir(source, { recursive: true })
      await writeFile(join(source, '说明.txt'), '说明', 'utf8')
      await symlink(join(source, '说明.txt'), join(source, '链接.txt'))
      const archive = await createArchive(
        [source],
        'zip',
        new Date(2026, 10, 13, 12, 0, 0),
      )
      const result = await extractArchive(archive)
      expect(
        await readFile(join(result.folder, '素材', '说明.txt'), 'utf8'),
      ).toBe('说明')
      await expect(
        readFile(join(result.folder, '素材', '链接.txt'), 'utf8'),
      ).rejects.toThrow()
    } finally {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
    }
  })

  test('single-file formats reject folders', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'mqmz-folder-stream-'))
    try {
      const source = join(folder, '素材')
      await mkdir(source, { recursive: true })
      await writeFile(join(source, '说明.txt'), '说明', 'utf8')
      for (const format of ['gz', 'bz2', 'xz'] as const) {
        await expect(createArchive([source], format)).rejects.toThrow(
          '只能压缩单个文件',
        )
      }
    } finally {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
    }
  })

  test('rejects multi-file GZ/BZ2/XZ archives', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'mqmz-stream-limit-'))
    try {
      const first = join(folder, 'a.txt')
      const second = join(folder, 'b.txt')
      await writeFile(first, 'alpha', 'utf8')
      await writeFile(second, 'beta', 'utf8')
      for (const format of ['gz', 'bz2', 'xz'] as const) {
        await expect(
          createArchive([first, second], format),
        ).rejects.toThrow('只能压缩单个文件')
      }
    } finally {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
    }
  })

  for (const format of ['gz', 'bz2', 'xz'] as const) {
    test(`creates and extracts a single-file ${format.toUpperCase()}`, async () => {
      const folder = await mkdtemp(join(tmpdir(), `mqmz-${format}-test-`))
      try {
        const source = join(folder, '报告.txt')
        await writeFile(source, '内容', 'utf8')
        const archive = await createArchive(
          [source],
          format,
          new Date(2026, 10, 12, 12, 0, 0),
        )
        expect(archive.endsWith(`报告.txt.${format}`)).toBe(true)
        const result = await extractArchive(archive)
        expect(result.count).toBe(1)
        expect(await readFile(join(result.folder, '报告.txt'), 'utf8')).toBe(
          '内容',
        )
      } finally {
        await rm(folder, { recursive: true, force: true }).catch(() => {})
      }
    })
  }
})
