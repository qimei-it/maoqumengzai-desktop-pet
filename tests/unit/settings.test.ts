import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { defaultSettings, petScales, themeIds } from '../../src/shared/settings'
import { loadSettingsFile, saveSettingsFile } from '../../src/main/settings'

describe('settings store', () => {
  test('defaults are valid and cover every theme and scale', () => {
    expect(themeIds).toContain(defaultSettings.theme)
    expect(petScales).toContain(defaultSettings.scale)
    expect(defaultSettings.statusBubbles).toBe(true)
    expect(defaultSettings.musicBubbles).toBe(true)
  })

  test('round-trips a saved file atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await saveSettingsFile(path, {
      ...defaultSettings,
      theme: 'christmas',
      scale: 1.5,
      launchAtLogin: true,
      statusBubbles: false,
    })
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings).toMatchObject({
      theme: 'christmas',
      scale: 1.5,
      launchAtLogin: true,
      statusBubbles: false,
    })
    expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1)
  })

  test('a missing or corrupt file falls back to defaults', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const missing = await loadSettingsFile(join(directory, 'none.json'))
    expect(missing.existed).toBe(false)
    expect(missing.settings).toEqual(defaultSettings)
    const corruptPath = join(directory, 'corrupt.json')
    await writeFile(corruptPath, '{not json')
    const corrupt = await loadSettingsFile(corruptPath)
    expect(corrupt.existed).toBe(false)
    expect(corrupt.settings).toEqual(defaultSettings)
  })
})
