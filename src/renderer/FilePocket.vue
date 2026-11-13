<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FilePlusCorner, GripVertical } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import FileTypeIcon from './FileTypeIcon.vue'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error: string }>()
const emit = defineEmits<{
  command: [command: Command]
  selectFiles: []
  receiveFiles: [files: File[]]
}>()
const selectedId = ref('')
const over = ref(false)
const selected = computed(
  () =>
    props.state?.files.find((file) => file.id === selectedId.value) ||
    props.state?.files.at(-1),
)
watch(
  () => props.state?.files.map((file) => file.id).join(':'),
  () => {
    selectedId.value = props.state?.files.at(-1)?.id || ''
  },
)
function size(value: number): string {
  return value < 1024
    ? `${value} B`
    : value < 1024 ** 2
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1024 ** 2).toFixed(1)} MB`
}
function startDrag(event: DragEvent, id: string): void {
  event.preventDefault()
  event.stopPropagation()
  window.mqmz?.startDrag(id)
}
function receive(event: DragEvent): void {
  event.preventDefault()
  over.value = false
  emit('receiveFiles', [...(event.dataTransfer?.files || [])])
}
function convertSelected(): void {
  const file = selected.value
  if (!file) return
  emit('command', { type: 'convert-open', fileIds: [file.id] })
}
function commandForSelected(
  type: 'save-copy' | 'remove-file' | 'reveal-file',
): void {
  const file = selected.value
  if (!file) return
  emit('command', { type, fileId: file.id })
}
</script>

<template>
  <main
    class="pocket-shell"
    :class="{ 'pocket-over': over }"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop="receive"
    @keydown.esc="emit('command', { type: 'hide-pocket' })"
  >
    <section class="pocket-surface" aria-label="文件置物架">
      <PanelHeader
        title="文件置物架"
        :platform="state?.runtime.platform"
        @minimize="emit('command', { type: 'panel-control', action: 'minimize' })"
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />


      <div v-if="!state?.files.length" class="pocket-empty">
        <FilePlusCorner
          :size="40"
          :stroke-width="2"
          aria-hidden="true"
          focusable="false"
        />
        <h2>拖到桌宠身上</h2>
        <span class="pocket-or">或</span>
        <button
          class="settings-button primary pocket-select"
          @click="emit('selectFiles')"
        >
          选择本地文件
        </button>
      </div>

      <template v-else>
        <div class="pocket-files panel-scroll" role="group" aria-label="本地文件">
          <article
            v-for="file in state.files"
            :key="file.id"
            class="pocket-file"
            :class="{ selected: selected?.id === file.id }"
            draggable="true"
            tabindex="0"
            role="button"
            :aria-label="`文件 ${file.name}`"
            :aria-pressed="selected?.id === file.id"
            data-testid="pocket-file"
            @click="selectedId = file.id"
            @keydown.enter="selectedId = file.id"
            @keydown.space.prevent="selectedId = file.id"
            @dragstart="startDrag($event, file.id)"
          >
            <span class="pocket-file-symbol">
              <FileTypeIcon :name="file.name" :size="22" />
            </span>
            <strong class="pocket-file-name" :title="file.name">{{
              file.name
            }}</strong>
            <span class="pocket-file-size">{{ size(file.size) }}</span>
            <GripVertical
              class="pocket-drag-icon"
              :size="16"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />
          </article>
        </div>
      </template>
      <section v-if="state?.belly.length" class="pocket-belly">
        <div class="pocket-belly-heading">
          <strong>肚子里的</strong><span>7 天内可取回</span>
        </div>
        <ul>
          <li v-for="entry in state?.belly.slice(0, 3)" :key="entry.id">
            <span class="pocket-belly-name" :title="entry.name">{{
              entry.name
            }}</span>
            <button
              class="settings-button pocket-restore"
              @click="
                emit('command', { type: 'restore-eaten', entryId: entry.id })
              "
            >
              取回
            </button>
          </li>
        </ul>
        <p v-if="state && state.belly.length > 3">
          还有 {{ state.belly.length - 3 }} 项，完整列表将随工作台提供。
        </p>
      </section>
      <p v-if="error" class="pocket-error" role="alert">{{ error }}</p>
      <div v-if="state?.files.length" class="pocket-actions">
        <button
          class="settings-button primary pocket-add"
          @click="emit('selectFiles')"
        >
          新增文件
        </button>
        <button class="settings-button" @click="convertSelected">
          格式转换
        </button>
        <button class="settings-button" @click="commandForSelected('save-copy')">
          另存副本
        </button>
        <button
          class="settings-button"
          @click="commandForSelected('remove-file')"
        >
          移出置物架
        </button>
        <button
          class="settings-button"
          @click="commandForSelected('reveal-file')"
        >
          定位源文件
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.pocket-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.pocket-surface {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.pocket-files {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.pocket-file {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: var(--radius-control);
  cursor: grab;
  outline-offset: -2px;
}
.pocket-file.selected {
  background: var(--color-brand-soft);
}
.pocket-file:hover {
  background: var(--color-brand-soft);
}
.pocket-file:active {
  cursor: grabbing;
}
.pocket-file:focus-visible {
  outline: 2px solid var(--color-brand-ink);
}
.pocket-file-symbol {
  display: flex;
  color: var(--color-brand-ink);
  flex: none;
}
.pocket-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-body);
  font-weight: 600;
}
.pocket-file-size {
  flex: none;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}
.pocket-drag-icon {
  color: var(--color-brand-ink);
  flex: none;
}
.pocket-actions {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-line);
}
.pocket-actions .settings-button {
  flex: 1 1 28%;
}
.pocket-belly {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-line);
}
.pocket-belly-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--font-size-label);
}
.pocket-belly-heading span {
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.pocket-belly ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
}
.pocket-belly li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 0;
  font-size: var(--font-size-label);
}
.pocket-belly-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pocket-belly .pocket-restore {
  flex: none;
}
.pocket-belly > p {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.pocket-error {
  font-size: var(--font-size-label);
  line-height: 1.5;
  color: var(--color-danger);
  margin: 8px 0;
  max-height: 50px;
  overflow: auto;
}
.pocket-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  padding-bottom: 12px;
}
.pocket-empty > svg {
  color: var(--color-brand-ink);
  margin-bottom: 8px;
}
.pocket-empty h2 {
  font-size: var(--font-size-section);
  line-height: 1.35;
  margin: 0;
}
.pocket-or {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.3;
}
.pocket-select {
  margin-top: 2px;
}
.pocket-over .pocket-surface {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: -2px;
}
.pocket-shell ::selection {
  background: var(--color-brand-soft);
}
.pocket-shell button:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
</style>
