import txt from './assets/file-icons/txt.svg'
import pdf from './assets/file-icons/pdf.svg'
import image from './assets/file-icons/image.svg'
import video from './assets/file-icons/video.svg'
import markdown from './assets/file-icons/markdown.svg'
import document from './assets/file-icons/document.svg'

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
])

/** File-type artwork chosen by extension; unknown documents use the blue sheet. */
export function fileIconFor(name: string): string {
  const extension = extensionOf(name)
  if (extension === 'md' || extension === 'markdown') return markdown
  if (extension === 'txt' || extension === 'text' || extension === 'log')
    return txt
  if (extension === 'pdf') return pdf
  if (imageExtensions.has(extension)) return image
  if (videoExtensions.has(extension)) return video
  return document
}
