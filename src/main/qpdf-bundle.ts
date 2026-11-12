/** Bundled qpdf binary and the environment needed to run its dylibs/DLLs. */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { app } from 'electron'

const platformKey = `${process.platform}-${process.arch}`

export function qpdfBundleRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'engines', 'qpdf', platformKey)
    : join(app.getAppPath(), 'resources', 'engines', 'qpdf', platformKey)
}

export function qpdfBinaryPath(): string | null {
  const root = qpdfBundleRoot()
  const binary =
    process.platform === 'win32'
      ? join(root, 'qpdf.exe')
      : join(root, 'bin', 'qpdf')
  return existsSync(binary) ? binary : null
}

export function qpdfEnv(binaryPath: string): NodeJS.ProcessEnv {
  const directory = dirname(binaryPath)
  const env = { ...process.env }
  if (process.platform === 'darwin') {
    const library = join(directory, '..', 'lib')
    if (existsSync(library))
      env.DYLD_LIBRARY_PATH = [library, env.DYLD_LIBRARY_PATH]
        .filter(Boolean)
        .join(delimiter)
  } else if (process.platform === 'win32') {
    env.PATH = [directory, env.PATH].filter(Boolean).join(delimiter)
  }
  return env
}

export function qpdfVersion(binaryPath: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      ['--version'],
      { timeout: 10_000, env: qpdfEnv(binaryPath) },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error('qpdf 无法运行。'))
          return
        }
        resolve(
          /qpdf version\s+([\d.]+)/i.exec(`${stdout}\n${stderr}`)?.[1],
        )
      },
    )
  })
}
