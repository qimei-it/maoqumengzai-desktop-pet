import { createServer, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'
import { listMiniMaxModels, testMiniMaxConnection } from '../../src/shared/minimax'

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
  handler: (response: ServerResponse) => void,
): Promise<string> {
  const server = createServer((_request, response) => handler(response))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no port')
  return `http://127.0.0.1:${address.port}/v1/models`
}

describe('MiniMax provider', () => {
  test('lists models and measures latency', async () => {
    const url = await endpoint((response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          object: 'list',
          data: [
            { id: 'MiniMax-M3.1-Flash' },
            { id: 'MiniMax-M3' },
          ],
        }),
      )
    })
    await expect(listMiniMaxModels('sk-test', { endpoint: url })).resolves.toEqual([
      'MiniMax-M3.1-Flash',
      'MiniMax-M3',
    ])
    await expect(
      testMiniMaxConnection('sk-test', { endpoint: url }),
    ).resolves.toBeGreaterThanOrEqual(0)
  })

  test('reports an invalid key', async () => {
    const url = await endpoint((response) => {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end('{}')
    })
    await expect(
      listMiniMaxModels('sk-bad', { endpoint: url }),
    ).rejects.toThrow('MiniMax API Key 无效')
  })
})
