<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderOpen, X } from '@lucide/vue'
import {
  archiveFormatLabels,
  archiveFormats,
  multiFileArchiveFormats,
  type ArchiveFormat,
  type Command,
  type Snapshot,
} from '../shared/protocol'
import FileTypeIcon from './FileTypeIcon.vue'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const archive = computed(() => props.state?.archive)
const files = computed(() => archive.value?.files ?? [])
const outcome = computed(() => archive.value?.outcome)
const busy = computed(() => Boolean(archive.value?.busy))
const multiple = computed(
  () =>
    files.value.length > 1 ||
    files.value.some((file) => file.kind === 'folder'),
)
const availableFormats = computed<readonly ArchiveFormat[]>(() =>
  multiple.value ? multiFileArchiveFormats : archiveFormats,
)
const format = ref<ArchiveFormat>('zip')

watch(
  outcome,
  (value) => {
    if (value) format.value = value.format
  },
  { immediate: true },
)
watch(
  availableFormats,
  (formats) => {
    if (!formats.includes(format.value)) format.value = formats[0]
  },
  { immediate: true },
)

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
function close(): void {
  emit('command', { type: 'archive-close' })
}
function removeFile(fileId: string): void {
  emit('command', { type: 'archive-remove-file', fileId })
}
function reveal(): void {
  emit('command', { type: 'archive-reveal' })
}
function start(): void {
  if (busy.value) return
  emit('command', { type: 'archive-start', format: format.value })
}
</script>

<template>
  <main class="archive-shell" @keydown.esc="close">
    <section class="archive-surface" aria-label="打包归档">
      <PanelHeader
        title="打包归档"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="close"
      />

      <div class="archive-content panel-scroll">
        <div v-if="!outcome" class="archive-files">
          <div
            v-for="file in files"
            :key="file.id"
            class="archive-file"
            :title="file.name"
          >
            <FileTypeIcon
              :name="file.name"
              :kind="file.kind"
              :shortcut="file.shortcut"
              :size="18"
            />
            <span class="archive-file-name">{{ file.name }}</span>
            <span class="archive-file-size">{{
              file.kind === 'folder' ? '文件夹' : formatSize(file.size)
            }}</span>
            <button
              type="button"
              class="archive-file-remove"
              :disabled="busy"
              :aria-label="`从打包列表移除 ${file.name}`"
              title="从打包列表移除"
              @click="removeFile(file.id)"
            >
              <X :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p v-if="archive?.notice" class="archive-notice" role="alert">
          {{ archive.notice }}
        </p>

        <template v-if="outcome">
          <div class="archive-result" role="status">
            <strong>{{
              outcome.folderCount
                ? `已打包 ${outcome.count} 项`
                : `已打包 ${outcome.count} 个文件`
            }}</strong>
          </div>
          <div class="archive-output">
            <FileTypeIcon :name="outcome.name" :size="28" />
            <span class="archive-output-name" :title="outcome.name">{{
              outcome.name
            }}</span>
            <span class="archive-output-size">{{
              formatSize(outcome.size)
            }}</span>
          </div>
        </template>

        <template v-else>
          <p class="archive-label">归档格式</p>
          <div
            class="archive-formats"
            :class="{ 'is-single': !multiple }"
            role="group"
            aria-label="归档格式"
          >
            <button
              v-for="item in availableFormats"
              :key="item"
              type="button"
              class="archive-format"
              :class="{ selected: format === item }"
              :aria-pressed="format === item"
              :disabled="busy"
              @click="format = item"
            >
              {{ archiveFormatLabels[item] }}
            </button>
          </div>
        </template>
      </div>

      <div v-if="outcome" class="archive-actions">
        <button
          type="button"
          class="settings-button"
          :disabled="!archive?.canReveal"
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
        <button type="button" class="settings-button primary" @click="close">
          完成
        </button>
      </div>

      <button
        v-else
        type="button"
        class="settings-button primary archive-start"
        :disabled="busy"
        @click="start"
      >
        {{ busy ? '正在打包…' : '开始打包' }}
      </button>

      <p v-if="error" class="archive-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.archive-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.archive-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.archive-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.archive-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.archive-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
}
.archive-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-label);
}
.archive-file-size {
  flex: none;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}
.archive-file-remove {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
}
.archive-file-remove:hover:not(:disabled) {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.archive-label {
  margin: 14px 0 8px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.archive-formats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.archive-formats.is-single {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.archive-format {
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
.archive-format.selected {
  border-color: var(--color-brand-ink);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.archive-start {
  flex: none;
  width: 100%;
  height: 34px;
  min-height: 34px;
  margin-top: 12px;
  font-size: var(--font-size-body);
}
.archive-result {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 6px;
  font-size: var(--font-size-body);
}
.archive-result strong {
  color: var(--color-brand-ink);
}
.archive-output {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
}
.archive-output-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-label);
  font-weight: 600;
}
.archive-output-size {
  flex: none;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}
.archive-actions {
  display: flex;
  flex: none;
  gap: 8px;
  margin-top: 12px;
}
.archive-actions .settings-button {
  flex: 1;
  height: 34px;
  min-height: 34px;
  gap: 6px;
  font-size: var(--font-size-body);
}
.archive-notice {
  margin: 8px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
.archive-error {
  margin: 8px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
</style>
