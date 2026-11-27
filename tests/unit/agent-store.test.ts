import { expect, test } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadAgentStore,
  maxAgentProjects,
  maxAgentSessions,
  saveAgentStore,
  type StoredProject,
  type StoredSession,
} from '../../src/main/agent/store'

function session(
  index: number,
  projectId: string | null = null,
): StoredSession {
  return {
    id: `session-${index}`,
    title: `会话 ${index}`,
    mode: 'build',
    model: 'deepseek-flash',
    reasoning: 'high',
    workspace: null,
    projectId,
    pinned: false,
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

function project(index: number): StoredProject {
  return {
    id: `project-${index}`,
    name: `项目 ${index}`,
    workspace: `/tmp/project-${index}`,
    pinned: false,
    createdAt: index,
  }
}

test('keeps archived sessions and project tool policies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-store-policy-'))
  const path = join(directory, 'agent.json')
  await saveAgentStore(path, {
    sessions: [{ ...session(1), archived: true }],
    projects: [{ ...project(1), toolPolicy: 'allow' }],
  })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions[0].archived).toBe(true)
  expect(loaded.projects[0].toolPolicy).toBe('allow')
})

test('migrates generation-only session models to a text model', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-store-model-'))
  const path = join(directory, 'agent.json')
  await saveAgentStore(path, {
    sessions: [{ ...session(1), model: 'MiniMax-H3-Image' }],
    projects: [],
  })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions[0].model).toBe('deepseek-flash')
})

test('preserves sessions that used removed Ark models and migrates their selection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-store-removed-ark-'))
  const path = join(directory, 'agent.json')
  const removed = [
    ['deepseek-v4-pro-260425', 'deepseek-v4-pro-ga-260813'],
    ['doubao-seed-2-0-code-preview-260215', 'doubao-seed-2-1-pro-260915'],
    ['doubao-seed-2-0-pro-260215', 'doubao-seed-2-1-pro-260915'],
  ] as const
  await writeFile(path, JSON.stringify({
    version: 2, projects: [],
    sessions: removed.map(([model], i) => ({ ...session(i), model, selectedModel: model })),
  }))
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions).toHaveLength(3)
  for (const [index, [, replacement]] of removed.entries()) {
    expect(loaded.sessions[index]).toMatchObject({ model: replacement, selectedModel: replacement })
    expect(loaded.sessions[index].history).toEqual([{ role: 'user', content: '你好' }])
  }
})

test('restores per-session generation model overrides', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-store-generation-'))
  const path = join(directory, 'agent.json')
  await saveAgentStore(path, {
    sessions: [
      {
        ...session(1),
        selectedModel: 'Doubao-Seedream-5.5',
        imageModel: 'Doubao-Seedream-5.5',
        videoModel: 'MiniMax-H3',
        audioModel: 'speech-2.8-turbo',
      },
    ],
    projects: [],
  })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions[0]).toMatchObject({
    selectedModel: 'Doubao-Seedream-5.5',
    imageModel: 'Doubao-Seedream-5.5',
    videoModel: 'MiniMax-H3',
    audioModel: 'speech-2.8-turbo',
  })
})

test('drops generation overrides with the wrong model kind', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-store-generation-'))
  const path = join(directory, 'agent.json')
  await saveAgentStore(path, {
    sessions: [
      {
        ...session(1),
        imageModel: 'MiniMax-M3',
        videoModel: 'speech-2.8-hd',
        audioModel: 'MiniMax-H3',
      },
    ],
    projects: [],
  })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions[0]).not.toHaveProperty('imageModel')
  expect(loaded.sessions[0]).not.toHaveProperty('videoModel')
  expect(loaded.sessions[0]).not.toHaveProperty('audioModel')
})

test('saves and restores projects and sessions with usage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  await saveAgentStore(path, {
    sessions: [session(1, 'project-1'), session(2)],
    projects: [project(1)],
  })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions).toHaveLength(2)
  expect(loaded.projects).toHaveLength(1)
  expect(loaded.sessions[0].projectId).toBe('project-1')
  expect(loaded.sessions[0].title).toBe('会话 1')
  expect(loaded.sessions[0].usage).toEqual({ input: 1, output: 2 })
  expect(loaded.sessions[0].ui[0].parts[0]).toEqual({
    type: 'text',
    text: '你好',
  })
  expect(loaded.projects[0].name).toBe('项目 1')
})

test('caps stored sessions and projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  const sessions = Array.from(
    { length: maxAgentSessions + 5 },
    (_, index) => session(index),
  )
  const projects = Array.from(
    { length: maxAgentProjects + 2 },
    (_, index) => project(index),
  )
  await saveAgentStore(path, { sessions, projects })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions).toHaveLength(maxAgentSessions)
  expect(loaded.projects).toHaveLength(maxAgentProjects)
  const raw = JSON.parse(await readFile(path, 'utf8')) as {
    sessions: unknown[]
    projects: unknown[]
  }
  expect(raw.sessions).toHaveLength(maxAgentSessions)
  expect(raw.projects).toHaveLength(maxAgentProjects)
})

test('ignores corrupt or unknown files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const corrupt = join(directory, 'corrupt.json')
  await writeFile(corrupt, '{not json')
  expect(await loadAgentStore(corrupt)).toEqual({
    sessions: [],
    projects: [],
  })

  const unknown = join(directory, 'unknown.json')
  await writeFile(unknown, JSON.stringify({ version: 99, sessions: [] }))
  expect(await loadAgentStore(unknown)).toEqual({
    sessions: [],
    projects: [],
  })

  expect(await loadAgentStore(join(directory, 'missing.json'))).toEqual({
    sessions: [],
    projects: [],
  })
})

test('backs up a damaged store instead of overwriting it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  await writeFile(path, '{broken')
  const backups: string[] = []
  expect(await loadAgentStore(path, (backup) => backups.push(backup))).toEqual({
    sessions: [],
    projects: [],
  })
  expect(backups).toHaveLength(1)
  expect(await readFile(backups[0]!, 'utf8')).toBe('{broken')

  // A missing file is normal first-run state and must not create a backup.
  const missingBackups: string[] = []
  await loadAgentStore(join(directory, 'missing.json'), (backup) =>
    missingBackups.push(backup),
  )
  expect(missingBackups).toEqual([])
})

test('filters invalid rows without dropping valid ones', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  await writeFile(
    path,
    JSON.stringify({
      version: 2,
      projects: [
        { id: '', name: 'bad', workspace: '/tmp/a' },
        { id: 'project-7', name: '', workspace: '/tmp/b' },
        project(7),
      ],
      sessions: [
        { id: '', title: 'bad' },
        {
          id: 'orphan',
          title: 'orphan',
          mode: 'build',
          model: 'deepseek-flash',
          projectId: 'missing',
          ui: [],
          history: [],
        },
        session(7, 'project-7'),
      ],
    }),
  )
  const loaded = await loadAgentStore(path)
  expect(loaded.projects).toHaveLength(1)
  expect(loaded.projects[0].id).toBe('project-7')
  expect(loaded.sessions).toHaveLength(2)
  expect(
    loaded.sessions.find((item) => item.id === 'orphan')?.projectId,
  ).toBeNull()
  expect(loaded.sessions.find((item) => item.id === 'session-7')?.projectId).toBe(
    'project-7',
  )
})

test('persists saveable attachment and artifact sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  const stored = session(1)
  stored.sources = [
    {
      id: 'source-1',
      name: 'notes.md',
      path: '/tmp/notes.md',
      kind: 'attachment',
    },
    {
      id: 'source-2',
      name: 'converted.pdf',
      path: '/tmp/converted.pdf',
      kind: 'artifact',
    },
  ]
  await saveAgentStore(path, { sessions: [stored], projects: [] })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions[0].sources).toEqual(stored.sources)
})

test('persists uploaded file references', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  const stored = session(1)
  stored.files = [
    {
      id: 'file-api-1',
      name: 'photo.png',
      path: '/tmp/photo.png',
      purpose: 'user_data',
      expiresAt: 1_800_000_000_000,
    },
  ]
  await saveAgentStore(path, { sessions: [stored], projects: [] })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions[0].files).toEqual(stored.files)
})

test('filters invalid file references without dropping valid ones', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  const stored = session(1)
  stored.files = [
    {
      id: 'file-api-1',
      name: 'photo.png',
      path: '/tmp/photo.png',
      purpose: 'user_data',
      expiresAt: null,
    },
    {
      id: '',
      name: 'bad',
      path: '/tmp/bad',
      purpose: 'user_data',
      expiresAt: null,
    } as never,
  ]
  await saveAgentStore(path, { sessions: [stored], projects: [] })
  const loaded = await loadAgentStore(path)
  expect(loaded.sessions[0].files).toHaveLength(1)
  expect(loaded.sessions[0].files?.[0].id).toBe('file-api-1')
})

test('migrates version 1 workspaces into projects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-store-'))
  const path = join(directory, 'agent.json')
  const first = { ...session(1), workspace: '/tmp/alpha' }
  const second = { ...session(2), workspace: '/tmp/alpha' }
  const third = { ...session(3) }
  await writeFile(
    path,
    JSON.stringify({ version: 1, sessions: [first, second, third] }),
  )
  const loaded = await loadAgentStore(path)
  expect(loaded.projects).toHaveLength(1)
  expect(loaded.projects[0].workspace).toBe('/tmp/alpha')
  expect(loaded.sessions[0].projectId).toBe(loaded.projects[0].id)
  expect(loaded.sessions[1].projectId).toBe(loaded.projects[0].id)
  expect(loaded.sessions[2].projectId).toBeNull()
})
