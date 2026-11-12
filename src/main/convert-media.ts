/** FFmpeg-backed media conversion, writing only new files. */
import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, link, mkdir, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  outputDirectory,
  outputName,
  targetExtension,
  type MediaTarget,
} from '../shared/convert'

const ffmpegTimeout = 30 * 60 * 1000

function mediaArgs(
  sourcePath: string,
  target: MediaTarget,
  destination: string,
): string[] {
  const base = ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath]
  const h264 = [
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
  ]
  switch (target) {
    case 'mp4':
      return [...base, ...h264, '-movflags', '+faststart', destination]
    case 'mov':
      return [...base, ...h264, '-movflags', '+faststart', destination]
    case 'mkv':
      return [...base, ...h264, destination]
    case 'webm':
      return [
        ...base,
        '-c:v',
        'libvpx-vp9',
        '-crf',
        '32',
        '-b:v',
        '0',
        '-row-mt',
        '1',
        '-cpu-used',
        '2',
        '-c:a',
        'libopus',
        '-b:a',
        '128k',
        destination,
      ]
    case 'gif':
      return [
        ...base,
        '-vf',
        "fps=12,scale='min(720,iw)':-2:flags=lanczos",
        '-loop',
        '0',
        destination,
      ]
    case 'webp-anim':
      return [
        ...base,
        '-vf',
        "fps=12,scale='min(720,iw)':-2:flags=lanczos",
        '-c:v',
        'libwebp_anim',
        '-quality',
        '75',
        '-loop',
        '0',
        '-an',
        destination,
      ]
    case 'mp3':
      return [
        ...base,
        '-vn',
        '-c:a',
        'libmp3lame',
        '-q:a',
        '2',
        destination,
      ]
    case 'wav':
      return [...base, '-vn', '-c:a', 'pcm_s16le', destination]
    case 'm4a':
      return [...base, '-vn', '-c:a', 'aac', '-b:a', '192k', destination]
    case 'flac':
      return [
        ...base,
        '-vn',
        '-c:a',
        'flac',
        '-compression_level',
        '5',
        destination,
      ]
    case 'ogg':
      return [
        ...base,
        '-vn',
        '-c:a',
        'libopus',
        '-b:a',
        '160k',
        destination,
      ]
  }
}

function abortError(): Error {
  const error = new Error('转换已取消')
  error.name = 'AbortError'
  return error
}

function durationOf(
  sourcePath: string,
  binary: string,
  signal?: AbortSignal,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    execFile(
      binary,
      ['-hide_banner', '-i', sourcePath],
      { timeout: 10_000, maxBuffer: 2 * 1024 * 1024, signal },
      (_error, _stdout, stderr) => {
        const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(
          String(stderr || ''),
        )
        if (!match) {
          resolve(null)
          return
        }
        resolve(
          Number(match[1]) * 3600 +
            Number(match[2]) * 60 +
            Number(match[3]),
        )
      },
    )
  })
}

function runFfmpeg(
  binary: string,
  args: string[],
  onTime?: (seconds: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const child = spawn(binary, ['-progress', 'pipe:1', '-nostats', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    let buffer = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = (): void => {
      child.kill('SIGKILL')
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
      child.kill('SIGKILL')
      settle(new Error('FFmpeg 转换超时。'))
    }, ffmpegTimeout)
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const match = /^out_time_(?:us|ms)=(.+)$/.exec(line.trim())
        if (!match) continue
        const micros = Number(match[1])
        if (Number.isFinite(micros)) onTime?.(micros / 1_000_000)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-8192)
    })
    child.on('error', (error) => settle(error))
    child.on('close', (code) => {
      if (code === 0) {
        settle()
        return
      }
      const detail = stderr
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-3)
        .join(' ')
      settle(new Error(detail || `FFmpeg 退出码 ${code ?? 'unknown'}`))
    })
  })
}

async function publishExclusive(
  temp: string,
  folder: string,
  sourcePath: string,
  target: MediaTarget,
): Promise<string> {
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const destination = join(folder, outputName(sourcePath, target, attempt))
    try {
      await link(temp, destination)
      return destination
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') continue
      if (
        code === 'EPERM' ||
        code === 'EXDEV' ||
        code === 'ENOSYS' ||
        code === 'EACCES'
      ) {
        try {
          await copyFile(temp, destination, constants.COPYFILE_EXCL)
          return destination
        } catch (copyError) {
          if ((copyError as NodeJS.ErrnoException).code === 'EEXIST') continue
          throw copyError
        }
      }
      throw error
    }
  }
  throw new Error('输出目录里没有可用的文件名。')
}

/** Runs FFmpeg into a temporary file, then publishes it without overwriting. */
export async function convertMedia(
  ffmpeg: string,
  sourcePath: string,
  target: MediaTarget,
  batch: boolean,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw abortError()
  const folder = outputDirectory(sourcePath, batch)
  await mkdir(folder, { recursive: true })
  const temp = join(
    folder,
    `.mqmz-${randomUUID()}.${targetExtension(target)}`,
  )
  try {
    const duration = await durationOf(sourcePath, ffmpeg, signal)
    let last = 0
    await runFfmpeg(
      ffmpeg,
      mediaArgs(sourcePath, target, temp),
      (seconds) => {
        if (!duration || duration <= 0) return
        const fraction = Math.min(0.99, Math.max(0, seconds / duration))
        if (fraction - last < 0.01) return
        last = fraction
        onProgress?.(fraction)
      },
      signal,
    )
    if (signal?.aborted) throw abortError()
    return await publishExclusive(temp, folder, sourcePath, target)
  } finally {
    await unlink(temp).catch(() => {})
  }
}
