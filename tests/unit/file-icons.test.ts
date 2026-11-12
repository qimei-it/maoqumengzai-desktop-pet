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
