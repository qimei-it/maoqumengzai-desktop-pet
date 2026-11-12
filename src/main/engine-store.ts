import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'

const schema = z
  .object({
    version: z.literal(1),
    localPaths: z.record(z.string(), z.string()).default({}),
  })
  .strict()

export type EnginePrefs = z.infer<typeof schema>

const defaultPrefs = (): EnginePrefs => ({
  version: 1,
  localPaths: {},
})

export async function loadEnginePrefs(path: string): Promise<EnginePrefs> {
  try {
    return schema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return defaultPrefs()
  }
}

let queue = Promise.resolve()

export async function saveEnginePrefs(
  path: string,
  prefs: EnginePrefs,
): Promise<void> {
  const value = JSON.stringify(schema.parse(prefs))
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, value, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
