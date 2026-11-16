import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'
import {
  generateVolcanoImage,
  listVolcanoModels,
  resolveVolcanoImageModel,
  testVolcanoConnection,
} from '../../src/shared/volcano'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  )
})

async function endpoint(
  handler: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void,
): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no port')
  return `http://127.0.0.1:${address.port}/api/v3`
}

describe('Volcano Ark provider', () => {
  test('lists model IDs and measures latency', async () => {
    const base = await endpoint((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          data: [
            { id: 'doubao-seedream-5-0-flash-20260101' },
            { id: 'doubao-other' },
          ],
        }),
      )
    })
    await expect(
      listVolcanoModels('ark-test', { endpoint: `${base}/models` }),
    ).resolves.toEqual([
      'doubao-seedream-5-0-flash-20260101',
      'doubao-other',
    ])
    await expect(
      testVolcanoConnection('ark-test', { endpoint: `${base}/models` }),
    ).resolves.toBeGreaterThanOrEqual(0)
  })

  test('prefers the Seedream 5.5 model', () => {
    expect(
      resolveVolcanoImageModel([
        'doubao-seedream-4-0-250828',
        'doubao-seedream-5-0-flash-20260101',
        'doubao-seedream-5-5-261028',
      ]),
    ).toBe('doubao-seedream-5-5-261028')
    expect(
      resolveVolcanoImageModel(['doubao-seedream-5-0-flash-20260101']),
    ).toBe('doubao-seedream-5-0-flash-20260101')
    expect(resolveVolcanoImageModel(['doubao-other'])).toBeUndefined()
  })

  test('requests a transparent PNG and parses the response', async () => {
    let body: Record<string, unknown> | undefined
    const base = await endpoint((request, response) => {
      let text = ''
      request.on('data', (chunk) => (text += chunk))
      request.on('end', () => {
        body = JSON.parse(text) as Record<string, unknown>
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            model: 'doubao-seedream-5-0-flash-20260101',
            data: [
              {
                url: 'https://example.com/pet.png',
                size: '1024x1024',
                output_format: 'png',
                background: 'transparent',
              },
            ],
          }),
        )
      })
    })
    const result = await generateVolcanoImage(
      'ark-test',
      {
        model: 'doubao-seedream-5-0-flash-20260101',
        prompt: '一只柔和水彩布偶猫',
        images: ['https://example.com/cat.jpg'],
      },
      { endpoint: `${base}/images/generations` },
    )
    expect(body).toMatchObject({
      model: 'doubao-seedream-5-0-flash-20260101',
      prompt: '一只柔和水彩布偶猫',
      image: 'https://example.com/cat.jpg',
      size: '1K',
      output_format: 'png',
      background: 'transparent',
      response_format: 'url',
      watermark: false,
    })
    expect(result.images[0]).toMatchObject({
      url: 'https://example.com/pet.png',
      size: '1024x1024',
      format: 'png',
      background: 'transparent',
    })
  })

  test('reports an invalid key', async () => {
    const base = await endpoint((_request, response) => {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end('{}')
    })
    await expect(
      testVolcanoConnection('ark-bad', { endpoint: `${base}/models` }),
    ).rejects.toThrow('火山方舟 API Key 无效')
  })
})
