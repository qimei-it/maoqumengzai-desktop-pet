import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  normalizePetDays,
  petStatsMaxDays,
  type PetInteractions,
  type PetStats,
} from '../shared/pet-stats'

const count = z.number().int().min(0).max(1_000_000_000)

const schema = z
  .object({
    version: z.literal(1),
    firstSeenAt: z.number().int().positive(),
    lastSeenAt: z.number().int().positive(),
    days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(petStatsMaxDays),
    interactions: z
      .object({ poke: count, focus: count, water: count, todo: count })
      .strict(),
  })
  .strict()

export function parsePetStats(raw: unknown): PetStats | undefined {
  const result = schema.safeParse(raw)
  if (!result.success) return undefined
  return {
    ...result.data,
    days: normalizePetDays(result.data.days),
    interactions: { ...result.data.interactions } as PetInteractions,
  }
}

let queue = Promise.resolve()

export async function loadPetStatsFile(
  path: string,
): Promise<PetStats | undefined> {
  try {
    return parsePetStats(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    return undefined
  }
}

export async function savePetStatsFile(
  path: string,
  stats: PetStats,
): Promise<void> {
  const value = JSON.stringify(schema.parse(stats))
  const operation = queue.then(async () => {
    await writeFile(`${path}.tmp`, value, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  })
  queue = operation.catch(() => {})
  await operation
}
