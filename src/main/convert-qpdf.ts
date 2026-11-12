/** PDF password protection through a user-selected local qpdf. */
import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { outputDirectory, securedOutputName } from '../shared/convert'
import { writeExclusive } from './write-output'

const timeout = 120_000

function abortError(): Error {
  const error = new Error('转换已取消')
  error.name = 'AbortError'
  return error
}

function killProcessTree(pid: number | undefined): void {
  if (!pid) return
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* already exited */
    }
  }
}

function runQpdf(
  binary: string,
  args: string[],
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const child = spawn(binary, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: process.platform !== 'win32',
    })
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = (): void => {
      killProcessTree(child.pid)
      settle(abortError())
    }
    const settle = (error?: Error): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      killProcessTree(child.pid)
      settle(new Error('qpdf 处理超时。'))
    }, timeout)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-8192)
    })
    child.on('error', (error) => settle(error))
    child.on('close', (code) => {
      if (code === 0 && !signal?.aborted) {
        settle()
        return
      }
      if (signal?.aborted) {
        settle(abortError())
        return
      }
      const detail = stderr
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-3)
        .join(' ')
      settle(new Error(detail || `qpdf 退出码 ${code ?? 'unknown'}`))
    })
  })
}

export async function convertPdfSecurity(
  qpdf: string,
  sourcePath: string,
  action: 'pdf-encrypt' | 'pdf-decrypt',
  password: string,
  batch: boolean,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw abortError()
  if (!password) throw new Error('请输入 PDF 密码。')
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-qpdf-'))
  const generated = join(directory, 'result.pdf')
  try {
    const args =
      action === 'pdf-encrypt'
        ? [
            '--encrypt',
            password,
            password,
            '256',
            '--',
            sourcePath,
            generated,
          ]
        : [`--password=${password}`, '--decrypt', sourcePath, generated]
    await runQpdf(qpdf, args, signal)
    if (signal?.aborted) throw abortError()
    const bytes = await readFile(generated)
    return writeExclusive(
      outputDirectory(sourcePath, batch),
      (attempt) => securedOutputName(sourcePath, action, attempt),
      bytes,
    )
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
