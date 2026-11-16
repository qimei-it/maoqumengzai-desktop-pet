/** Local record of quota alerts already delivered, so restarts do not repeat. */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { pruneAiQuotaAlertKeys } from '../shared/ai-quota-alert'

const storeSchema = z
  .object({
    version: z.literal(1),
    keys: z.record(z.string(), z.number().finite()),
  })
  .strict()

export async function loadAiQuotaAlertKeys(
  path: string,
): Promise<Record<string, number>> {
  try {
    const stored = storeSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    return pruneAiQuotaAlertKeys(stored.keys)
  } catch {
    return {}
  }
}

let queue = Promise.resolve()

export async function saveAiQuotaAlertKeys(
  path: string,
  keys: Readonly<Record<string, number>>,
): Promise<void> {
  const value = JSON.stringify(
    storeSchema.parse({
      version: 1,
      keys: pruneAiQuotaAlertKeys(keys),
    }),
  )
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, value, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
