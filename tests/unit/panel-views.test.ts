import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

describe('panel window backgrounds', () => {
  test('every toggled view keeps the window margin transparent', () => {
    const root = process.cwd()
    const app = readFileSync(join(root, 'src/renderer/App.vue'), 'utf8')
    const css = readFileSync(join(root, 'src/renderer/style.css'), 'utf8')
    const views = [
      ...new Set(
        [...app.matchAll(/classList\.toggle\("([a-z-]+-view)"/g)].map(
          (match) => match[1],
        ),
      ),
    ]
    expect(views.length).toBeGreaterThan(10)
    for (const view of views) {
      const block = new RegExp(
        `\\.${view}(?=[,\\s{])[\\s\\S]*?\\{([^}]*)\\}`,
      ).exec(css)
      expect(block, view).not.toBeNull()
      expect(block![1], view).toContain('background: transparent')
    }
  })
})
