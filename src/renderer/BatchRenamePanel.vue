<script setup lang="ts">
import { computed, ref } from 'vue'
import { PenLine } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  previewRename,
  type RenameConfig,
  type RenameFormat,
  type RenameMode,
  type RenamePosition,
} from '../shared/rename'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const mode = ref<RenameMode>('replace')
const find = ref('')
const replace = ref('')
const addText = ref('')
const addPosition = ref<RenamePosition>('after')
const format = ref<RenameFormat>('index')
const formatText = ref('文件')
const formatPosition = ref<RenamePosition>('after')
const start = ref(1)

const files = computed(() => props.state?.rename.files ?? [])
const busy = computed(() => Boolean(props.state?.rename.busy))
const config = computed<RenameConfig>(() => ({
  mode: mode.value,
  find: find.value,
  replace: replace.value,
  text: mode.value === 'add' ? addText.value : formatText.value,
  position: mode.value === 'add' ? addPosition.value : formatPosition.value,
  format: format.value,
  start: Number(start.value) || 0,
}))
const preview = computed(() =>
  previewRename(
    files.value.map((file) => file.name),
    config.value,
  ),
)
const changed = computed(() =>
  preview.value.some((name, index) => name !== files.value[index]?.name),
)
const visible = computed(() => files.value.slice(0, 6))

function close(): void {
  emit('command', { type: 'rename-close' })
}
function apply(): void {
  if (!changed.value || busy.value) return
  emit('command', { type: 'rename-apply', config: config.value })
}
</script>

<template>
  <main class="rename-shell" @keydown.esc="close">
    <section class="rename-surface" aria-label="批量重命名">
      <PanelHeader
        title="批量重命名"
        :platform="state?.runtime.platform"
        @minimize="emit('command', { type: 'panel-control', action: 'minimize' })"
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      >
        <template #icon>
          <PenLine
            :size="17"
            :stroke-width="2"
            aria-hidden="true"
            focusable="false"
          />
        </template>
      </PanelHeader>

      <p class="rename-count">给 {{ files.length }} 个项目重新命名</p>

      <div class="rename-modes" role="group" aria-label="重命名方式">
        <button
          type="button"
          :class="{ active: mode === 'replace' }"
          @click="mode = 'replace'"
        >
          替换文本
        </button>
        <button
          type="button"
          :class="{ active: mode === 'add' }"
          @click="mode = 'add'"
        >
          添加文本
        </button>
        <button
          type="button"
          :class="{ active: mode === 'format' }"
          @click="mode = 'format'"
        >
          格式
        </button>
      </div>

      <div v-if="mode === 'replace'" class="rename-fields">
        <label>
          <span>查找</span>
          <input v-model="find" type="text" placeholder="要替换的文字" />
        </label>
        <label>
          <span>替换成</span>
          <input v-model="replace" type="text" placeholder="留空则删除" />
        </label>
      </div>

      <div v-else-if="mode === 'add'" class="rename-fields">
        <label class="rename-wide">
          <span>添加文本</span>
          <input v-model="addText" type="text" placeholder="要添加的文字" />
        </label>
        <label>
          <span>位置</span>
          <select v-model="addPosition">
            <option value="before">名称之前</option>
            <option value="after">名称之后</option>
          </select>
        </label>
      </div>

      <div v-else class="rename-fields rename-format">
        <label>
          <span>名称格式</span>
          <select v-model="format">
            <option value="index">名称和索引</option>
            <option value="counter">名称和计数</option>
            <option value="date">名称和日期</option>
          </select>
        </label>
        <label>
          <span>位置</span>
          <select v-model="formatPosition">
            <option value="before">名称之前</option>
            <option value="after">名称之后</option>
          </select>
        </label>
        <label class="rename-wide">
          <span>自定义格式</span>
          <input v-model="formatText" type="text" placeholder="文件名" />
        </label>
        <label v-if="format === 'counter'">
          <span>开始数字</span>
          <input v-model.number="start" type="number" min="0" max="999999" />
        </label>
      </div>

      <div class="rename-preview" aria-live="polite">
        <div
          v-for="(file, index) in visible"
          :key="file.id"
          class="rename-row"
          :class="{ unchanged: preview[index] === file.name }"
        >
          <span class="rename-old" :title="file.name">{{ file.name }}</span>
          <span class="rename-arrow">→</span>
          <span class="rename-new" :title="preview[index]">{{
            preview[index]
          }}</span>
        </div>
        <p v-if="files.length > visible.length" class="rename-more">
          还有 {{ files.length - visible.length }} 个文件
        </p>
      </div>

      <p v-if="error" class="rename-error" role="alert">{{ error }}</p>

      <footer class="rename-actions">
        <button type="button" class="button-soft" @click="close">取消</button>
        <button
          type="button"
          class="button-glass"
          :disabled="busy || !changed"
          @click="apply"
        >
          {{ busy ? "正在重命名…" : "重命名" }}
        </button>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.rename-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.rename-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.rename-count {
  margin: 0 0 12px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.rename-modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 3px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.rename-modes button {
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: calc(var(--radius-control) - 3px);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.rename-modes button.active {
  background: var(--color-surface);
  color: var(--color-brand-ink);
  box-shadow: var(--shadow-control);
}
.rename-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  margin-top: 14px;
}
.rename-fields label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 150px;
  min-width: 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.rename-fields label.rename-wide {
  flex-basis: 100%;
}
.rename-fields input,
.rename-fields select {
  height: var(--tap-min);
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.rename-fields input:focus-visible,
.rename-fields select:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.rename-preview {
  flex: 1;
  min-height: 0;
  margin-top: 14px;
  padding: 4px 0;
  border-top: 1px solid var(--color-line);
  overflow: auto;
  scrollbar-width: thin;
}
.rename-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 30px;
  font-size: var(--font-size-label);
}
.rename-row.unchanged {
  opacity: 0.55;
}
.rename-old,
.rename-new {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rename-old {
  color: var(--color-muted);
}
.rename-new {
  color: var(--color-brand-ink);
  font-weight: var(--font-weight-bold);
}
.rename-arrow {
  color: var(--color-muted);
}
.rename-more {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
}
.rename-actions {
  flex: none;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 0;
  border-top: 0;
}
.rename-actions .button-soft,
.rename-actions .button-glass {
  min-width: 96px;
}
.rename-error {
  margin: 8px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
</style>
