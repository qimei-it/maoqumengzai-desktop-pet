import { describe, expect, test, vi } from 'vitest'
import { htmlToPage, readWebPage } from '../../src/main/agent/web'

describe('agent web reader', () => {
  test('extracts the title and readable text', () => {
    const page = htmlToPage(
      '<html><head><title>示例 &amp; 标题</title><style>.x{}</style></head><body><script>alert(1)</script><h1>第一段</h1><p>正文&nbsp;内容</p></body></html>',
    )
    expect(page.title).toBe('示例 & 标题')
    expect(page.text).toBe('第一段\n正文 内容')
  })

  test('reads a page through fetch and follows the final url', async () => {
    const fake = vi.fn(async () =>
      new Response('<title>结果页</title><p>读取成功</p>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    ) as unknown as typeof fetch
    const page = await readWebPage('https://example.com/page', {
      fetch: fake,
    })
    expect(page.title).toBe('结果页')
    expect(page.text).toBe('读取成功')
    expect(page.url).toBe('https://example.com/page')
    expect(fake).toHaveBeenCalledOnce()
  })

  test('rejects localhost and private network addresses', async () => {
    const fake = vi.fn() as unknown as typeof fetch
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1/',
      'http://192.168.1.2/',
      'http://10.0.0.1/',
      'file:///etc/passwd',
    ])
      await expect(readWebPage(url, { fetch: fake })).rejects.toThrow()
    expect(fake).not.toHaveBeenCalled()
  })

  test('rejects oversized pages', async () => {
    const fake = vi.fn(async () =>
      new Response('x', {
        status: 200,
        headers: { 'Content-Length': String(4 * 1024 * 1024) },
      }),
    ) as unknown as typeof fetch
    await expect(
      readWebPage('https://example.com/big', { fetch: fake }),
    ).rejects.toThrow('网页内容过大')
  })
})
