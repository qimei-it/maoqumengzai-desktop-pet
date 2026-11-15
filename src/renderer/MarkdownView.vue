<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { renderMarkdown } from './markdown'

const props = defineProps<{ text: string; streaming?: boolean }>()
const html = ref('')
const root = ref<HTMLElement>()
let frame = 0
let mermaidReady = false
let mermaidBusy = false
let mermaidAgain = false
let mermaidSequence = 0
let themeObserver: MutationObserver | undefined

function render(): void {
  frame = 0
  html.value = renderMarkdown(props.text)
  void nextTick(() => {
    void renderMermaidBlocks()
  })
}

watch(
  () => props.text,
  () => {
    if (frame) return
    frame = requestAnimationFrame(render)
  },
  { immediate: true },
)

watch(
  () => props.streaming,
  (streaming) => {
    if (!streaming) void nextTick(() => renderMermaidBlocks())
  },
)

onMounted(() => {
  themeObserver = new MutationObserver(() => {
    mermaidReady = false
    render()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
})

onUnmounted(() => {
  if (frame) cancelAnimationFrame(frame)
  themeObserver?.disconnect()
})

function css(name: string, fallback: string): string {
  if (!root.value) return fallback
  return getComputedStyle(root.value).getPropertyValue(name).trim() || fallback
}

async function renderMermaidBlocks(): Promise<void> {
  if (props.streaming || !root.value) return
  const blocks = Array.from(
    root.value.querySelectorAll<HTMLElement>('pre > code.language-mermaid'),
  )
  if (!blocks.length) return
  if (mermaidBusy) {
    mermaidAgain = true
    return
  }
  mermaidBusy = true
  try {
    const imported = await import('mermaid')
    const mermaid = imported.default
    if (!mermaidReady) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        htmlLabels: false,
        maxTextSize: 20_000,
        maxEdges: 500,
        themeVariables: {
          background: css('--color-canvas', '#fbf9f5'),
          primaryColor: css('--color-surface', '#ffffff'),
          primaryTextColor: css('--color-ink', '#1a1a1a'),
          primaryBorderColor: css('--color-line', '#e8e4dd'),
          secondaryColor: css('--color-brand-soft', '#f8e9dc'),
          secondaryTextColor: css('--color-brand-ink', '#ad5946'),
          secondaryBorderColor: css('--color-brand-highlight', '#e69b80'),
          tertiaryColor: css('--color-surface-muted', '#f4f0ea'),
          tertiaryTextColor: css('--color-muted', '#666666'),
          lineColor: css('--color-muted', '#666666'),
          textColor: css('--color-ink', '#1a1a1a'),
          fontFamily: css('--font-family-base', 'sans-serif'),
          fontSize: '14px',
        },
        flowchart: { htmlLabels: false },
      })
      mermaidReady = true
    }
    for (const code of blocks) {
      const pre = code.parentElement
      if (!pre || !root.value?.contains(pre)) continue
      if (pre.dataset.mermaid === 'done' || pre.dataset.mermaid === 'failed')
        continue
      const source = code.textContent ?? ''
      if (!source.trim() || source.length > 20_000) continue
      pre.dataset.mermaid = 'rendering'
      try {
        const id = `mqmz-mermaid-${mermaidSequence++}`
        const { svg } = await mermaid.render(id, source)
        if (!root.value?.contains(pre) || props.streaming) continue
        const figure = document.createElement('div')
        figure.className = 'agent-mermaid'
        figure.dataset.source = source
        figure.innerHTML = svg
        const actions = document.createElement('div')
        actions.className = 'agent-mermaid-actions'
        for (const [action, label] of [
          ['copy', '复制源码'],
          ['svg', 'SVG'],
          ['png', 'PNG'],
        ] as const) {
          const button = document.createElement('button')
          button.type = 'button'
          button.dataset.mermaidAction = action
          button.textContent = label
          button.title =
            action === 'copy'
              ? '复制 Mermaid 源码'
              : `导出 ${label} 图片`
          button.setAttribute('aria-label', button.title)
          actions.append(button)
        }
        figure.append(actions)
        pre.replaceWith(figure)
      } catch {
        pre.dataset.mermaid = 'failed'
      }
    }
  } finally {
    mermaidBusy = false
    if (mermaidAgain) {
      mermaidAgain = false
      void renderMermaidBlocks()
    }
  }
}

function serializeSvg(
  svg: SVGSVGElement,
  width?: number,
  height?: number,
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  if (width) clone.setAttribute('width', String(width))
  if (height) clone.setAttribute('height', String(height))
  return new XMLSerializer().serializeToString(clone)
}

async function svgToPng(svg: SVGSVGElement): Promise<string> {
  const rect = svg.getBoundingClientRect()
  const width = Math.max(120, Math.round(rect.width || 800))
  const height = Math.max(80, Math.round(rect.height || 600))
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    serializeSvg(svg, width, height),
  )}`
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Mermaid 图片转换失败'))
    image.src = source
  })
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建导出画布')
  context.fillStyle = css('--color-canvas', '#ffffff')
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png').split(',')[1] ?? ''
}

function flashDiagramButton(button: HTMLButtonElement, text: string): void {
  if (!button.dataset.label) button.dataset.label = button.textContent ?? ''
  button.textContent = text
  window.setTimeout(() => {
    button.textContent = button.dataset.label ?? text
  }, 1200)
}

async function runMermaidAction(button: HTMLButtonElement): Promise<void> {
  const figure = button.closest<HTMLElement>('.agent-mermaid')
  const svg = figure?.querySelector('svg')
  if (!figure || !svg) return
  const action = button.dataset.mermaidAction
  if (action === 'copy') {
    const result = await window.mqmz?.copyAgentOutput(
      figure.dataset.source ?? '',
    )
    flashDiagramButton(button, result?.ok ? '已复制' : '复制失败')
    return
  }
  if (action !== 'svg' && action !== 'png') return
  try {
    const data =
      action === 'svg'
        ? serializeSvg(svg as SVGSVGElement)
        : await svgToPng(svg as SVGSVGElement)
    const result = await window.mqmz?.exportAgentDiagram(action, data)
    flashDiagramButton(button, result?.ok ? '已导出' : '导出失败')
  } catch {
    flashDiagramButton(button, '导出失败')
  }
}

function onClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  const action = target?.closest<HTMLButtonElement>('[data-mermaid-action]')
  if (action) {
    event.preventDefault()
    void runMermaidAction(action)
    return
  }
  const anchor = target?.closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') ?? ''
  if (!/^(https?:|mailto:)/i.test(href)) return
  event.preventDefault()
  void window.mqmz?.openExternal(href)
}
</script>

<template>
  <div
    ref="root"
    class="agent-markdown"
    @click="onClick"
    v-html="html"
  ></div>
</template>

<style scoped>
.agent-markdown {
  min-width: 0;
  color: var(--color-ink);
  font-size: var(--font-size-body);
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.agent-markdown :deep(> :first-child) {
  margin-top: 0;
}
.agent-markdown :deep(> :last-child) {
  margin-bottom: 0;
}
.agent-markdown :deep(p) {
  margin: 0 0 var(--space-3);
}
.agent-markdown :deep(h1),
.agent-markdown :deep(h2),
.agent-markdown :deep(h3),
.agent-markdown :deep(h4),
.agent-markdown :deep(h5),
.agent-markdown :deep(h6) {
  margin: var(--space-5) 0 var(--space-2);
  font-weight: 650;
  line-height: 1.3;
}
.agent-markdown :deep(h1) {
  font-size: var(--font-size-title);
}
.agent-markdown :deep(h2) {
  font-size: var(--font-size-section-lg);
}
.agent-markdown :deep(h3),
.agent-markdown :deep(h4),
.agent-markdown :deep(h5),
.agent-markdown :deep(h6) {
  font-size: var(--font-size-section);
}
.agent-markdown :deep(ul),
.agent-markdown :deep(ol) {
  margin: 0 0 var(--space-3);
  padding-left: var(--space-6);
}
.agent-markdown :deep(li) {
  margin: var(--space-1) 0;
}
.agent-markdown :deep(li > p) {
  margin: 0;
}
.agent-markdown :deep(blockquote) {
  margin: 0 0 var(--space-3);
  padding-left: var(--space-3);
  border-left: 2px solid var(--color-line);
  color: var(--color-muted);
}
.agent-markdown :deep(code) {
  padding: 1px 4px;
  border-radius: var(--radius-xs);
  background: var(--color-fill-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
}
.agent-markdown :deep(pre) {
  margin: 0 0 var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  overflow-x: auto;
}
.agent-markdown :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: var(--font-size-label);
  line-height: 1.55;
}
.agent-markdown :deep(a) {
  color: var(--color-brand-ink);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.agent-markdown :deep(a:hover) {
  color: var(--color-brand);
}
.agent-markdown :deep(hr) {
  margin: var(--space-4) 0;
  border: 0;
  border-top: 1px solid var(--color-line);
}
.agent-markdown :deep(table) {
  width: 100%;
  margin: 0 0 var(--space-3);
  border-collapse: collapse;
  font-size: var(--font-size-label);
}
.agent-markdown :deep(th),
.agent-markdown :deep(td) {
  padding: 4px 8px;
  border: 1px solid var(--color-line);
  text-align: left;
  vertical-align: top;
}
.agent-markdown :deep(th) {
  background: var(--color-fill-secondary);
  font-weight: 600;
}
.agent-markdown :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-control);
}
.agent-markdown :deep(input[type='checkbox']) {
  margin-right: var(--space-1);
}
.agent-markdown :deep(.agent-mermaid) {
  position: relative;
  margin: 0 0 var(--space-3);
  overflow-x: auto;
}
.agent-markdown :deep(.agent-mermaid-actions) {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.agent-markdown :deep(.agent-mermaid:hover .agent-mermaid-actions),
.agent-markdown :deep(.agent-mermaid:focus-within .agent-mermaid-actions) {
  opacity: 1;
}
.agent-markdown :deep(.agent-mermaid-actions button) {
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-caption);
}
.agent-markdown :deep(.agent-mermaid-actions button:hover) {
  border-color: var(--color-brand);
  color: var(--color-brand-ink);
}
.agent-markdown :deep(.agent-mermaid-actions button:focus-visible) {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-markdown :deep(.agent-mermaid svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
</style>
