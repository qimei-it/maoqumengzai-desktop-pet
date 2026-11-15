import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { speak, stopSpeaking } from '../../src/main/agent/tts'

function fakeSpawn() {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    stdin: { end: vi.fn() },
  })
  return { child, spawn: vi.fn(() => child) }
}

describe('agent speech', () => {
  afterEach(() => stopSpeaking())

  test('speaks through the macOS say command', async () => {
    const { child, spawn } = fakeSpawn()
    const handle = speak('你好', {
      platform: 'darwin',
      spawn: spawn as never,
    })
    expect(spawn).toHaveBeenCalledWith('say', ['你好'], {
      stdio: 'ignore',
    })
    handle.done
    stopSpeaking()
    expect(child.kill).toHaveBeenCalled()
  })

  test('speaks through Windows System.Speech and sends stdin', async () => {
    const { child, spawn } = fakeSpawn()
    speak('你好', { platform: 'win32', spawn: spawn as never })
    expect(spawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive']),
      { stdio: ['pipe', 'ignore', 'ignore'] },
    )
    expect(child.stdin.end).toHaveBeenCalledWith('你好')
    stopSpeaking()
  })

  test('rejects empty text and unsupported platforms', () => {
    expect(() => speak('  ')).toThrow('没有可以朗读的文字')
    expect(() =>
      speak('你好', { platform: 'linux', spawn: fakeSpawn().spawn as never }),
    ).toThrow('当前系统暂不支持朗读')
  })
})
