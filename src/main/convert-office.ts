/** Office → PDF through a user-selected local LibreOffice installation. */
import { execFile, spawn } from 'node:child_process'
import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { outputDirectory, outputName } from '../shared/convert'
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
      /* process already exited */
    }
  }
}

function runSoffice(
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
      settle(new Error('LibreOffice 转换超时。'))
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
      settle(new Error(detail || `LibreOffice 退出码 ${code ?? 'unknown'}`))
    })
  })
}

export async function convertOffice(
  soffice: string,
  sourcePath: string,
  target: 'pdf' | 'docx' | 'xlsx' | 'pptx',
  batch: boolean,
  signal?: AbortSignal,
): Promise<string> {
  const bytes = await officeBytes(soffice, sourcePath, target, signal)
  return writeExclusive(
    outputDirectory(sourcePath, batch),
    (attempt) => outputName(sourcePath, target, attempt),
    bytes,
  )
}

/** Converts an Office file in a private temp folder and returns its bytes. */
export async function officePdfBuffer(
  soffice: string,
  sourcePath: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  return officeBytes(soffice, sourcePath, 'pdf', signal)
}

async function officeBytes(
  soffice: string,
  sourcePath: string,
  target: 'pdf' | 'docx' | 'xlsx' | 'pptx',
  signal?: AbortSignal,
): Promise<Buffer> {
  if (signal?.aborted) throw abortError()
  const output = await mkdtemp(join(tmpdir(), 'mqmz-office-'))
  const profile = await mkdtemp(join(tmpdir(), 'mqmz-office-profile-'))
  try {
    await runSoffice(soffice, [
      // macOS 27 的 headless LibreOffice 无法回退到系统中文字体，会导出空白汉字。
      process.platform === 'darwin' ? '--invisible' : '--headless',
      '--nologo',
      '--nodefault',
      '--norestore',
      '--convert-to',
      target,
      '--outdir',
      output,
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
      sourcePath,
    ], signal)
    if (signal?.aborted) throw abortError()
    const expected = join(
      output,
      `${basename(sourcePath, extname(sourcePath))}.${target}`,
    )
    let generatedPath = expected
    try {
      await lstat(expected)
    } catch {
      const entries = await readdir(output)
      const generated = entries.find((entry) =>
        entry.toLowerCase().endsWith(`.${target}`),
      )
      if (!generated)
        throw new Error(`LibreOffice 没有生成 ${target.toUpperCase()}。`)
      generatedPath = join(output, generated)
    }
    if (signal?.aborted) throw abortError()
    return await readFile(generatedPath)
  } finally {
    await rm(output, { recursive: true, force: true }).catch(() => {})
    await rm(profile, { recursive: true, force: true }).catch(() => {})
  }
}
