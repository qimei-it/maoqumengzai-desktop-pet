<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, FolderOpen, Music, X } from '@lucide/vue'
import { isAudioFile } from '../shared/file-kinds'
import type {
  Command,
  ConvertAction,
  ConvertTargetGroup,
  Snapshot,
} from '../shared/protocol'
import FileTypeIcon from './FileTypeIcon.vue'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const convert = computed(() => props.state?.convert)
const title = computed(() =>
  convert.value?.mode === 'audio' ? '提取音频' : '文件转换',
)
watch(
  title,
  (value) => {
    document.title = `毛趣萌仔 · ${value}`
  },
  { immediate: true },
)
const target = ref<ConvertAction | ''>('')
const busy = computed(() => Boolean(convert.value?.busy))
const password = ref('')
const needsPassword = computed(
  () => target.value === 'pdf-encrypt' || target.value === 'pdf-decrypt',
)
const files = computed(() => convert.value?.files ?? [])
const targets = computed(() => convert.value?.targets ?? [])
const outcome = computed(() => convert.value?.outcome)
const progress = computed(
  () => convert.value?.progress ?? { done: 0, total: 0 },
)
const batch = computed(() => files.value.length > 1)
const hasPercent = computed(
  () =>
    typeof progress.value.percent === 'number' || progress.value.done > 0,
)
const percent = computed(() => {
  if (!progress.value.total) return 0
  const done = progress.value.done + (progress.value.percent ?? 0) / 100
  return Math.min(100, Math.round((done / progress.value.total) * 100))
})
const displayPercent = ref(0)
watch(
  [
    busy,
    () => progress.value.done,
    () => progress.value.total,
    () => progress.value.percent,
  ],
  () => {
    if (!busy.value) {
      displayPercent.value = 0
      return
    }
    if (!progress.value.total) return
    displayPercent.value = Math.max(displayPercent.value, percent.value)
  },
  { immediate: true },
)
const progressText = computed(() => {
  if (hasPercent.value) return `${displayPercent.value}%`
  if (progress.value.done > 0)
    return `已完成 ${progress.value.done} / ${progress.value.total}`
  return '正在转换'
})
const extraOutputs = computed(() =>
  Math.max(
    0,
    (outcome.value?.converted ?? 0) - (outcome.value?.outputs.length ?? 0),
  ),
)
function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

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
  if (target.value === 'pdf-encrypt') return '生成带打开密码的 PDF'
  if (target.value === 'pdf-decrypt') return '移除 PDF 打开密码'
  return batch.value ? '批量输出到 convert_output' : '输出到原目录'
})
const groupLabel: Record<ConvertTargetGroup, string> = {
  video: '视频',
  audio: '提取音频',
  image: '图片',
  pdf: 'PDF',
}
const audioGroupLabel = computed(() =>
  files.value.length > 0 && files.value.every((file) => isAudioFile(file.name))
    ? '音频'
    : '提取音频',
)
function groupTitle(group: ConvertTargetGroup): string {
  return group === 'audio' ? audioGroupLabel.value : groupLabel[group]
}
const targetGroups = computed(() => {
  const order: ConvertTargetGroup[] = ['video', 'audio', 'image', 'pdf']
  return order
    .map((group) => ({
      group,
      items: targets.value.filter((item) => item.group === group),
    }))
    .filter((group) => group.items.length > 0)
})
const mediaGroups = computed(() =>
  targetGroups.value.filter(
    (group) => group.group === 'video' || group.group === 'audio',
  ),
)

function close(): void {
  emit('command', { type: 'convert-close' })
}
watch(target, () => {
  password.value = ''
})
function start(): void {
  if (!target.value) return
  if (needsPassword.value && !password.value) return
  emit('command', {
    type: 'convert-start',
    action: target.value,
    ...(needsPassword.value ? { password: password.value } : {}),
  })
}
function cancel(): void {
  emit('command', { type: 'convert-cancel' })
}
function reveal(): void {
  emit('command', { type: 'convert-reveal' })
}
function removeFile(fileId: string): void {
  emit('command', { type: 'convert-remove-file', fileId })
}
function moveFile(fileId: string, direction: 'up' | 'down'): void {
  emit('command', { type: 'convert-move-file', fileId, direction })
}
function openOutput(outputId: string): void {
  emit('command', { type: 'convert-output-open', outputId })
}
</script>

<template>
  <main class="convert-shell" @keydown.esc="close">
    <section class="convert-surface" :aria-label="title">
      <PanelHeader
        :title="title"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="close"
      />

      <div class="convert-content panel-scroll">
        <div v-if="!outcome" class="convert-files">
          <div
            v-for="(file, index) in files"
            :key="file.id"
            class="convert-file"
            :title="file.name"
          >
            <FileTypeIcon :name="file.name" :size="18" />
            <span class="convert-file-name">{{ file.name }}</span>
            <template v-if="target === 'merge-pdf' && !busy">
              <button
                type="button"
                class="convert-file-move"
                :disabled="index === 0"
                :aria-label="`上移 ${file.name}`"
                title="上移"
                @click.stop="moveFile(file.id, 'up')"
              >
                <ArrowUp :size="14" :stroke-width="2" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="convert-file-move"
                :disabled="index === files.length - 1"
                :aria-label="`下移 ${file.name}`"
                title="下移"
                @click.stop="moveFile(file.id, 'down')"
              >
                <ArrowDown :size="14" :stroke-width="2" aria-hidden="true" />
              </button>
            </template>
            <button
              type="button"
              class="convert-file-remove"
              :disabled="busy"
              :aria-label="`从转换列表移除 ${file.name}`"
              title="从转换列表移除"
              @click.stop="removeFile(file.id)"
            >
              <X :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p v-if="convert?.notice" class="convert-notice">
          {{ convert.notice }}
        </p>

        <template v-if="outcome">
          <div class="convert-result" role="status">
            <strong>已转换 {{ outcome.converted }} 个</strong>
            <span v-if="outcome.failed">失败 {{ outcome.failed }} 个</span>
          </div>
          <ul v-if="outcome.messages.length" class="convert-errors panel-scroll">
            <li v-for="message in outcome.messages.slice(0, 3)" :key="message">
              {{ message }}
            </li>
          </ul>
        </template>

        <template v-else-if="targets.length">
          <template v-if="mediaGroups.length">
            <section
              v-for="group in mediaGroups"
              :key="group.group"
              class="convert-group"
            >
              <p class="convert-label">{{ groupTitle(group.group) }}</p>
              <div
                class="convert-targets"
                role="group"
                :aria-label="groupTitle(group.group)"
              >
                <button
                  v-for="item in group.items"
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
            </section>
          </template>
          <template v-else>
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
          </template>
          <label v-if="needsPassword" class="convert-password">
            <span>PDF 密码</span>
            <input
              v-model="password"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :disabled="busy"
              placeholder="输入打开密码"
            />
          </label>
          <p class="convert-output">{{ outputHint }}</p>
        </template>

        <p v-else class="convert-notice">
          没有可用的转换目标。
        </p>

        <p v-if="error" class="convert-error" role="alert">{{ error }}</p>
      </div>

      <div
        v-if="outcome?.outputs.length"
        class="convert-previews panel-scroll"
        aria-label="转换结果预览"
      >
        <button
          v-for="output in outcome.outputs"
          :key="output.id"
          type="button"
          class="convert-preview"
          :title="output.name"
          :aria-label="`打开 ${output.name}`"
          @click="openOutput(output.id)"
        >
          <span class="convert-preview-media">
            <img
              v-if="output.preview"
              :src="output.preview"
              alt=""
              draggable="false"
            />
            <Music
              v-else-if="output.kind === 'audio'"
              :size="28"
              :stroke-width="2"
              aria-hidden="true"
            />
            <FileTypeIcon v-else :name="output.name" :size="30" />
            <span class="convert-preview-badge">{{ output.format }}</span>
          </span>
          <span class="convert-preview-name">{{ output.name }}</span>
          <span class="convert-preview-meta">{{
            formatSize(output.size)
          }}</span>
        </button>
        <span v-if="extraOutputs" class="convert-preview-more">
          还有 {{ extraOutputs }} 个
        </span>
      </div>

      <div v-if="outcome" class="convert-actions">
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

      <div v-if="busy" class="convert-progress">
        <div
          class="convert-progress-track"
          :class="{ indeterminate: !hasPercent }"
        >
          <span
            v-if="hasPercent"
            :style="{ width: `${displayPercent}%` }"
          ></span>
        </div>
        <span class="convert-progress-text">{{ progressText }}</span>
      </div>

      <button
        v-if="!outcome && targets.length"
        type="button"
        class="convert-start"
        :class="busy ? 'button-soft' : 'button-glass'"
        :disabled="
          !busy && (!target || (needsPassword && !password))
        "
        @click="busy ? cancel() : start()"
      >
        {{ busy ? "取消转换" : "开始转换" }}
      </button>
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
  overflow: hidden;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.convert-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.convert-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: none;
  margin-bottom: 12px;
}
.convert-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--font-size-label);
}
.convert-file-name {
  flex: 1;
  min-width: 0;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.convert-file-remove,
.convert-file-move {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.convert-file-remove:hover:not(:disabled),
.convert-file-move:hover:not(:disabled) {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.convert-file-remove:focus-visible,
.convert-file-move:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.convert-file-remove:disabled,
.convert-file-move:disabled {
  opacity: 0.45;
  cursor: default;
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
.convert-group + .convert-group {
  margin-top: 14px;
}
.convert-password {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.convert-password input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
}
.convert-password input:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.convert-output {
  margin: 12px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.convert-progress {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.convert-progress-track {
  position: relative;
  flex: 1;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(
    in srgb,
    var(--color-brand-ink) 14%,
    var(--color-fill-secondary)
  );
}
.convert-progress-track span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--color-brand-ink);
  transition: width 160ms var(--ease-standard);
}
.convert-progress-track.indeterminate {
  background-image: linear-gradient(
    100deg,
    transparent 0%,
    color-mix(in srgb, var(--color-brand-ink) 26%, transparent) 45%,
    transparent 80%
  );
  background-color: color-mix(
    in srgb,
    var(--color-brand-ink) 14%,
    var(--color-fill-secondary)
  );
  background-repeat: no-repeat;
  background-size: 220% 100%;
  animation: convert-progress-shimmer 1.2s linear infinite;
}
@keyframes convert-progress-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -120% 0;
  }
}
.convert-progress-text {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
}
.convert-start {
  flex: none;
  width: 100%;
  margin-top: 12px;
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
  flex: none;
  gap: 8px;
  margin-top: 12px;
}
.convert-previews {
  display: flex;
  flex: none;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  margin-top: 12px;
  padding: 2px 0 6px;
}
.convert-preview {
  display: block;
  flex: none;
  width: 150px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  text-align: left;
  cursor: pointer;
  box-shadow: var(--shadow-control);
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}
.convert-preview:hover {
  border-color: var(--color-brand);
  transform: translateY(-1px);
}
.convert-preview:active {
  transform: scale(0.98);
}
.convert-preview:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.convert-preview-media {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--color-fill-secondary);
  color: var(--color-muted);
}
.convert-preview-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.convert-preview-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 6px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-brand-ink);
  font-size: 9px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.04em;
}
.convert-preview-name {
  display: -webkit-box;
  overflow: hidden;
  padding: 6px 8px 0;
  font-size: var(--font-size-label);
  line-height: 1.35;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.convert-preview-meta {
  display: block;
  padding: 2px 8px 7px;
  color: var(--color-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.convert-preview-more {
  display: grid;
  flex: none;
  place-items: center;
  width: 76px;
  padding: 0 4px;
  border: 1px dashed var(--color-line);
  border-radius: var(--radius-control);
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.4;
  text-align: center;
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
  .convert-progress-track.indeterminate {
    background-image: none;
    animation: none;
  }
  .convert-preview {
    transition: none;
  }
}
</style>
