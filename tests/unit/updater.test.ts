import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  root: '',
  openPath: vi.fn(async () => ''),
  quit: vi.fn(),
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '1.0.7',
    getPath: (name: string) => name === 'userData' ? mock.root : join(mock.root, 'downloads'),
    quit: mock.quit,
  },
  shell: { openPath: mock.openPath, trashItem: vi.fn() },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 1 })) },
}))

let updater: typeof import('../../src/main/updater')
const body = Buffer.from('verified installer')
const digest = createHash('sha256').update(body).digest('hex')
const file = 'mqmz-1.0.8-test.dmg'
const manifest = () => ({
  version: '1.0.8',
  assets: { [`${process.platform}-${process.arch}`]: { file, size: body.length, sha256: digest } },
})

beforeEach(async () => {
  mock.root = await mkdtemp(join(tmpdir(), 'mqmz-updater-test-'))
  mock.openPath.mockClear()
  vi.resetModules()
  updater = await import('../../src/main/updater')
})
afterEach(async () => {
  updater.disposeUpdater()
  vi.unstubAllGlobals()
  await rm(mock.root, { recursive: true, force: true })
})

describe('update download', () => {
  test('downloads and verifies the installer before opening it', async () => {
    const fetch = vi.fn(async (url: string | URL) =>
      String(url).includes('latest.json')
        ? Response.json(manifest())
        : new Response(body),
    )
    vi.stubGlobal('fetch', fetch)
    expect((await updater.checkForUpdates()).status).toBe('available')
    expect(await updater.downloadUpdate()).toMatchObject({ status: 'downloaded', version: '1.0.8', percent: 100 })
    const target = join(mock.root, 'updates', file)
    expect(await readFile(target)).toEqual(body)
    await updater.installUpdate()
    expect(mock.openPath).toHaveBeenCalledWith(target)
  })

  test('installs the current verified download even if an old marker remains', async () => {
    await writeFile(join(mock.root, 'update-pending.json'), JSON.stringify({ version: '1.0.6', path: join(mock.root, 'old.dmg') }))
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) =>
      String(url).includes('latest.json') ? Response.json(manifest()) : new Response(body),
    ))
    await updater.checkForUpdates()
    await updater.downloadUpdate()
    await writeFile(join(mock.root, 'update-pending.json'), JSON.stringify({ version: '1.0.6', path: join(mock.root, 'old.dmg') }))
    await updater.installUpdate()
    expect(mock.openPath).toHaveBeenCalledWith(join(mock.root, 'updates', file))
  })

  test('cancels an active download, removes the partial file and permits retry', async () => {
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])) },
    })
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) =>
      String(url).includes('latest.json') ? Response.json(manifest()) : new Response(stream),
    ))
    await updater.checkForUpdates()
    const downloading = updater.downloadUpdate()
    await vi.waitFor(async () => {
      expect((await stat(join(mock.root, 'updates', `${file}.part`))).size).toBe(3)
    })
    updater.cancelUpdateDownload()
    expect(await downloading).toMatchObject({ status: 'available', version: '1.0.8' })
    expect(await readdir(join(mock.root, 'updates'))).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    expect((await updater.downloadUpdate()).status).toBe('downloaded')
  })

  test('a corrupt existing installer in Downloads is not removed', async () => {
    await mkdir(join(mock.root, 'downloads'))
    const existing = join(mock.root, 'downloads', file)
    await writeFile(existing, 'user file')
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) =>
      String(url).includes('latest.json') ? Response.json(manifest()) : new Response(body),
    ))
    await updater.checkForUpdates()
    await updater.downloadUpdate()
    expect(await readFile(existing, 'utf8')).toBe('user file')
  })

  test('rejects a downloaded file that does not match the expected digest', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) =>
      String(url).includes('latest.json')
        ? Response.json(manifest())
        : new Response(Buffer.alloc(body.length)),
    ))
    await updater.checkForUpdates()
    expect(await updater.downloadUpdate()).toMatchObject({ status: 'error', error: '安装包校验失败，请重新下载。' })
    expect(await readdir(join(mock.root, 'updates'))).toEqual([])
  })
})
