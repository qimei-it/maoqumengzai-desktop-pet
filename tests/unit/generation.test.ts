import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  defaultGenerationParams,
  normalizeGenerationParams,
} from '../../src/shared/generation'
import { generationKindForModel } from '../../src/main/agent/generation'
import {
  editMiniMaxImage,
  generateMiniMaxImage,
  generateMiniMaxSpeech,
} from '../../src/main/agent/minimax-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generation parameters', () => {
  test('clamps counts, durations and speeds', () => {
    const params = normalizeGenerationParams({
      image: { count: 99, area: '4K', ratio: '16:9', format: 'png' },
      video: { resolution: '2K', duration: 30, ratio: '9:16' },
      speech: { voiceId: 'female-tianmei', speed: 3, emotion: 'happy', format: 'wav' },
    })
    expect(params.image.count).toBe(10)
    expect(params.image.area).toBe('4K')
    expect(params.video.duration).toBe(15)
    expect(params.video.ratio).toBe('9:16')
    expect(params.speech.speed).toBe(2)
    expect(params.speech.emotion).toBe('happy')
  })

  test('falls back to defaults for unknown values', () => {
    const params = normalizeGenerationParams({
      image: { area: '8K', ratio: '2:1', format: 'gif' },
      video: { resolution: '1080P', duration: 1, ratio: 'auto' },
      speech: { voiceId: 'unknown', speed: 0, emotion: 'nope', format: 'ogg' },
    })
    expect(params.image).toEqual(defaultGenerationParams.image)
    expect(params.video.resolution).toBe(
      defaultGenerationParams.video.resolution,
    )
    expect(params.video.ratio).toBe(defaultGenerationParams.video.ratio)
    expect(params.video.duration).toBe(4)
    expect(params.speech.voiceId).toBe(defaultGenerationParams.speech.voiceId)
    expect(params.speech.speed).toBe(defaultGenerationParams.speech.speed)
    expect(params.speech.emotion).toBe('')
    expect(params.speech.format).toBe('mp3')
  })
})

describe('generation model kinds', () => {
  test('maps speech models to audio output', () => {
    expect(generationKindForModel('speech-2.8-hd')).toBe('audio')
    expect(generationKindForModel('MiniMax-H3-Image')).toBe('image')
    expect(generationKindForModel('MiniMax-H3')).toBe('video')
    expect(generationKindForModel('MiniMax-M3')).toBeNull()
  })
})

describe('MiniMax generation payloads', () => {
  test('sends image size, ratio, count and format', async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          data: [{ url: 'https://example.com/a.jpg', size: '2048x2048' }],
        }),
        { status: 200 },
      )
    })
    const result = await generateMiniMaxImage('sk-test', {
      prompt: '一只橘猫',
      count: 2,
      area: '2K',
      aspectRatio: '1:1',
      outputFormat: 'png',
    })
    expect(body.model).toBe('MiniMax-H3-Image')
    expect(body.n).toBe(2)
    expect(body.area).toBe('2K')
    expect(body.aspect_ratio).toBe('1:1')
    expect(body.output_format).toBe('png')
    expect(result.images[0]?.size).toBe('2048x2048')
  })

  test('sends reference images to the edit endpoint', async () => {
    let url = ''
    let body: Record<string, unknown> = {}
    vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
      url = input
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    })
    await editMiniMaxImage('sk-test', {
      prompt: '换成柴犬',
      images: ['mm_file://1', 'mm_file://2'],
    })
    expect(url).toContain('/v1/images/edits')
    expect(body.images).toEqual([
      { image_url: 'mm_file://1' },
      { image_url: 'mm_file://2' },
    ])
  })

  test('decodes hex speech audio', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({
          data: { audio: Buffer.from('wave').toString('hex') },
          extra_info: { audio_length: 1200, audio_format: 'mp3' },
          base_resp: { status_code: 0, status_msg: 'success' },
        }),
        { status: 200 },
      ),
    )
    const result = await generateMiniMaxSpeech('sk-test', { text: '你好' })
    expect(result.audio?.toString()).toBe('wave')
    expect(result.durationMs).toBe(1200)
    expect(result.format).toBe('mp3')
  })
})
