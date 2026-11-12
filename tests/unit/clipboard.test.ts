import { describe, expect, test } from 'vitest'
import {
  looksSensitive,
  pruneClipboardEntries,
} from '../../src/shared/clipboard'

const at = (daysAgo: number) => Date.now() - daysAgo * 24 * 60 * 60 * 1000

describe('clipboard helpers', () => {
  test('detects obvious secrets while keeping normal text', () => {
    expect(looksSensitive('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
    expect(looksSensitive('sk-abcdefghijklmnopqrstuvwx')).toBe(true)
    expect(looksSensitive('password: hunter2')).toBe(true)
    expect(looksSensitive('明天下午三点开会')).toBe(false)
    expect(looksSensitive('https://example.com/docs')).toBe(false)
  })

  test('keeps pinned entries and prunes by age and capacity', () => {
    const oldPinned = { id: 'pinned', createdAt: at(90), pinned: true }
    const old = { id: 'old', createdAt: at(90), pinned: false }
    const freshA = { id: 'a', createdAt: at(1), pinned: false }
    const freshB = { id: 'b', createdAt: at(0), pinned: false }
    const kept = pruneClipboardEntries(
      [oldPinned, old, freshA, freshB],
      { maxItems: 1, retentionDays: 30 },
    )
    expect(kept.map((entry) => entry.id).sort()).toEqual(['b', 'pinned'])
  })
})
