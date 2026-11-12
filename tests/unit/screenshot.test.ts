import { describe, expect, test } from 'vitest'
import {
  isImageFileName,
  isScreenshotCandidate,
} from '../../src/shared/screenshot'

describe('screenshot file helpers', () => {
  test('recognises image files', () => {
    expect(isImageFileName('Screenshot 2026-11-12.png')).toBe(true)
    expect(isImageFileName('截屏2026-11-12.PNG')).toBe(true)
    expect(isImageFileName('notes.txt')).toBe(false)
    expect(isImageFileName('.png')).toBe(false)
  })

  test('requires screenshot names on shared folders but not dedicated ones', () => {
    expect(isScreenshotCandidate('Screenshot 2026-11-12.png', false)).toBe(true)
    expect(isScreenshotCandidate('截屏 2026-11-12.png', false)).toBe(true)
    expect(isScreenshotCandidate('屏幕快照 2026-11-12.png', false)).toBe(true)
    expect(isScreenshotCandidate('family-photo.png', false)).toBe(false)
    expect(isScreenshotCandidate('family-photo.png', true)).toBe(true)
    expect(isScreenshotCandidate('family-photo.txt', true)).toBe(false)
  })
})
