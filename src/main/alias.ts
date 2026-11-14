import { open } from 'node:fs/promises'

/**
 * A macOS Finder alias is a regular file whose record starts with
 * `book` + four zero bytes + `mark`; it carries no `.alias` extension, so the
 * extension-based icon mapping cannot recognise it. Symlinks stay rejected
 * elsewhere and are not affected by this check.
 */
const aliasHeader = Buffer.from('book\u0000\u0000\u0000\u0000mark', 'binary')

export async function isFinderAlias(path: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  const handle = await open(path, 'r').catch(() => null)
  if (!handle) return false
  try {
    const header = Buffer.alloc(aliasHeader.length)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    return bytesRead === header.length && header.equals(aliasHeader)
  } catch {
    return false
  } finally {
    await handle.close().catch(() => {})
  }
}
