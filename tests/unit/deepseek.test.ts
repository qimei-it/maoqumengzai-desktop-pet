import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'
import {
  requestCompletion,
  testDeepSeekConnection,
} from '../../src/shared/deepseek'

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
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  path = '/chat/completions',
): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no address')
  return `http://127.0.0.1:${address.port}${path}`
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => resolve(body))
  })
}

describe('DeepSeek chat completions', () => {
  test('sends the expected request and returns the answer', async () => {
    let captured: {
      authorization?: string
      body: Record<string, unknown>
    } = { body: {} }
    const url = await endpoint(async (request, response) => {
      captured = {
        authorization: request.headers.authorization,
        body: JSON.parse(await readBody(request)),
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [{ message: { content: '  这是回答。  ' } }],
        }),
      )
    })

    const answer = await requestCompletion(
      'sk-test-key',
      [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '你好' },
      ],
      { endpoint: url },
    )

    expect(answer).toBe('这是回答。')
    expect(captured.authorization).toBe('Bearer sk-test-key')
    expect(captured.body).toMatchObject({
      model: 'deepseek-flash',
      stream: false,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '你好' },
      ],
    })
  })

  test('uses the selected model', async () => {
    let body: Record<string, unknown> = {}
    const url = await endpoint(async (request, response) => {
      body = JSON.parse(await readBody(request))
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({ choices: [{ message: { content: '来自 Pro' } }] }),
      )
    })
    await requestCompletion(
      'sk-test',
      [{ role: 'user', content: 'hi' }],
      { endpoint: url, model: 'deepseek-v4-pro' },
    )
    expect(body.model).toBe('deepseek-v4-pro')
  })

  test('measures the models endpoint latency', async () => {
    let authorization: string | undefined
    const url = await endpoint((request, response) => {
      authorization = request.headers.authorization
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ object: 'list', data: [] }))
    }, '/models')
    const latency = await testDeepSeekConnection('sk-test', { endpoint: url })
    expect(authorization).toBe('Bearer sk-test')
    expect(latency).toBeGreaterThanOrEqual(0)
  })

  test('reports an invalid key during connection test', async () => {
    const url = await endpoint((_request, response) => {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end('{}')
    }, '/models')
    await expect(
      testDeepSeekConnection('sk-bad', { endpoint: url }),
    ).rejects.toThrow('API Key 无效')
  })

  test('maps an invalid key to a friendly message', async () => {
    const url = await endpoint((_request, response) => {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'invalid key' } }))
    })
    await expect(
      requestCompletion('sk-bad', [{ role: 'user', content: 'hi' }], {
        endpoint: url,
      }),
    ).rejects.toThrow('API Key 无效')
  })

  test('reports insufficient balance and server failures', async () => {
    const balance = await endpoint((_request, response) => {
      response.writeHead(402)
      response.end('{}')
    })
    await expect(
      requestCompletion('sk-test', [{ role: 'user', content: 'hi' }], {
        endpoint: balance,
      }),
    ).rejects.toThrow('余额不足')

    const down = await endpoint((_request, response) => {
      response.writeHead(503)
      response.end('{}')
    })
    await expect(
      requestCompletion('sk-test', [{ role: 'user', content: 'hi' }], {
        endpoint: down,
      }),
    ).rejects.toThrow('暂时不可用')
  })

  test('an empty completion becomes a retry hint', async () => {
    const url = await endpoint((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ choices: [{ message: { content: '' } }] }))
    })
    await expect(
      requestCompletion('sk-test', [{ role: 'user', content: 'hi' }], {
        endpoint: url,
      }),
    ).rejects.toThrow('没有返回内容')
  })
})
