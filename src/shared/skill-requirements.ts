/**
 * Turns a skill's free-text `requires` hint into checkable requirements.
 *
 * The manifest only carries prose such as "需要配置 NCBI_API_KEY" or
 * "需要 Python 3 与技能脚本", so this is a best-effort parse: environment
 * variables are recognised by shape, and a small set of known tools by name.
 */

export type SkillRequirement =
  | { kind: 'env'; id: string; label: string }
  | { kind: 'bin'; id: string; alternatives: string[]; label: string }

const binHints: Array<{
  test: RegExp
  alternatives: string[]
  label: string
}> = [
  { test: /python/i, alternatives: ['python3', 'python'], label: 'Python' },
  { test: /\bnode(?:\.js)?\b|\bnpx\b|\bnpm\b/i, alternatives: ['node'], label: 'Node.js' },
  { test: /\bbun\b/i, alternatives: ['bun'], label: 'Bun' },
  { test: /hyperframes/i, alternatives: ['hyperframes'], label: 'HyperFrames CLI' },
  { test: /gstack/i, alternatives: ['gstack'], label: 'gstack CLI' },
  { test: /topview/i, alternatives: ['topview'], label: 'TopView CLI' },
  { test: /playwright/i, alternatives: ['npx'], label: 'Playwright' },
]

/** `XXX_API_KEY`, `SOME_TOKEN`, `CLIENT_SECRET`: uppercase names with an underscore. */
const envPattern = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g

export function parseSkillRequires(
  requires?: string,
): SkillRequirement[] {
  if (!requires) return []
  const found: SkillRequirement[] = []
  const seen = new Set<string>()

  for (const match of requires.matchAll(envPattern)) {
    const id = match[1]
    if (id.length < 5 || seen.has(`env:${id}`)) continue
    seen.add(`env:${id}`)
    found.push({ kind: 'env', id, label: id })
  }

  for (const hint of binHints) {
    if (!hint.test.test(requires)) continue
    const key = `bin:${hint.label}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({
      kind: 'bin',
      id: hint.alternatives[0]!,
      alternatives: hint.alternatives,
      label: hint.label,
    })
  }

  return found
}

/** Human summary shown next to a skill that cannot run as-is. */
export function missingSummary(missing: readonly string[]): string {
  return missing.length ? `缺少：${missing.join('、')}` : ''
}
