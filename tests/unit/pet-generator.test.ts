import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import sharp from 'sharp'
import { afterEach, describe, expect, test } from 'vitest'
import { generatePetAsset } from '../../src/main/pet-generator'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  delete process.env.MQMZ_VOLCANO_IMAGES_URL
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
  return `http://127.0.0.1:${address.port}/images/generations`
}

async function transparentPng(size = 1024): Promise<Buffer> {
  const data = Buffer.alloc(size * size * 4)
  const left = Math.round(size * 0.3)
  const right = Math.round(size * 0.7)
  for (let y = Math.round(size * 0.1); y < Math.round(size * 0.9); y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * size + x) * 4
      data[offset] = 180
      data[offset + 1] = 140
      data[offset + 2] = 110
      data[offset + 3] = 255
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer()
}

describe('pet generation', () => {
  test('requests transparent PNG, sends references and normalizes', async () => {
    let body: Record<string, unknown> | undefined
    const image = await transparentPng()
    const url = await endpoint((request, response) => {
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
                b64_json: image.toString('base64'),
                size: '1024x1024',
                output_format: 'png',
                background: 'transparent',
              },
            ],
          }),
        )
      })
    })
    process.env.MQMZ_VOLCANO_IMAGES_URL = url
    const photo = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 200, g: 190, b: 180 },
      },
    })
      .jpeg()
      .toBuffer()
    const result = await generatePetAsset({
      apiKey: 'ark-test',
      model: 'doubao-seedream-5-0-flash-20260101',
      prompt: '柔和水彩宠物',
      references: [photo],
    })
    expect(body).toMatchObject({
      background: 'transparent',
      output_format: 'png',
      response_format: 'b64_json',
      size: '1K',
      watermark: false,
    })
    expect(String(body?.image)).toMatch(/^data:image\/jpeg;base64,/)
    expect(result.background).toBe('transparent')
    const metadata = await sharp(result.normalized).metadata()
    expect(metadata).toMatchObject({ width: 448, height: 448, hasAlpha: true })
  })

  test('rejects an opaque generation result', async () => {
    const opaque = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 200, g: 190, b: 180 },
      },
    })
      .png()
      .toBuffer()
    const url = await endpoint((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          data: [{ b64_json: opaque.toString('base64') }],
        }),
      )
    })
    process.env.MQMZ_VOLCANO_IMAGES_URL = url
    await expect(
      generatePetAsset({
        apiKey: 'ark-test',
        model: 'doubao-seedream-5-0-flash-20260101',
        prompt: '柔和水彩宠物',
      }),
    ).rejects.toThrow('真实透明通道')
  })
})
