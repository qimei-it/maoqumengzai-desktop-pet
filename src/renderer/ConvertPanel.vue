<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Files, FolderOpen, X } from '@lucide/vue'
import type { Command, ConvertAction, Snapshot } from '../shared/protocol'
import FileTypeIcon from './FileTypeIcon.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const convert = computed(() => props.state?.convert)
const target = ref<ConvertAction | ''>('')
const busy = computed(() => Boolean(convert.value?.busy))
const files = computed(() => convert.value?.files ?? [])
const targets = computed(() => convert.value?.targets ?? [])
const outcome = computed(() => convert.value?.outcome)
const progress = computed(
  () => convert.value?.progress ?? { done: 0, total: 0 },
)
const batch = computed(() => files.value.length > 1)
const percent = computed(() =>
  progress.value.total
    ? Math.round((progress.value.done / progress.value.total) * 100)
    : 0,
)
const visibleFiles = computed(() => files.value.slice(0, 3))
const extraFiles = computed(() => Math.max(0, files.value.length - 3))

watch(
  targets,
  (list) => {
    if (!list.some((item) => item.id === target.value))
      target.value = list[0]?.id ?? ''
  },
  { immediate: true },
)
const outputHint = computed(() => {
  if (target.value === 'merge-pdf') return '合并输出到 convert_output'
  if (target.value === 'split-pdf') return '拆分到 convert_output/<文件名>'
  return batch.value ? '批量输出到 convert_output' : '输出到原目录'
})

function close(): void {
  emit('command', { type: 'convert-close' })
}
function start(): void {
  if (!target.value) return
  emit('command', { type: 'convert-start', action: target.value })
}
function reveal(): void {
  emit('command', { type: 'convert-reveal' })
}
</script>

<template>
  <main class="convert-shell" @keydown.esc="close">
    <section class="convert-surface" aria-label="文件转换">
      <header class="convert-header">
        <div class="convert-title">
          <Files
            :size="17"
            :stroke-width="2"
            aria-hidden="true"
            focusable="false"
          />
          <h1>文件转换</h1>
        </div>
        <button
          type="button"
          class="convert-icon-button"
          aria-label="关闭图片转换"
          title="关闭"
          @click="close"
        >
          <X
            :size="16"
            :stroke-width="2"
            aria-hidden="true"
            focusable="false"
          />
        </button>
      </header>

      <div class="convert-files">
        <span
          v-for="file in visibleFiles"
          :key="file.id"
          class="convert-file"
          :title="file.name"
        >
          <FileTypeIcon :name="file.name" :size="13" />
          {{ file.name }}
        </span>
        <span v-if="extraFiles" class="convert-file">+{{ extraFiles }}</span>
      </div>

      <p v-if="convert?.notice" class="convert-notice">
        {{ convert.notice }}
      </p>

      <template v-if="outcome">
        <div class="convert-result" role="status">
          <strong>已转换 {{ outcome.converted }} 个</strong>
          <span v-if="outcome.failed">失败 {{ outcome.failed }} 个</span>
        </div>
        <ul v-if="outcome.messages.length" class="convert-errors">
          <li v-for="message in outcome.messages.slice(0, 3)" :key="message">
            {{ message }}
          </li>
        </ul>
        <div class="convert-actions">
          <button
            type="button"
            class="button-soft"
            :disabled="!convert?.canReveal"
            @click="reveal"
          >
            <FolderOpen
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />
            打开所在位置
          </button>
          <button type="button" class="button-glass" @click="close">
            完成
          </button>
        </div>
      </template>

      <template v-else-if="targets.length">
        <p class="convert-label">转换为</p>
        <div class="convert-targets" role="group" aria-label="目标格式">
          <button
            v-for="item in targets"
            :key="item.id"
            type="button"
            class="convert-target"
            :class="{ selected: target === item.id }"
            :aria-pressed="target === item.id"
            :disabled="busy"
            @click="target = item.id"
          >
            {{ item.label }}
          </button>
        </div>
        <p class="convert-output">{{ outputHint }}</p>
        <div v-if="busy" class="convert-progress">
          <div class="convert-progress-track">
            <span :style="{ width: `${percent}%` }"></span>
          </div>
          <span class="convert-progress-text"
            >{{ progress.done }} / {{ progress.total }}</span
          >
        </div>
        <button
          type="button"
          class="button-glass convert-start"
          :disabled="busy || !target"
          @click="start"
        >
          {{ busy ? "正在转换…" : "开始转换" }}
        </button>
      </template>

      <p v-else class="convert-notice">
        没有可用的转换目标。
      </p>

      <p v-if="error" class="convert-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.convert-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.convert-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.convert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.convert-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-brand-ink);
}
.convert-title h1 {
  margin: 0;
  font-size: var(--font-size-section);
  line-height: 1.5;
  font-weight: 650;
  color: var(--color-ink);
}
.convert-icon-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
}
.convert-icon-button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.convert-files {
  display: flex;
  gap: 6px;
  overflow: hidden;
  flex: none;
  margin-bottom: 10px;
}
.convert-file {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 132px;
  padding: 4px 9px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: var(--font-size-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.convert-file svg {
  flex: none;
}
.convert-notice {
  margin: 0 0 12px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
.convert-label {
  margin: 0 0 8px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.convert-targets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.convert-target {
  min-height: 52px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.04em;
}
.convert-target.selected {
  border-color: var(--color-brand-ink);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.convert-output {
  margin: 12px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.convert-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.convert-progress-track {
  flex: 1;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-fill-secondary);
}
.convert-progress-track span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--color-brand-ink);
  transition: width 180ms ease;
}
.convert-progress-text {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
}
.convert-start {
  width: 100%;
  margin-top: auto;
}
.convert-result {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 6px;
  font-size: var(--font-size-body);
}
.convert-result strong {
  color: var(--color-brand-ink);
}
.convert-result span {
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
.convert-errors {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.6;
  overflow: auto;
}
.convert-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}
.convert-actions .button-soft,
.convert-actions .button-glass {
  flex: 1;
  gap: 6px;
}
.convert-error {
  margin: 8px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .convert-progress-track span {
    transition: none;
  }
}
</style>
