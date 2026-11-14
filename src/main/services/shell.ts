/** Confirmed shell execution. Kept out of the tool layer so it can be tested alone. */

import { spawn } from 'node:child_process'
import type { ServiceResult, ShellOutput } from './contracts'

const maxOutput = 64 * 1024

export type ShellInput = {
  command: string
  workspace: string | null
  timeoutSeconds: number
  signal: AbortSignal
}

function failed(error: unknown): ServiceResult<ShellOutput> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : '命令执行失败。',
  }
}

export async function runShell(
  input: ShellInput,
): Promise<ServiceResult<ShellOutput>> {
  const command = input.command.trim()
  if (!command) return failed(new Error('缺少命令。'))
  if (command.length > 2000) return failed(new Error('命令过长。'))
  if (!input.workspace)
    return failed(new Error('请先选择 shell 工作区，再执行命令。'))
  const timeoutMs = Math.min(120, Math.max(1, input.timeoutSeconds)) * 1000
  const windows = process.platform === 'win32'

  return new Promise((resolve) => {
    const child = spawn(
      windows ? 'cmd.exe' : '/bin/zsh',
      windows ? ['/d', '/s', '/c', command] : ['-lc', command],
      {
        cwd: input.workspace!,
        env: { ...process.env },
        detached: !windows,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let stdout = ''
    let stderr = ''
    let truncated = false
    let timedOut = false
    let aborted = false
    let settled = false

    const append = (target: 'out' | 'err', chunk: Buffer): void => {
      const value = chunk.toString('utf8')
      if (target === 'out') {
        if (stdout.length < maxOutput) stdout += value
        else truncated = true
      } else if (stderr.length < maxOutput) stderr += value
      else truncated = true
    }
    child.stdout.on('data', (chunk: Buffer) => append('out', chunk))
    child.stderr.on('data', (chunk: Buffer) => append('err', chunk))

    const kill = (): void => {
      if (child.pid && !windows) {
        try {
          process.kill(-child.pid, 'SIGTERM')
          return
        } catch {
          /* fall back to the direct child */
        }
      }
      child.kill('SIGTERM')
    }

    const timer = setTimeout(() => {
      timedOut = true
      kill()
      finish(null)
    }, timeoutMs)

    const onAbort = (): void => {
      aborted = true
      kill()
      finish(null)
    }
    input.signal.addEventListener('abort', onAbort, { once: true })

    function finish(exitCode: number | null): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      input.signal.removeEventListener('abort', onAbort)
      resolve({
        ok: true,
        value: {
          command,
          workspace: input.workspace!,
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          truncated,
          timedOut,
          aborted,
        },
      })
    }

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      input.signal.removeEventListener('abort', onAbort)
      resolve(failed(error))
    })
    child.on('close', (code) => finish(code))
  })
}
