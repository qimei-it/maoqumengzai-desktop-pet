import { describe, expect, test } from 'vitest'
import { renderMarkdown } from '../../src/renderer/markdown'

describe('agent markdown', () => {
  test('renders headings, lists, code and tables', () => {
    const html = renderMarkdown(
      '## 标题\n\n- 一\n- 二\n\n```ts\nconst a = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |',
    )
    expect(html).toContain('<h2>标题</h2>')
    expect(html).toContain('<li>一</li>')
    expect(html).toContain('<pre><code class="language-ts">')
    expect(html).toContain('<table>')
  })

  test('escapes raw HTML and blocks unsafe link protocols', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[good](https://deepseek.com)',
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('href="https://deepseek.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })

  test('escapes raw HTML inside paragraphs', () => {
    const html = renderMarkdown(
      'hello <img src="x" onerror="alert(1)"> world',
    )
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('onerror="alert(1)"')
  })
})
