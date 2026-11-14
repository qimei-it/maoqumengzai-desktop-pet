import txt from './assets/file-icons/txt.svg'
import pdf from './assets/file-icons/pdf.svg'
import archive7z from './assets/file-icons/7z.svg'
import archive from './assets/file-icons/archive.svg'
import image from './assets/file-icons/image.svg'
import video from './assets/file-icons/video.svg'
import audio from './assets/file-icons/audio.svg'
import markdown from './assets/file-icons/markdown.svg'
import pages from './assets/file-icons/pages.png'
import keynote from './assets/file-icons/keynote.png'
import numbers from './assets/file-icons/numbers.png'
import document from './assets/file-icons/document.svg'
import folder from './assets/file-icons/folder.svg'
import spreadsheet from './assets/file-icons/spreadsheet.svg'
import csv from './assets/file-icons/csv.svg'
import slides from './assets/file-icons/slides.svg'
import doc from './assets/file-icons/doc.svg'
import psd from './assets/file-icons/psd.svg'
import xml from './assets/file-icons/xml.svg'
import exe from './assets/file-icons/exe.svg'
import code from './assets/file-icons/code.svg'
import shortcut from './assets/file-icons/shortcut.svg'

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

const imageExtensions = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'svg',
  'avif',
  'jfif',
  'ico',
  'icns',
  // Camera raw stays on the image artwork.
  'raw',
  'dng',
  'cr2',
  'cr3',
  'nef',
  'arw',
  'orf',
  'rw2',
])
const videoExtensions = new Set([
  // `.ts` stays a video container (MPEG-TS); TypeScript files keep this icon.
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
  'vob',
  'mts',
  'm2ts',
  'ogv',
  'asf',
  'f4v',
  'rmvb',
  'rm',
])

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
  'alac',
  'mid',
  'midi',
])

const archiveExtensions = new Set([
  'zip',
  'zipx',
  'rar',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'tbz2',
  'xz',
  'txz',
  'zst',
  'lz',
  'lzma',
  'cab',
  'iso',
  'jar',
  'war',
  'ear',
  'arj',
  'lzh',
])

const spreadsheetExtensions = new Set([
  'xls',
  'xlsx',
  'xlsm',
  'xlsb',
  'numbers',
  'ods',
])
const csvExtensions = new Set(['csv', 'tsv'])
const slidesExtensions = new Set(['ppt', 'pptx', 'pps', 'ppsx', 'key', 'odp'])
const docExtensions = new Set([
  'doc',
  'docx',
  'rtf',
  'odt',
  'pages',
  'ofd',
  'epub',
  'mobi',
  'azw3',
  'djvu',
  'ics',
  'vcf',
  'xmind',
  'mm',
  'mindnode',
])
const psdExtensions = new Set(['psd', 'psb', 'ai', 'sketch', 'fig'])
const xmlExtensions = new Set(['xml', 'xsl', 'xslt', 'plist', 'drawio'])
const exeExtensions = new Set([
  'exe',
  'msi',
  'com',
  'bat',
  'cmd',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'apk',
  'appimage',
  'ipa',
  'appx',
  'msix',
])
const codeExtensions = new Set([
  'js',
  'mjs',
  'cjs',
  'jsx',
  'tsx',
  'vue',
  'svelte',
  'py',
  'java',
  'c',
  'h',
  'cpp',
  'cc',
  'hpp',
  'cs',
  'go',
  'rs',
  'rb',
  'php',
  'swift',
  'kt',
  'kts',
  'scala',
  'lua',
  'pl',
  'r',
  'dart',
  'sql',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'vbs',
  'gradle',
  'groovy',
  'tex',
  'ipynb',
  'rmd',
])
const shortcutExtensions = new Set(['lnk', 'alias', 'url', 'webloc', 'desktop'])
// Pages, Keynote and Numbers save as macOS document packages (folders), so the
// extension decides their artwork even when the shelf records a directory.
const documentPackageExtensions = new Set(['pages', 'key', 'numbers'])

export function isAppleDocumentPackage(name: string): boolean {
  return documentPackageExtensions.has(extensionOf(name))
}

/** File-type artwork chosen by extension; unknown documents use the blue sheet. */
export function fileIconFor(
  name: string,
  kind: 'file' | 'folder' = 'file',
  shortcutFile = false,
): string {
  const extension = extensionOf(name)
  if (kind === 'folder' && !isAppleDocumentPackage(name)) return folder
  if (shortcutFile) return shortcut
  if (extension === 'pages') return pages
  if (extension === 'key') return keynote
  if (extension === 'numbers') return numbers
  if (extension === '7z') return archive7z
  if (archiveExtensions.has(extension)) return archive
  if (extension === 'md' || extension === 'markdown') return markdown
  if (extension === 'txt' || extension === 'text' || extension === 'log')
    return txt
  if (extension === 'srt' || extension === 'ass' || extension === 'vtt')
    return txt
  if (extension === 'lrc') return txt
  if (extension === 'pdf') return pdf
  if (imageExtensions.has(extension)) return image
  if (videoExtensions.has(extension)) return video
  if (audioExtensions.has(extension)) return audio
  if (spreadsheetExtensions.has(extension)) return spreadsheet
  if (csvExtensions.has(extension)) return csv
  if (slidesExtensions.has(extension)) return slides
  if (docExtensions.has(extension)) return doc
  if (psdExtensions.has(extension)) return psd
  if (xmlExtensions.has(extension)) return xml
  if (exeExtensions.has(extension)) return exe
  if (shortcutExtensions.has(extension)) return shortcut
  if (codeExtensions.has(extension)) return code
  return document
}
