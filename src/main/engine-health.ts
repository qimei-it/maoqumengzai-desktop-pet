/** Startup health checks for engines bundled with the application. */
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import sharp from 'sharp'
import { zipSync } from 'fflate'
import { createExtractorFromData } from 'node-unrar-js'
import { builtinEngines } from '../shared/conversion-engines'
import { sevenZipBinaryPath } from './archive-zip'
import { easyOfdBase } from './convert-ofd'

export type BuiltinEngineHealth = {
  status: 'ready' | 'error'
  version: string
  error?: string
}

function moduleRoot(packageName: string): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : join(app.getAppPath(), 'node_modules')
  return join(base, packageName)
}

async function requireFile(path: string): Promise<void> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.size === 0)
      throw new Error('组件文件缺失或为空。')
  } catch {
    throw new Error('组件文件缺失或为空。')
  }
}

async function checkEach(): Promise<Record<string, BuiltinEngineHealth>> {
  const results: Record<string, BuiltinEngineHealth> = {}
  const run = async (
    id: string,
    version: string,
    check: () => Promise<void>,
  ): Promise<void> => {
    try {
      await check()
      results[id] = { status: 'ready', version }
    } catch (error) {
      results[id] = {
        status: 'error',
        version,
        error: error instanceof Error ? error.message : '组件不可用。',
      }
    }
  }
  const versions = new Map(
    builtinEngines.map((engine) => [engine.id, engine.version]),
  )
  const version = (id: string): string => versions.get(id) ?? 'unknown'

  await run('sharp', version('sharp'), async () => {
    const image = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer()
    if (image.length === 0) throw new Error('sharp 无法生成图片。')
  })
  await run('pdf-lib', version('pdf-lib'), async () => {
    const document = await PDFDocument.create()
    document.addPage([10, 10])
    const bytes = await document.save()
    if (bytes.length === 0) throw new Error('pdf-lib 无法生成 PDF。')
  })
  await run('pdfjs', version('pdfjs'), async () => {
    if (typeof getDocument !== 'function')
      throw new Error('PDF.js 渲染模块缺失。')
    for (const name of ['build/pdf.worker.mjs', 'legacy/build/pdf.worker.mjs'])
      await requireFile(join(moduleRoot('pdfjs-dist'), name))
  })
  await run('chromium', version('chromium'), async () => {
    if (!process.versions.chrome) throw new Error('Chromium 版本信息缺失。')
  })
  await run('easyofd', version('easyofd'), async () => {
    const base = easyOfdBase()
    for (const name of [
      'easyofd.js',
      'lib/jszip.min.js',
      'lib/x2js.js',
      'lib/opentype.min.js',
      'lib/eaysjbig2.js',
    ])
      await requireFile(join(base, name))
  })
  await run('7zip', version('7zip'), async () => {
    const binary = sevenZipBinaryPath()
    if (!binary) throw new Error('7-Zip 二进制路径缺失。')
    await requireFile(binary)
  })
  await run('unrar', version('unrar'), async () => {
    if (typeof createExtractorFromData !== 'function')
      throw new Error('RAR 解压模块缺失。')
  })
  await run('fflate', version('fflate'), async () => {
    const archive = zipSync({ 'health.txt': new Uint8Array([109, 113]) })
    if (archive.length === 0) throw new Error('ZIP 模块无法生成归档。')
  })
  return results
}

let cached: Record<string, BuiltinEngineHealth> | undefined

export async function checkBuiltinEngines(
  force = false,
): Promise<Record<string, BuiltinEngineHealth>> {
  if (!cached || force) cached = await checkEach()
  return cached
}
