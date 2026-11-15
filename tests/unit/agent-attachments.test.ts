import { describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  agentAttachmentFileChars,
  readAgentAttachment,
} from '../../src/main/agent/attachments'

async function directory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'mqmz-agent-attachment-'))
}

describe('agent attachments', () => {
  test('reads a text file with its name and size', async () => {
    const root = await directory()
    const path = join(root, 'notes.md')
    const text = '# 标题\n这里是附件内容'
    await writeFile(path, text)
    const attachment = await readAgentAttachment(path, 30_000)
    expect(attachment).toMatchObject({
      name: 'notes.md',
      text,
      truncated: false,
    })
    expect(attachment?.size).toBe(Buffer.byteLength(text))
  })

  test('truncates to the remaining turn budget', async () => {
    const root = await directory()
    const path = join(root, 'long.txt')
    await writeFile(path, '0123456789')
    const attachment = await readAgentAttachment(path, 4)
    expect(attachment?.text).toBe('0123')
    expect(attachment?.truncated).toBe(true)
  })

  test('caps a single file at the per-file limit', async () => {
    const root = await directory()
    const path = join(root, 'long.txt')
    await writeFile(path, 'x'.repeat(agentAttachmentFileChars + 200))
    const attachment = await readAgentAttachment(path, 30_000)
    expect(attachment?.text?.length).toBe(agentAttachmentFileChars)
    expect(attachment?.truncated).toBe(true)
  })

  test('rejects binary, empty, missing files and folders', async () => {
    const root = await directory()
    const binary = join(root, 'image.png')
    await writeFile(binary, Buffer.from([0, 1, 2, 3]))
    expect(await readAgentAttachment(binary, 30_000)).toBeNull()

    const empty = join(root, 'empty.txt')
    await writeFile(empty, '  \n')
    expect(await readAgentAttachment(empty, 30_000)).toBeNull()

    expect(
      await readAgentAttachment(join(root, 'missing.txt'), 30_000),
    ).toBeNull()

    const folder = join(root, 'folder')
    await mkdir(folder)
    expect(await readAgentAttachment(folder, 30_000)).toBeNull()
  })
})
