import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import {
  generationOutputDir,
  localDateFolder,
} from '../../src/main/agent/output-path'

describe('generation output paths', () => {
  test('uses local date and session id folders', () => {
    const date = new Date(2026, 10, 16, 23, 59)
    expect(localDateFolder(date)).toBe('2026-11-16')
    expect(generationOutputDir('/tmp/agent', 'session-id', date)).toBe(
      join('/tmp/agent', '2026-11-16', 'session-id'),
    )
  })
})
