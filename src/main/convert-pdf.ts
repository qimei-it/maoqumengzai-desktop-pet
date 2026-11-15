/** Image → PDF, PDF merge/split, PDF → images/text, all local and offline. */
import { readFile, unlink } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { pdf } from 'pdf-to-img'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import sharp from 'sharp'
import { imagePipeline } from './image-source'
import {
  mergedOutputName,
  outputDirectory,
  outputName,
  pdfPageName,
  splitOutputDirectory,
  splitPageName,
} from '../shared/convert'
import { writeExclusive } from './write-output'

const A4: [number, number] = [595.28, 841.89]
const margin = 24

function abortError(): Error {
  const error = new Error('转换已取消')
  error.name = 'AbortError'
  return error
}

export async function imageToPdf(
  sourcePath: string,
  batch: boolean,
): Promise<string> {
  const pipeline = (await imagePipeline(sourcePath)).rotate()
  const metadata = await pipeline.metadata()
  if (!metadata.width || !metadata.height)
    throw new Error('无法读取图片尺寸。')
  const jpeg = await pipeline
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92 })
    .toBuffer()
  const pdf = await PDFDocument.create()
  const image = await pdf.embedJpg(jpeg)
  const landscape = metadata.width > metadata.height
  const [width, height] = landscape ? [A4[1], A4[0]] : A4
  const scale = Math.min(
    (width - margin * 2) / metadata.width,
    (height - margin * 2) / metadata.height,
  )
  const drawWidth = metadata.width * scale
  const drawHeight = metadata.height * scale
  const page = pdf.addPage([width, height])
  page.drawImage(image, {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  })
  const bytes = await pdf.save()
  return writeExclusive(
    outputDirectory(sourcePath, batch),
    (attempt) => outputName(sourcePath, 'pdf', attempt),
    bytes,
  )
}

export async function mergePdfs(
  paths: string[],
  signal?: AbortSignal,
): Promise<string> {
  if (paths.length < 2) throw new Error('至少需要两个 PDF 才能合并。')
  const output = await PDFDocument.create()
  for (const path of paths) {
    if (signal?.aborted) throw abortError()
    const source = await PDFDocument.load(await readFile(path))
    const pages = await output.copyPages(source, source.getPageIndices())
    for (const page of pages) output.addPage(page)
  }
  const bytes = await output.save()
  const first = paths[0]
  return writeExclusive(
    outputDirectory(first, true),
    (attempt) => mergedOutputName(first, attempt),
    bytes,
  )
}

/** Splits every page into its own PDF inside convert_output/<source name>/. */
export async function splitPdf(
  sourcePath: string,
  signal?: AbortSignal,
): Promise<{ folder: string; pages: number; files: string[] }> {
  if (signal?.aborted) throw abortError()
  const source = await PDFDocument.load(await readFile(sourcePath))
  const count = source.getPageCount()
  if (count < 1) throw new Error('PDF 没有页面。')
  const folder = splitOutputDirectory(sourcePath)
  const files: string[] = []
  try {
    for (let index = 0; index < count; index += 1) {
      if (signal?.aborted) throw abortError()
      const output = await PDFDocument.create()
      const [page] = await output.copyPages(source, [index])
      output.addPage(page)
      files.push(
        await writeExclusive(
          folder,
          (attempt) => splitPageName(index + 1, attempt),
          await output.save(),
        ),
      )
    }
  } catch (error) {
    await Promise.all(files.map((file) => unlink(file).catch(() => {})))
    if (signal?.aborted) throw abortError()
    throw error
  }
  return { folder, pages: count, files }
}

export async function pdfToImages(
  sourcePath: string,
  extension: 'png' | 'jpg',
  signal?: AbortSignal,
): Promise<{ folder: string; pages: number; files: string[] }> {
  if (signal?.aborted) throw abortError()
  const folder = splitOutputDirectory(sourcePath)
  const files: string[] = []
  let page = 0
  try {
    const document = await pdf(sourcePath, { scale: 2 })
    for await (const image of document) {
      if (signal?.aborted) throw abortError()
      page += 1
      const bytes =
        extension === 'png'
          ? image
          : await sharp(image).jpeg({ quality: 90 }).toBuffer()
      files.push(
        await writeExclusive(
          folder,
          (attempt) => pdfPageName(page, extension, attempt),
          bytes,
        ),
      )
    }
  } catch (error) {
    await Promise.all(files.map((file) => unlink(file).catch(() => {})))
    if (signal?.aborted) throw abortError()
    throw error
  }
  if (page === 0) throw new Error('PDF 没有页面。')
  return { folder, pages: page, files }
}

export async function pdfToText(
  sourcePath: string,
  batch: boolean,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw abortError()
  const task = getDocument({
    data: new Uint8Array(await readFile(sourcePath)),
    useSystemFonts: true,
    verbosity: 0,
  })
  try {
    const document = await task.promise
    const pages: string[] = []
    for (let index = 1; index <= document.numPages; index += 1) {
      if (signal?.aborted) throw abortError()
      const page = await document.getPage(index)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str
        if (item.hasEOL) text += '\n'
      }
      pages.push(text.trimEnd())
    }
    const value = pages.join('\n\n').trim()
    if (!value) throw new Error('这是扫描版 PDF，暂不支持 OCR。')
    if (signal?.aborted) throw abortError()
    return writeExclusive(
      outputDirectory(sourcePath, batch),
      (attempt) => outputName(sourcePath, 'txt', attempt),
      Buffer.from(value, 'utf8'),
    )
  } finally {
    await task.destroy()
  }
}
