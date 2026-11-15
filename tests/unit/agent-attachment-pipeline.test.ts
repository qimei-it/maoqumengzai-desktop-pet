import { describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { zipSync, strToU8 } from 'fflate'
import sharp from 'sharp'
import {
  prepareAgentAttachment,
  releaseAgentAttachment,
} from '../../src/main/agent/attachment-pipeline'

async function directory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mqmz-pipeline-'))
}

const flash = { model: 'deepseek-flash' as const, soffice: null, ffmpeg: null }
const pro = { model: 'deepseek-v4-pro' as const, soffice: null, ffmpeg: null }

function wav(seconds: number): Buffer {
  const sampleRate = 16_000
  const samples = Math.round(sampleRate * seconds)
  const data = Buffer.alloc(samples * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

async function textPdf(): Promise<Buffer> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const page = document.addPage()
  page.drawText('Hello attachment pipeline', { x: 60, y: 700, font, size: 18 })
  return Buffer.from(await document.save())
}

async function longPdf(pages: number): Promise<Buffer> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < pages; index += 1) {
    const page = document.addPage()
    page.drawText(`Page ${index + 1} of a long attachment`, {
      x: 60,
      y: 700,
      font,
      size: 14,
    })
  }
  return Buffer.from(await document.save())
}

function hasQpdf(): boolean {
  return spawnSync('qpdf', ['--version']).status === 0
}

function textDocx(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Office attachment test</w:t></w:r></w:p></w:body></w:document>',
    ),
  })
}

const soffice = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
const ffmpeg =
  process.env.MQMZ_TEST_FFMPEG ??
  join(
    homedir(),
    'Library/Application Support/mqmz-desktop/engines/ffmpeg/6.0/ffmpeg',
  )

describe('agent attachment pipeline', () => {
  test('reads plain text locally', async () => {
    const root = await directory()
    const path = join(root, 'notes.md')
    await writeFile(path, '# 标题\n这里是附件内容')
    const result = await prepareAgentAttachment(path, 30_000, flash)
    expect('attachment' in result).toBe(true)
    if (!('attachment' in result)) return
    expect(result.attachment).toMatchObject({
      kind: 'text',
      mode: 'text',
      needsModelUpload: false,
      text: '# 标题\n这里是附件内容',
    })
  })

  test('extracts text from a PDF locally', async () => {
    const root = await directory()
    const path = join(root, 'report.pdf')
    await writeFile(path, await textPdf())
    const result = await prepareAgentAttachment(path, 30_000, flash)
    expect('attachment' in result).toBe(true)
    if (!('attachment' in result)) return
    expect(result.attachment.mode).toBe('text')
    expect(result.attachment.text).toContain('Hello attachment pipeline')
  })

  test('reads a long PDF and marks it truncated by the text budget', async () => {
    const root = await directory()
    const path = join(root, 'long.pdf')
    await writeFile(path, await longPdf(300))
    const result = await prepareAgentAttachment(path, 4_000, flash)
    expect('attachment' in result).toBe(true)
    if (!('attachment' in result)) return
    expect(result.attachment.mode).toBe('text')
    expect(result.attachment.detail).toContain('300 页')
    expect(result.attachment.truncated).toBe(true)
    expect(result.attachment.text?.length).toBeLessThanOrEqual(4_000)
    expect(result.attachment.text).toContain('Page 1 of a long attachment')
  })

  test('rejects a PDF that needs a password', async () => {
    if (!hasQpdf()) return
    const root = await directory()
    const plain = join(root, 'plain.pdf')
    const encrypted = join(root, 'locked.pdf')
    await writeFile(plain, await textPdf())
    execFileSync('qpdf', [
      '--encrypt',
      'user-pass',
      'owner-pass',
      '256',
      '--',
      plain,
      encrypted,
    ])
    const result = await prepareAgentAttachment(encrypted, 30_000, flash)
    expect(result).toEqual({ skipped: 'PDF 已加密，暂不支持读取' })
  })

  test('stops reading a large archive at the text budget', async () => {
    const root = await directory()
    const path = join(root, 'bundle.zip')
    const entries: Record<string, Uint8Array> = {}
    for (let index = 0; index < 400; index += 1)
      entries[`docs/file-${index}.md`] = strToU8(
        `# 文件 ${index}\n${'内容'.repeat(20)}`,
      )
    await writeFile(path, zipSync(entries))
    const result = await prepareAgentAttachment(path, 5_000, flash)
    expect('attachment' in result).toBe(true)
    if (!('attachment' in result)) return
    expect(result.attachment.mode).toBe('text')
    expect(result.attachment.detail).toMatch(/压缩包 · \d+ 个文件/)
    expect(result.attachment.truncated).toBe(true)
    expect(result.attachment.text?.length).toBeLessThan(8_000)
    expect(result.attachment.text).toContain('文件 0')
    await releaseAgentAttachment(result.attachment)
  })

  test.skipIf(process.platform !== 'darwin' || !existsSync(ffmpeg))(
    'extracts the audio track from a real video',
    async () => {
      const root = await directory()
      const path = join(root, 'clip.mp4')
      execFileSync(
        ffmpeg,
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=320x240:d=1',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=1',
          '-shortest',
          '-c:v',
          'libx264',
          '-c:a',
          'aac',
          path,
        ],
        { stdio: 'ignore' },
      )
      const result = await prepareAgentAttachment(path, 30_000, {
        model: 'deepseek-flash',
        soffice: null,
        ffmpeg,
      })
      expect('attachment' in result).toBe(true)
      if (!('attachment' in result)) return
      expect(result.attachment.kind).toBe('video')
      expect(result.attachment.mode).toBe('audio')
      expect(result.attachment.detail).toContain('视频 · 语音转写')
      const chunk = result.attachment.audio?.[0]
      expect(chunk).toBeTruthy()
      if (!chunk) return
      const bytes = await readFile(chunk)
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')
      expect(bytes.readUInt32LE(24)).toBe(16_000)
      await releaseAgentAttachment(result.attachment)
    },
    60_000,
  )

  test('reports parsing stages and honors an aborted signal', async () => {
    const root = await directory()
    const path = join(root, 'progress.pdf')
    await writeFile(path, await textPdf())
    const stages: string[] = []
    await prepareAgentAttachment(path, 30_000, {
      ...flash,
      onProgress: (stage) => stages.push(stage),
    })
    expect(stages).toContain('抽取 PDF 文字')
    const controller = new AbortController()
    controller.abort()
    await expect(
      prepareAgentAttachment(path, 30_000, {
        ...flash,
        signal: controller.signal,
      }),
    ).rejects.toThrow('附件解析已取消')
  })

  test.skipIf(!existsSync(soffice))(
    'extracts DOCX text through the local LibreOffice engine',
    async () => {
      const root = await directory()
      const path = join(root, 'report.docx')
      await writeFile(path, textDocx())
      const result = await prepareAgentAttachment(path, 30_000, {
        model: 'deepseek-flash',
        soffice,
        ffmpeg: null,
      })
      expect('attachment' in result).toBe(true)
      if (!('attachment' in result)) return
      expect(result.attachment.mode).toBe('text')
      expect(result.attachment.text).toContain('Office attachment test')
    },
    60_000,
  )

  test('sends a scanned PDF to the upload path on Flash and blocks it on Pro', async () => {
    const root = await directory()
    const path = join(root, 'scan.pdf')
    const document = await PDFDocument.create()
    document.addPage()
    await writeFile(path, await document.save())

    const uploaded = await prepareAgentAttachment(path, 30_000, flash)
    expect('attachment' in uploaded).toBe(true)
    if ('attachment' in uploaded) {
      expect(uploaded.attachment.mode).toBe('document')
      expect(uploaded.attachment.needsModelUpload).toBe(true)
      expect(uploaded.attachment.upload?.[0].purpose).toBe('text_recognition')
    }

    const blocked = await prepareAgentAttachment(path, 30_000, pro)
    expect('skipped' in blocked).toBe(true)
  })

  test('extracts EPUB text from its spine', async () => {
    const root = await directory()
    const path = join(root, 'book.epub')
    const zip = zipSync({
      'META-INF/container.xml': strToU8(
        '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
      ),
      'OEBPS/content.opf': strToU8(
        '<?xml version="1.0"?><package><manifest><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
      ),
      'OEBPS/chapter1.xhtml': strToU8(
        '<html><body><h1>第一章</h1><p>这是电子书内容。</p></body></html>',
      ),
    })
    await writeFile(path, zip)
    const result = await prepareAgentAttachment(path, 30_000, flash)
    expect('attachment' in result).toBe(true)
    if (!('attachment' in result)) return
    expect(result.attachment.mode).toBe('text')
    expect(result.attachment.text).toContain('第一章')
    expect(result.attachment.text).toContain('这是电子书内容。')
  })

  test('marks images as vision uploads and blocks them on Pro', async () => {
    const root = await directory()
    const path = join(root, 'image.png')
    await writeFile(path, await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 240, g: 200, b: 180 },
      },
    }).png().toBuffer())
    const result = await prepareAgentAttachment(path, 30_000, flash)
    expect('attachment' in result).toBe(true)
    if ('attachment' in result) {
      expect(result.attachment.mode).toBe('vision')
      expect(result.attachment.needsModelUpload).toBe(true)
      expect(result.attachment.upload?.[0].purpose).toBe('user_data')
    }
    expect('skipped' in (await prepareAgentAttachment(path, 30_000, pro))).toBe(
      true,
    )
  })

  test('reads archives into local text and cleans temporary files', async () => {
    const root = await directory()
    const path = join(root, 'bundle.zip')
    await writeFile(
      path,
      zipSync({
        'readme.txt': strToU8('压缩包里的说明。'),
        'src/main.ts': strToU8('console.log("hello")'),
        'image.png': new Uint8Array([0, 1, 2, 3]),
      }),
    )
    const result = await prepareAgentAttachment(path, 30_000, flash)
    expect('attachment' in result).toBe(true)
    if (!('attachment' in result)) return
    expect(result.attachment.mode).toBe('text')
    expect(result.attachment.text).toContain('压缩包里的说明。')
    expect(result.attachment.text).toContain('console.log')
    expect(result.attachment.tempPaths.length).toBe(1)
    await releaseAgentAttachment(result.attachment)
  })

  test('uses a valid PCM WAV directly for speech recognition', async () => {
    const root = await directory()
    const path = join(root, 'voice.wav')
    await writeFile(path, wav(1))
    const result = await prepareAgentAttachment(path, 30_000, flash)
    expect('attachment' in result).toBe(true)
    if (!('attachment' in result)) return
    expect(result.attachment.mode).toBe('audio')
    expect(result.attachment.audio).toEqual([path])
  })

  test.skipIf(process.platform !== 'darwin' || !existsSync(ffmpeg))(
    'converts other audio formats to 16 kHz mono WAV through FFmpeg',
    async () => {
      const root = await directory()
      const path = join(root, 'voice.aiff')
      execFileSync('say', ['-o', path, '你好，这是语音测试。'])
      const result = await prepareAgentAttachment(path, 30_000, {
        model: 'deepseek-flash',
        soffice: null,
        ffmpeg,
      })
      expect('attachment' in result).toBe(true)
      if (!('attachment' in result)) return
      expect(result.attachment.mode).toBe('audio')
      const chunk = result.attachment.audio?.[0]
      expect(chunk).toBeTruthy()
      if (!chunk) return
      const bytes = await readFile(chunk)
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF')
      expect(bytes.readUInt16LE(22)).toBe(1)
      expect(bytes.readUInt32LE(24)).toBe(16_000)
      expect((await stat(chunk)).size).toBeLessThan(8 * 1024 * 1024)
      await releaseAgentAttachment(result.attachment)
    },
    60_000,
  )

  test('rejects unsupported and empty files', async () => {
    const root = await directory()
    const unsupported = join(root, 'thing.xyz')
    await writeFile(unsupported, 'nope')
    expect(
      'skipped' in (await prepareAgentAttachment(unsupported, 30_000, flash)),
    ).toBe(true)
    const empty = join(root, 'empty.txt')
    await writeFile(empty, ' ')
    expect('skipped' in (await prepareAgentAttachment(empty, 30_000, flash))).toBe(
      true,
    )
  })
})
