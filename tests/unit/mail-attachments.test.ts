import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  collectMailAttachments,
  mailAttachmentFor,
  maxMailAttachments,
  uniquePaths,
} from '../../src/main/mail-attachments'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  )
})

async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mqmz-mail-attach-'))
  directories.push(dir)
  return dir
}

describe('mail attachments', () => {
  test('reads a shelf file into a composer attachment', async () => {
    const dir = await root()
    const path = join(dir, '报告.pdf')
    await writeFile(path, 'hello')
    await expect(mailAttachmentFor(path)).resolves.toEqual({
      path,
      name: '报告.pdf',
      size: 5,
    })
  })

  test('skips missing paths and directories', async () => {
    const dir = await root()
    const folder = join(dir, 'folder')
    await mkdir(folder)
    await expect(mailAttachmentFor(join(dir, 'missing.txt'))).resolves.toBe(
      undefined,
    )
    await expect(mailAttachmentFor(folder)).resolves.toBe(undefined)
  })

  test('keeps order and removes repeated paths', () => {
    expect(
      uniquePaths(['/a.txt', undefined, '/b.txt', '/a.txt', '/b.txt']),
    ).toEqual(['/a.txt', '/b.txt'])
  })

  test('resolves shelf ids and skips folders, missing files and duplicates', async () => {
    const dir = await root()
    const first = join(dir, 'a.txt')
    const second = join(dir, 'b.txt')
    const folder = join(dir, 'folder')
    await writeFile(first, 'a')
    await writeFile(second, 'bb')
    await mkdir(folder)
    const paths: Record<string, string> = {
      a: first,
      b: second,
      again: first,
      folder,
      missing: join(dir, 'missing.txt'),
    }
    const { attachments, truncated } = await collectMailAttachments(
      ['a', 'folder', 'missing', 'again', 'b'],
      async (id) => {
        if (id === 'missing') throw new Error('gone')
        return paths[id]
      },
    )
    expect(truncated).toBe(false)
    expect(attachments.map((item) => item.name)).toEqual(['a.txt', 'b.txt'])
    expect(attachments.map((item) => item.size)).toEqual([1, 2])
  })

  test('caps the attachment count at the composer limit', async () => {
    const dir = await root()
    const ids = Array.from(
      { length: maxMailAttachments + 1 },
      (_, index) => `file-${index}`,
    )
    for (const id of ids) await writeFile(join(dir, id), 'x')
    const { attachments, truncated } = await collectMailAttachments(
      ids,
      async (id) => join(dir, id),
    )
    expect(truncated).toBe(true)
    expect(attachments).toHaveLength(maxMailAttachments)
  })
})
