import { describe, expect, test } from 'vitest'
import {
  parseShelfIndex,
  serializeShelfIndex,
  type ShelfRecord,
} from '../../src/main/shelf-index'

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'note.txt',
  path: '/tmp/note.txt',
  size: 12,
  modifiedAt: 1_700_000_000_000,
  device: 1,
  inode: 2,
  status: 'shelved' as const,
}

describe('shelf index', () => {
  test('version 1 records restore as regular files', () => {
    const records = parseShelfIndex({ version: 1, files: [base] })
    expect(records).toEqual([{ ...base, kind: 'file' }])
  })

  test('version 2 round-trips folders, files and aliases', () => {
    const files: ShelfRecord[] = [
      { ...base, kind: 'file' },
      {
        ...base,
        id: '33333333-3333-4333-8333-333333333333',
        name: '李焱',
        path: '/tmp/李焱',
        kind: 'file',
        shortcut: true,
      },
      {
        ...base,
        id: '22222222-2222-4222-8222-222222222222',
        name: '素材',
        path: '/tmp/素材',
        size: 0,
        kind: 'folder',
      },
    ]
    expect(parseShelfIndex(JSON.parse(serializeShelfIndex(files)))).toEqual(
      files,
    )
    expect(JSON.parse(serializeShelfIndex(files)).version).toBe(2)
  })

  test('rejects unknown kinds and relative paths', () => {
    expect(() =>
      parseShelfIndex({ version: 2, files: [{ ...base, kind: 'link' }] }),
    ).toThrow()
    expect(() =>
      parseShelfIndex({
        version: 2,
        files: [{ ...base, kind: 'file', path: 'note.txt' }],
      }),
    ).toThrow()
  })
})
