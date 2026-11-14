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
    expect(defaultSettings.aiModel).toBe('deepseek-flash')
    expect(defaultSettings.hoverWheelActions).toHaveLength(10)
    expect(defaultSettings.fileWheelActions).toHaveLength(10)
    expect(defaultSettings.aiQuotaEnabled).toBe(true)
    expect(defaultSettings.aiQuotaRefreshMinutes).toBe(5)
    expect(defaultSettings.aiQuotaOpenAIPath).toBe('')
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
      aiQuotaEnabled: false,
      aiQuotaRefreshMinutes: 15,
      aiQuotaOpenAIPath: '/tmp/codex-auth.json',
      hoverWheelActions: ['agent', 'todo', 'water', 'settings'],
      fileWheelActions: ['stash', 'convert', 'eat', 'ask'],
    })
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings).toMatchObject({
      theme: 'christmas',
      scale: 1.5,
      launchAtLogin: true,
      statusBubbles: false,
      aiQuotaEnabled: false,
      aiQuotaRefreshMinutes: 15,
      aiQuotaOpenAIPath: '/tmp/codex-auth.json',
      hoverWheelActions: ['agent', 'todo', 'water', 'settings'],
      fileWheelActions: ['stash', 'convert', 'eat', 'ask'],
    })
    expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1)
  })

  test('adds AI quota defaults to an older settings file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    const {
      aiQuotaEnabled: _enabled,
      aiQuotaRefreshMinutes: _minutes,
      aiQuotaOpenAIPath: _path,
      ...legacy
    } = defaultSettings
    await writeFile(path, JSON.stringify(legacy))
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings).toMatchObject({
      aiQuotaEnabled: true,
      aiQuotaRefreshMinutes: 5,
      aiQuotaOpenAIPath: '',
    })
  })

  test('invalid wheel lists fall back without losing other settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await writeFile(
      path,
      JSON.stringify({
        ...defaultSettings,
        petName: '团子',
        hoverWheelActions: ['agent', 'agent', 'todo'],
        fileWheelActions: ['stash', 'convert', 'eat', 'ask'],
      }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings.petName).toBe('团子')
    expect(loaded.settings.hoverWheelActions).toEqual(defaultSettings.hoverWheelActions)
    expect(loaded.settings.fileWheelActions).toEqual([
      'stash',
      'convert',
      'eat',
      'ask',
    ])
  })

  test('migrates the previous hover wheel order without touching other settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await writeFile(
      path,
      JSON.stringify({
        ...defaultSettings,
        petName: '团子',
        hoverWheelActions: [
          'agent',
          'clipboard',
          'profile',
          'todo',
          'break',
          'water',
          'focus',
          'shelf',
          'mail',
          'settings',
        ],
      }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings.petName).toBe('团子')
    expect(loaded.settings.hoverWheelActions).toEqual([
      'agent',
      'clipboard',
      'shelf',
      'profile',
      'break',
      'todo',
      'water',
      'focus',
      'mail',
      'settings',
    ])
  })

  test('migrates the previous file wheel order without touching other settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await writeFile(
      path,
      JSON.stringify({
        ...defaultSettings,
        petName: '团子',
        fileWheelActions: [
          'stash',
          'convert',
          'archive',
          'extract',
          'shrink',
          'eat',
          'copy',
          'mail',
          'rename',
          'ask',
        ],
      }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings.petName).toBe('团子')
    expect(loaded.settings.fileWheelActions).toEqual([
      'ask',
      'stash',
      'archive',
      'extract',
      'shrink',
      'eat',
      'copy',
      'mail',
      'convert',
      'rename',
    ])
  })

  test('drops the removed archive format without losing other settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await writeFile(
      path,
      JSON.stringify({
        ...defaultSettings,
        petName: '团子',
        archiveFormat: '7z',
      }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings.petName).toBe('团子')
    expect(loaded.settings).not.toHaveProperty('archiveFormat')
    await saveSettingsFile(path, loaded.settings)
    expect(JSON.parse(await readFile(path, 'utf8'))).not.toHaveProperty(
      'archiveFormat',
    )
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
