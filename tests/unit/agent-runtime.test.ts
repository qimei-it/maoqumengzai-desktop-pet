import { describe, expect, test } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAgentRuntime } from '../../src/main/agent/runtime'
import type {
  StreamOptions,
  StreamResult,
} from '../../src/main/agent/provider'
import { makeDeps } from './agent-fixtures'

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
  },
) {
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-runtime-'))
  const storePath = join(directory, 'agent.json')
  const script = scripted(results)
  const runtime = createAgentRuntime({
    ...makeDeps(calls),
    storePath,
    getKey: () => 'test-key',
    broadcast: () => {},
    pickWorkspace: async () => directory,
    stream: override?.stream ?? script.stream,
  })
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
      ...makeDeps(calls),
      storePath,
      getKey: () => 'test-key',
      broadcast: () => {},
      pickWorkspace: async () => '/tmp',
      stream: scripted([]).stream,
    })
    await restored.load()
    const state = restored.state()
    expect(state.sessions.length).toBe(1)
    expect(state.messages.length).toBe(2)
    expect(state.messages[0].role).toBe('user')
  })
})
