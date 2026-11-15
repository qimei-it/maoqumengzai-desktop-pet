/** Local text-to-speech using the platform voice, no model call. */

import { spawn, type ChildProcess } from 'node:child_process'

export type SpeakHandle = {
  /** Resolves when speech finishes or is stopped. */
  done: Promise<void>
  stop(): void
}

type SpawnFn = typeof spawn

let active: { child: ChildProcess; stop: () => void } | null = null

export function stopSpeaking(): void {
  const current = active
  active = null
  current?.stop()
}

function track(
  child: ChildProcess,
  stop: () => void,
): SpeakHandle {
  const done = new Promise<void>((resolve) => {
    child.once('close', () => {
      if (active?.child === child) active = null
      resolve()
    })
    child.once('error', () => {
      if (active?.child === child) active = null
      resolve()
    })
  })
  const handle: SpeakHandle = {
    done,
    stop: () => {
      stop()
      if (active?.child === child) active = null
    },
  }
  active = { child, stop: handle.stop }
  return handle
}

export function speak(
  text: string,
  options: { platform?: NodeJS.Platform; spawn?: SpawnFn } = {},
): SpeakHandle {
  const value = text.trim().slice(0, 4_000)
  if (!value) throw new Error('没有可以朗读的文字。')
  stopSpeaking()
  const platform = options.platform ?? process.platform
  const launch = options.spawn ?? spawn
  if (platform === 'darwin') {
    const child = launch('say', [value], { stdio: 'ignore' })
    return track(child, () => child.kill())
  }
  if (platform === 'win32') {
    const child = launch(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak([Console]::In.ReadToEnd())",
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] },
    )
    child.stdin?.end(value)
    return track(child, () => child.kill())
  }
  throw new Error('当前系统暂不支持朗读。')
}
