/** Safe Markdown rendering for agent output. */

import { Marked } from 'marked'

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  )

/** Only web and mail links are clickable; everything else stays as text. */
function safeHref(href: string): string | undefined {
  const value = href.trim()
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(value)
  if (!match) return undefined
  const protocol = match[1].toLowerCase()
  if (!['http', 'https', 'mailto'].includes(protocol)) return undefined
  return value
}

const markdown = new Marked({ gfm: true, breaks: true })

markdown.use({
  renderer: {
    // Model output is untrusted: never inject raw HTML into the renderer.
    html({ text }) {
      return escapeHtml(text)
    },
    link({ href, title, text }) {
      const safe = safeHref(href)
      const label = escapeHtml(text)
      if (!safe) return label
      const titleAttribute = title
        ? ` title="${escapeHtml(title)}"`
        : ''
      return `<a href="${escapeHtml(safe)}"${titleAttribute} target="_blank" rel="noreferrer noopener">${label}</a>`
    },
  },
})

export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false })
}
