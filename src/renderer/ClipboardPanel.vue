<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  ClipboardList,
  Pin,
  Search,
  Settings,
  SquareX,
  Trash2,
  X,
} from '@lucide/vue'
import type { ClipboardConfig } from '../shared/clipboard'
import { clipboardDefaults } from '../shared/clipboard'
import type { Command, Snapshot } from '../shared/protocol'
import ClipboardSettings from './ClipboardSettings.vue'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

type ClipboardTab = 'history' | 'settings'
const tab = ref<ClipboardTab>('history')
const query = ref('')
const now = ref(Date.now())
let clock: number | undefined
onMounted(() => {
  clock = window.setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})
onUnmounted(() => {
  if (clock) window.clearInterval(clock)
})

const clipboard = computed(() => props.state?.clipboard)
const config = computed<ClipboardConfig>(
  () => clipboard.value ?? clipboardDefaults,
)
const entries = computed(() => clipboard.value?.entries ?? [])
const filtered = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!value) return entries.value
  return entries.value.filter(
    (entry) =>
      entry.kind === 'text' && entry.text?.toLowerCase().includes(value),
  )
})
const unpinned = computed(() => entries.value.filter((entry) => !entry.pinned))

function timeLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const current = new Date(now.value)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
  if (
    date.getFullYear() === current.getFullYear() &&
    date.getMonth() === current.getMonth() &&
    date.getDate() === current.getDate()
  )
    return time
  if (date.getFullYear() === current.getFullYear())
    return `${date.getMonth() + 1}月${date.getDate()}日`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
function copy(id: string): void {
  emit('command', { type: 'clipboard-copy', id })
}
function pin(id: string, pinned: boolean): void {
  emit('command', { type: 'clipboard-pin', id, pinned })
}
function remove(id: string): void {
  emit('command', { type: 'clipboard-remove', id })
}
function clear(): void {
  emit('command', { type: 'clipboard-clear' })
}
function updateConfig(patch: Partial<ClipboardConfig>): void {
  emit('command', { type: 'clipboard-config', patch })
}
function close(): void {
  emit('command', { type: 'clipboard-close' })
}
</script>

<template>
  <main class="clipboard-shell" @keydown.esc="close">
    <section class="clipboard-surface" aria-label="剪贴板">
      <PanelHeader
        title="剪贴板"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div
        class="clipboard-tabs"
        role="tablist"
        aria-label="剪贴板分类"
        :data-active="tab"
      >
        <span class="clipboard-tabs-thumb" aria-hidden="true" />
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'history'"
          :class="{ active: tab === 'history' }"
          @click="tab = 'history'"
        >
          <ClipboardList :size="15" :stroke-width="2" aria-hidden="true" />
          记录
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'settings'"
          :class="{ active: tab === 'settings' }"
          @click="tab = 'settings'"
        >
          <Settings :size="15" :stroke-width="2" aria-hidden="true" />
          设置
        </button>
      </div>

      <div v-if="tab === 'history'" class="clipboard-body">
        <div class="clipboard-toolbar">
          <span class="clipboard-search">
            <Search :size="14" :stroke-width="2" aria-hidden="true" />
            <input
              v-model="query"
              type="text"
              placeholder="搜索"
              maxlength="100"
              aria-label="搜索剪贴板"
            />
            <button
              v-if="query"
              type="button"
              class="clipboard-search-clear"
              aria-label="清空搜索"
              title="清空搜索"
              @click="query = ''"
            >
              <X :size="13" :stroke-width="2" aria-hidden="true" />
            </button>
          </span>
          <button
            v-if="unpinned.length"
            type="button"
            class="clipboard-clear"
            aria-label="清空未固定记录"
            title="清空未固定记录"
            @click="clear"
          >
            <Trash2 :size="15" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>

        <div v-if="filtered.length" class="clipboard-list panel-scroll">
          <div
            v-for="entry in filtered"
            :key="entry.id"
            class="clipboard-entry"
            :class="{ pinned: entry.pinned }"
          >
            <button
              type="button"
              class="clipboard-copy"
              :aria-label="
                entry.kind === 'text'
                  ? `复制${entry.text}`
                  : '复制图片'
              "
              @click="copy(entry.id)"
            >
              <span v-if="entry.kind === 'image'" class="clipboard-thumb">
                <img :src="entry.thumbnail" alt="" draggable="false" />
              </span>
              <span v-else class="clipboard-text">{{ entry.text }}</span>
              <span class="clipboard-meta">
                {{ timeLabel(entry.createdAt) }}
              </span>
            </button>
            <span class="clipboard-actions">
              <button
                type="button"
                class="clipboard-action"
                :class="{ active: entry.pinned }"
                :aria-label="entry.pinned ? '取消固定' : '固定记录'"
                :title="entry.pinned ? '取消固定' : '固定记录'"
                @click="pin(entry.id, !entry.pinned)"
              >
                <Pin
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="clipboard-action danger"
                aria-label="删除记录"
                title="删除记录"
                @click="remove(entry.id)"
              >
                <SquareX
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
            </span>
          </div>
        </div>
        <p v-else class="clipboard-empty">
          {{ query.trim() ? '没有匹配的记录' : '还没有剪贴板记录' }}
        </p>
      </div>

      <div v-else class="clipboard-body clipboard-settings panel-scroll">
        <ClipboardSettings
          :config="config"
          :clear-count="unpinned.length"
          @update="updateConfig"
          @clear="clear"
        />
      </div>

      <p v-if="error" class="clipboard-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.clipboard-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.clipboard-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.clipboard-tabs {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 10px;
  padding: 4px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
}
.clipboard-tabs-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 8px) / 2);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  transition: transform var(--motion-slide) var(--ease-spring);
  will-change: transform;
}
.clipboard-tabs[data-active='settings'] .clipboard-tabs-thumb {
  transform: translateX(100%);
}
.clipboard-tabs button {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  transition: color var(--motion-fast) var(--ease-standard);
}
.clipboard-tabs button.active {
  color: var(--color-brand-ink);
  font-weight: 600;
}
.clipboard-tabs button:focus-visible {
  outline-offset: -2px;
}
.clipboard-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 12px;
}
.clipboard-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clipboard-search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-muted);
}
.clipboard-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.clipboard-search input:focus {
  outline: none;
}
.clipboard-search-clear {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
}
.clipboard-search-clear:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.clipboard-clear {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  color: var(--color-muted);
}
.clipboard-clear:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.clipboard-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 8px;
}
.clipboard-entry {
  display: flex;
  align-items: stretch;
  gap: 6px;
  border-bottom: 1px solid var(--color-line);
}
.clipboard-entry.pinned {
  background: var(--color-fill-secondary);
}
.clipboard-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 2px 9px 6px;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  text-align: left;
}
.clipboard-copy:hover .clipboard-text {
  color: var(--color-brand-ink);
}
.clipboard-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: var(--font-size-label);
  line-height: 1.4;
  word-break: break-word;
}
.clipboard-thumb {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-fill-secondary);
}
.clipboard-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.clipboard-meta {
  color: var(--color-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.clipboard-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 2px;
}
.clipboard-action {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
}
.clipboard-action:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}
.clipboard-action.active {
  color: var(--color-brand-ink);
}
.clipboard-action.danger:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.clipboard-empty {
  margin: auto;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.clipboard-settings {
  overflow: auto;
}
.clipboard-error {
  margin: 10px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
@media (prefers-reduced-motion: reduce) {
  .clipboard-tabs-thumb {
    transition: none;
  }
}
</style>
