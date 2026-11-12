/** Optional LGPL FFmpeg bundle downloaded on demand. */
export type FfmpegBuild = {
  version: string
  url: string
  sha256: string
  compressedBytes: number
  installedBytes: number
  binaryBytes: number
  /** Path of the executable inside the extracted bundle. */
  binaryPath: string
  binaryName: string
  license: string
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

const version = '9.0.2'
const release = 'v9.0.2'
const source = 'AgentDVR FFmpeg · LGPL v3'
const base = `https://github.com/ispysoftware/agentdvr-ffmpeg-build/releases/download/${release}`

const builds: Record<
  string,
  Omit<FfmpegBuild, 'version' | 'source' | 'license'>
> = {
  'darwin-arm64': {
    url: `${base}/ffmpeg9.0.2-lgpl-macos-arm64-notarized.zip`,
    sha256:
      '9d38382b7ae47e7cc22ce6a4f09d020c8c9c65aaa20f25608b9b5c4d4fab3ac1',
    compressedBytes: 14_488_314,
    installedBytes: 30_559_698,
    binaryBytes: 452_624,
    binaryPath: 'bin/ffmpeg',
    binaryName: 'ffmpeg',
  },
  'win32-x64': {
    url: `${base}/ffmpeg9.0.2-lgpl-windows-x64.zip`,
    sha256:
      '68dbe655beb35f3453bae31d3c7d0985e7ce62cb7414cdc88cb263df0829d1a5',
    compressedBytes: 18_092_098,
    installedBytes: 42_417_281,
    binaryBytes: 486_912,
    binaryPath: 'ffmpeg.exe',
    binaryName: 'ffmpeg.exe',
  },
}

export const ffmpegBuildPlatforms = Object.keys(builds)

export function ffmpegBuild(
  platform: string,
  arch: string,
): FfmpegBuild | null {
  const build = builds[`${platform}-${arch}`]
  return build
    ? { ...build, version, source, license: 'LGPL-3.0' }
    : null
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
