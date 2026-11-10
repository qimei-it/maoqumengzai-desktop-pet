<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FilePlusCorner, GripVertical, X } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import FileTypeIcon from './FileTypeIcon.vue'

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
      <header class="pocket-header">
        <h1>文件置物架</h1>
        <button
          class="pocket-icon-button"
          aria-label="关闭文件卡片"
          @click="emit('command', { type: 'hide-pocket' })"
        >
          <X
            :size="16"
            :stroke-width="2"
            aria-hidden="true"
            focusable="false"
          />
        </button>
      </header>

      <div v-if="!state?.files.length" class="pocket-empty">
        <FilePlusCorner
          :size="40"
          :stroke-width="2"
          aria-hidden="true"
          focusable="false"
        />
        <h2>拖到桌宠身上</h2>
        <button class="button-soft" @click="emit('selectFiles')">
          选择本地文件
        </button>
      </div>

      <template v-else>
        <p class="pocket-drag-hint">按住卡片拖出</p>
        <div class="pocket-files" role="group" aria-label="本地文件">
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
              <FileTypeIcon :name="file.name" :size="24" />
            </span>
            <div class="pocket-file-description">
              <strong :title="file.name">{{ file.name }}</strong
              ><span
                >{{ size(file.size)
                }}<span v-if="file.status === 'shelved'"> · 已暂存</span></span
              >
            </div>
            <GripVertical
              class="pocket-drag-icon"
              :size="16"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />
          </article>
        </div>
        <div v-if="selected" class="pocket-actions">
          <div class="pocket-primary-actions button-pair">
            <button
              class="button-glass"
              :disabled="selected.status === 'shelved'"
              @click="
                emit('command', { type: 'stash-file', fileId: selected.id })
              "
            >
              {{
                selected.status === 'shelved'
                  ? '已暂存到置物架'
                  : '暂存到置物架'
              }}
            </button>
            <button
              class="button-soft"
              @click="
                emit('command', { type: 'save-copy', fileId: selected.id })
              "
            >
              另存副本
            </button>
          </div>
          <button
            class="pocket-convert button-soft"
            disabled
            title="格式转换引擎尚未接入"
          >
            转换格式
          </button>
          <p
            v-if="selected.status === 'shelved'"
            class="pocket-saved"
            role="status"
          >
            已暂存
          </p>
          <div class="pocket-secondary-actions">
            <button
              @click="
                emit('command', { type: 'reveal-file', fileId: selected.id })
              "
            >
              定位原文件</button
            ><button
              @click="
                emit('command', { type: 'remove-file', fileId: selected.id })
              "
            >
              移除记录
            </button>
          </div>
        </div>
      </template>
      <section v-if="state?.belly.length" class="pocket-belly">
        <div class="pocket-belly-heading">
          <strong>肚子里的</strong><span>7 天内可取回</span>
        </div>
        <ul>
          <li v-for="entry in state.belly.slice(0, 3)" :key="entry.id">
            <span class="pocket-belly-name" :title="entry.name">{{
              entry.name
            }}</span>
            <button
              @click="
                emit('command', { type: 'restore-eaten', entryId: entry.id })
              "
            >
              取回
            </button>
          </li>
        </ul>
        <p v-if="state.belly.length > 3">
          还有 {{ state.belly.length - 3 }} 项，完整列表将随工作台提供。
        </p>
      </section>
      <p v-if="error" class="pocket-error" role="alert">{{ error }}</p>
      <footer class="pocket-footer">
        <span>本地保存 · 原件保留</span
        ><button v-if="state?.files.length" @click="emit('selectFiles')">
          添加文件
        </button>
      </footer>
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
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.pocket-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}
.pocket-header h1 {
  font-size: var(--font-size-section);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  font-weight: 650;
}
.pocket-icon-button {
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  min-height: 28px;
  padding: 0;
  color: var(--color-muted);
}
.pocket-drag-hint {
  font-size: var(--font-size-label);
  color: var(--color-muted);
  line-height: 1.6;
  margin: 0 0 12px;
}
.pocket-files {
  max-height: 151px;
  min-height: 70px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-line) transparent;
  flex: 0 1 auto;
}
.pocket-file {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 10px;
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
.pocket-file-description {
  flex: 1;
  min-width: 0;
}
.pocket-file-description strong {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--font-size-body);
  font-weight: 600;
}
.pocket-file-description > span {
  display: block;
  font-size: var(--font-size-label);
  color: var(--color-muted);
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
}
.pocket-drag-icon {
  color: var(--color-brand-ink);
  flex: none;
}
.pocket-actions {
  margin-top: 14px;
}
.pocket-primary-actions {
  gap: var(--space-4);
}
.pocket-primary-actions .button-glass,
.pocket-primary-actions .button-soft {
  border-color: transparent;
}
.pocket-convert {
  min-height: var(--tap-min);
  margin-top: 8px;
  width: 100%;
  font-size: var(--font-size-label);
  background: var(--color-fill-secondary);
  color: var(--color-muted);
  cursor: not-allowed;
  opacity: 1;
}
.pocket-saved {
  font-size: var(--font-size-label);
  color: var(--color-success);
  margin: 7px 0 0;
  line-height: 1.5;
}
.pocket-primary-actions button:disabled {
  background: var(--color-success-soft);
  color: var(--color-success);
  border-color: transparent;
  opacity: 1;
  cursor: default;
}
.pocket-secondary-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}
.pocket-secondary-actions button {
  background: transparent;
  border: 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  min-height: 28px;
  padding: 3px 0;
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
.pocket-belly li button {
  flex: none;
  border: 0;
  background: transparent;
  color: var(--color-brand-ink);
  min-height: 26px;
  padding: 2px 4px;
  font-size: var(--font-size-label);
}
.pocket-belly > p {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.pocket-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
  font-size: var(--font-size-caption);
  color: var(--color-muted);
  border-top: 0;
}
.pocket-footer button {
  border: 0;
  background: transparent;
  color: var(--color-brand-ink);
  font-size: var(--font-size-label);
  padding: 3px 0;
  min-height: 25px;
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
  text-align: center;
  padding-bottom: 12px;
}
.pocket-empty > svg {
  color: var(--color-brand-ink);
  margin-bottom: 16px;
}
.pocket-empty h2 {
  font-size: var(--font-size-section);
  margin: 0;
}
.pocket-empty button {
  min-height: var(--tap-min);
  margin-top: 16px;
  padding-inline: var(--space-8);
  font-size: var(--font-size-label);
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
