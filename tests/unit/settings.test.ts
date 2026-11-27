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
    expect(defaultSettings.agentDefaultChatModel).toBe('deepseek-flash')
    expect(defaultSettings.aiImageModel).toBe('Doubao-Seedream-5.5')
    expect(defaultSettings.agentDefaultVideoModel).toBe('MiniMax-H3')
    expect(defaultSettings.agentDefaultAudioModel).toBe('speech-2.8-hd')
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
    expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(2)
  })

  test('adds AI quota defaults to an older settings file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    const {
      aiQuotaEnabled: _enabled,
      aiQuotaRefreshMinutes: _minutes,
      aiQuotaOpenAIPath: _path,
      aiImageModel: _imageModel,
      ...legacy
    } = defaultSettings
    await writeFile(path, JSON.stringify(legacy))
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings).toMatchObject({
      aiImageModel: 'Doubao-Seedream-5.5',
      aiQuotaEnabled: true,
      aiQuotaRefreshMinutes: 5,
      aiQuotaOpenAIPath: '',
    })
  })

  test('migrates the v1 MiniMax image default to Seedream and bumps the version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await writeFile(
      path,
      JSON.stringify({
        ...defaultSettings,
        version: 1,
        aiImageModel: 'MiniMax-H3-Image',
      }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.upgraded).toBe(true)
    expect(loaded.settings.version).toBe(2)
    expect(loaded.settings.aiImageModel).toBe('Doubao-Seedream-5.5')
    // A deliberate Seedream→MiniMax choice made later survives reloads.
    await saveSettingsFile(path, {
      ...loaded.settings,
      aiImageModel: 'MiniMax-H3-Image',
    })
    const reloaded = await loadSettingsFile(path)
    expect(reloaded.upgraded).toBe(false)
    expect(reloaded.settings.aiImageModel).toBe('MiniMax-H3-Image')
  })

  test('migrates the default chat model from the legacy AI model', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    const legacy = {
      ...defaultSettings,
      aiModel: 'deepseek-v4-pro',
    } as Record<string, unknown>
    delete legacy.agentDefaultChatModel
    delete legacy.agentDefaultVideoModel
    delete legacy.agentDefaultAudioModel
    await writeFile(path, JSON.stringify(legacy))
    const loaded = await loadSettingsFile(path)
    expect(loaded.settings.agentDefaultChatModel).toBe('deepseek-v4-pro')
    expect(loaded.settings.agentDefaultVideoModel).toBe('MiniMax-H3')
    expect(loaded.settings.agentDefaultAudioModel).toBe('speech-2.8-hd')
  })

  test('migrates removed Ark defaults without changing other settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-removed-ark-'))
    const path = join(directory, 'mqmz.settings.json')
    for (const [old, replacement] of [
      ['deepseek-v4-pro-260425', 'deepseek-v4-pro-ga-260813'],
      ['doubao-seed-2-0-code-preview-260215', 'doubao-seed-2-1-pro-260915'],
      ['doubao-seed-2-0-pro-260215', 'doubao-seed-2-1-pro-260915'],
    ]) {
      await writeFile(path, JSON.stringify({ ...defaultSettings, petName: '团子', agentDefaultChatModel: old }))
      const result = await loadSettingsFile(path)
      expect(result.upgraded).toBe(true)
      expect(result.settings).toMatchObject({ petName: '团子', agentDefaultChatModel: replacement })
    }
  })

  test('allows every default model to be unset', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await saveSettingsFile(path, {
      ...defaultSettings,
      agentDefaultChatModel: '',
      aiImageModel: '',
      agentDefaultVideoModel: '',
      agentDefaultAudioModel: '',
    })
    const loaded = await loadSettingsFile(path)
    expect(loaded.settings).toMatchObject({
      agentDefaultChatModel: '',
      aiImageModel: '',
      agentDefaultVideoModel: '',
      agentDefaultAudioModel: '',
    })
  })

  test('falls back when default models have the wrong kind', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await writeFile(
      path,
      JSON.stringify({
        ...defaultSettings,
        aiModel: 'deepseek-v4-pro',
        agentDefaultChatModel: 'MiniMax-H3-Image',
        aiImageModel: 'MiniMax-M3',
        agentDefaultVideoModel: 'speech-2.8-hd',
        agentDefaultAudioModel: 'MiniMax-H3',
      }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.settings.agentDefaultChatModel).toBe('deepseek-v4-pro')
    expect(loaded.settings.aiImageModel).toBe('Doubao-Seedream-5.5')
    expect(loaded.settings.agentDefaultVideoModel).toBe('MiniMax-H3')
    expect(loaded.settings.agentDefaultAudioModel).toBe('speech-2.8-hd')
  })

  test('invalid wheel lists fall back without losing other settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await writeFile(
      path,
      JSON.stringify({
        ...defaultSettings,
        petName: '团子',
        aiImageModel: 'MiniMax-M3',
        hoverWheelActions: ['agent', 'agent', 'todo'],
        fileWheelActions: ['stash', 'convert', 'eat', 'ask'],
      }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings.petName).toBe('团子')
    expect(loaded.settings.aiImageModel).toBe('Doubao-Seedream-5.5')
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
      'copy-to',
      'mail',
      'convert',
      'rename',
    ])
  })

  test('migrates the agent-first file wheel order to the copy-to default', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    await writeFile(
      path,
      JSON.stringify({
        ...defaultSettings,
        fileWheelActions: [
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
        ],
      }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings.fileWheelActions).toEqual([
      'ask',
      'stash',
      'archive',
      'extract',
      'shrink',
      'eat',
      'copy-to',
      'mail',
      'convert',
      'rename',
    ])
  })

  test('keeps a custom file wheel that still asks for 另存副本', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-settings-'))
    const path = join(directory, 'mqmz.settings.json')
    const custom = ['stash', 'copy', 'mail', 'ask']
    await writeFile(
      path,
      JSON.stringify({ ...defaultSettings, fileWheelActions: custom }),
    )
    const loaded = await loadSettingsFile(path)
    expect(loaded.existed).toBe(true)
    expect(loaded.settings.fileWheelActions).toEqual(custom)
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
