import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseSkillRequires } from '../../src/shared/skill-requirements'

const root = join(__dirname, '..', '..')

describe('skill requirements', () => {
  test('extracts environment variable names', () => {
    const parsed = parseSkillRequires('需要配置 NCBI_API_KEY、OPENALEX_API_KEY')
    expect(parsed).toEqual([
      { kind: 'env', id: 'NCBI_API_KEY', label: 'NCBI_API_KEY' },
      { kind: 'env', id: 'OPENALEX_API_KEY', label: 'OPENALEX_API_KEY' },
    ])
  })

  test('recognises known command line tools', () => {
    const python = parseSkillRequires('需要 Python 3 与技能脚本')
    expect(python).toEqual([
      {
        kind: 'bin',
        id: 'python3',
        alternatives: ['python3', 'python'],
        label: 'Python',
      },
    ])
    expect(parseSkillRequires('需要 gstack CLI')[0]).toMatchObject({
      kind: 'bin',
      label: 'gstack CLI',
    })
  })

  test('returns nothing for skills without requirements', () => {
    expect(parseSkillRequires(undefined)).toEqual([])
    expect(parseSkillRequires('')).toEqual([])
  })

  test('ignores prose that only mentions a service', () => {
    expect(parseSkillRequires('需要 MiniMax API（部分技能）')).toEqual([])
  })
})

describe('builtin skill defaults', () => {
  test('no default-enabled skill needs external credentials or tools', async () => {
    const manifest = JSON.parse(
      await readFile(join(root, 'resources', 'skills', 'manifest.json'), 'utf8'),
    ) as { skills: Array<{ id: string; defaultEnabled?: boolean; requires?: string }> }
    const offenders = manifest.skills.filter(
      (skill) => skill.defaultEnabled !== false && skill.requires,
    )
    expect(offenders.map((skill) => skill.id)).toEqual([])
  })
})
