import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { csvToXlsx, parseCsv } from '../../src/main/convert-spreadsheet'

const folders: string[] = []
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) =>
      rm(folder, { recursive: true, force: true }).catch(() => {}),
    ),
  )
})

describe('CSV → XLSX', () => {
  test('parses quoted CSV fields', () => {
    expect(parseCsv('a,b\n1,"hello, world"\n')).toEqual([
      ['a', 'b'],
      ['1', 'hello, world'],
    ])
  })

  test('writes a minimal valid workbook', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'mqmz-xlsx-'))
    folders.push(folder)
    const source = join(folder, 'data.csv')
    await writeFile(source, '名称,数量\n苹果,3\n香蕉,5\n', 'utf8')
    const output = await csvToXlsx(source, false)
    const entries = unzipSync(new Uint8Array(await (await import('node:fs/promises')).readFile(output)))
    expect(entries['xl/workbook.xml']).toBeTruthy()
    const sheet = strFromU8(entries['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('苹果')
    expect(sheet).toContain('<v>3</v>')
  })
})
