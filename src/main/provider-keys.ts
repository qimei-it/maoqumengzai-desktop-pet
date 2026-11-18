/** Encrypted per-provider API keys for providers other than DeepSeek. */

import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type ExternalProvider = 'minimax' | 'bailian' | 'volcano'

type Stored = {
  version: 1
  keys: Partial<Record<ExternalProvider, string>>
}

function configPath(): string {
  return join(app.getPath('userData'), 'mqmz.provider-keys.json')
}

async function readStore(): Promise<Stored> {
  try {
    const value = JSON.parse(await readFile(configPath(), 'utf8')) as Stored
    if (value.version !== 1 || !value.keys || typeof value.keys !== 'object')
      return { version: 1, keys: {} }
    return value
  } catch {
    return { version: 1, keys: {} }
  }
}

async function writeStore(value: Stored): Promise<void> {
  const file = configPath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 })
  await rename(`${file}.tmp`, file)
}

function decrypted(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    if (value.startsWith('enc:')) {
      if (!safeStorage.isEncryptionAvailable()) return undefined
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
    }
    if (value.startsWith('plain:')) return value.slice(6)
    return undefined
  } catch {
    // A key encrypted by another build identity must not crash startup.
    return undefined
  }
}

export async function loadProviderKey(
  provider: ExternalProvider,
): Promise<string | undefined> {
  const stored = await readStore()
  return decrypted(stored.keys[provider])
}

export async function saveProviderKey(
  provider: ExternalProvider,
  apiKey: string,
): Promise<void> {
  const stored = await readStore()
  stored.keys[provider] = safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(apiKey).toString('base64')}`
    : `plain:${apiKey}`
  await writeStore(stored)
}

export async function clearProviderKey(
  provider: ExternalProvider,
): Promise<void> {
  const stored = await readStore()
  delete stored.keys[provider]
  await writeStore(stored)
}
