<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ArrowLeft, Plus } from '@lucide/vue'
import { donutMetrics, midAngle, pointAt, span } from '../shared/donut'
import WheelPreview from './WheelPreview.vue'

const props = defineProps<{
  title: string
  actions: readonly string[]
  catalog: readonly string[]
  labels: Record<string, string>
  wheelLabels: Record<string, readonly string[]>
  min: number
  max: number
  singleLine?: boolean
  petImage?: string
}>()
const emit = defineEmits<{ update: [actions: string[]]; close: [] }>()

const metrics = donutMetrics(1)
const backButton = ref<HTMLButtonElement>()
const drag = ref<{
  source: 'slot' | 'palette'
  action: string
  index: number
} | null>(null)
const dropGap = ref<number | null>(null)
const hoverIndex = ref<number | null>(null)
const paletteOver = ref(false)
const centerOver = ref(false)
let dragGhost: HTMLElement | null = null

const count = computed(() => props.actions.length)
const available = computed(() =>
  props.catalog.filter((action) => !props.actions.includes(action)),
)
const canAdd = computed(() => count.value < props.max)
const canRemove = computed(() => count.value > props.min)
const activeAction = computed(() => {
  const index = hoverIndex.value
  return index === null ? null : (props.actions[index] ?? null)
})

const hits = computed(() =>
  props.actions.map((action, index) => {
    const point = pointAt(metrics.mid, midAngle(index, count.value))
    return {
      action,
      index,
      x: metrics.window / 2 + point.x,
      y: metrics.window / 2 + point.y,
    }
  }),
)

const gaps = computed(() => {
  const step = span(count.value)
  return props.actions.map((_, index) => {
    const angle = (index + 0.5) * step
    const point = pointAt(metrics.mid, angle)
    const insertIndex = index === count.value - 1 ? 0 : index + 1
    return {
      index,
      insertIndex,
      x: metrics.window / 2 + point.x,
      y: metrics.window / 2 + point.y,
      rotate: (angle * 180) / Math.PI,
      label: `插入到第 ${insertIndex + 1} 项之前`,
    }
  })
})

function label(action: string): string {
  return props.labels[action] ?? action
}

function resetDrag(): void {
  drag.value = null
  dropGap.value = null
  paletteOver.value = false
  centerOver.value = false
  dragGhost?.remove()
  dragGhost = null
}

function dragGhostFor(action: string): HTMLElement {
  const styles = getComputedStyle(document.documentElement)
  const ghost = document.createElement('div')
  ghost.textContent = label(action)
  ghost.style.position = 'fixed'
  ghost.style.top = '-1000px'
  ghost.style.left = '-1000px'
  ghost.style.padding = '5px 10px'
  ghost.style.borderRadius = '999px'
  ghost.style.font =
    '600 11px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
  ghost.style.pointerEvents = 'none'
  ghost.style.background = styles.getPropertyValue('--color-surface').trim()
  ghost.style.color = styles.getPropertyValue('--color-ink').trim()
  ghost.style.border = `1px solid ${styles.getPropertyValue('--color-line').trim()}`
  document.body.appendChild(ghost)
  return ghost
}

function startDrag(
  event: DragEvent,
  source: 'slot' | 'palette',
  action: string,
  index: number,
): void {
  drag.value = { source, action, index }
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = source === 'slot' ? 'move' : 'copy'
  event.dataTransfer.setData('text/plain', action)
  if (source === 'slot') {
    dragGhost = dragGhostFor(action)
    event.dataTransfer.setDragImage(dragGhost, 20, 16)
  }
}

function moveTo(from: number, to: number): void {
  const next = [...props.actions]
  if (from < 0 || from >= next.length) return
  const target = Math.max(0, Math.min(to, next.length - 1))
  if (target === from) return
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  emit('update', next)
}

/** Moves a slice into the gap before the action currently at `insertIndex`. */
function moveToGap(from: number, insertIndex: number): void {
  if (from < 0 || from >= props.actions.length) return
  if (insertIndex === from || insertIndex === from + 1) return
  const next = [...props.actions]
  const [moved] = next.splice(from, 1)
  const target = from < insertIndex ? insertIndex - 1 : insertIndex
  next.splice(Math.max(0, Math.min(target, next.length)), 0, moved)
  emit('update', next)
}

function addAt(action: string, index: number): void {
  if (!canAdd.value || props.actions.includes(action)) return
  const next = [...props.actions]
  next.splice(Math.max(0, Math.min(index, next.length)), 0, action)
  emit('update', next)
}

function removeAt(index: number): void {
  if (!canRemove.value) return
  emit(
    'update',
    props.actions.filter((_, current) => current !== index),
  )
}

function overGap(event: DragEvent, insertIndex: number): void {
  if (!drag.value) return
  event.preventDefault()
  event.stopPropagation()
  dropGap.value = insertIndex
  paletteOver.value = false
  centerOver.value = false
}

function dropInGap(event: DragEvent, insertIndex: number): void {
  event.preventDefault()
  event.stopPropagation()
  const current = drag.value
  if (!current) return
  if (current.source === 'palette') addAt(current.action, insertIndex)
  else moveToGap(current.index, insertIndex)
  resetDrag()
}

function overCenter(event: DragEvent): void {
  if (!drag.value) return
  event.preventDefault()
  centerOver.value = true
  dropGap.value = null
  paletteOver.value = false
}

function leaveCenter(): void {
  centerOver.value = false
}

function dropCenter(event: DragEvent): void {
  event.preventDefault()
  const current = drag.value
  if (!current) return
  if (current.source === 'palette') addAt(current.action, count.value)
  else moveTo(current.index, count.value - 1)
  resetDrag()
}

function overPalette(event: DragEvent): void {
  if (!drag.value || drag.value.source !== 'slot' || !canRemove.value) return
  event.preventDefault()
  paletteOver.value = true
  dropGap.value = null
  centerOver.value = false
}

function dropPalette(event: DragEvent): void {
  event.preventDefault()
  const current = drag.value
  if (!current) return
  if (current.source === 'slot') removeAt(current.index)
  resetDrag()
}

function leavePalette(event: DragEvent): void {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next)) return
  paletteOver.value = false
}

function onHitKeydown(event: KeyboardEvent, index: number): void {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveTo(index, index === 0 ? count.value - 1 : index - 1)
    return
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    moveTo(index, index === count.value - 1 ? 0 : index + 1)
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    removeAt(index)
  }
}

function reset(): void {
  emit('update', [...props.catalog].slice(0, props.max))
  resetDrag()
}

function close(): void {
  emit('close')
}

onMounted(() => {
  void nextTick(() => backButton.value?.focus())
})
</script>

<template>
  <section class="wheel-config-page" role="region" :aria-label="title">
    <header class="wheel-page-head">
      <button
        ref="backButton"
        type="button"
        class="wheel-back"
        @click="close"
      >
        <ArrowLeft :size="14" aria-hidden="true" focusable="false" />
        返回
      </button>
      <h2 class="wheel-page-title">{{ title }}</h2>
      <span class="wheel-count">{{ count }} / {{ max }}</span>
      <p class="wheel-page-hint">拖动排序 / 间隙插入 / 右侧移除</p>
    </header>

    <div class="wheel-page-body">
      <WheelPreview
        class="wheel-stage"
        :scale="1"
        :actions="actions"
        :labels="wheelLabels"
        :label-size="11"
        :single-line="singleLine"
        :active="activeAction"
        :pet-image="petImage"
        :hide-pet="!!drag"
        interactive
        :aria-label="`${title}预览`"
      >
        <button
          v-for="hit in hits"
          :key="hit.action"
          type="button"
          class="wheel-hit"
          :class="{ dragging: drag }"
          :style="{ left: `${hit.x}px`, top: `${hit.y}px` }"
          draggable="true"
          :aria-label="`第 ${hit.index + 1} 项 ${label(hit.action)}`"
          @pointerenter="hoverIndex = hit.index"
          @pointerleave="hoverIndex = null"
          @focus="hoverIndex = hit.index"
          @blur="hoverIndex = null"
          @dragstart="startDrag($event, 'slot', hit.action, hit.index)"
          @dragend="resetDrag"
          @keydown="onHitKeydown($event, hit.index)"
        />
        <button
          v-for="gap in gaps"
          :key="`gap-${gap.index}`"
          type="button"
          class="wheel-gap"
          :class="{
            armed: drag,
            target: dropGap === gap.insertIndex,
          }"
          :style="{
            left: `${gap.x}px`,
            top: `${gap.y}px`,
            '--gap-angle': `${gap.rotate}deg`,
          }"
          tabindex="-1"
          aria-hidden="true"
          :data-gap="gap.insertIndex"
          :aria-label="gap.label"
          @dragover="overGap($event, gap.insertIndex)"
          @drop="dropInGap($event, gap.insertIndex)"
          @dragleave="dropGap = null"
        >
          <span class="wheel-gap-mark" />
        </button>
        <button
          v-if="drag"
          type="button"
          class="wheel-center-drop"
          :class="{ target: centerOver }"
          tabindex="-1"
          aria-hidden="true"
          aria-label="添加到末尾"
          @dragover="overCenter"
          @dragleave="leaveCenter"
          @drop="dropCenter"
        >
          <span class="wheel-center-drop-fill">添加到末尾</span>
        </button>
      </WheelPreview>

      <aside
        class="wheel-palette"
        :class="{ removing: paletteOver }"
        @dragover="overPalette"
        @dragleave="leavePalette"
        @drop="dropPalette"
      >
        <header class="wheel-palette-head">
          <span>{{ paletteOver ? '松手移除' : '可用动作' }}</span>
          <span class="wheel-palette-count">{{ available.length }}</span>
        </header>
        <div class="wheel-palette-list">
          <button
            v-for="action in available"
            :key="action"
            type="button"
            class="wheel-palette-chip"
            :disabled="!canAdd"
            draggable="true"
            :aria-label="`添加${label(action)}`"
            :title="
              canAdd
                ? '拖入轮盘，或点击添加到末尾'
                : `最多 ${max} 项，先移除一项`
            "
            @dragstart="startDrag($event, 'palette', action, -1)"
            @dragend="resetDrag"
            @click="addAt(action, count)"
          >
            <Plus :size="12" aria-hidden="true" focusable="false" />
            <span>{{ label(action) }}</span>
          </button>
          <p v-if="!available.length" class="wheel-palette-empty">
            已全部使用
          </p>
          <p v-else-if="!canAdd" class="wheel-palette-empty">已到上限</p>
        </div>
      </aside>
    </div>

    <div class="wheel-page-foot">
      <div class="wheel-page-actions">
        <button type="button" class="wheel-page-button" @click="reset">
          恢复默认
        </button>
        <button
          type="button"
          class="wheel-page-button primary"
          @click="close"
        >
          完成
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wheel-config-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.wheel-page-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-line);
}
.wheel-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-brand-ink);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  transition: background-color var(--motion-fast) var(--ease-out);
}
.wheel-back:hover {
  background: var(--color-brand-soft);
}
.wheel-page-title {
  margin: 0;
  font-size: var(--font-size-body);
  font-weight: 600;
}
.wheel-count {
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}
.wheel-page-body {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 0;
  padding: 12px 0 10px;
}
.wheel-stage {
  cursor: default;
}
.wheel-hit {
  position: absolute;
  z-index: 2;
  width: 58px;
  height: 44px;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 0;
  border-radius: 12px;
  background: transparent;
  cursor: grab;
}
.wheel-hit:active {
  cursor: grabbing;
}
.wheel-hit.dragging {
  pointer-events: none;
}
.wheel-hit:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.wheel-gap {
  position: absolute;
  z-index: 1;
  width: 26px;
  height: 44px;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 0;
  background: transparent;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-out);
}
.wheel-gap.armed {
  z-index: 3;
  opacity: 1;
}
.wheel-gap-mark {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 18px;
  transform: translate(-50%, -50%) rotate(var(--gap-angle));
  border-radius: 999px;
  background: var(--color-brand);
  opacity: 0.35;
  pointer-events: none;
  transition:
    height var(--motion-fast) var(--ease-out),
    opacity var(--motion-fast) var(--ease-out),
    background-color var(--motion-fast) var(--ease-out);
}
.wheel-gap.target .wheel-gap-mark {
  height: 28px;
  background: var(--color-brand-ink);
  opacity: 1;
}
.wheel-center-drop {
  position: absolute;
  z-index: 4;
  left: 50%;
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 126px;
  height: 126px;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 1px dashed var(--color-line);
  border-radius: 999px;
  background: transparent;
  transition:
    border-color var(--motion-fast) var(--ease-out),
    transform var(--motion-fast) var(--ease-out);
}
.wheel-center-drop.target {
  transform: translate(-50%, -50%) scale(1.03);
  border-color: var(--color-brand);
}
.wheel-center-drop-fill {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 104px;
  height: 104px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font-size: var(--font-size-label);
  line-height: 1.35;
  text-align: center;
  transition:
    background-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out);
}
.wheel-center-drop.target .wheel-center-drop-fill {
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.wheel-palette {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 188px;
  max-height: 312px;
  padding: 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  transition:
    background-color var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out);
}
.wheel-palette.removing {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}
.wheel-palette-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.wheel-palette.removing .wheel-palette-head {
  color: var(--color-danger);
  font-weight: 600;
}
.wheel-palette-count {
  font-variant-numeric: tabular-nums;
}
.wheel-palette-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  margin-top: 8px;
  overflow: auto;
  padding-right: 2px;
}
.wheel-palette-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
  cursor: grab;
  transition:
    background-color var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out);
}
.wheel-palette-chip:hover:not(:disabled) {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.wheel-palette-chip:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.wheel-palette-empty {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  text-align: center;
}
.wheel-page-hint {
  margin: 0 0 0 auto;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  text-align: right;
}
.wheel-page-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 12px;
}
.wheel-page-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.wheel-page-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  transition:
    background-color var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out),
    transform var(--motion-fast) var(--ease-out);
}
.wheel-page-button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.wheel-page-button:active {
  transform: scale(0.97);
}
.wheel-page-button.primary {
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.wheel-page-button.primary:hover {
  border-color: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.wheel-back:focus-visible,
.wheel-page-button:focus-visible,
.wheel-palette-chip:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .wheel-back,
  .wheel-center-drop,
  .wheel-center-drop-fill,
  .wheel-palette,
  .wheel-palette-chip,
  .wheel-page-button {
    transition: none;
  }
}
</style>
