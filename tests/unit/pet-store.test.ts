import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, test } from 'vitest'
import { getPetStyle, petPoseIds } from '../../src/shared/pet-style'
import {
  loadPetRecord,
  petRecordFor,
  registerPetAssets,
} from '../../src/main/pet-store'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mqmz-pets-'))
  directories.push(dir)
  return dir
}

async function writePet(
  base: string,
  id: string,
  record = petRecordFor(id, '橘子', getPetStyle(), 'seedream', Date.now()),
): Promise<string> {
  const directory = join(base, id)
  await mkdir(directory, { recursive: true })
  const png = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer()
  for (const pose of petPoseIds)
    await writeFile(join(directory, record.poses[pose]), png)
  await writeFile(join(directory, 'pet.json'), JSON.stringify(record))
  return directory
}

describe('pet store', () => {
  test('loads a complete saved pet and registers every pose', async () => {
    const base = await root()
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    await writePet(base, id)
    const record = await loadPetRecord(base, id)
    expect(record).toMatchObject({
      id,
      name: '橘子',
      styleId: 'mqmz-watercolor',
      styleName: '麻薯柔和水彩',
    })
    expect(record?.poses).toEqual(
      Object.fromEntries(petPoseIds.map((pose) => [pose, `${pose}.png`])),
    )
    const assets = registerPetAssets(base, record!)
    expect(assets.poses.base).toContain('mqmz-media://source/')
    expect(Object.keys(assets.poses)).toEqual([...petPoseIds])
  })

  test('persists the species chosen at creation', async () => {
    const base = await root()
    const id = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa'
    const record = petRecordFor(
      id,
      '团子',
      getPetStyle(),
      'seedream',
      Date.now(),
      '狗',
    )
    expect(record.species).toBe('狗')
    await writePet(base, id, record)
    await expect(loadPetRecord(base, id)).resolves.toMatchObject({
      species: '狗',
    })
  })

  test('persists the companion prompt and exposes it on assets', async () => {
    const base = await root()
    const id = 'cccccccc-dddd-4eee-8fff-cccccccccccc'
    const record = petRecordFor(
      id,
      '团子',
      getPetStyle(),
      'seedream',
      Date.now(),
      '狗',
      '  像朋友一样陪我聊天  ',
    )
    expect(record.prompt).toBe('像朋友一样陪我聊天')
    await writePet(base, id, record)
    const loaded = await loadPetRecord(base, id)
    expect(loaded?.prompt).toBe('像朋友一样陪我聊天')
    expect(registerPetAssets(base, loaded!).prompt).toBe('像朋友一样陪我聊天')
  })

  test('caps the companion prompt at the shared limit', () => {
    const record = petRecordFor(
      'cccccccc-dddd-4eee-8fff-dddddddddddd',
      '团子',
      getPetStyle(),
      'seedream',
      Date.now(),
      '狗',
      '陪'.repeat(1200),
    )
    expect(record.prompt).toBe('陪'.repeat(1000))
  })

  test('loads records created before species existed', async () => {
    const base = await root()
    const id = 'cccccccc-dddd-4eee-8fff-bbbbbbbbbbbb'
    const record = petRecordFor(
      id,
      '橘子',
      getPetStyle(),
      'seedream',
      Date.now(),
    )
    expect(record.species).toBeUndefined()
    expect(record.prompt).toBeUndefined()
    await writePet(base, id, record)
    await expect(loadPetRecord(base, id)).resolves.toMatchObject({
      id,
      name: '橘子',
    })
  })

  test('rejects an incomplete pet directory', async () => {
    const base = await root()
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const directory = await writePet(base, id)
    await rm(join(directory, 'focus.png'))
    await expect(loadPetRecord(base, id)).resolves.toBeUndefined()
  })

  test('rejects path-like identifiers', async () => {
    const base = await root()
    const id = '../outside'
    await expect(loadPetRecord(base, id)).resolves.toBeUndefined()
  })

  test('rejects path-like pose filenames', async () => {
    const base = await root()
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const directory = await writePet(base, id)
    const path = join(directory, 'pet.json')
    const record = JSON.parse(await readFile(path, 'utf8')) as {
      poses: Record<string, string>
    }
    record.poses.base = '../../outside.png'
    await writeFile(path, JSON.stringify(record))
    await expect(loadPetRecord(base, id)).resolves.toBeUndefined()
  })

  test('writes a versioned record with all six poses', async () => {
    const base = await root()
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const directory = await writePet(base, id)
    const record = JSON.parse(
      await readFile(join(directory, 'pet.json'), 'utf8'),
    ) as { version: number; poses: Record<string, string> }
    expect(record.version).toBe(1)
    expect(Object.keys(record.poses)).toEqual([...petPoseIds])
  })
})
