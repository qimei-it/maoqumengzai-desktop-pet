/** CSV, TXT, Markdown and HTML → PDF using a hidden Chromium print surface. */
import { BrowserWindow, session, type Session } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { marked } from 'marked'
import { outputDirectory, outputName } from '../shared/convert'
import { parseCsv } from './convert-spreadsheet'
import { writeExclusive } from './write-output'

const baseStyle = `
:root { color-scheme: light; }
body {
  margin: 0;
  color: #1a1a1a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 12pt;
  line-height: 1.65;
}
h1, h2, h3, h4 { line-height: 1.3; margin: 0.8em 0 0.35em; }
h1 { font-size: 22pt; }
h2 { font-size: 18pt; }
h3 { font-size: 15pt; }
p { margin: 0.5em 0; }
pre, code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 10pt;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 10px;
  border-radius: 8px;
  background: #f5f3ef;
}
table { width: 100%; border-collapse: collapse; margin: 0.6em 0; font-size: 10pt; }
th, td { padding: 6px 8px; border: 1px solid #d9d4cb; text-align: left; vertical-align: top; }
th { background: #f5f3ef; font-weight: 600; }
blockquote { margin: 0.6em 0; padding-left: 12px; border-left: 3px solid #d9d4cb; color: #666; }
img { max-width: 100%; }
@page { size: A4; }
`

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}



function csvHtml(value: string): string {
  const rows = parseCsv(value.replace(/^\uFEFF/, ''))
  if (!rows.length) return '<p>空 CSV</p>'
  const [head, ...body] = rows
  const headHtml = head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')
  const bodyHtml = body
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
    )
    .join('')
  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}

function documentHtml(html: string, baseHref: string): string {
  const head = `<meta charset="utf-8"><base href="${baseHref}"><style>${baseStyle}</style>`
  if (/<\/head>/i.test(html))
    return html.replace(/<\/head>/i, `${head}</head>`)
  if (/<head[\s>]/i.test(html))
    return html.replace(/(<head[^>]*>)/i, `$1${head}`)
  if (/<html[\s>]/i.test(html))
    return html.replace(/(<html[^>]*>)/i, `$1<head>${head}</head>`)
  return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`
}

let pdfSession: Session | undefined

function documentPdfSession(): Session {
  if (!pdfSession) {
    pdfSession = session.fromPartition('mqmz-document-pdf', { cache: false })
    pdfSession.webRequest.onBeforeRequest(
      {
        urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'],
      },
      (_details, callback) => callback({ cancel: true }),
    )
  }
  return pdfSession
}

function abortError(): Error {
  const error = new Error('转换已取消')
  error.name = 'AbortError'
  return error
}

async function renderHtmlToPdf(
  html: string,
  baseHref: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (signal?.aborted) throw abortError()
  const directory = await mkdtemp(join(tmpdir(), 'mqmz-document-'))
  const source = join(directory, 'document.html')
  await writeFile(source, documentHtml(html, baseHref), 'utf8')
  const window = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      session: documentPdfSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      backgroundThrottling: false,
    },
  })
  const onAbort = (): void => {
    if (!window.isDestroyed()) window.destroy()
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    await window.loadFile(source)
    if (signal?.aborted) throw abortError()
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5,
      },
    })
    if (signal?.aborted) throw abortError()
    return pdf
  } catch (error) {
    if (signal?.aborted) throw abortError()
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (!window.isDestroyed()) window.destroy()
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

export async function convertDocumentToPdf(
  sourcePath: string,
  batch: boolean,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw abortError()
  const text = await readFile(sourcePath, 'utf8')
  const extension = extname(sourcePath).slice(1).toLowerCase()
  const html =
    extension === 'csv'
      ? csvHtml(text)
      : extension === 'txt'
        ? `<pre>${escapeHtml(text)}</pre>`
        : extension === 'md' || extension === 'markdown'
          ? String(await marked.parse(text))
          : text
  const baseHref = `${pathToFileURL(dirname(sourcePath)).href}/`
  const pdf = await renderHtmlToPdf(html, baseHref, signal)
  if (signal?.aborted) throw abortError()
  return writeExclusive(
    outputDirectory(sourcePath, batch),
    (attempt) => outputName(sourcePath, 'pdf', attempt),
    pdf,
  )
}
