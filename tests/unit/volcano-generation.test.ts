import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { defaultGenerationParams } from '../../src/shared/generation'
import { runAgentGeneration } from '../../src/main/agent/generation'

const directories: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function outputDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mqmz-volcano-'))
  directories.push(dir)
  return dir
}

async function tinyPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 220, g: 180, b: 140 },
    },
  })
    .png()
    .toBuffer()
}

function request(
  dir: string,
  overrides: Partial<(typeof defaultGenerationParams)['image']> = {},
) {
  return {
    apiKey: 'ark-test',
    model: 'Doubao-Seedream-5.5' as const,
    prompt: '一只柔和水彩橘猫',
    params: {
      ...defaultGenerationParams,
      image: {
        ...defaultGenerationParams.image,
        count: 1,
        area: '1K' as const,
        ratio: '16:9' as const,
        format: 'png' as const,
        ...overrides,
      },
    },
    references: [],
    outputDir: dir,
    signal: new AbortController().signal,
    onProgress: () => {},
  }
}

describe('Volcano image generation', () => {
  test('maps Seedream size, format and response', async () => {
    const png = await tinyPng()
    let body: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          model: 'doubao-seedream-5-5-261028',
          data: [
            {
              b64_json: png.toString('base64'),
              size: '1424x800',
              output_format: 'png',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    const dir = await outputDir()
    const result = await runAgentGeneration(request(dir))
    expect(body).toMatchObject({
      model: 'doubao-seedream-5-5-261028',
      prompt: '一只柔和水彩橘猫',
      size: '1424x800',
      background: 'opaque',
      output_format: 'png',
      response_format: 'b64_json',
      watermark: false,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      kind: 'image',
      width: 1424,
      height: 800,
    })
    const saved = await readFile(join(dir, result.items[0]!.name))
    expect(saved.equals(png)).toBe(true)
  })

  test('rejects unsupported count, area and format', async () => {
    const dir = await outputDir()
    await expect(
      runAgentGeneration(request(dir, { count: 2 })),
    ).rejects.toThrow('只能生成 1 张')
    await expect(
      runAgentGeneration(request(dir, { area: '4K' })),
    ).rejects.toThrow('不支持 4K')
    await expect(
      runAgentGeneration(request(dir, { format: 'webp' })),
    ).rejects.toThrow('只支持 png 或 jpeg')
  })
})
