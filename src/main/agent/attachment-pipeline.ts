/**
 * Local-first attachment reading for the agent composer.
 *
 * Text, PDF, Office, OFD, ebooks and archives are parsed on this machine when
 * an engine is available. Only scanned documents, images and ebooks that need
 * DeepSeek parsing become uploads; audio and video are transcribed through the
 * ASR tool so the model still receives plain text.
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
  basename,
  dirname,
  extname,
  join,
  posix,
  relative,
  sep,
} from 'node:path'
import { unzipSync } from 'fflate'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import sharp from 'sharp'
import {
  agentAttachmentFileChars,
  agentAttachmentFileBytes,
} from './attachments'
import type {
  AgentAttachmentInput,
  AgentAttachmentKind,
  AgentAttachmentMode,
  AgentAttachmentPick,
  AgentAttachmentUpload,
} from '../../shared/agent'
import type { AgentModelId } from '../../shared/agent-models'
import { fileExtension } from '../../shared/file-kinds'
import { extractArchive } from '../archive-zip'
import { officeCsvBuffer, officePdfBuffer } from '../convert-office'
import { ffmpegEnv } from '../ffmpeg-bundle'

export const agentAttachmentBinaryBytes = 20 * 1024 * 1024
export const agentAttachmentMediaBytes = 200 * 1024 * 1024
export const agentAttachmentArchiveBytes = 20 * 1024 * 1024
export const agentAttachmentArchiveExpandedBytes = 200 * 1024 * 1024
export const agentAttachmentAudioSegmentSeconds = 110
export const agentAttachmentMediaSeconds = 600
export const agentAttachmentOfdPages = 20
export const agentAttachmentArchiveEntries = 1000

const textExtensions = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'log',
  'xml',
  'svg',
  'html',
  'htm',
  'xhtml',
  'css',
  'scss',
  'less',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'vue',
  'svelte',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'sql',
  'patch',
  'diff',
  'srt',
  'vtt',
  'tex',
  'rtf',
])

const imageExtensions = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'tiff',
  'tif',
  'heic',
  'heif',
])

const officeExtensions = new Set(['doc', 'docx', 'ppt', 'pptx', 'odt', 'odp'])
const spreadsheetExtensions = new Set(['xls', 'xlsx', 'ods'])
const audioExtensions = new Set([
  'mp3',
  'wav',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'wma',
  'aiff',
  'aif',
  'amr',
])
const videoExtensions = new Set([
  'mp4',
  'mov',
  'mkv',
  'webm',
  'avi',
  'm4v',
  'flv',
  'wmv',
  'mpg',
  'mpeg',
  'ts',
  '3gp',
])
const archiveExtensions = new Set([
  'zip',
  '7z',
  'rar',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
])
const ebookExtensions = new Set(['epub', 'mobi', 'azw3'])
const visionImageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

export type AttachmentEngineOptions = {
  model: AgentModelId
  soffice: string | null
  ffmpeg: string | null
  signal?: AbortSignal
  onProgress?: (stage: string) => void
}

export type PreparedAgentAttachment = AgentAttachmentPick & {
  /** Original path chosen by the user. */
  sourcePath: string
  text?: string
  upload?: AgentAttachmentUpload[]
  audio?: string[]
  /** Temporary files and folders removed after send or removal. */
  tempPaths: string[]
}

export type PrepareAttachmentResult =
  | { attachment: PreparedAgentAttachment }
  | { skipped: string }

export function attachmentKindForName(
  name: string,
): AgentAttachmentKind | null {
  const extension = fileExtension(name)
  if (textExtensions.has(extension)) return 'text'
  if (extension === 'pdf') return 'pdf'
  if (officeExtensions.has(extension)) return 'office'
  if (spreadsheetExtensions.has(extension)) return 'spreadsheet'
  if (extension === 'ofd') return 'ofd'
  if (imageExtensions.has(extension)) return 'image'
  if (audioExtensions.has(extension)) return 'audio'
  if (videoExtensions.has(extension)) return 'video'
  if (archiveExtensions.has(extension)) return 'archive'
  if (ebookExtensions.has(extension)) return 'ebook'
  return null
}

export function agentAttachmentPick(
  attachment: PreparedAgentAttachment,
): AgentAttachmentPick {
  const {
    id,
    name,
    size,
    kind,
    mode,
    needsModelUpload,
    detail,
    uploadError,
    truncated,
  } = attachment
  return {
    id,
    name,
    size,
    kind,
    mode,
    needsModelUpload,
    ...(detail ? { detail } : {}),
    ...(uploadError ? { uploadError } : {}),
    truncated,
  }
}

export async function releaseAgentAttachment(
  attachment: Pick<PreparedAgentAttachment, 'tempPaths'>,
): Promise<void> {
  await Promise.all(
    attachment.tempPaths.map((path) =>
      rm(path, { recursive: true, force: true }).catch(() => {}),
    ),
  )
}

function baseAttachment(
  path: string,
  size: number,
  kind: AgentAttachmentKind,
  mode: AgentAttachmentMode,
  options: {
    needsModelUpload?: boolean
    detail?: string
    truncated?: boolean
  } = {},
): PreparedAgentAttachment {
  return {
    id: randomUUID(),
    name: basename(path),
    size,
    kind,
    mode,
    sourcePath: path,
    needsModelUpload: options.needsModelUpload ?? false,
    ...(options.detail ? { detail: options.detail } : {}),
    truncated: options.truncated ?? false,
    tempPaths: [],
  }
}

function skipped(message: string): PrepareAttachmentResult {
  return { skipped: message }
}

function isUploadModel(options: AttachmentEngineOptions): boolean {
  return options.model === 'deepseek-flash'
}

function remainingText(remaining: number): number {
  return Math.min(agentAttachmentFileChars, Math.max(0, remaining))
}

export async function prepareAgentAttachment(
  path: string,
  remaining: number,
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (options.signal?.aborted) throw new Error('附件解析已取消')
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return skipped('不是可读取的文件')
  if (info.size === 0) return skipped('文件是空的')
  const kind = attachmentKindForName(path)
  if (!kind) return skipped(`暂不支持 ${extname(path) || '该格式'}`)

  try {
    switch (kind) {
      case 'text':
        return await prepareText(path, info.size, remaining, options)
      case 'pdf':
        return await preparePdf(path, info.size, remaining, options)
      case 'office':
      case 'spreadsheet':
        return await prepareOffice(path, info.size, remaining, kind, options)
      case 'ofd':
        return await prepareOfd(path, info.size, options)
      case 'image':
        return await prepareImage(path, info.size, options)
      case 'audio':
        return await prepareMedia(path, info.size, 'audio', options)
      case 'video':
        return await prepareMedia(path, info.size, 'video', options)
      case 'ebook':
        return await prepareEbook(path, info.size, remaining, options)
      case 'archive':
        return await prepareArchive(path, info.size, remaining, options)
    }
  } catch (error) {
    if (options.signal?.aborted) throw error
    return skipped(
      error instanceof Error ? error.message : '读取附件失败',
    )
  }
}

type TableData = {
  markdown: string
  rows: number
  columns: number
  truncated: boolean
}

function parseTable(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else quoted = false
      } else field += character
      continue
    }
    if (character === '"') {
      quoted = true
      continue
    }
    if (character === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    if (character !== '\r') field += character
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()))
}

function tableMarkdown(
  text: string,
  delimiter: string,
  limit: number,
): TableData | null {
  const rows = parseTable(text, delimiter)
  if (!rows.length) return null
  const columns = Math.min(
    20,
    Math.max(...rows.map((cells) => cells.length)),
  )
  const clean = (value: string | undefined): string =>
    (value ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  const lines = [
    `| ${Array.from({ length: columns }, (_, index) => clean(rows[0][index]) || ' ').join(' | ')} |`,
    `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`,
  ]
  let used = lines.join('\n').length
  let read = 0
  let truncated = rows.length > 500 || Math.max(...rows.map((cells) => cells.length)) > columns
  for (const cells of rows.slice(1, 500)) {
    const line = `| ${Array.from({ length: columns }, (_, index) => clean(cells[index])).join(' | ')} |`
    if (used + line.length + 1 > limit) {
      truncated = true
      break
    }
    lines.push(line)
    used += line.length + 1
    read += 1
  }
  return {
    markdown: lines.join('\n').slice(0, limit),
    rows: read + 1,
    columns,
    truncated,
  }
}

async function prepareText(
  path: string,
  size: number,
  remaining: number,
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (remaining <= 0) return skipped('本轮附件文字已达上限')
  if (size > agentAttachmentFileBytes) return skipped('文本超过 2 MB')
  options.onProgress?.('读取文本')
  const raw = await readPlainText(path)
  if (options.signal?.aborted) throw new Error('附件解析已取消')
  if (!raw?.trim()) return skipped('没有可读取的文字')
  const limit = remainingText(remaining)
  const extension = fileExtension(path)
  if (extension === 'csv' || extension === 'tsv') {
    const table = tableMarkdown(
      raw,
      extension === 'tsv' ? '\t' : ',',
      limit,
    )
    if (table) {
      const attachment = baseAttachment(path, size, 'text', 'text', {
        detail: `${extension.toUpperCase()} · ${table.rows} 行 · 表格`,
        truncated: table.truncated,
      })
      attachment.text = table.markdown
      return { attachment }
    }
  }
  const text = raw.slice(0, limit)
  const attachment = baseAttachment(path, size, 'text', 'text', {
    detail: '本地文本',
    truncated: text.length < raw.length,
  })
  attachment.text = text
  return { attachment }
}

async function preparePdf(
  path: string,
  size: number,
  remaining: number,
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (size > agentAttachmentBinaryBytes) return skipped('PDF 超过 20 MB')
  const limit = remainingText(remaining)
  if (limit > 0) options.onProgress?.('抽取 PDF 文字')
  const extracted =
    limit > 0
      ? await pdfTextFromPath(path, limit, options.signal)
      : { text: '', pages: 0, truncated: false }
  if (limit > 0 && extracted.text.trim().length >= 20) {
    const attachment = baseAttachment(path, size, 'pdf', 'text', {
      detail: `PDF · ${extracted.pages} 页 · 本地文本`,
      truncated: extracted.truncated,
    })
    attachment.text = extracted.text
    return { attachment }
  }
  if (!isUploadModel(options))
    return skipped(
      limit > 0
        ? '扫描版 PDF 需要 Flash 上传解析'
        : '本轮附件文字已达上限，PDF 需要 Flash 上传解析',
    )
  options.onProgress?.('准备上传解析')
  const scanned = extracted.pages > 0
  const attachment = baseAttachment(path, size, 'pdf', 'document', {
    needsModelUpload: true,
    detail:
      extracted.pages > 0
        ? `PDF · ${extracted.pages} 页 · ${
            scanned ? '富版面解析' : '上传解析'
          }`
        : 'PDF · 上传解析',
  })
  attachment.upload = [
    {
      path,
      purpose: scanned ? 'rich_layout_recognition' : 'text_recognition',
    },
  ]
  return { attachment }
}

async function prepareOffice(
  path: string,
  size: number,
  remaining: number,
  kind: 'office' | 'spreadsheet',
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (size > agentAttachmentBinaryBytes) return skipped('文档超过 20 MB')
  const limit = remainingText(remaining)
  const extension = fileExtension(path).toUpperCase()
  if (options.soffice && limit > 0) {
    options.onProgress?.(
      kind === 'spreadsheet' ? '读取表格' : '转换文档',
    )
    if (kind === 'spreadsheet') {
      let table: TableData | null = null
      try {
        const csv = await officeCsvBuffer(
          options.soffice,
          path,
          options.signal,
        )
        table = tableMarkdown(csv.toString('utf8'), ',', limit)
      } catch (error) {
        if (options.signal?.aborted) throw error
      }
      if (table) {
        const attachment = baseAttachment(path, size, kind, 'text', {
          detail: `${extension} · 表格 · ${table.rows} 行`,
          truncated: table.truncated,
        })
        attachment.text = table.markdown
        return { attachment }
      }
    }
    let bytes: Buffer | null = null
    try {
      bytes = await officePdfBuffer(options.soffice, path, options.signal)
    } catch (error) {
      if (options.signal?.aborted) throw error
    }
    if (bytes) {
      options.onProgress?.('抽取文字')
      const extracted = await pdfTextFromBytes(bytes, limit, options.signal)
      if (extracted.text.trim().length >= 20) {
        const attachment = baseAttachment(path, size, kind, 'text', {
          detail: `${extension} · 本地文本`,
          truncated: extracted.truncated,
        })
        attachment.text = extracted.text
        return { attachment }
      }
    }
  }
  if (!isUploadModel(options))
    return skipped(`${extension} 需要 Flash 上传解析`)
  const uploadable =
    kind === 'spreadsheet'
      ? extension === 'XLS' || extension === 'XLSX'
      : ['DOC', 'DOCX', 'PPT', 'PPTX'].includes(extension)
  if (!uploadable)
    return skipped(`${extension} 需要先安装 LibreOffice`)
  options.onProgress?.('准备上传解析')
  const attachment = baseAttachment(path, size, kind, 'document', {
    needsModelUpload: true,
    detail: `${extension} · 上传解析`,
  })
  attachment.upload = [
    {
      path,
      purpose: kind === 'spreadsheet' ? 'user_data' : 'text_recognition',
    },
  ]
  return { attachment }
}

async function prepareOfd(
  path: string,
  size: number,
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (size > agentAttachmentBinaryBytes) return skipped('OFD 超过 20 MB')
  if (!isUploadModel(options))
    return skipped('OFD 需要 Flash 视觉解析')
  options.onProgress?.('渲染 OFD 页面')
  const { renderOfdPageBuffers } = await import('../convert-ofd')
  const pages = await renderOfdPageBuffers(path, options.signal)
  if (!pages.length) return skipped('OFD 没有可渲染的页面')
  options.onProgress?.('准备视觉解析')
  const selected = pages.slice(0, agentAttachmentOfdPages)
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-ofd-'))
  const upload: AgentAttachmentUpload[] = []
  try {
    for (const [index, bytes] of selected.entries()) {
      if (options.signal?.aborted) throw new Error('附件解析已取消')
      const page = join(directory, `page-${index + 1}.png`)
      await writeFile(page, bytes)
      upload.push({ path: page, purpose: 'user_data' })
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
    throw error
  }
  const attachment = baseAttachment(path, size, 'ofd', 'vision', {
    needsModelUpload: true,
    detail:
      pages.length > selected.length
        ? `OFD · ${selected.length}/${pages.length} 页 · 视觉解析`
        : `OFD · ${selected.length} 页 · 视觉解析`,
    truncated: pages.length > selected.length,
  })
  attachment.upload = upload
  attachment.tempPaths.push(directory)
  return { attachment }
}

async function prepareImage(
  path: string,
  size: number,
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (size > agentAttachmentBinaryBytes) return skipped('图片超过 20 MB')
  if (!isUploadModel(options))
    return skipped('图片需要 Flash 视觉解析')
  const extension = fileExtension(path)
  options.onProgress?.('准备视觉解析')
  const attachment = baseAttachment(path, size, 'image', 'vision', {
    needsModelUpload: true,
    detail: '图片 · 视觉解析',
  })
  if (visionImageExtensions.has(extension)) {
    attachment.upload = [{ path, purpose: 'user_data' }]
    return { attachment }
  }
  options.onProgress?.('转换图片')
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-image-'))
  const converted = join(directory, 'image.png')
  try {
    await sharp(path)
      .rotate()
      .resize({
        width: 4096,
        height: 4096,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toFile(converted)
    if (options.signal?.aborted) throw new Error('附件解析已取消')
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
    throw error
  }
  attachment.upload = [{ path: converted, purpose: 'user_data' }]
  attachment.tempPaths.push(directory)
  return { attachment }
}

async function videoFrames(
  ffmpeg: string,
  path: string,
  directory: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const duration = await probeDuration(ffmpeg, path, signal)
  const times =
    duration && duration > 0
      ? Array.from(
          { length: 4 },
          (_, index) => (duration * (index + 0.5)) / 4,
        )
      : [null]
  const frames: string[] = []
  for (const [index, time] of times.entries()) {
    const output = join(
      directory,
      `frame-${String(index + 1).padStart(2, '0')}.jpg`,
    )
    await runFfmpeg(
      ffmpeg,
      [
        ...(time === null ? [] : ['-ss', String(time)]),
        '-i',
        path,
        '-an',
        '-frames:v',
        '1',
        '-vf',
        'scale=1280:-2',
        '-q:v',
        '4',
        output,
      ],
      signal,
    )
    const info = await stat(output).catch(() => null)
    if (info?.isFile() && info.size > 0) frames.push(output)
  }
  return frames
}

async function prepareMedia(
  path: string,
  size: number,
  kind: 'audio' | 'video',
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (size > agentAttachmentMediaBytes)
    return skipped(`${kind === 'audio' ? '音频' : '视频'}超过 200 MB`)
  const chunks: string[] = []
  const tempPaths: string[] = []
  options.onProgress?.('检查音频')
  if (
    kind === 'audio' &&
    size <= 8 * 1024 * 1024 &&
    pcmWavInfo(await readFile(path))
  ) {
    chunks.push(path)
  } else {
    if (!options.ffmpeg)
      return skipped(
        kind === 'video'
          ? '视频转写需要先安装 FFmpeg'
          : '音频转写需要先安装 FFmpeg',
      )
    options.onProgress?.(kind === 'video' ? '提取音轨' : '转码音频')
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-audio-'))
    tempPaths.push(directory)
    try {
      chunks.push(
        ...(await audioChunks(
          options.ffmpeg,
          path,
          directory,
          options.signal,
        )),
      )
    } catch (error) {
      await releaseAgentAttachment({ tempPaths })
      throw error
    }
  }
  if (options.signal?.aborted) {
    await releaseAgentAttachment({ tempPaths })
    throw new Error('附件解析已取消')
  }
  if (!chunks.length) return skipped('没有可转写的音频')
  const attachment = baseAttachment(path, size, kind, 'audio', {
    detail: `${kind === 'audio' ? '音频' : '视频'} · 语音转写`,
  })
  attachment.audio = chunks
  attachment.tempPaths.push(...tempPaths)
  if (kind === 'video' && options.ffmpeg && isUploadModel(options)) {
    options.onProgress?.('提取视频画面')
    const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-frames-'))
    try {
      const frames = await videoFrames(
        options.ffmpeg,
        path,
        directory,
        options.signal,
      )
      if (frames.length) {
        attachment.mode = 'vision'
        attachment.needsModelUpload = true
        attachment.upload = frames.map((frame) => ({
          path: frame,
          purpose: 'user_data' as const,
        }))
        attachment.detail = `视频 · ${frames.length} 帧 + 语音转写`
        attachment.tempPaths.push(directory)
      } else await rm(directory, { recursive: true, force: true })
    } catch (error) {
      await rm(directory, { recursive: true, force: true })
      if (options.signal?.aborted) {
        await releaseAgentAttachment({ tempPaths })
        throw error
      }
    }
  }
  return { attachment }
}

const ebookImageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

async function epubImageFiles(
  path: string,
  directory: string,
): Promise<string[]> {
  const buffer = await readFile(path)
  let expanded = 0
  const entries = unzipSync(new Uint8Array(buffer), {
    filter: (file) => {
      if (file.name.endsWith('/')) return false
      if (!ebookImageExtensions.has(fileExtension(file.name))) return false
      const size = file.originalSize ?? 0
      expanded += size
      return (
        size >= 20 * 1024 &&
        size <= 4 * 1024 * 1024 &&
        expanded <= 40 * 1024 * 1024
      )
    },
  })
  const files: string[] = []
  for (const [name, bytes] of Object.entries(entries)) {
    if (files.length >= 4) break
    if (!bytes?.length) continue
    const output = join(
      directory,
      `image-${files.length + 1}.${fileExtension(name) || 'jpg'}`,
    )
    await writeFile(output, bytes)
    files.push(output)
  }
  return files
}

async function prepareEbook(
  path: string,
  size: number,
  remaining: number,
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (size > agentAttachmentBinaryBytes) return skipped('电子书超过 20 MB')
  const extension = fileExtension(path)
  if (extension === 'azw3') return skipped('暂不支持 AZW3，请先转换为 EPUB')
  const limit = remainingText(remaining)
  if (extension === 'epub') {
    if (limit > 0) {
      options.onProgress?.('读取电子书')
      const text = await epubText(path, limit).catch(() => null)
      if (options.signal?.aborted) throw new Error('附件解析已取消')
      if (text?.trim()) {
        const attachment = baseAttachment(path, size, 'ebook', 'text', {
          detail: 'EPUB · 本地文本',
          truncated: text.length >= limit,
        })
        attachment.text = text
        if (isUploadModel(options)) {
          const directory = await mkdtemp(join(tmpdir(), 'mqmz-agent-epub-'))
          const images = await epubImageFiles(path, directory).catch(
            () => [],
          )
          if (images.length) {
            attachment.mode = 'vision'
            attachment.needsModelUpload = true
            attachment.upload = images.map((image) => ({
              path: image,
              purpose: 'user_data' as const,
            }))
            attachment.detail = `EPUB · 文本 + ${images.length} 图`
            attachment.tempPaths.push(directory)
          } else await rm(directory, { recursive: true, force: true })
        }
        return { attachment }
      }
      return skipped('EPUB 没有可读取的文字')
    }
    if (!isUploadModel(options))
      return skipped('本轮附件文字已达上限，EPUB 需要 Flash 上传解析')
  } else if (!isUploadModel(options)) {
    return skipped('MOBI 需要 Flash 上传解析')
  }
  options.onProgress?.('准备上传解析')
  const attachment = baseAttachment(path, size, 'ebook', 'document', {
    needsModelUpload: true,
    detail: `${extension.toUpperCase()} · 上传解析`,
  })
  attachment.upload = [{ path, purpose: 'user_data' }]
  return { attachment }
}

type ArchiveBudget = {
  used: number
  budget: number
  read: number
  seen: number
  nested: number
}

async function collectArchiveFolder(
  folder: string,
  prefix: string,
  name: string,
  depth: number,
  budget: ArchiveBudget,
  options: AttachmentEngineOptions,
  root: string,
): Promise<string[]> {
  const sections: string[] = []
  const entries = await walkFiles(folder)
  for (const entry of entries) {
    if (options.signal?.aborted) throw new Error('附件解析已取消')
    if (budget.used >= budget.budget) break
    budget.seen += 1
    if (entry.relative.startsWith('__MACOSX/')) continue
    if (entry.relative.split('/').some((part) => part.startsWith('.')))
      continue
    const relative = prefix
      ? `${prefix}/${entry.relative}`
      : entry.relative
    const extension = fileExtension(entry.path)
    if (
      depth < 2 &&
      budget.nested < 10 &&
      archiveExtensions.has(extension) &&
      entry.size <= agentAttachmentArchiveBytes
    ) {
      const nestedRoot = await mkdtemp(join(root, 'nested-'))
      const copy = join(nestedRoot, basename(entry.path))
      try {
        await copyFile(entry.path, copy)
        options.onProgress?.('解压嵌套压缩包')
        const { folder: inner } = await extractArchive(copy, {
          inputBytes: agentAttachmentArchiveBytes,
          entries: agentAttachmentArchiveEntries,
          expandedBytes: agentAttachmentArchiveExpandedBytes,
        })
        budget.nested += 1
        sections.push(
          ...(await collectArchiveFolder(
            inner,
            relative,
            name,
            depth + 1,
            budget,
            options,
            root,
          )),
        )
      } catch (error) {
        if (options.signal?.aborted) throw error
      }
      continue
    }
    const header = `<attachment name="${escapeAttribute(
      `${name}/${relative}`,
    )}">\n`
    const footer = '\n</attachment>'
    const overhead = header.length + footer.length + 2
    if (budget.used + overhead >= budget.budget) break
    const limit = budget.budget - budget.used - overhead
    const text = await innerText(entry.path, limit, options).catch(
      () => null,
    )
    if (!text?.trim()) continue
    const clipped = text.slice(0, limit)
    sections.push(`${header}${clipped}${footer}`)
    budget.used += overhead + clipped.length
    budget.read += 1
  }
  return sections
}

async function prepareArchive(
  path: string,
  size: number,
  remaining: number,
  options: AttachmentEngineOptions,
): Promise<PrepareAttachmentResult> {
  if (size > agentAttachmentArchiveBytes) return skipped('压缩包超过 20 MB')
  if (remaining <= 0) return skipped('本轮附件文字已达上限')
  const root = await mkdtemp(join(tmpdir(), 'mqmz-agent-archive-'))
  try {
    const copy = join(root, basename(path))
    await copyFile(path, copy)
    options.onProgress?.('解压压缩包')
    const { folder } = await extractArchive(copy, {
      inputBytes: agentAttachmentArchiveBytes,
      entries: agentAttachmentArchiveEntries,
      expandedBytes: agentAttachmentArchiveExpandedBytes,
    })
    if (options.signal?.aborted) throw new Error('附件解析已取消')
    const budget: ArchiveBudget = {
      used: 0,
      budget: remainingText(remaining),
      read: 0,
      seen: 0,
      nested: 0,
    }
    options.onProgress?.('读取压缩包内容')
    const sections = await collectArchiveFolder(
      folder,
      '',
      basename(path),
      0,
      budget,
      options,
      root,
    )
    if (!sections.length) return skipped('压缩包里没有可读取的文字')
    const truncated =
      budget.used >= budget.budget || budget.seen > budget.read
    const attachment = baseAttachment(path, size, 'archive', 'text', {
      detail: `压缩包 · ${budget.read} 个文件 · 本地文本`,
      truncated,
    })
    attachment.text = [
      '以下是压缩包内读取到的文件内容：',
      ...sections,
      ...(truncated ? ['（其余文件未展开）'] : []),
    ].join('\n\n')
    attachment.tempPaths.push(root)
    return { attachment }
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function innerText(
  path: string,
  budget: number,
  options: AttachmentEngineOptions,
): Promise<string | null> {
  if (budget <= 0) return null
  const extension = fileExtension(path)
  const info = await stat(path).catch(() => null)
  if (!info?.isFile() || info.size === 0) return null
  if (textExtensions.has(extension)) {
    if (info.size > agentAttachmentFileBytes) return null
    const text = await readPlainText(path)
    return text?.trim() ? text.slice(0, budget) : null
  }
  if (extension === 'pdf' && info.size <= agentAttachmentBinaryBytes) {
    const extracted = await pdfTextFromPath(path, budget, options.signal)
    return extracted.text.trim() ? extracted.text : null
  }
  if (
    (officeExtensions.has(extension) ||
      spreadsheetExtensions.has(extension)) &&
    options.soffice &&
    info.size <= agentAttachmentBinaryBytes
  ) {
    let bytes: Buffer | null = null
    try {
      bytes = await officePdfBuffer(options.soffice, path, options.signal)
    } catch (error) {
      if (options.signal?.aborted) throw error
    }
    if (!bytes) return null
    const extracted = await pdfTextFromBytes(bytes, budget, options.signal)
    return extracted.text.trim() ? extracted.text : null
  }
  if (extension === 'epub' && info.size <= agentAttachmentBinaryBytes) {
    return epubText(path, budget)
  }
  return null
}

async function walkFiles(
  root: string,
): Promise<Array<{ relative: string; path: string; size: number }>> {
  const files: Array<{ relative: string; path: string; size: number }> = []
  const stack: string[] = [root]
  while (stack.length && files.length < agentAttachmentArchiveEntries) {
    const directory = stack.pop()!
    const children = await readdir(directory, { withFileTypes: true })
    for (const child of children) {
      if (child.isSymbolicLink()) continue
      const path = join(directory, child.name)
      if (child.isDirectory()) {
        stack.push(path)
        continue
      }
      if (!child.isFile()) continue
      const info = await stat(path)
      files.push({
        relative: relative(root, path).split(sep).join('/'),
        path,
        size: info.size,
      })
      if (files.length >= agentAttachmentArchiveEntries) break
    }
  }
  return files
}

function decodeText(buffer: Buffer): string | null {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe)
    return buffer.subarray(2).toString('utf16le')
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const copy = Buffer.from(buffer.subarray(2))
    copy.swap16()
    return copy.toString('utf16le')
  }
  if (buffer.includes(0)) return null
  return buffer.toString('utf8')
}

export async function readPlainText(path: string): Promise<string | null> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile() || info.size > agentAttachmentFileBytes) return null
  const buffer = await readFile(path)
  return decodeText(buffer)
}

type PdfExtraction = { text: string; pages: number; truncated: boolean }

async function pdfTextFromPath(
  path: string,
  limit: number,
  signal?: AbortSignal,
): Promise<PdfExtraction> {
  return pdfTextFromBytes(await readFile(path), limit, signal)
}

async function pdfTextFromBytes(
  bytes: Uint8Array,
  limit: number,
  signal?: AbortSignal,
): Promise<PdfExtraction> {
  if (signal?.aborted) throw new Error('附件读取已取消')
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    verbosity: 0,
  })
  try {
    const document = await task.promise
    const parts: string[] = []
    let length = 0
    let truncated = false
    const pages = Math.min(document.numPages, 1000)
    for (let index = 1; index <= pages; index += 1) {
      if (signal?.aborted) throw new Error('附件读取已取消')
      if (length >= limit) {
        truncated = true
        break
      }
      const page = await document.getPage(index)
      const content = await page.getTextContent()
      for (const item of content.items) {
        if (!('str' in item)) continue
        parts.push(item.str)
        length += item.str.length
        if (item.hasEOL) {
          parts.push('\n')
          length += 1
        }
        if (length >= limit) break
      }
      parts.push('\n\n')
      length += 2
    }
    const text = parts.join('').replace(/\n{3,}/g, '\n\n').trim()
    return {
      text: text.slice(0, limit),
      pages: document.numPages,
      truncated:
        truncated || text.length > limit || document.numPages > pages,
    }
  } catch (error) {
    if ((error as { name?: string })?.name === 'PasswordException')
      throw new Error('PDF 已加密，暂不支持读取')
    throw error
  } finally {
    await task.destroy().catch(() => {})
  }
}

function epubText(path: string, limit: number): Promise<string> {
  return readFile(path).then((buffer) => {
    let expanded = 0
    const entries = unzipSync(new Uint8Array(buffer), {
      filter: (file) => {
        if (file.name.endsWith('/')) return false
        const size = file.originalSize ?? 0
        expanded += size
        if (expanded > 100 * 1024 * 1024)
          throw new Error('EPUB 解压后体积过大')
        return size <= 8 * 1024 * 1024
      },
    })
    const decoder = new TextDecoder()
    const files = new Map<string, Uint8Array>()
    for (const [name, data] of Object.entries(entries))
      files.set(name.replace(/\\/g, '/'), data)
    const container = files.get('META-INF/container.xml')
    let opfPath: string | undefined
    if (container) {
      const rootfile = /<rootfile\b[^>]*>/i.exec(decoder.decode(container))
      opfPath = rootfile?.[0]
        ? attribute(rootfile[0], 'full-path')
        : undefined
    }
    if (!opfPath) {
      opfPath = [...files.keys()].find((name) =>
        name.toLowerCase().endsWith('.opf'),
      )
    }
    if (!opfPath || !files.has(opfPath)) return ''
    const opf = decoder.decode(files.get(opfPath)!)
    const base = posix.dirname(opfPath)
    const items = new Map<string, string>()
    for (const tag of opf.match(/<item\b[^>]*>/gi) ?? []) {
      const id = attribute(tag, 'id')
      const href = attribute(tag, 'href')
      const media = attribute(tag, 'media-type') ?? ''
      if (!id || !href) continue
      if (
        !/xhtml|html|xml|text/i.test(media) &&
        !/\.(xhtml|html|htm|txt)$/i.test(href)
      )
        continue
      const resolved = safeArchivePath(base, href)
      if (resolved) items.set(id, resolved)
    }
    const spine = (opf.match(/<itemref\b[^>]*>/gi) ?? [])
      .map((tag) => attribute(tag, 'idref'))
      .filter((id): id is string => Boolean(id))
    const ordered = spine
      .map((id) => items.get(id))
      .filter((name): name is string => Boolean(name))
    const fallback = [...files.keys()].filter((name) =>
      /\.(xhtml|html|htm|txt)$/i.test(name),
    )
    const selected = ordered.length ? ordered : fallback
    const parts: string[] = []
    let length = 0
    for (const name of selected) {
      if (length >= limit) break
      const data = files.get(name)
      if (!data) continue
      const text = htmlToText(decoder.decode(data))
      if (!text) continue
      parts.push(text)
      length += text.length
    }
    return parts.join('\n\n').slice(0, limit)
  })
}

function safeArchivePath(base: string, href: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(href.split('#')[0])
  } catch {
    return null
  }
  if (!decoded || decoded.startsWith('/') || /^[a-z]+:/i.test(decoded))
    return null
  const resolved = posix.normalize(posix.join(base, decoded))
  if (resolved.startsWith('../') || resolved === '..') return null
  return resolved
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    'i',
  ).exec(tag)
  return match?.[1] ?? match?.[2]
}

function htmlToText(value: string): string {
  return decodeEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_all, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_all, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

type PcmWav = {
  sampleRate: number
  channels: number
  bits: number
  dataBytes: number
  duration: number
}

function pcmWavInfo(buffer: Buffer): PcmWav | null {
  if (
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  )
    return null
  let offset = 12
  let format: number | null = null
  let channels = 0
  let sampleRate = 0
  let bits = 0
  let dataBytes = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ' && body + 16 <= buffer.length) {
      format = buffer.readUInt16LE(body)
      channels = buffer.readUInt16LE(body + 2)
      sampleRate = buffer.readUInt32LE(body + 4)
      bits = buffer.readUInt16LE(body + 14)
    } else if (id === 'data') {
      dataBytes = Math.min(size, buffer.length - body)
      break
    }
    offset = body + size + (size % 2)
  }
  if (
    format !== 1 ||
    ![1, 2].includes(channels) ||
    ![8000, 16000, 22050, 24000, 32000, 44100, 48000].includes(
      sampleRate,
    ) ||
    bits !== 16 ||
    !dataBytes
  )
    return null
  const duration = dataBytes / (sampleRate * channels * 2)
  if (duration > 120 || dataBytes > 8 * 1024 * 1024) return null
  return { sampleRate, channels, bits, dataBytes, duration }
}

function runFfmpeg(
  binary: string,
  args: string[],
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('附件读取已取消'))
      return
    }
    execFile(
      binary,
      ['-hide_banner', '-loglevel', 'error', '-y', ...args],
      {
        timeout: 10 * 60 * 1000,
        maxBuffer: 2 * 1024 * 1024,
        env: ffmpegEnv(binary),
        signal,
      },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve()
          return
        }
        if (signal?.aborted) reject(new Error('附件读取已取消'))
        else
          reject(
            new Error(
              String(stderr || '').trim() ||
                'FFmpeg 处理音视频失败。',
            ),
          )
      },
    )
  })
}

function probeDuration(
  binary: string,
  path: string,
  signal?: AbortSignal,
): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      binary,
      ['-hide_banner', '-i', path],
      {
        timeout: 20_000,
        maxBuffer: 2 * 1024 * 1024,
        env: ffmpegEnv(binary),
        signal,
      },
      (_error, _stdout, stderr) => {
        const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(
          String(stderr || ''),
        )
        if (!match) {
          resolve(null)
          return
        }
        resolve(
          Number(match[1]) * 3600 +
            Number(match[2]) * 60 +
            Number(match[3]),
        )
      },
    )
  })
}

async function audioChunks(
  ffmpeg: string,
  path: string,
  directory: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const duration = await probeDuration(ffmpeg, path, signal)
  if (duration !== null && duration > agentAttachmentMediaSeconds)
    throw new Error('音视频超过 10 分钟，请先截短')
  if (duration === null) {
    const output = join(directory, 'part-1.wav')
    await runFfmpeg(
      ffmpeg,
      [
        '-i',
        path,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        output,
      ],
      signal,
    )
    const info = await stat(output)
    if (info.size > 8 * 1024 * 1024)
      throw new Error('音频超过 8 MB，需要安装 FFmpeg 后分段')
    return [output]
  }
  const count = Math.max(
    1,
    Math.ceil(duration / agentAttachmentAudioSegmentSeconds),
  )
  const outputs: string[] = []
  for (let index = 0; index < count; index += 1) {
    const start = index * agentAttachmentAudioSegmentSeconds
    const length = Math.min(
      agentAttachmentAudioSegmentSeconds,
      duration - start,
    )
    const output = join(directory, `part-${index + 1}.wav`)
    await runFfmpeg(
      ffmpeg,
      [
        '-i',
        path,
        '-ss',
        String(start),
        '-t',
        String(length),
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        output,
      ],
      signal,
    )
    outputs.push(output)
  }
  return outputs
}
