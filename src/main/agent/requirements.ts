/** Probes the local machine for the requirements a skill declares. */

import { execFile } from 'node:child_process'
import {
  parseSkillRequires,
  type SkillRequirement,
} from '../../shared/skill-requirements'

const binCache = new Map<string, boolean>()

function hasBinary(name: string): Promise<boolean> {
  const cached = binCache.get(name)
  if (cached !== undefined) return Promise.resolve(cached)
  return new Promise((resolve) => {
    execFile('which', [name], (error) => {
      const ok = !error
      binCache.set(name, ok)
      resolve(ok)
    })
  })
}

async function satisfied(requirement: SkillRequirement): Promise<boolean> {
  if (requirement.kind === 'env') return Boolean(process.env[requirement.id])
  for (const name of requirement.alternatives) {
    if (await hasBinary(name)) return true
  }
  return false
}

/**
 * Labels of unmet requirements for one skill. Results are cached per session
 * because installing a tool requires restarting the app anyway.
 */
const skillCache = new Map<string, string[]>()

export async function missingSkillRequirements(
  requires: string | undefined,
  cacheKey: string,
): Promise<string[]> {
  if (!requires) return []
  const cached = skillCache.get(cacheKey)
  if (cached) return cached
  const parsed = parseSkillRequires(requires)
  const missing: string[] = []
  for (const requirement of parsed) {
    if (!(await satisfied(requirement))) missing.push(requirement.label)
  }
  skillCache.set(cacheKey, missing)
  return missing
}

/** Drops cached probe results, e.g. after a skill or tool changes. */
export function clearRequirementCache(): void {
  skillCache.clear()
  binCache.clear()
}
