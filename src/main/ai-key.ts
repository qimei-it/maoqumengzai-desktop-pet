/**
 * Local storage for the user's DeepSeek API key. The key is encrypted with the
 * OS keychain-backed safeStorage when available; the file is 0600 either way.
 */
import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

type Stored = { version: 1; key: string }

function configPath(): string {
  return join(app.getPath('userData'), 'mqmz.ai.json')
}

export async function loadStoredKey(): Promise<string | undefined> {
  try {
    const stored = JSON.parse(await readFile(configPath(), 'utf8')) as Stored
    if (stored.version !== 1 || typeof stored.key !== 'string') return undefined
    if (stored.key.startsWith('enc:')) {
      if (!safeStorage.isEncryptionAvailable()) return undefined
      return safeStorage.decryptString(
        Buffer.from(stored.key.slice(4), 'base64'),
      )
    }
    if (stored.key.startsWith('plain:')) return stored.key.slice(6)
    return undefined
  } catch {
    return undefined
  }
}

export async function saveStoredKey(apiKey: string): Promise<void> {
  const encrypted = safeStorage.isEncryptionAvailable()
  const key = encrypted
    ? `enc:${safeStorage.encryptString(apiKey).toString('base64')}`
    : `plain:${apiKey}`
  const file = configPath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ version: 1, key }), { mode: 0o600 })
}

export async function clearStoredKey(): Promise<void> {
  await rm(configPath(), { force: true })
}
