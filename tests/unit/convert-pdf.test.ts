import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { afterEach, describe, expect, test } from 'vitest'
import {
  imageToPdf,
  mergePdfs,
  splitPdf,
} from '../../src/main/convert-pdf'

const folders: string[] = []

async function workspace(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'mqmz-pdf-test-'))
  folders.push(folder)
  return folder
}

async function pdf(path: string, pages: number): Promise<void> {
  const document = await PDFDocument.create()
  for (let index = 0; index < pages; index += 1)
    document.addPage([200, 300])
  await writeFile(path, await document.save())
}

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  )
})

describe('PDF conversion', () => {
  test('merges PDFs into convert_output', async () => {
    const folder = await workspace()
    const first = join(folder, '一.pdf')
    const second = join(folder, '二.pdf')
    await pdf(first, 2)
    await pdf(second, 1)

    const output = await mergePdfs([first, second])
    expect(output.endsWith('convert_output/一-合并.pdf')).toBe(true)
    const merged = await PDFDocument.load(await readFile(output))
    expect(merged.getPageCount()).toBe(3)
  })

  test('splits every page into its own PDF', async () => {
    const folder = await workspace()
    const source = join(folder, '合同.pdf')
    await pdf(source, 3)

    const result = await splitPdf(source)
    expect(result.pages).toBe(3)
    expect(result.folder.endsWith('convert_output/合同')).toBe(true)
    for (let page = 1; page <= 3; page += 1) {
      const document = await PDFDocument.load(
        await readFile(join(result.folder, `page-${page}.pdf`)),
      )
      expect(document.getPageCount()).toBe(1)
    }
  })

  test('wraps an image into a one-page PDF beside it', async () => {
    const folder = await workspace()
    const source = join(folder, '封面.png')
    await sharp({
      create: { width: 60, height: 40, channels: 3, background: '#336699' },
    })
      .png()
      .toFile(source)

    const output = await imageToPdf(source, false)
    expect(output).toBe(join(folder, '封面.pdf'))
    const document = await PDFDocument.load(await readFile(output))
    expect(document.getPageCount()).toBe(1)
  })
})
