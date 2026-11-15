import { describe, expect, test, vi } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  transcribeAgentAudio,
  uploadAgentFile,
} from '../../src/main/agent/files'

async function file(name: string, bytes: Uint8Array): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mqmz-files-'))
  const path = join(root, name)
  await writeFile(path, bytes)
  return path
}

describe('DeepSeek attachment APIs', () => {
  test('uploads with purpose before the file and stores the 30-day expiry', async () => {
    const path = await file('report.pdf', new Uint8Array([1, 2, 3]))
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(
        JSON.stringify({
          id: 'file-api-test',
          expires_at: 1_700_000_000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const uploaded = await uploadAgentFile(
      'sk-test',
      path,
      'text_recognition',
      { fetch: fake, endpoint: 'https://example.test/files' },
    )
    expect(uploaded).toEqual({
      id: 'file-api-test',
      expiresAt: 1_700_000_000_000,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://example.test/files')
    expect(calls[0].init.method).toBe('POST')
    expect(
      new Headers(calls[0].init.headers).get('Authorization'),
    ).toBe('Bearer sk-test')
    const form = calls[0].init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('purpose')).toBe('text_recognition')
    expect(form.get('expires_after[anchor]')).toBe('created_at')
    expect(form.get('expires_after[seconds]')).toBe('2592000')
    expect((form.get('file') as File).name).toBe('report.pdf')
  })

  test('maps upload errors to readable messages', async () => {
    const path = await file('photo.png', new Uint8Array([1]))
    const fake = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad file' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch
    await expect(
      uploadAgentFile('sk-test', path, 'user_data', { fetch: fake }),
    ).rejects.toThrow('附件无法解析：bad file')
  })

  test('transcribes audio and returns the text', async () => {
    const path = await file('voice.wav', new Uint8Array([1, 2]))
    const fake = vi.fn(async () => {
      return new Response(
        JSON.stringify({ text: '你好，世界。', duration_ms: 1200 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch
    expect(
      await transcribeAgentAudio('sk-test', path, {
        fetch: fake,
        endpoint: 'https://example.test/asr',
      }),
    ).toBe('你好，世界。')
  })

  test('asks for a new attachment when the source file is gone', async () => {
    const fake = vi.fn() as unknown as typeof fetch
    await expect(
      uploadAgentFile('sk-test', '/missing/photo.png', 'user_data', {
        fetch: fake,
      }),
    ).rejects.toThrow('源文件已不在了，请重新添加附件。')
    await expect(
      transcribeAgentAudio('sk-test', '/missing/voice.wav', { fetch: fake }),
    ).rejects.toThrow('音频源文件已不在了，请重新添加音频。')
    expect(fake).not.toHaveBeenCalled()
  })

  test('rejects audio over the 8 MB transcription limit', async () => {
    const path = await file(
      'large.wav',
      new Uint8Array(8 * 1024 * 1024 + 1),
    )
    await expect(
      transcribeAgentAudio('sk-test', path, {
        fetch: vi.fn() as unknown as typeof fetch,
      }),
    ).rejects.toThrow('单段音频超过 8 MB')
  })
})
