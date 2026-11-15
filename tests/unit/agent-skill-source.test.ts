import { describe, expect, test } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { zipSync, strToU8 } from 'fflate'
import { resolveSkillSource } from '../../src/main/agent/skill-source'

function response(body: Uint8Array | string, type: string, status = 200) {
  return new Response(body as BodyInit, {
    status,
    headers: { 'content-type': type },
  })
}

describe('skill source resolution', () => {
  test('downloads a direct Markdown file', async () => {
    const source = await resolveSkillSource('https://example.com/SKILL.md', {
      fetch: (async () =>
        response('# demo\ncontent', 'text/markdown')) as typeof fetch,
    })
    expect(source.path.endsWith('.md')).toBe(true)
    expect(await readFile(source.path, 'utf8')).toContain('# demo')
    await source.cleanup()
    await expect(stat(source.path)).rejects.toThrow()
  })

  test('accepts GitHub tree links and resolves the folder', async () => {
    const zip = zipSync({
      'demo-main/skills/demo/SKILL.md': strToU8('---\nname: demo\n---\nbody'),
      'demo-main/skills/demo/references/a.md': strToU8('ref'),
    })
    const urls: string[] = []
    const source = await resolveSkillSource(
      'https://github.com/acme/demo/tree/main/skills/demo',
      {
        fetch: (async (input: string | URL | Request) => {
          urls.push(String(input))
          return response(zip, 'application/zip')
        }) as typeof fetch,
      },
    )
    expect(urls[0]).toContain('codeload.github.com/acme/demo')
    const info = await stat(source.path)
    expect(info.isDirectory()).toBe(true)
    expect(await readFile(`${source.path}/SKILL.md`, 'utf8')).toContain('body')
    await source.cleanup()
  })

  test('rejects insecure and private addresses', async () => {
    for (const url of [
      'http://example.com/SKILL.md',
      'https://localhost/SKILL.md',
      'https://127.0.0.1/SKILL.md',
      'https://192.168.1.2/SKILL.md',
      'https://user:pass@example.com/SKILL.md',
      'not-a-url',
    ])
      await expect(
        resolveSkillSource(url, {
          fetch: (async () =>
            response('x', 'text/markdown')) as typeof fetch,
        }),
      ).rejects.toThrow()
  })

  test('rejects unknown file types and oversized downloads', async () => {
    await expect(
      resolveSkillSource('https://example.com/data.bin', {
        fetch: (async () =>
          response('binary', 'application/octet-stream')) as typeof fetch,
      }),
    ).rejects.toThrow('只支持')

    await expect(
      resolveSkillSource('https://example.com/SKILL.md', {
        fetch: (async () =>
          new Response('x', {
            headers: {
              'content-type': 'text/markdown',
              'content-length': String(60 * 1024 * 1024),
            },
          })) as typeof fetch,
      }),
    ).rejects.toThrow('50 MB')
  })
})
