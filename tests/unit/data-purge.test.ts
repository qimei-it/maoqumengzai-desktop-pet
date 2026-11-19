import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  consumePurgeRequest,
  purgeMarkerPath,
  readPurgeRequest,
  requestDataPurge,
} from '../../src/main/data-purge'

async function workspace(): Promise<{ root: string; dataRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), 'mqmz-purge-test-'))
  const dataRoot = join(root, 'mqmz-desktop')
  await mkdir(dataRoot, { recursive: true })
  await writeFile(join(dataRoot, 'mqmz.settings.json'), '{}')
  return { root, dataRoot }
}

describe('local data purge', () => {
  test('removes the data directory and legacy roots on the next start', async () => {
    const { root, dataRoot } = await workspace()
    const legacy = join(root, '毛趣萌仔')
    await mkdir(legacy, { recursive: true })
    await writeFile(join(legacy, 'old.json'), '{}')
    const marker = purgeMarkerPath(dataRoot)

    requestDataPurge(marker, dataRoot, 1700000000000)

    expect(await readPurgeRequest(marker)).toEqual({
      app: 'mqmz',
      format: 1,
      dataRoot,
      createdAt: 1700000000000,
    })
    expect(await readFile(marker, 'utf8')).toContain('mqmz-desktop')

    expect(
      consumePurgeRequest({
        markerPath: marker,
        dataRoot,
        extraRoots: [legacy],
      }),
    ).toBe(true)
    expect(existsSync(dataRoot)).toBe(false)
    expect(existsSync(legacy)).toBe(false)
    expect(existsSync(marker)).toBe(false)
  })

  test('discards a request for another data root without deleting anything', async () => {
    const { root, dataRoot } = await workspace()
    const other = join(root, 'other-data')
    await mkdir(other, { recursive: true })
    const marker = join(root, 'mqmz-data-purge.json')
    requestDataPurge(marker, dataRoot)

    expect(
      consumePurgeRequest({ markerPath: marker, dataRoot: other }),
    ).toBe(false)
    expect(existsSync(other)).toBe(true)
    expect(existsSync(dataRoot)).toBe(true)
    expect(existsSync(marker)).toBe(false)
  })

  test('drops a damaged marker and keeps the data', async () => {
    const { root, dataRoot } = await workspace()
    const marker = join(root, 'mqmz-data-purge.json')
    await writeFile(marker, 'not json')

    expect(
      consumePurgeRequest({ markerPath: marker, dataRoot }),
    ).toBe(false)
    expect(existsSync(dataRoot)).toBe(true)
    expect(existsSync(marker)).toBe(false)
  })

  test('never deletes the home directory or a folder holding the marker', async () => {
    const { root, dataRoot } = await workspace()
    const marker = join(dataRoot, 'mqmz-data-purge.json')
    requestDataPurge(marker, dataRoot)
    expect(consumePurgeRequest({ markerPath: marker, dataRoot })).toBe(true)
    expect(existsSync(dataRoot)).toBe(true)

    const homeMarker = join(root, 'home-marker.json')
    requestDataPurge(homeMarker, homedir())
    consumePurgeRequest({ markerPath: homeMarker, dataRoot: homedir() })
    expect(existsSync(homeMarker)).toBe(false)
    expect(existsSync(homedir())).toBe(true)
  })
})