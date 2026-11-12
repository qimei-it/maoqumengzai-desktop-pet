/** Screenshot file helpers shared by the watcher and tests. */
const imageExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.heic',
  '.bmp',
  '.gif',
])

const screenshotName =
  /(screenshot|screen[ -]?shot|截屏|屏幕快照|屏幕截图)/i

export function isImageFileName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && imageExtensions.has(name.slice(dot).toLowerCase())
}

export function isScreenshotCandidate(
  name: string,
  dedicatedFolder: boolean,
): boolean {
  if (!isImageFileName(name)) return false
  return dedicatedFolder || screenshotName.test(name)
}
