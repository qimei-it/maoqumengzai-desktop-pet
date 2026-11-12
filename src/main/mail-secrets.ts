/** OS-keychain encrypted mail authorization codes and app passwords. */
import { safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

type Stored = { version: 1; secrets: Record<string, string> }

async function readStored(path: string): Promise<Stored> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Stored
    if (value.version !== 1 || !value.secrets || typeof value.secrets !== 'object')
      return { version: 1, secrets: {} }
    return value
  } catch {
    return { version: 1, secrets: {} }
  }
}

async function writeStored(path: string, value: Stored): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 })
  await rename(`${path}.tmp`, path)
}

export async function loadMailSecret(
  path: string,
  accountId: string,
): Promise<string | undefined> {
  if (!safeStorage.isEncryptionAvailable()) return undefined
  const stored = await readStored(path)
  const value = stored.secrets[accountId]
  if (!value) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return undefined
  }
}

export async function saveMailSecret(
  path: string,
  accountId: string,
  secret: string,
): Promise<void> {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('系统凭据存储不可用，无法保存邮箱授权码。')
  const stored = await readStored(path)
  stored.secrets[accountId] = safeStorage
    .encryptString(secret)
    .toString('base64')
  await writeStored(path, stored)
}

export async function removeMailSecret(
  path: string,
  accountId: string,
): Promise<void> {
  const stored = await readStored(path)
  if (!stored.secrets[accountId]) return
  delete stored.secrets[accountId]
  await writeStored(path, stored)
}
