import { describe, expect, test } from 'vitest'
import { sanitizeMailBodyHtml } from '../../src/main/mail-html'

describe('mail body html', () => {
  test('keeps table structure, presentation attributes and inline layout', () => {
    const html = sanitizeMailBodyHtml(
      '<table width="600" cellpadding="8" cellspacing="0" bgcolor="#f6f6f6" border="0" style="border-collapse:collapse;width:600px">' +
        '<tr><td colspan="2" rowspan="1" style="padding:12px;background-color:#fff;color:#222;border:1px solid #ddd;line-height:1.5">标题</td></tr>' +
        '<tr><td align="center"><font color="#333" size="3">内容</font></td><td><a href="https://example.com/order/1" style="display:inline-block;padding:8px 16px;background-color:#ffffff;color:#222;text-decoration:none;border-radius:6px">查看订单</a></td></tr>' +
        '</table>',
    )
    expect(html).toContain('<table')
    expect(html).toContain('width="600"')
    expect(html).toContain('cellpadding="8"')
    expect(html).toContain('bgcolor="#f6f6f6"')
    expect(html).toContain('colspan="2"')
    expect(html).toContain('rowspan="1"')
    expect(html).toContain('border-collapse:collapse')
    expect(html).toContain('background-color:#fff')
    expect(html).toContain('border:1px solid #ddd')
    expect(html).toContain('line-height:1.5')
    expect(html).toContain('display:inline-block')
    expect(html).toContain('text-decoration:none')
    expect(html).toContain('border-radius:6px')
    expect(html).toContain('<font color="#333" size="3">内容</font>')
  })

  test('keeps safe links and marks them for external opening', () => {
    const html = sanitizeMailBodyHtml(
      '<p><a href="https://example.com/a?x=1&amp;y=2">网页</a>' +
        '<a href="mailto:help@example.com">邮件</a></p>',
    )
    expect(html).toContain('href="https://example.com/a?x=1&amp;y=2"')
    expect(html).toContain('href="mailto:help@example.com"')
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2)
  })

  test('drops unsafe and relative links while keeping their text', () => {
    const html = sanitizeMailBodyHtml(
      '<a href="javascript:alert(1)">脚本</a>' +
        '<a href="//evil.example/path">协议相对</a>' +
        '<a href="data:text/html,evil">数据</a>' +
        '<a href="#section">锚点</a>',
    )
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('evil.example')
    expect(html).not.toContain('data:text/html')
    expect(html).toContain('脚本')
    expect(html).toContain('协议相对')
    expect(html).toContain('数据')
    expect(html).toContain('锚点')
  })

  test('removes scripts, forms, buttons, images and dangerous styles', () => {
    const html = sanitizeMailBodyHtml(
      '<style>body{background:url(https://track.example/p.gif)}</style>' +
        '<script>alert(1)</script>' +
        '<form><input value="x"></form>' +
        '<button onclick="alert(1)">按钮</button>' +
        '<img src="https://track.example/p.gif" onerror="alert(1)">' +
        '<div style="position:fixed;z-index:999;background-image:url(https://track.example/p.gif);color:#333">正文</div>',
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<style')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('position')
    expect(html).not.toContain('z-index')
    expect(html).not.toContain('background-image')
    expect(html).not.toContain('onerror')
    expect(html).toContain('正文')
    expect(html).toContain('color:#333')
  })
})
