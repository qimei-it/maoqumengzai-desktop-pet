import { describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  createAgentRuntime,
  type AgentSkillPrompt,
} from '../../src/main/agent/runtime'
import { saveAgentStore } from '../../src/main/agent/store'
import type {
  StreamOptions,
  StreamResult,
} from '../../src/main/agent/provider'
import { makeServices, shelfFileId } from './agent-fixtures'
import { defaultSettings } from '../../src/shared/settings'

function scripted(results: StreamResult[]) {
  let index = 0
  const calls: string[] = []
  const stream = async (
    _key: string,
    options: StreamOptions,
  ): Promise<StreamResult> => {
    calls.push(options.messages.at(-1)?.role ?? '')
    const next = results[index++] ?? { text: '完成', toolCalls: [] }
    if (next.text) options.onText?.(next.text)
    return next
  }
  return { stream, calls }
}

async function waitFor(check: () => boolean, timeout = 3000): Promise<void> {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('waitFor timeout')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function makeRuntime(
  results: StreamResult[],
  calls: string[] = [],
  override?: {
    stream?: typeof import('../../src/main/agent/provider').streamChat
    titleStream?: typeof import('../../src/main/agent/provider').streamChat
    files?: import('../../src/main/agent/runtime').AgentFilesClient
    loadSkills?: () => Promise<AgentSkillPrompt[]>
    readSkillFile?: (name: string, path: string) => Promise<string>
    getSkillAdmin?: () => import('../../src/main/agent/skill-admin').SkillAdmin
    getKey?: () => string | undefined
    getMiniMaxKey?: () => string | undefined
    getVolcanoKey?: () => string | undefined
    getVolcanoModels?: () => string[] | undefined
    getPetProfile?: () => import('../../src/shared/agent').AgentPetProfile
    volcanoStream?: typeof import('../../src/main/agent/volcano-provider').streamVolcanoChat
    seedStore?: (path: string) => Promise<void>
  },
) {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-runtime-'))
  const storePath = join(directory, 'agent.json')
  const script = scripted(results)
  const runtime = createAgentRuntime({
    services: makeServices(calls),
    storePath,
    getKey: override?.getKey ?? (() => 'test-key'),
    getSettings: () => ({ ...defaultSettings }),
    getPetProfile:
      override?.getPetProfile ??
      (() => ({ id: 'ragdoll', name: '麻薯' })),
    broadcast: () => {},
    stream: override?.stream ?? script.stream,
    ...(override?.titleStream ? { titleStream: override.titleStream } : {}),
    ...(override?.getMiniMaxKey
      ? { getMiniMaxKey: override.getMiniMaxKey }
      : {}),
    ...(override?.getVolcanoKey
      ? { getVolcanoKey: override.getVolcanoKey }
      : {}),
    ...(override?.getVolcanoModels
      ? { getVolcanoModels: override.getVolcanoModels }
      : {}),
    ...(override?.volcanoStream
      ? { volcanoStream: override.volcanoStream }
      : {}),
    ...(override?.files ? { files: override.files } : {}),
    ...(override?.loadSkills ? { loadSkills: override.loadSkills } : {}),
    ...(override?.readSkillFile
      ? { readSkillFile: override.readSkillFile }
      : {}),
    ...(override?.getSkillAdmin
      ? { getSkillAdmin: override.getSkillAdmin }
      : {}),
  })
  if (override?.seedStore) await override.seedStore(storePath)
  await runtime.load()
  runtime.newSession()
  return { runtime, storePath, streamCalls: script.calls }
}

function toolParts(runtime: ReturnType<typeof createAgentRuntime>) {
  return runtime
    .state()
    .messages.flatMap((message) => message.parts)
    .filter((part) => part.type === 'tool')
}

describe('agent runtime', () => {
  test('runs a tool after approval and continues the turn', async () => {
    const calls: string[] = []
    const { runtime } = await makeRuntime(
      [
        {
          text: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'todo_create',
              arguments: '{"text":"买猫粮"}',
            },
          ],
        },
        { text: '已经建好了。', toolCalls: [] },
      ],
      calls,
    )
    const running = runtime.send('帮我建个待办')
    await waitFor(() => runtime.state().approval !== null)
    const approval = runtime.state().approval!
    expect(approval.name).toBe('todo_create')
    runtime.approve(approval.id)
    await running

    expect(calls).toContain('addTodo:买猫粮')
    expect(runtime.state().approval).toBeNull()
    expect(runtime.state().busy).toBe(false)
    const tools = toolParts(runtime)
    expect(tools[0].type === 'tool' ? tools[0].status : '').toBe('done')
    const text = runtime
      .state()
      .messages.flatMap((message) => message.parts)
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
    expect(text).toContain('已经建好了')
  })

  test('allows the same tool for the rest of the session', async () => {
    const calls: string[] = []
    const copyArguments = JSON.stringify({ fileId: shelfFileId })
    const { runtime } = await makeRuntime(
      [
        {
          text: '',
          toolCalls: [
            { id: 'call-1', name: 'file_save_copy', arguments: copyArguments },
          ],
        },
        { text: '完成', toolCalls: [] },
        {
          text: '',
          toolCalls: [
            { id: 'call-2', name: 'file_save_copy', arguments: copyArguments },
          ],
        },
        { text: '完成', toolCalls: [] },
      ],
      calls,
    )
    const first = runtime.send('另存一份')
    await waitFor(() => runtime.state().approval !== null)
    runtime.approveSame(runtime.state().approval!.id)
    await first
    expect(runtime.state().approval).toBeNull()

    const second = runtime.send('再另存一份')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(runtime.state().approval).toBeNull()
    await second
    expect(calls.filter((call) => call === 'shelf:saveCopy')).toHaveLength(2)
  })

  test('denial skips the service and reports it to the model', async () => {
    const calls: string[] = []
    const { runtime } = await makeRuntime(
      [
        {
          text: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'todo_create',
              arguments: '{"text":"不要创建"}',
            },
          ],
        },
        { text: '好的，不创建。', toolCalls: [] },
      ],
      calls,
    )
    const running = runtime.send('建个待办')
    await waitFor(() => runtime.state().approval !== null)
    runtime.deny(runtime.state().approval!.id)
    await running
    expect(calls.some((call) => call.startsWith('addTodo:'))).toBe(false)
    const tools = toolParts(runtime)
    expect(tools[0].type === 'tool' ? tools[0].status : '').toBe('denied')
  })

  test('plan mode never asks for a write tool', async () => {
    const calls: string[] = []
    const { runtime } = await makeRuntime(
      [
        {
          text: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'todo_create',
              arguments: '{"text":"计划模式"}',
            },
          ],
        },
        { text: '计划模式下不能写入。', toolCalls: [] },
      ],
      calls,
    )
    runtime.setMode('plan')
    await runtime.send('建个待办')
    expect(calls.some((call) => call.startsWith('addTodo:'))).toBe(false)
    expect(runtime.state().approval).toBeNull()
    const tools = toolParts(runtime)
    expect(tools[0].type === 'tool' ? tools[0].status : '').toBe('denied')
  })

  test('unknown tools are reported instead of crashing', async () => {
    const { runtime } = await makeRuntime([
      {
        text: '',
        toolCalls: [{ id: 'call-x', name: 'nope', arguments: '{}' }],
      },
      { text: '结束。', toolCalls: [] },
    ])
    await runtime.send('做点什么')
    const tools = toolParts(runtime)
    expect(tools[0].type === 'tool' ? tools[0].status : '').toBe('error')
    expect(tools[0].type === 'tool' ? tools[0].output : '').toContain(
      '未知工具',
    )
  })

  test('exports a session as Markdown with tools and attachments', async () => {
    const { runtime } = await makeRuntime([
      {
        text: '',
        toolCalls: [
          {
            id: 'call-todo',
            name: 'todo_create',
            arguments: JSON.stringify({ text: '买猫粮' }),
          },
        ],
      },
      { text: '好的。', toolCalls: [] },
    ])
    const running = runtime.send('创建待办', [
      {
        id: 'attachment-export',
        name: 'notes.md',
        size: 12,
        kind: 'text',
        mode: 'text',
        needsModelUpload: false,
        truncated: false,
        sourcePath: '/tmp/notes.md',
        text: '附件内容',
      },
    ])
    await waitFor(() => runtime.state().approval !== null)
    runtime.approve(runtime.state().approval!.id)
    await running
    const exported = runtime.sessionMarkdown(runtime.state().sessionId!)
    expect(exported).toBeTruthy()
    expect(exported!.title).toContain('创建待办')
    expect(exported!.text).toContain('## 用户')
    expect(exported!.text).toContain('### 附件')
    expect(exported!.text).toContain('- notes.md')
    expect(exported!.text).toContain('工具：新建待办')
    expect(exported!.text).toContain('## 助手')
  })

  test('records tool artifacts and resolves their source path', async () => {
    const { runtime } = await makeRuntime([
      {
        text: '',
        toolCalls: [
          {
            id: 'call-save',
            name: 'file_save_copy',
            arguments: JSON.stringify({ fileId: shelfFileId }),
          },
        ],
      },
      { text: '已另存。', toolCalls: [] },
    ])
    const running = runtime.send('另存一份')
    await waitFor(() => runtime.state().approval !== null)
    runtime.approve(runtime.state().approval!.id)
    await running
    const tool = toolParts(runtime)[0]
    expect(tool.type).toBe('tool')
    if (tool.type !== 'tool') return
    expect(tool.artifacts?.[0]).toMatchObject({ name: 'copy.txt' })
    const source = runtime.source(tool.artifacts![0].id)
    expect(source).toEqual({ name: 'copy.txt', path: '/tmp/copy.txt' })
  })

  test('cancel stops a running turn', async () => {
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          )
        }),
    })
    const running = runtime.send('一直等着')
    await waitFor(() => runtime.state().busy)
    runtime.cancel()
    await running
    expect(runtime.state().busy).toBe(false)
    const text = runtime
      .state()
      .messages.flatMap((message) => message.parts)
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
    expect(text).toContain('已停止')
  })

  test('rejects a second send while busy', async () => {
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          )
        }),
    })
    const running = runtime.send('第一条')
    await waitFor(() => runtime.state().busy)
    await expect(runtime.send('第二条')).rejects.toThrow('正在执行')
    runtime.cancel()
    await running
  })

  test('switching sessions cancels the running turn', async () => {
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          )
        }),
    })
    const first = runtime.state().sessionId!
    runtime.newSession()
    const second = runtime.state().sessionId!
    expect(second).not.toBe(first)
    const running = runtime.send('在第二个会话里等')
    await waitFor(() => runtime.state().busy)
    runtime.select(first)
    await running
    expect(runtime.state().busy).toBe(false)
    expect(runtime.state().sessionId).toBe(first)
  })

  test('persists and restores sessions', async () => {
    const calls: string[] = []
    const { runtime, storePath } = await makeRuntime(
      [{ text: '你好。', toolCalls: [] }],
      calls,
    )
    await runtime.send('第一句')
    await runtime.flush()

    const restored = createAgentRuntime({
      services: makeServices(calls),
      storePath,
      getKey: () => 'test-key',
      getSettings: () => ({ ...defaultSettings }),
      getPetProfile: () => ({ id: 'ragdoll', name: '麻薯' }),
      broadcast: () => {},
      stream: scripted([]).stream,
    })
    await restored.load()
    const state = restored.state()
    expect(state.sessions.length).toBe(1)
    expect(state.messages.length).toBe(2)
    expect(state.messages[0].role).toBe('user')
  })

  test('sends text attachments as context and keeps their names', async () => {
    let captured: StreamOptions['messages'] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        captured = options.messages
        options.onText?.('收到')
        return { text: '收到', toolCalls: [] }
      },
    })
    await runtime.send('看看附件', [
      {
        id: 'attachment-1',
        name: 'notes.md',
        size: 24,
        kind: 'text',
        mode: 'text',
        needsModelUpload: false,
        truncated: false,
        text: '# 标题\n这里是附件内容',
      },
    ])

    const user = captured.find((message) => message.role === 'user')
    expect(user?.content).toContain('<attachment name="notes.md">')
    expect(user?.content).toContain('这里是附件内容')
    const message = runtime
      .state()
      .messages.find((item) => item.role === 'user')
    expect(message?.attachments).toEqual([
      { id: 'attachment-1', name: 'notes.md', size: 24 },
    ])
  })

  test('uploads image attachments and keeps file blocks in history', async () => {
    let captured: StreamOptions['messages'] = []
    let uploaded = 0
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        captured = options.messages
        options.onText?.('看到了')
        return { text: '看到了', toolCalls: [] }
      },
      files: {
        upload: async () => {
          uploaded += 1
          return { id: 'file-api-image', expiresAt: Date.now() + 86_400_000 }
        },
        transcribe: async () => '',
      },
    })
    await runtime.send('看看这张图', [
      {
        id: 'attachment-image',
        name: 'photo.png',
        size: 128,
        kind: 'image',
        mode: 'vision',
        needsModelUpload: true,
        truncated: false,
        upload: [{ path: '/tmp/photo.png', purpose: 'user_data' }],
      },
    ])

    expect(uploaded).toBe(1)
    const user = captured.find((message) => message.role === 'user')
    expect(Array.isArray(user?.content)).toBe(true)
    if (Array.isArray(user?.content)) {
      expect(user.content[0]).toMatchObject({ type: 'text' })
      expect(user.content[1]).toEqual({
        type: 'file',
        file_id: 'file-api-image',
      })
    }
  })

  test('turns audio attachments into transcript text', async () => {
    let captured: StreamOptions['messages'] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        captured = options.messages
        return { text: '听完了', toolCalls: [] }
      },
      files: {
        upload: async () => ({ id: 'unused', expiresAt: null }),
        transcribe: async () => '这是语音内容。',
      },
    })
    await runtime.send('听听录音', [
      {
        id: 'attachment-audio',
        name: 'voice.wav',
        size: 1024,
        kind: 'audio',
        mode: 'audio',
        needsModelUpload: false,
        truncated: false,
        audio: ['/tmp/voice.wav'],
      },
    ])
    const user = captured.find((message) => message.role === 'user')
    expect(typeof user?.content).toBe('string')
    expect(user?.content).toContain('<transcript name="voice.wav">')
    expect(user?.content).toContain('这是语音内容。')
  })

  test('blocks upload-required attachments on the Pro model', async () => {
    const { runtime } = await makeRuntime([], [])
    runtime.setModel('deepseek-v4-pro')
    await expect(
      runtime.send('看看这张图', [
        {
          id: 'attachment-image',
          name: 'photo.png',
          size: 128,
          kind: 'image',
          mode: 'vision',
          needsModelUpload: true,
          truncated: false,
          upload: [{ path: '/tmp/photo.png', purpose: 'user_data' }],
        },
      ]),
    ).rejects.toThrow('当前模型只支持文字附件')
  })

  test('keeps one selected model and falls back to the default chat model', async () => {
    const { runtime } = await makeRuntime([], [])
    expect(runtime.state().selectedModel).toBe(
      defaultSettings.agentDefaultChatModel,
    )
    runtime.setGenerationModel('image', 'MiniMax-H3-Image')
    let state = runtime.state()
    expect(state.selectedModel).toBe('MiniMax-H3-Image')
    expect(state.imageModel).toBe('MiniMax-H3-Image')
    expect(state.model).toBe(defaultSettings.agentDefaultChatModel)
    runtime.setModel('deepseek-v4-pro')
    state = runtime.state()
    expect(state.selectedModel).toBe('deepseek-v4-pro')
    expect(state.model).toBe('deepseek-v4-pro')
    expect(state.imageModel).toBe('MiniMax-H3-Image')
  })

  test('starts on the Volcano text model when only Ark is configured', async () => {
    const keys: {
      deepseek?: string
      volcano?: string
    } = { volcano: 'ark-key' }
    const { runtime } = await makeRuntime([], [], {
      getKey: () => keys.deepseek,
      getVolcanoKey: () => keys.volcano,
    })
    let state = runtime.state()
    expect(state.configured).toBe(true)
    expect(state.model).toBe('doubao-seed-2-1-pro-260915')
    expect(state.selectedModel).toBe('doubao-seed-2-1-pro-260915')
    keys.deepseek = 'ds-key'
    runtime.syncModelWithKeys()
    expect(runtime.state().model).toBe('doubao-seed-2-1-pro-260915')
    keys.volcano = undefined
    runtime.syncModelWithKeys()
    state = runtime.state()
    expect(state.model).toBe('deepseek-flash')
    expect(state.selectedModel).toBe('deepseek-flash')
  })

  test('uses only Ark models the current key can call', async () => {
    let listed: string[] | undefined = ['doubao-seed-2-0-mini-260428']
    const { runtime } = await makeRuntime([], [], {
      getKey: () => undefined,
      getVolcanoKey: () => 'ark-key',
      getVolcanoModels: () => listed,
    })
    let state = runtime.state()
    expect(state.configured).toBe(true)
    expect(state.model).toBe('doubao-seed-2-0-mini-260428')
    listed = ['doubao-seed-2-1-lite-260915']
    runtime.syncModelWithKeys()
    state = runtime.state()
    expect(state.model).toBe('doubao-seed-2-1-lite-260915')
    expect(state.selectedModel).toBe('doubao-seed-2-1-lite-260915')
    // An unknown list (fetch failed) keeps the current choice.
    listed = undefined
    runtime.syncModelWithKeys()
    expect(runtime.state().model).toBe('doubao-seed-2-1-lite-260915')
  })

  test('routes text turns to the Volcano stream', async () => {    let arkCalls = 0
    const { runtime } = await makeRuntime([], [], {
      getKey: () => undefined,
      getVolcanoKey: () => 'ark-key',
      volcanoStream: async (_key, options) => {
        arkCalls += 1
        options.onText?.('你好')
        return { text: '你好', toolCalls: [] }
      },
    })
    await runtime.send('你好')
    expect(arkCalls).toBe(1)
    expect(runtime.state().error).toBeUndefined()
    const text = runtime
      .state()
      .messages.flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === 'text' ? [part.text] : [],
        ),
      )
      .join('')
    expect(text).toContain('你好')
  })

  test('includes the pet species in the system prompt', async () => {
    let system = ''
    const { runtime } = await makeRuntime([], [], {
      getPetProfile: () => ({ id: 'pet-1', name: '团子', species: '狗' }),
      stream: async (_key, options) => {
        const first = options.messages[0]
        system = typeof first.content === 'string' ? first.content : ''
        return { text: '好', toolCalls: [] }
      },
    })
    await runtime.send('你好')
    expect(system).toContain('名字：团子')
    expect(system).toContain('种类：狗')
  })

  test('includes the custom pet prompt inside the personality section', async () => {
    let system = ''
    const { runtime } = await makeRuntime([], [], {
      getPetProfile: () => ({
        id: 'pet-1',
        name: '团子',
        species: '狗',
        prompt: '用朋友的口吻陪我聊天',
      }),
      stream: async (_key, options) => {
        const first = options.messages[0]
        system = typeof first.content === 'string' ? first.content : ''
        return { text: '好', toolCalls: [] }
      },
    })
    await runtime.send('你好')
    const promptAt = system.indexOf('用朋友的口吻陪我聊天')
    expect(promptAt).toBeGreaterThan(-1)
    expect(system.indexOf('名字：团子')).toBeLessThan(promptAt)
    expect(promptAt).toBeLessThan(
      system.indexOf('不得改变任务判断、工具选择、操作安全规则和事实陈述'),
    )
  })

  test('relocates stored media paths when the attachment directory moves', async () => {
    const base = await mkdtemp(join(tmpdir(), 'mqmz-relocate-'))
    const oldDir = join(base, 'old')
    const newDir = join(base, 'new')
    const oldPath = join(oldDir, '2026-11-16', 'seed', 'cat.png')
    await mkdir(dirname(oldPath), { recursive: true })
    await writeFile(oldPath, 'img')
    const session = {
      id: 'seed-session',
      title: '旧会话',
      mode: 'build' as const,
      model: 'deepseek-flash' as const,
      reasoning: 'high' as const,
      workspace: null,
      projectId: null,
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
      ui: [
        {
          id: 'msg',
          role: 'assistant' as const,
          parts: [
            {
              type: 'media' as const,
              status: 'done' as const,
              items: [
                {
                  id: 'media-id',
                  name: 'cat.png',
                  kind: 'image' as const,
                  path: oldPath,
                  directory: dirname(oldPath),
                },
              ],
            },
          ],
        },
      ],
      history: [],
      sources: [
        {
          id: 'media-id',
          name: 'cat.png',
          path: oldPath,
          kind: 'artifact' as const,
        },
      ],
      usage: { input: 0, output: 0 },
    }
    const { runtime } = await makeRuntime([], [], {
      seedStore: (path) =>
        saveAgentStore(path, { sessions: [session], projects: [] }),
    })
    runtime.select('seed-session')
    const mediaPath = () => {
      const part = runtime.state().messages[0]?.parts[0]
      return part?.type === 'media' ? part.items[0]?.path : undefined
    }
    expect(mediaPath()).toBe(oldPath)
    await runtime.relocateMedia(oldDir, newDir)
    const moved = join(newDir, '2026-11-16', 'seed', 'cat.png')
    expect(mediaPath()).toBe(moved)
    expect(runtime.source('media-id')?.path).toBe(moved)
    await rm(base, { recursive: true, force: true })
  })

  test('aborts a turn when an upload fails and marks the attachment', async () => {
    let streamed = false
    const { runtime } = await makeRuntime([], [], {
      stream: async () => {
        streamed = true
        return { text: '收到了', toolCalls: [] }
      },
      files: {
        upload: async () => {
          throw new Error('网络错误')
        },
        transcribe: async () => '',
      },
    })
    const attachment = {
      id: 'attachment-image',
      name: 'photo.png',
      size: 128,
      kind: 'image' as const,
      mode: 'vision' as const,
      needsModelUpload: true,
      truncated: false,
      uploadError: undefined,
      upload: [{ path: '/tmp/photo.png', purpose: 'user_data' as const }],
    }
    await runtime.send('看看这张图', [attachment])
    expect(streamed).toBe(false)
    const state = runtime.state()
    expect(state.error).toContain('上传失败')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].role).toBe('assistant')
    expect(attachment.uploadError).toContain('上传失败：网络错误')
  })

  test('sends a video to Pro as transcript without uploading frames', async () => {
    let captured: StreamOptions['messages'] = []
    let uploads = 0
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        captured = options.messages
        return { text: '看过了', toolCalls: [] }
      },
      files: {
        upload: async () => {
          uploads += 1
          return { id: 'unused', expiresAt: null }
        },
        transcribe: async () => '视频里的语音内容',
      },
    })
    runtime.setModel('deepseek-v4-pro')
    await runtime.send('看看视频', [
      {
        id: 'attachment-video',
        name: 'clip.mp4',
        size: 1024,
        kind: 'video',
        mode: 'vision',
        needsModelUpload: true,
        truncated: false,
        upload: [{ path: '/tmp/frame.jpg', purpose: 'user_data' }],
        audio: ['/tmp/audio.wav'],
      },
    ])
    expect(runtime.state().error).toBeUndefined()
    expect(uploads).toBe(0)
    const user = captured.find((message) => message.role === 'user')
    expect(user?.content).toContain('视频里的语音内容')
    expect(Array.isArray(user?.content)).toBe(false)
  })

  test('refreshes an expired uploaded file when its source still exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-runtime-refresh-'))
    const source = join(directory, 'photo.png')
    await writeFile(source, new Uint8Array([1, 2, 3]))
    const storePath = join(directory, 'agent.json')
    await writeFile(
      storePath,
      JSON.stringify({
        version: 2,
        projects: [],
        sessions: [
          {
            id: 'expired-session',
            title: '旧会话',
            mode: 'build',
            model: 'deepseek-flash',
            reasoning: 'high',
            workspace: null,
            projectId: null,
            pinned: false,
            createdAt: 1,
            updatedAt: 2,
            ui: [
              {
                id: 'u1',
                role: 'user',
                parts: [{ type: 'text', text: '之前上传的图片' }],
              },
            ],
            history: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: '之前上传的图片' },
                  { type: 'file', file_id: 'file-api-old' },
                ],
              },
            ],
            files: [
              {
                id: 'file-api-old',
                name: 'photo.png',
                path: source,
                purpose: 'user_data',
                expiresAt: Date.now() - 1000,
              },
            ],
            usage: { input: 0, output: 0 },
          },
        ],
      }),
    )
    let captured: StreamOptions['messages'] = []
    let uploads = 0
    const runtime = createAgentRuntime({
      services: makeServices(),
      storePath,
      getKey: () => 'test-key',
      getSettings: () => ({ ...defaultSettings }),
      getPetProfile: () => ({ id: 'ragdoll', name: '麻薯' }),
      broadcast: () => {},
        stream: async (_key, options) => {
        captured = options.messages
        return { text: '好了', toolCalls: [] }
      },
      files: {
        upload: async () => {
          uploads += 1
          return {
            id: 'file-api-new',
            expiresAt: Date.now() + 86_400_000,
          }
        },
        transcribe: async () => '',
      },
    })
    await runtime.load()
    await runtime.send('继续')

    expect(uploads).toBe(1)
    const firstUser = captured.find((message) => message.role === 'user')
    expect(Array.isArray(firstUser?.content)).toBe(true)
    if (Array.isArray(firstUser?.content)) {
      expect(firstUser.content[1]).toEqual({
        type: 'file',
        file_id: 'file-api-new',
      })
    }
  })

  test('prunes uploaded files that no stored message references', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-runtime-orphan-'))
    const storePath = join(directory, 'agent.json')
    const source = join(directory, 'photo.png')
    await writeFile(source, new Uint8Array([1, 2, 3]))
    const ref = (id: string) => ({
      id,
      name: 'photo.png',
      path: source,
      purpose: 'user_data',
      expiresAt: Date.now() + 86_400_000,
    })
    await writeFile(
      storePath,
      JSON.stringify({
        version: 2,
        projects: [],
        sessions: [
          {
            id: 'orphan-session',
            title: '旧会话',
            mode: 'build',
            model: 'deepseek-flash',
            reasoning: 'high',
            workspace: null,
            projectId: null,
            pinned: false,
            createdAt: 1,
            updatedAt: 2,
            ui: [],
            history: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: '看看这张图' },
                  { type: 'file', file_id: 'file-used' },
                ],
              },
            ],
            files: [ref('file-used'), ref('file-orphan')],
            usage: { input: 0, output: 0 },
          },
        ],
      }),
    )
    const removed: string[] = []
    const runtime = createAgentRuntime({
      services: makeServices(),
      storePath,
      getKey: () => 'test-key',
      getSettings: () => ({ ...defaultSettings }),
      getPetProfile: () => ({ id: 'ragdoll', name: '麻薯' }),
      broadcast: () => {},
        stream: async () => ({ text: '完成', toolCalls: [] }),
      files: {
        upload: async () => ({ id: 'unused', expiresAt: null }),
        transcribe: async () => '',
        remove: async (_key, id) => {
          removed.push(id)
        },
      },
    })
    await runtime.load()
    await runtime.flush()
    expect(removed).toEqual(['file-orphan'])
    const store = JSON.parse(await readFile(storePath, 'utf8')) as {
      sessions: Array<{ files?: Array<{ id: string }> }>
    }
    expect(store.sessions[0].files?.map((item) => item.id)).toEqual([
      'file-used',
    ])
  })

  test('deletes a removed session uploaded files from the account', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-runtime-remove-'))
    const storePath = join(directory, 'agent.json')
    const session = (id: string, fileId: string) => ({
      id,
      title: id,
      mode: 'build',
      model: 'deepseek-flash',
      reasoning: 'high',
      workspace: null,
      projectId: null,
      pinned: false,
      createdAt: 1,
      updatedAt: 2,
      ui: [],
      history: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '看看这张图' },
            { type: 'file', file_id: fileId },
          ],
        },
      ],
      files: [
        {
          id: fileId,
          name: 'photo.png',
          path: join(directory, 'photo.png'),
          purpose: 'user_data',
          expiresAt: Date.now() + 86_400_000,
        },
      ],
      usage: { input: 0, output: 0 },
    })
    await writeFile(
      storePath,
      JSON.stringify({
        version: 2,
        projects: [],
        sessions: [
          session('session-a', 'file-a'),
          session('session-b', 'file-b'),
        ],
      }),
    )
    const removed: string[] = []
    const runtime = createAgentRuntime({
      services: makeServices(),
      storePath,
      getKey: () => 'test-key',
      getSettings: () => ({ ...defaultSettings }),
      getPetProfile: () => ({ id: 'ragdoll', name: '麻薯' }),
      broadcast: () => {},
        stream: async () => ({ text: '完成', toolCalls: [] }),
      files: {
        upload: async () => ({ id: 'unused', expiresAt: null }),
        transcribe: async () => '',
        remove: async (_key, id) => {
          removed.push(id)
        },
      },
    })
    await runtime.load()
    expect(removed).toEqual([])
    runtime.remove('session-b')
    expect(removed).toEqual(['file-b'])
  })

  test('folds older turns into a compact summary and reports it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-runtime-summary-'))
    const storePath = join(directory, 'agent.json')
    const history = Array.from({ length: 70 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `第 ${index + 1} 轮：${'需要保留的历史上下文。'.repeat(500)}`,
    }))
    await writeFile(
      storePath,
      JSON.stringify({
        version: 2,
        projects: [],
        sessions: [
          {
            id: 'long-session',
            title: '长对话',
            mode: 'build',
            model: 'deepseek-flash',
            reasoning: 'high',
            workspace: null,
            projectId: null,
            pinned: false,
            createdAt: 1,
            updatedAt: 2,
            ui: [],
            history,
            usage: { input: 0, output: 0 },
          },
        ],
      }),
    )
    let captured: StreamOptions['messages'] = []
    const runtime = createAgentRuntime({
      services: makeServices(),
      storePath,
      getKey: () => 'test-key',
      getSettings: () => ({ ...defaultSettings }),
      getPetProfile: () => ({ id: 'ragdoll', name: '麻薯' }),
      broadcast: () => {},
        stream: async (_key, options) => {
        captured = options.messages
        return { text: '好的', toolCalls: [] }
      },
    })
    await runtime.load()
    await runtime.send('继续')

    const system = captured.find((message) => message.role === 'system')
    expect(system?.content).toContain('本会话较早内容的摘要')
    expect(captured.length).toBeLessThan(70)
    expect(captured.at(-1)?.role).toBe('user')
    expect(captured.at(-1)?.content).toBe('继续')
    expect(runtime.state().contextCompacted).toBeGreaterThan(0)
  })

  test('keeps assistant replies in the conversation history', async () => {
    const seen: StreamOptions['messages'][] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        seen.push(options.messages)
        return { text: '第一次回答', toolCalls: [] }
      },
    })
    await runtime.send('第一问')
    await runtime.send('第二问')
    expect(
      seen[1].some(
        (message) =>
          message.role === 'assistant' &&
          message.content === '第一次回答',
      ),
    ).toBe(true)
  })

  test('retries a failed turn without duplicating the prompt', async () => {
    let attempts = 0
    let captured: StreamOptions['messages'] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        attempts += 1
        if (attempts === 1) throw new Error('网络中断')
        captured = options.messages
        options.onText?.('好啦')
        return { text: '好啦', toolCalls: [] }
      },
    })
    await runtime.send('继续做')
    let state = runtime.state()
    expect(state.error).toContain('网络中断')
    expect(state.retryLabel).toBe('重试')
    expect(state.messages.filter((item) => item.role === 'user')).toHaveLength(
      1,
    )
    await runtime.retry()
    state = runtime.state()
    expect(state.error).toBeUndefined()
    expect(state.retryLabel).toBeUndefined()
    expect(state.messages.filter((item) => item.role === 'user')).toHaveLength(
      1,
    )
    expect(
      captured.filter((message) => message.role === 'user'),
    ).toHaveLength(1)
    expect(
      state.messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.parts.some(
            (part) => part.type === 'text' && part.text === '好啦',
          ),
      ),
    ).toBe(true)
  })

  test('continues after the user stops a turn', async () => {
    let attempts = 0
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        attempts += 1
        if (attempts > 1) {
          options.onText?.('完成了')
          return { text: '完成了', toolCalls: [] }
        }
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            options.onText?.('完成了')
            resolve({ text: '完成了', toolCalls: [] })
          }, 30)
          options.signal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new Error('aborted'))
          })
        })
      },
    })
    const sending = runtime.send('做点事')
    await new Promise((resolve) => setTimeout(resolve, 5))
    runtime.cancel()
    await sending
    let state = runtime.state()
    expect(state.error).toBeUndefined()
    expect(state.retryLabel).toBe('继续')
    await runtime.retry()
    state = runtime.state()
    expect(state.retryLabel).toBeUndefined()
    expect(
      state.messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.parts.some(
            (part) => part.type === 'text' && part.text === '完成了',
          ),
      ),
    ).toBe(true)
  })

  test('archives a session and leaves the active conversation', async () => {
    const { runtime } = await makeRuntime([])
    const first = runtime.state().sessionId
    expect(first).toBeTruthy()
    runtime.newSession()
    const second = runtime.state().sessionId
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
    runtime.setSessionArchived(second!, true)
    let state = runtime.state()
    expect(state.sessions.find((item) => item.id === second)).toMatchObject({
      archived: true,
    })
    expect(state.sessionId).toBe(first)
    runtime.setSessionArchived(second!, false)
    state = runtime.state()
    expect(state.sessions.find((item) => item.id === second)?.archived).toBe(
      false,
    )
  })

  test('clears a conversation while keeping the session entry', async () => {
    const { runtime } = await makeRuntime([])
    await runtime.send('你好')
    expect(runtime.state().messages.length).toBeGreaterThan(0)
    const id = runtime.state().sessionId!
    runtime.clearSession(id)
    const state = runtime.state()
    expect(state.sessionId).toBe(id)
    expect(state.messages).toEqual([])
    expect(state.sessions.find((item) => item.id === id)?.title).toBe(
      '新会话',
    )
    expect(state.usage).toEqual({ input: 0, output: 0 })
  })

  test('regenerates the last turn without duplicating the prompt', async () => {
    let attempts = 0
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        attempts += 1
        const text = attempts === 1 ? '第一次回答' : '第二次回答'
        options.onText?.(text)
        return { text, toolCalls: [] }
      },
    })
    await runtime.send('你好')
    expect(
      runtime.state().messages.filter((item) => item.role === 'user'),
    ).toHaveLength(1)
    await runtime.regenerate()
    const state = runtime.state()
    expect(
      state.messages.filter((item) => item.role === 'user'),
    ).toHaveLength(1)
    expect(
      state.messages.at(-1)?.parts.some(
        (part) => part.type === 'text' && part.text === '第二次回答',
      ),
    ).toBe(true)
    expect(attempts).toBe(2)
  })

  test('edits an earlier user message and drops later turns', async () => {
    const seen: StreamOptions['messages'][] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        seen.push(options.messages)
        const text = `回答 ${seen.length}`
        options.onText?.(text)
        return { text, toolCalls: [] }
      },
    })
    await runtime.send('第一问')
    const firstUser = runtime
      .state()
      .messages.find((message) => message.role === 'user')!
    await runtime.send('第二问')
    await runtime.editMessage(firstUser.id, '修改后的问题')
    const state = runtime.state()
    expect(
      state.messages
        .filter((message) => message.role === 'user')
        .map((message) =>
          message.parts
            .map((part) => (part.type === 'text' ? part.text : ''))
            .join(''),
        ),
    ).toEqual(['修改后的问题'])
    const lastRequest = seen.at(-1)!
    expect(
      lastRequest.filter((message) => message.role === 'user'),
    ).toHaveLength(1)
    expect(
      lastRequest.some(
        (message) =>
          message.role === 'assistant' &&
          message.content === '回答 1',
      ),
    ).toBe(false)
  })

  test('streams reasoning into a collapsible part', async () => {
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        options.onReasoning?.('先检查置物架')
        options.onText?.('完成')
        return {
          text: '完成',
          reasoning: '先检查置物架',
          toolCalls: [],
        }
      },
    })
    await runtime.send('看看文件')
    const message = runtime.state().messages.at(-1)
    const reasoning = message?.parts.find(
      (part) => part.type === 'reasoning',
    )
    expect(reasoning).toMatchObject({
      type: 'reasoning',
      text: '先检查置物架',
    })
  })

  test('notes when the output stops at the length limit', async () => {
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        options.onText?.('写到一半')
        return {
          text: '写到一半',
          toolCalls: [],
          finishReason: 'length',
        }
      },
    })
    await runtime.send('写长一点')
    expect(runtime.state().messages.at(-1)?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: '（输出达到长度上限，请继续指令让我接着写。）',
        }),
      ]),
    )
  })

  test('lists enabled skills and loads one through the tool', async () => {
    const seen: StreamOptions['messages'][] = []
    const toolSets: string[][] = []
    const { runtime } = await makeRuntime([], [], {
      loadSkills: async () => [
        {
          name: '日报',
          description: '按三段写日报',
          content: '请按三段写日报。',
        },
      ],
      stream: async (_key, options) => {
        seen.push(options.messages)
        toolSets.push(
          (options.tools ?? []).map((tool) => tool.function.name),
        )
        if (seen.length === 1)
          return {
            text: '',
            toolCalls: [
              {
                id: 'skill-1',
                name: 'skill_load',
                arguments: JSON.stringify({ name: '日报' }),
              },
            ],
          }
        options.onText?.('已完成日报')
        return { text: '已完成日报', toolCalls: [] }
      },
    })
    await runtime.send('写日报')
    const system = seen[0].find((message) => message.role === 'system')
    expect(system?.content).toContain('已启用技能')
    expect(system?.content).toContain('日报：按三段写日报')
    expect(toolSets[0]).toContain('skill_load')
    const toolResult = seen[1].find((message) => message.role === 'tool')
    expect(toolResult?.content).toContain('请按三段写日报。')
    const skillPart = toolParts(runtime).find(
      (part) => part.type === 'tool' && part.name === 'skill_load',
    )
    expect(skillPart).toMatchObject({
      type: 'tool',
      title: '读取技能 日报',
      status: 'done',
    })
  })

  test('applies a project tool policy to write tools', async () => {
    const calls: string[] = []
    const createArguments = JSON.stringify({ text: '项目任务' })
    const { runtime } = await makeRuntime(
      [
        {
          text: '',
          toolCalls: [
            { id: 'call-1', name: 'todo_create', arguments: createArguments },
          ],
        },
        { text: '完成', toolCalls: [] },
        {
          text: '',
          toolCalls: [
            { id: 'call-2', name: 'todo_create', arguments: createArguments },
          ],
        },
        { text: '完成', toolCalls: [] },
      ],
      calls,
    )
    runtime.createProject('允许项目', `/tmp/mqmz-allow-${Date.now()}`)
    const allowProject = runtime
      .state()
      .projects.find((project) => project.name === '允许项目')!
    runtime.newSessionIn(allowProject.id)
    runtime.setProjectToolPolicy(allowProject.id, 'allow')
    await runtime.send('建个待办')
    expect(calls).toContain('addTodo:项目任务')
    expect(runtime.state().approval).toBeNull()

    runtime.createProject('禁止项目', `/tmp/mqmz-deny-${Date.now()}`)
    const denyProject = runtime
      .state()
      .projects.find((project) => project.name === '禁止项目')!
    runtime.newSessionIn(denyProject.id)
    runtime.setProjectToolPolicy(denyProject.id, 'deny')
    await runtime.send('再建一个')
    expect(
      calls.filter((call) => call === 'addTodo:项目任务'),
    ).toHaveLength(1)
    const denied = toolParts(runtime).find(
      (part) => part.type === 'tool' && part.name === 'todo_create',
    )
    expect(denied?.type === 'tool' ? denied.status : '').toBe('denied')
  })

  test('runs a read-only sub-agent and reports its conclusion', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'mqmz-subagent-'))
    await mkdir(join(workspace, 'src'), { recursive: true })
    await writeFile(
      join(workspace, 'src', 'app.ts'),
      '// TODO: rename this\nconst value = 1\n',
    )
    let parentCalls = 0
    let childCalls = 0
    const childTools: string[][] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        const system = options.messages[0]
        const isChild =
          system?.role === 'system' &&
          String(system.content).includes('只读子 Agent')
        if (!isChild) {
          parentCalls += 1
          if (parentCalls === 1)
            return {
              text: '',
              toolCalls: [
                {
                  id: 'sub-1',
                  name: 'subagent_run',
                  arguments: JSON.stringify({ task: '查找 TODO' }),
                },
              ],
            }
          options.onText?.('子 Agent 已找到。')
          return { text: '子 Agent 已找到。', toolCalls: [] }
        }
        childTools.push(
          (options.tools ?? []).map((tool) => tool.function.name),
        )
        childCalls += 1
        if (childCalls === 1)
          return {
            text: '',
            toolCalls: [
              {
                id: 'child-1',
                name: 'workspace_search',
                arguments: JSON.stringify({ query: 'TODO' }),
              },
            ],
          }
        return { text: '找到 1 处 TODO。', toolCalls: [] }
      },
    })
    runtime.createProject('代码项目', workspace)
    const project = runtime
      .state()
      .projects.find((item) => item.name === '代码项目')!
    runtime.newSessionIn(project.id)
    await runtime.send('调查一下代码')

    const part = toolParts(runtime).find(
      (item) => item.type === 'tool' && item.name === 'subagent_run',
    )
    expect(part).toMatchObject({ type: 'tool', status: 'done' })
    expect(part?.type === 'tool' ? part.output : '').toContain(
      '找到 1 处 TODO',
    )
    expect(childTools[0]).toContain('workspace_search')
    expect(childTools[0]).not.toContain('workspace_write')
    expect(
      runtime
        .state()
        .messages.at(-1)
        ?.parts.some(
          (item) =>
            item.type === 'text' && item.text.includes('子 Agent 已找到'),
        ),
    ).toBe(true)
  })

  test('uses skill search and skill file reads when many skills exist', async () => {
    const skills = Array.from({ length: 61 }, (_, index) => ({
      name: `Skill ${index}`,
      description: `Description ${index}`,
      content: `Body ${index}`,
      files: ['notes.md'],
    }))
    const seen: StreamOptions[] = []
    const { runtime } = await makeRuntime([], [], {
      loadSkills: async () => skills,
      readSkillFile: async () => 'skill asset content',
      stream: async (_key, options) => {
        seen.push(options)
        if (seen.length === 1)
          return {
            text: '',
            toolCalls: [
              {
                id: 'search-1',
                name: 'skill_search',
                arguments: JSON.stringify({ query: 'Skill 42' }),
              },
              {
                id: 'read-1',
                name: 'skill_read',
                arguments: JSON.stringify({
                  name: 'Skill 42',
                  path: 'notes.md',
                }),
              },
            ],
          }
        options.onText?.('完成')
        return { text: '完成', toolCalls: [] }
      },
    })
    await runtime.send('找一下技能')
    const system = seen[0].messages.find(
      (message) => message.role === 'system',
    )
    expect(system?.content).toContain('skill_search')
    expect(system?.content).not.toContain('- Skill 0：')
    const parts = toolParts(runtime)
    const search = parts.find(
      (part) => part.type === 'tool' && part.name === 'skill_search',
    )
    const read = parts.find(
      (part) => part.type === 'tool' && part.name === 'skill_read',
    )
    expect(search?.type === 'tool' ? search.output : '').toContain('Skill 42')
    expect(read?.type === 'tool' ? read.output : '').toContain(
      'skill asset content',
    )
  })

  test('passes reasoning effort and echoes reasoning_content with tools', async () => {
    const seen: StreamOptions[] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        seen.push(options)
        if (seen.length === 1)
          return {
            text: '',
            reasoning: '先看看置物架。',
            toolCalls: [
              { id: 'call-1', name: 'shelf_list', arguments: '{}' },
            ],
          }
        return { text: '完成', toolCalls: [] }
      },
    })
    runtime.setReasoning('max')
    await runtime.send('列一下文件')

    expect(seen[0]?.reasoning).toBe('max')
    const assistant = seen[1]?.messages.find(
      (message) => message.role === 'assistant',
    )
    expect(assistant?.reasoning_content).toBe('先看看置物架。')
  })

  test('sets the active session workspace from a project', async () => {
    const { runtime } = await makeRuntime([], [])
    const workspace = '/tmp/mqmz-agent-workspace'
    runtime.createProject('工作区项目', workspace)
    const project = runtime.state().projects[0]
    runtime.setWorkspace(project.id)
    let state = runtime.state()
    expect(state.workspace).toBe(workspace)
    expect(
      state.sessions.find((item) => item.id === state.sessionId)?.projectId,
    ).toBe(project.id)

    runtime.setWorkspace(null)
    state = runtime.state()
    expect(state.workspace).toBeNull()
    expect(
      state.sessions.find((item) => item.id === state.sessionId)?.projectId,
    ).toBeNull()
  })

  test('generates a cleaned conversation title', async () => {
    const { runtime } = await makeRuntime([{ text: '完成', toolCalls: [] }], [], {
      titleStream: async () => ({
        text: '标题：日报，整理。',
        toolCalls: [],
      }),
    })
    await runtime.send('帮我整理今天的日报')
    await waitFor(
      () => runtime.state().sessions[0]?.title === '日报整理',
    )
    expect(runtime.state().sessions[0]?.title).toBe('日报整理')
  })

  test('falls back to a punctuation-free title within the limit', async () => {
    const { runtime } = await makeRuntime([{ text: '好', toolCalls: [] }])
    await runtime.send('你好，世界！这是很长的一段话需要截断到十六个字符以内')
    const title = runtime.state().sessions[0]?.title ?? ''
    expect(title.startsWith('你好世界')).toBe(true)
    expect(Array.from(title).length).toBeLessThanOrEqual(16)
    expect(/[\p{P}]/u.test(title)).toBe(false)
  })

  test('limits session and project names to 16 characters', async () => {
    const { runtime } = await makeRuntime([], [])
    runtime.newSession()
    const id = runtime.state().sessionId!
    expect(() => runtime.renameSession(id, '一'.repeat(17))).toThrow(
      '标题最多 16 个字符',
    )
    runtime.renameSession(id, `${'一'.repeat(15)}，`)
    expect(runtime.state().sessions[0]?.title).toBe(`${'一'.repeat(15)}，`)

    expect(() =>
      runtime.createProject('项'.repeat(17), '/tmp/mqmz-long-project'),
    ).toThrow('项目名称最多 16 个字符')
    runtime.createProject('项'.repeat(16), '/tmp/mqmz-long-project')
    expect(runtime.state().projects[0]?.name).toBe('项'.repeat(16))
  })

  test('auto approval skips routine writes but keeps risky tools gated', async () => {
    const calls: string[] = []
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-approval-'))
    const seen: StreamOptions['messages'][] = []
    const { runtime } = await makeRuntime([], calls, {
        stream: async (_key, options) => {
          seen.push(options.messages)
          const result = [
            {
              text: '',
              toolCalls: [
                {
                  id: 'todo-auto',
                  name: 'todo_create',
                  arguments: '{"text":"自动审批待办"}',
                },
              ],
            },
            { text: '已创建。', toolCalls: [] },
            {
              text: '',
              toolCalls: [
                {
                  id: 'ws-auto',
                  name: 'workspace_set',
                  arguments: JSON.stringify({ path: directory }),
                },
              ],
            },
            { text: '已绑定。', toolCalls: [] },
          ][seen.length - 1]
          return result ?? { text: '完成', toolCalls: [] }
        },
      },
    )
    runtime.setApprovalMode('auto')
    await runtime.send('建个待办')
    expect(calls).toContain('addTodo:自动审批待办')
    expect(runtime.state().approval).toBeNull()

    const running = runtime.send('绑定工作区')
    await waitFor(() => runtime.state().approval?.name === 'workspace_set')
    runtime.approve(runtime.state().approval!.id)
    await running
    expect(runtime.state().workspace).toBe(await realpath(directory))
  })

  test('full access skips approvals but plan mode still blocks writes', async () => {
    const calls: string[] = []
    const seen: StreamOptions['messages'][] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        seen.push(options.messages)
        if (seen.length === 1)
          return {
            text: '',
            toolCalls: [
              {
                id: 'todo-full',
                name: 'todo_create',
                arguments: '{"text":"完全访问待办"}',
              },
            ],
          }
        return { text: '完成', toolCalls: [] }
      },
    })
    runtime.setMode('plan')
    runtime.setApprovalMode('full')
    await runtime.send('建个待办')
    expect(runtime.state().approval).toBeNull()
    expect(calls).not.toContain('addTodo:完全访问待办')
    expect(runtime.state().messages.some((message) =>
      message.parts.some(
        (part) =>
          part.type === 'tool' &&
          part.output?.includes('当前模式下不可用'),
      ),
    )).toBe(true)
  })

  test('defaults project names to the folder name', async () => {
    const { runtime } = await makeRuntime([], [])
    runtime.createProject('', '/tmp/mqmz-project-default')
    let project = runtime.state().projects[0]
    expect(project.name).toBe('mqmz-project-def')

    runtime.updateProject(project.id, { name: '' })
    project = runtime.state().projects[0]
    expect(project.name).toBe('mqmz-project-def')

    runtime.updateProject(project.id, {
      name: '',
      workspace: '/tmp/another-project-folder',
    })
    project = runtime.state().projects[0]
    expect(project.name).toBe('another-project-')

    runtime.updateProject(project.id, {
      workspace: '/tmp/third-project-folder',
    })
    project = runtime.state().projects[0]
    expect(project.name).toBe('another-project-')
  })

  test('manages skills through list and approval-gated tools', async () => {
    const skill = {
      id: 'demo',
      name: '演示',
      description: '演示用途',
      category: '通用工具',
      builtin: false,
      enabled: false,
    }
    const toggles: string[] = []
    const admin = {
      list: () => [skill],
      find: (target: string) => {
        if (target === 'demo' || target === '演示') return skill
        throw new Error('没有找到技能。')
      },
      scan: async () => ({
        status: 'safe' as const,
        scanner: 'test',
        summary: '安全检查通过。',
        findings: [],
      }),
      ensureCanEnable: async () => {},
      setEnabled: async (target: string, enabled: boolean) => {
        toggles.push(`${target}:${enabled}`)
        return { ...skill, enabled }
      },
      installLocal: async () => ({ installed: [], scans: [] }),
      installUrl: async () => ({ installed: [], scans: [] }),
      remove: async () => true,
    }
    const seen: StreamOptions['messages'][] = []
    const { runtime } = await makeRuntime([], [], {
      getSkillAdmin: () => admin,
      stream: async (_key, options) => {
        seen.push(options.messages)
        if (seen.length === 1)
          return {
            text: '',
            toolCalls: [
              {
                id: 'list-1',
                name: 'skill_list',
                arguments: '{"scope":"user"}',
              },
            ],
          }
        if (seen.length === 2)
          return {
            text: '',
            toolCalls: [
              {
                id: 'toggle-1',
                name: 'skill_set_enabled',
                arguments: '{"target":"演示","enabled":true}',
              },
            ],
          }
        return { text: '已启用。', toolCalls: [] }
      },
    })
    const running = runtime.send('帮我启用演示技能')
    await waitFor(() => runtime.state().messages.some(
      (message) =>
        message.parts.some(
          (part) => part.type === 'tool' && part.name === 'skill_list',
        ),
    ))
    await waitFor(() => runtime.state().approval?.name === 'skill_set_enabled')
    const listResult = seen[1].find((message) => message.role === 'tool')
    expect(listResult?.content).toContain('demo')
    expect(listResult?.content).toContain('演示')
    const approval = runtime.state().approval!
    expect(approval.title).toBe('启用技能 演示')
    runtime.approve(approval.id)
    await running
    expect(toggles).toEqual(['演示:true'])
    expect(seen[0].some((message) => message.role === 'system')).toBe(true)
  })

  test('binds a workspace only after approval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-workspace-'))
    const seen: StreamOptions['messages'][] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        seen.push(options.messages)
        if (seen.length === 1)
          return {
            text: '',
            toolCalls: [
              {
                id: 'ws-1',
                name: 'workspace_set',
                arguments: JSON.stringify({ path: directory }),
              },
            ],
          }
        return { text: '已绑定。', toolCalls: [] }
      },
    })
    expect(runtime.state().workspace).toBeNull()
    const running = runtime.send('绑定工作区')
    await waitFor(() => runtime.state().approval?.name === 'workspace_set')
    const approval = runtime.state().approval!
    expect(approval.title).toBe(`绑定工作区 ${directory}`)
    runtime.approve(approval.id)
    await running
    expect(runtime.state().workspace).toBe(await realpath(directory))
  })

  test('refuses shell without a workspace instead of opening a picker', async () => {
    const seen: StreamOptions['messages'][] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        seen.push(options.messages)
        if (seen.length === 1)
          return {
            text: '',
            toolCalls: [
              {
                id: 'shell-1',
                name: 'shell_run',
                arguments: JSON.stringify({ command: 'ls' }),
              },
            ],
          }
        return { text: '需要工作区。', toolCalls: [] }
      },
    })
    await runtime.send('查看目录')
    expect(runtime.state().approval).toBeNull()
    const result = seen[1].find((message) => message.role === 'tool')
    expect(result?.content).toContain('还没有绑定工作区')
  })

  test('full access runs shell from the home directory', async () => {
    const seen: StreamOptions['messages'][] = []
    const { runtime } = await makeRuntime([], [], {
      stream: async (_key, options) => {
        seen.push(options.messages)
        if (seen.length === 1)
          return {
            text: '',
            toolCalls: [
              {
                id: 'shell-home',
                name: 'shell_run',
                arguments: '{"command":"pwd"}',
              },
            ],
          }
        return { text: '完成', toolCalls: [] }
      },
    })
    runtime.setApprovalMode('full')
    await runtime.send('看看当前目录')
    const result = seen[1].find((message) => message.role === 'tool')
    expect(result?.content).toContain(homedir())
  })
})
