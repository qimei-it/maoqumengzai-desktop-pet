import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { appUserAgent, appVersion } from '../../src/shared/app-version'

describe('app version', () => {
  test('matches package.json so User-Agent and IMAP ID stay accurate', async () => {
    const pkg = JSON.parse(
      await readFile(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version: string }
    expect(appVersion).toBe(pkg.version)
    expect(appUserAgent).toBe(`MaoquMengzai/${pkg.version}`)
  })
})
