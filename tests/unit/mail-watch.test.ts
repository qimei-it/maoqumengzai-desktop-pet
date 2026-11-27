import { beforeEach, describe, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  client: undefined as any,
  supported: true,
}))
vi.mock('imapflow', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ImapFlow: class extends EventEmitter {
      capabilities = new Map(state.supported ? [['IDLE', true]] : [])
      connect = vi.fn(async () => {})
      mailboxOpen = vi.fn(async () => ({}))
      close = vi.fn(() => this.emit('close'))
      constructor() { super(); state.client = this }
    },
  }
})

import { watchMailInbox } from '../../src/main/mail-sync'

describe('IMAP inbox watch', () => {
  beforeEach(() => { state.supported = true; state.client = undefined })

  test('syncs after connecting and on mailbox changes, then stops on abort', async () => {
    const controller = new AbortController()
    const changed = vi.fn()
    const watching = watchMailInbox('qq', 'user@qq.com', 'secret', controller.signal, changed)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1))
    expect(state.client.mailboxOpen).toHaveBeenCalledWith('INBOX', { readOnly: true })
    state.client.emit('exists')
    expect(changed).toHaveBeenCalledTimes(2)
    controller.abort()
    expect(await watching).toBe('closed')
    expect(state.client.close).toHaveBeenCalled()
  })

  test('falls back when the server does not advertise IDLE', async () => {
    state.supported = false
    const changed = vi.fn()
    expect(await watchMailInbox('qq', 'user@qq.com', 'secret', new AbortController().signal, changed)).toBe('unsupported')
    expect(changed).not.toHaveBeenCalled()
    expect(state.client.close).toHaveBeenCalled()
  })

  test('returns when the server disconnects', async () => {
    const changed = vi.fn()
    const watching = watchMailInbox('qq', 'user@qq.com', 'secret', new AbortController().signal, changed)
    await vi.waitFor(() => expect(changed).toHaveBeenCalled())
    state.client.emit('close')
    expect(await watching).toBe('closed')
  })
})
