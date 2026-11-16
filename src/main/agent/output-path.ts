/** Date and session folders for generated media. */

import { join } from 'node:path'

export function localDateFolder(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function generationOutputDir(
  base: string,
  sessionId: string,
  date = new Date(),
): string {
  return join(base, localDateFolder(date), sessionId)
}
