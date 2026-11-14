import { describe, expect, test } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isFinderAlias } from '../../src/main/alias'

describe('Finder alias detection', () => {
  test.skipIf(process.platform !== 'darwin')(
    'recognises the book header and ignores regular files',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'mqmz-alias-'))
      try {
        const aliasPath = join(directory, '李焱')
        await writeFile(
          aliasPath,
          Buffer.from('book\u0000\u0000\u0000\u0000mark alias record'),
          'binary',
        )
        const textPath = join(directory, 'book.txt')
        await writeFile(textPath, 'book notes', 'utf8')
        const shortPath = join(directory, 'tiny')
        await writeFile(shortPath, 'abc', 'utf8')

        expect(await isFinderAlias(aliasPath)).toBe(true)
        expect(await isFinderAlias(textPath)).toBe(false)
        expect(await isFinderAlias(shortPath)).toBe(false)
        expect(await isFinderAlias(join(directory, 'missing'))).toBe(false)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  test('never reports aliases outside macOS', () => {
    if (process.platform === 'darwin') return
    expect(isFinderAlias('/tmp/book')).toBeInstanceOf(Promise)
  })
})
