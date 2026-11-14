import { expect, test } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadAgentStore,
  maxAgentSessions,
  saveAgentStore,
  type StoredSession,
} from '../../src/main/agent/store'

function session(index: number): StoredSession {
  return {
    id: `session-${index}`,
    title: `会话 ${index}`,
    mode: 'build',
    model: 'deepseek-flash',
    workspace: null,
    createdAt: index,
    updatedAt: index,
    ui: [
      {
        id: `message-${index}`,
        role: 'user',
        parts: [{ type: 'text', text: '你好' }],
      },
    ],
    history: [{ role: 'user', content: '你好' }],
    usage: { input: 1, output: 2 },
  }
}

test('saves and restores sessions with usage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  await saveAgentStore(path, [session(1), session(2)])
  const loaded = await loadAgentStore(path)
  expect(loaded).toHaveLength(2)
  expect(loaded[0].title).toBe('会话 1')
  expect(loaded[0].usage).toEqual({ input: 1, output: 2 })
  expect(loaded[0].ui[0].parts[0]).toEqual({ type: 'text', text: '你好' })
})

test('caps stored sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  const many = Array.from({ length: maxAgentSessions + 5 }, (_, index) =>
    session(index),
  )
  await saveAgentStore(path, many)
  const loaded = await loadAgentStore(path)
  expect(loaded).toHaveLength(maxAgentSessions)
  const raw = JSON.parse(await readFile(path, 'utf8')) as {
    sessions: unknown[]
  }
  expect(raw.sessions).toHaveLength(maxAgentSessions)
})

test('ignores corrupt or unknown files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const corrupt = join(directory, 'corrupt.json')
  await writeFile(corrupt, '{not json')
  expect(await loadAgentStore(corrupt)).toEqual([])

  const unknown = join(directory, 'unknown.json')
  await writeFile(unknown, JSON.stringify({ version: 99, sessions: [] }))
  expect(await loadAgentStore(unknown)).toEqual([])

  expect(await loadAgentStore(join(directory, 'missing.json'))).toEqual([])
})

test('filters invalid sessions without dropping valid ones', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      sessions: [
        { id: '', title: 'bad' },
        { id: 'ok', title: 'ok', mode: 'unknown', model: 'deepseek-flash', ui: [], history: [] },
        session(7),
      ],
    }),
  )
  const loaded = await loadAgentStore(path)
  expect(loaded).toHaveLength(1)
  expect(loaded[0].id).toBe('session-7')
})
