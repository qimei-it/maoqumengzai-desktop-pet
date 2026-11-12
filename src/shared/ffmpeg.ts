/** Optional FFmpeg build downloaded on demand. */
export type FfmpegBuild = {
  version: string
  url: string
  sha256: string
  compressedBytes: number
  installedBytes: number
  binaryName: string
  source: string
}

export type FfmpegEngineStatus =
  | 'missing'
  | 'downloading'
  | 'installed'
  | 'error'
  | 'unsupported'

export type FfmpegEngineState = {
  status: FfmpegEngineStatus
  version: string
  progress: number
  error?: string
  downloadBytes: number
  installedBytes: number
  source: string
  origin: 'none' | 'download' | 'local'
}

const version = '6.0'
const release = 'b6.1.1'
const source = `npmmirror 镜像 · ffmpeg-static ${release}`
const base = `https://cdn.npmmirror.com/binaries/ffmpeg-static/${release}`

const builds: Record<string, Omit<FfmpegBuild, 'version' | 'source'>> = {
  'darwin-arm64': {
    url: `${base}/ffmpeg-darwin-arm64.gz`,
    sha256:
      '8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa',
    compressedBytes: 19_246_198,
    installedBytes: 45_568_216,
    binaryName: 'ffmpeg',
  },
  'darwin-x64': {
    url: `${base}/ffmpeg-darwin-x64.gz`,
    sha256:
      '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106',
    compressedBytes: 25_296_431,
    installedBytes: 78_862_176,
    binaryName: 'ffmpeg',
  },
  'win32-x64': {
    url: `${base}/ffmpeg-win32-x64.gz`,
    sha256:
      '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77',
    compressedBytes: 29_581_307,
    installedBytes: 82_797_568,
    binaryName: 'ffmpeg.exe',
  },
}

export function ffmpegBuild(
  platform: string,
  arch: string,
): FfmpegBuild | null {
  const build = builds[`${platform}-${arch}`]
  return build ? { ...build, version, source } : null
}

export function emptyFfmpegState(
  build: FfmpegBuild | null,
): FfmpegEngineState {
  return {
    status: build ? 'missing' : 'unsupported',
    version,
    progress: 0,
    downloadBytes: build?.compressedBytes ?? 0,
    installedBytes: build?.installedBytes ?? 0,
    source,
    origin: 'none',
  }
}
