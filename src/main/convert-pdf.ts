/** Image → PDF, PDF merge and PDF page splitting, all local and offline. */
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import {
  mergedOutputName,
  outputDirectory,
  outputName,
  splitOutputDirectory,
  splitPageName,
} from '../shared/convert'
import { writeExclusive } from './write-output'

const A4: [number, number] = [595.28, 841.89]
const margin = 24

export async function imageToPdf(
  sourcePath: string,
  batch: boolean,
): Promise<string> {
  const pipeline = sharp(sourcePath, {
    limitInputPixels: 100_000_000,
  }).rotate()
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

export async function mergePdfs(paths: string[]): Promise<string> {
  if (paths.length < 2) throw new Error('至少需要两个 PDF 才能合并。')
  const output = await PDFDocument.create()
  for (const path of paths) {
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
): Promise<{ folder: string; pages: number }> {
  const source = await PDFDocument.load(await readFile(sourcePath))
  const count = source.getPageCount()
  if (count < 1) throw new Error('PDF 没有页面。')
  const folder = splitOutputDirectory(sourcePath)
  for (let index = 0; index < count; index += 1) {
    const output = await PDFDocument.create()
    const [page] = await output.copyPages(source, [index])
    output.addPage(page)
    await writeExclusive(
      folder,
      (attempt) => splitPageName(index + 1, attempt),
      await output.save(),
    )
  }
  return { folder, pages: count }
}
