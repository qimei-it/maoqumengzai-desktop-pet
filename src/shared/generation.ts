/** Generation parameters shown under the agent composer for MiniMax models. */

export const generationRatios = [
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
] as const
export type GenerationRatio = (typeof generationRatios)[number]

export const imageRatios = ['auto', ...generationRatios] as const
export type ImageRatio = (typeof imageRatios)[number]

export const videoResolutions = ['480P', '768P', '2K'] as const
export type VideoResolution = (typeof videoResolutions)[number]

export const imageAreas = ['1K', '2K', '4K'] as const
export type ImageArea = (typeof imageAreas)[number]

export const imageFormats = ['jpeg', 'png', 'webp'] as const
export type ImageFormat = (typeof imageFormats)[number]

export const speechEmotions = [
  '',
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised',
  'calm',
] as const
export type SpeechEmotion = (typeof speechEmotions)[number]
export const speechEmotionLabels: Record<SpeechEmotion, string> = {
  '': '自动',
  happy: '高兴',
  sad: '悲伤',
  angry: '愤怒',
  fearful: '害怕',
  disgusted: '厌恶',
  surprised: '惊讶',
  calm: '中性',
}

export const speechFormats = ['mp3', 'wav'] as const
export type SpeechFormat = (typeof speechFormats)[number]

export const speechVoices = [
  { id: 'male-qn-qingse', label: '青涩青年' },
  { id: 'male-qn-jingying', label: '精英青年' },
  { id: 'male-qn-daxuesheng', label: '青年大学生' },
  { id: 'female-shaonv', label: '少女' },
  { id: 'female-yujie', label: '御姐' },
  { id: 'female-chengshu', label: '成熟女性' },
  { id: 'female-tianmei', label: '甜美女性' },
  { id: 'Chinese (Mandarin)_Gentleman', label: '温润男声' },
  { id: 'Chinese (Mandarin)_Warm_Bestie', label: '温暖闺蜜' },
] as const

export type GenerationParams = {
  image: {
    count: number
    area: ImageArea
    ratio: ImageRatio
    format: ImageFormat
  }
  video: {
    resolution: VideoResolution
    duration: number
    ratio: GenerationRatio
  }
  speech: {
    voiceId: string
    speed: number
    emotion: SpeechEmotion
    format: SpeechFormat
  }
}

export const defaultGenerationParams: GenerationParams = {
  image: { count: 1, area: '2K', ratio: 'auto', format: 'jpeg' },
  video: { resolution: '768P', duration: 5, ratio: '16:9' },
  speech: {
    voiceId: speechVoices[0].id,
    speed: 1,
    emotion: '',
    format: 'mp3',
  },
}

/** Resolutions supported by MiniMax-H3 in the first release. */
export const h3VideoResolutions: readonly VideoResolution[] = ['768P', '2K']

export function normalizeGenerationParams(
  value: unknown,
): GenerationParams {
  const source =
    value && typeof value === 'object'
      ? (value as Partial<GenerationParams>)
      : {}
  const image = source.image ?? defaultGenerationParams.image
  const video = source.video ?? defaultGenerationParams.video
  const speech = source.speech ?? defaultGenerationParams.speech
  return {
    image: {
      count: Math.min(10, Math.max(1, Math.round(Number(image.count) || 1))),
      area: imageAreas.includes(image.area as ImageArea)
        ? (image.area as ImageArea)
        : defaultGenerationParams.image.area,
      ratio: imageRatios.includes(image.ratio as ImageRatio)
        ? (image.ratio as ImageRatio)
        : defaultGenerationParams.image.ratio,
      format: imageFormats.includes(image.format as ImageFormat)
        ? (image.format as ImageFormat)
        : defaultGenerationParams.image.format,
    },
    video: {
      resolution: h3VideoResolutions.includes(
        video.resolution as VideoResolution,
      )
        ? (video.resolution as VideoResolution)
        : defaultGenerationParams.video.resolution,
      duration: Math.min(
        15,
        Math.max(4, Math.round(Number(video.duration) || 5)),
      ),
      ratio: generationRatios.includes(video.ratio as GenerationRatio)
        ? (video.ratio as GenerationRatio)
        : defaultGenerationParams.video.ratio,
    },
    speech: {
      voiceId: speechVoices.some((voice) => voice.id === speech.voiceId)
        ? String(speech.voiceId)
        : defaultGenerationParams.speech.voiceId,
      speed: Math.min(
        2,
        Math.max(0.5, Number(speech.speed) || defaultGenerationParams.speech.speed),
      ),
      emotion: speechEmotions.includes(speech.emotion as SpeechEmotion)
        ? (speech.emotion as SpeechEmotion)
        : '',
      format: speechFormats.includes(speech.format as SpeechFormat)
        ? (speech.format as SpeechFormat)
        : 'mp3',
    },
  }
}
