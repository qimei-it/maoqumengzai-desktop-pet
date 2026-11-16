/** Saved custom desktop pets under the local data directory. */

import { access, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { mediaUrl } from '../shared/media'
import { registerMediaPath } from './agent/media-registry'
import {
  petPoseIds,
  type PetPoseId,
  type PetStyle,
} from '../shared/pet-style'

const recordSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(20),
    styleId: z.string().min(1).max(80),
    styleName: z.string().min(1).max(80),
    model: z.string().min(1).max(200),
    createdAt: z.number().int().positive(),
    poses: z.record(
      z.enum(petPoseIds),
      z
        .string()
        .min(1)
        .max(120)
        .regex(/^[a-z0-9-]+\.png$/i),
    ),
  })
  .strict()

export type PetRecord = z.infer<typeof recordSchema>

export type PetAssets = {
  id: string
  name: string
  styleName: string
  poses: Record<PetPoseId, string>
}

export function petsRoot(dataRoot: string): string {
  return join(dataRoot, 'pets')
}

export async function loadPetRecord(
  root: string,
  id: string,
): Promise<PetRecord | undefined> {
  if (!/^[a-z0-9-]{6,80}$/.test(id)) return undefined
  const directory = join(root, id)
  try {
    const record = recordSchema.parse(
      JSON.parse(await readFile(join(directory, 'pet.json'), 'utf8')),
    )
    if (record.id !== id) return undefined
    for (const pose of petPoseIds) {
      await access(join(directory, record.poses[pose]))
    }
    return record
  } catch {
    return undefined
  }
}

export async function listPetRecords(root: string): Promise<PetRecord[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const records: PetRecord[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const record = await loadPetRecord(root, entry.name)
      if (record) records.push(record)
    }
    return records.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

/** Drafts live in memory only, so unfinished directories are safe to drop. */
export async function cleanupPetDrafts(root: string): Promise<void> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('.draft-'))
        .map((entry) =>
          rm(join(root, entry.name), { recursive: true, force: true }).catch(
            () => {},
          ),
        ),
    )
  } catch {
    // No pets directory yet.
  }
}

export function registerPetAssets(
  root: string,
  record: PetRecord,
): PetAssets {
  const directory = join(root, record.id)
  const poses = {} as Record<PetPoseId, string>
  for (const pose of petPoseIds) {
    const key = `pet-${record.id}-${pose}`
    registerMediaPath(key, join(directory, record.poses[pose]))
    poses[pose] = mediaUrl(key)
  }
  return {
    id: record.id,
    name: record.name,
    styleName: record.styleName,
    poses,
  }
}

export function petRecordFor(
  id: string,
  name: string,
  style: PetStyle,
  model: string,
  createdAt: number,
): PetRecord {
  return {
    version: 1,
    id,
    name,
    styleId: style.id,
    styleName: style.name,
    model,
    createdAt,
    poses: Object.fromEntries(
      petPoseIds.map((pose) => [pose, `${pose}.png`]),
    ) as Record<PetPoseId, string>,
  }
}
