/** OFD → PDF/PNG/JPG using EasyOFD in a hidden Chromium window. */
import { app, BrowserWindow } from 'electron'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import {
  outputDirectory,
  outputName,
  pdfPageName,
  splitOutputDirectory,
} from '../shared/convert'
import { writeExclusive } from './write-output'

function easyOfdHtml(): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'easyofd')
    : join(app.getAppPath(), 'node_modules', 'easyofd')
  const script = (path: string) => pathToFileURL(path).href
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#fff}
  .ofd-toolbar,.ofd-watermark{display:none!important}
  .ofd-page-wrapper{box-shadow:none!important;margin:0!important}
  </style></head><body><div id="ofd-container"></div>
  <script src="${script(join(base, 'lib', 'jszip.min.js'))}"></script>
  <script src="${script(join(base, 'lib', 'x2js.js'))}"></script>
  <script src="${script(join(base, 'lib', 'opentype.min.js'))}"></script>
  <script src="${script(join(base, 'lib', 'eaysjbig2.js'))}"></script>
  <script src="${script(join(base, 'easyofd.js'))}"></script>
  <script>
  window.renderOfd = function (base64) {
    return new Promise(function (resolve, reject) {
      try {
        var binary = atob(base64)
        var bytes = new Uint8Array(binary.length)
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        var container = document.getElementById('ofd-container')
        var instance = new EasyOFD('mqmz-ofd', container)
        var started = Date.now()
        var timer = setInterval(function () {
          var canvases = Array.prototype.slice.call(
            container.querySelectorAll('.ofd-page-wrapper canvas'),
          )
          var count = instance.allPageNo
          if (count && canvases.length >= count) {
            clearInterval(timer)
            resolve(canvases.map(function (canvas) {
              return canvas.toDataURL('image/png')
            }))
          } else if (Date.now() - started > 30000) {
            clearInterval(timer)
            reject(new Error('OFD 渲染超时'))
          }
        }, 150)
        instance.loadFromBlob(new Blob([bytes], { type: 'application/ofd' }))
      } catch (error) {
        reject(error)
      }
    })
  }
  </script></body></html>`
}

function abortError(): Error {
  const error = new Error('转换已取消')
  error.name = 'AbortError'
  return error
}

export async function ofdToImages(
  sourcePath: string,
  extension: 'png' | 'jpg',
  signal?: AbortSignal,
): Promise<{ folder: string; pages: number; files: string[] }> {
  if (signal?.aborted) throw abortError()
  const pages = await renderOfdPages(sourcePath, signal)
  const folder = splitOutputDirectory(sourcePath)
  const files: string[] = []
  let page = 0
  try {
    for (const png of pages) {
      if (signal?.aborted) throw abortError()
      page += 1
      const bytes =
        extension === 'png'
          ? png
          : await sharp(png)
              .flatten({ background: { r: 255, g: 255, b: 255 } })
              .jpeg({ quality: 90 })
              .toBuffer()
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
  if (!page) throw new Error('OFD 没有可渲染的页面。')
  return { folder, pages: page, files }
}

export async function ofdToPdf(
  sourcePath: string,
  batch: boolean,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw abortError()
  const pages = await renderOfdPages(sourcePath, signal)
  if (!pages.length) throw new Error('OFD 没有可渲染的页面。')
  const pdf = await PDFDocument.create()
  for (const png of pages) {
    if (signal?.aborted) throw abortError()
    const image = await pdf.embedPng(png)
    const width = image.width * 0.75
    const height = image.height * 0.75
    const page = pdf.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
  }
  if (signal?.aborted) throw abortError()
  return writeExclusive(
    outputDirectory(sourcePath, batch),
    (attempt) => outputName(sourcePath, 'pdf', attempt),
    await pdf.save(),
  )
}

async function renderOfdPages(
  sourcePath: string,
  signal?: AbortSignal,
): Promise<Buffer[]> {
  if (signal?.aborted) throw abortError()
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-ofd-'))
  const htmlPath = join(directory, 'ofd.html')
  await writeFile(htmlPath, easyOfdHtml(), 'utf8')
  const window = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      backgroundThrottling: false,
    },
  })
  const onAbort = (): void => {
    if (!window.isDestroyed()) window.destroy()
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    await window.loadFile(htmlPath)
    if (signal?.aborted) throw abortError()
    const base64 = (await readFile(sourcePath)).toString('base64')
    const urls = await window.webContents.executeJavaScript(
      `window.renderOfd(${JSON.stringify(base64)})`,
      true,
    )
    if (signal?.aborted) throw abortError()
    if (!Array.isArray(urls) || !urls.length)
      throw new Error('OFD 没有可渲染的页面。')
    return urls.map((url: string) =>
      Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'),
    )
  } catch (error) {
    if (signal?.aborted) throw abortError()
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (!window.isDestroyed()) window.destroy()
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
