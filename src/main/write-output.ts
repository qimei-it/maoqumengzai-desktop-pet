import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Writes a new output file without ever replacing an existing file. `name`
 * receives an attempt number so callers can add " (2)" suffixes.
 */
export async function writeExclusive(
  folder: string,
  name: (attempt: number) => string,
  bytes: Uint8Array,
): Promise<string> {
  await mkdir(folder, { recursive: true })
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const destination = join(folder, name(attempt))
    try {
      await writeFile(destination, bytes, { flag: 'wx' })
      return destination
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
  }
  throw new Error('输出目录里没有可用的文件名。')
}
