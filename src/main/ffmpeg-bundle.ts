/** Extraction and runtime environment for the downloaded LGPL FFmpeg bundle. */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import type { FfmpegBuild } from '../shared/ffmpeg'

function keepEntry(name: string, platform: string): boolean {
  if (name.endsWith('/')) return false
  if (platform === 'win32')
    return (
      name === 'ffmpeg.exe' ||
      name.endsWith('.dll') ||
      /^(COPYING|LICENSE)/.test(name)
    )
  return (
    name === 'bin/ffmpeg' ||
    (name.startsWith('lib/') && name.endsWith('.dylib')) ||
    name.startsWith('licenses/')
  )
}

export async function extractFfmpegBundle(
  archive: Uint8Array,
  targetDirectory: string,
  release: FfmpegBuild,
): Promise<void> {
  await rm(targetDirectory, { recursive: true, force: true })
  await mkdir(targetDirectory, { recursive: true, mode: 0o700 })
  const entries = unzipSync(archive)
  for (const [name, data] of Object.entries(entries)) {
    if (!keepEntry(name, process.platform)) continue
    const destination = join(targetDirectory, name)
    await mkdir(dirname(destination), { recursive: true })
    if (
      process.platform !== 'win32' &&
      name.startsWith('lib/') &&
      name.endsWith('.dylib') &&
      data.length < 256
    ) {
      const target = strFromU8(data).trim()
      if (!target || target.includes('/') || target.includes('\\'))
        throw new Error('FFmpeg 包内的动态库链接无效。')
      await symlink(target, destination)
      continue
    }
    await writeFile(destination, data)
  }
  const binary = join(targetDirectory, release.binaryPath)
  const info = await stat(binary)
  if (info.size !== release.binaryBytes)
    throw new Error('FFmpeg 解压大小异常，已停止安装。')
  if (process.platform !== 'win32') await chmod(binary, 0o755)
}

export function ffmpegEnv(binaryPath: string): NodeJS.ProcessEnv {
  const directory = dirname(binaryPath)
  const env = { ...process.env }
  if (process.platform === 'darwin') {
    const library = join(directory, '..', 'lib')
    if (existsSync(library))
      env.DYLD_LIBRARY_PATH = [library, env.DYLD_LIBRARY_PATH]
        .filter(Boolean)
        .join(delimiter)
  } else if (process.platform === 'win32') {
    env.PATH = [directory, env.PATH].filter(Boolean).join(delimiter)
  }
  return env
}

export function smokeTestFfmpeg(binaryPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      ['-hide_banner', '-version'],
      { timeout: 15_000, env: ffmpegEnv(binaryPath) },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error('FFmpeg 安装后无法运行。'))
          return
        }
        if (!/ffmpeg version\s+\S+/i.test(`${stdout}\n${stderr}`)) {
          reject(new Error('FFmpeg 版本信息异常。'))
          return
        }
        resolve()
      },
    )
  })
}
