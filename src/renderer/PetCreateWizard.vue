<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  AlertCircle,
  Info,
  LoaderCircle,
  Plus,
  RefreshCw,
  X,
} from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import type { PetPoseId } from '../shared/pet-style'

const props = defineProps<{ state?: Snapshot }>()
const emit = defineEmits<{ command: [Command] }>()

const name = ref('')
const dialog = ref<HTMLElement | null>(null)
const create = computed(() => props.state?.petCreate)
const open = computed(() => create.value?.open === true)
const step = computed(() => create.value?.step ?? 'edit')
const busy = computed(() => create.value?.busy === true)
const photos = computed(() => create.value?.photos ?? [])
const poses = computed(() => create.value?.poses ?? [])
const volcanoReady = computed(() => create.value?.volcanoReady === true)
const canStart = computed(
  () =>
    Boolean(name.value.trim()) &&
    photos.value.length > 0 &&
    volcanoReady.value &&
    !busy.value,
)
const doneCount = computed(
  () => poses.value.filter((pose) => pose.status === 'done').length,
)
const allDone = computed(
  () =>
    poses.value.length > 0 &&
    poses.value.every((pose) => pose.status === 'done'),
)
const canContinue = computed(
  () =>
    step.value === 'generating' &&
    !busy.value &&
    poses.value.some((pose) => pose.status !== 'done'),
)

watch(open, async (value) => {
  if (!value) return
  name.value = create.value?.name ?? ''
  await nextTick()
  dialog.value?.focus()
})

function addPhotos(): void {
  emit('command', { type: 'pet-create-pick-photos' })
}
function removePhoto(id: string): void {
  emit('command', { type: 'pet-create-remove-photo', id })
}
function start(): void {
  if (!canStart.value) return
  emit('command', { type: 'pet-create-start', name: name.value.trim() })
}
function continueSet(): void {
  if (busy.value) return
  emit('command', { type: 'pet-create-start', name: name.value.trim() })
}
function retry(pose: PetPoseId): void {
  emit('command', { type: 'pet-create-retry', pose })
}
function stop(): void {
  emit('command', { type: 'pet-create-cancel' })
}
function close(): void {
  emit('command', { type: 'pet-create-close' })
}
function save(): void {
  emit('command', { type: 'pet-create-save' })
}
</script>

<template>
  <Transition name="pet-wizard">
    <div
      v-if="open"
      class="pet-wizard-layer"
    >
      <section
        ref="dialog"
        class="pet-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="新建桌宠"
        tabindex="-1"
        @keydown.esc="!busy && close()"
      >
        <header class="pet-wizard-head">
          <h2>
            {{
              step === 'edit'
                ? '新建桌宠'
                : step === 'preview'
                  ? '预览桌宠'
                  : '生成桌宠'
            }}
          </h2>
        </header>

        <div v-if="step === 'edit'" class="pet-wizard-body">
          <div class="pet-wizard-field">
            <span class="pet-wizard-label">
              参考照片
              <span
                class="pet-wizard-info"
                tabindex="0"
                aria-label="最多添加 4 张照片；照片仅用于本次生成，保存或放弃后会删除。"
              >
                <Info :size="13" :stroke-width="2" aria-hidden="true" />
                <span class="pet-wizard-tooltip" role="tooltip">
                  最多添加 4 张照片；照片仅用于本次生成，保存或放弃后会删除。
                </span>
              </span>
            </span>
            <div class="pet-wizard-photos">
              <div
                v-for="photo in photos"
                :key="photo.id"
                class="pet-wizard-photo"
              >
                <img :src="photo.url" :alt="photo.name" draggable="false" />
                <button
                  type="button"
                  class="pet-wizard-remove"
                  :aria-label="`移除${photo.name}`"
                  title="移除"
                  @click="removePhoto(photo.id)"
                >
                  <X :size="10" :stroke-width="2.2" aria-hidden="true" />
                </button>
              </div>
              <button
                v-if="photos.length < 4"
                type="button"
                class="pet-wizard-add"
                aria-label="添加照片"
                title="添加照片"
                @click="addPhotos"
              >
                <Plus :size="20" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </div>

          <label class="pet-wizard-field">
            <span class="pet-wizard-label">名字</span>
            <input
              v-model="name"
              class="pet-wizard-input"
              type="text"
              maxlength="20"
              placeholder="给桌宠起个名字"
              aria-label="桌宠名字"
              @keydown.enter.prevent="start"
            />
          </label>

          <p v-if="!volcanoReady" class="pet-wizard-error" role="alert">
            请先在设置 → 智能体添加火山方舟 API Key。
          </p>
          <p v-else-if="create?.error" class="pet-wizard-error" role="alert">
            {{ create.error }}
          </p>
        </div>

        <div v-else class="pet-wizard-body">
          <div class="pet-wizard-progress">
            <span>{{ doneCount }} / {{ poses.length }}</span>
          </div>
          <p v-if="create?.error" class="pet-wizard-error" role="alert">
            {{ create.error }}
          </p>
          <div class="pet-wizard-grid">
            <div
              v-for="pose in poses"
              :key="pose.id"
              class="pet-wizard-pose"
              :class="`is-${pose.status}`"
            >
              <div class="pet-wizard-stage">
                <img
                  v-if="pose.url"
                  :src="pose.url"
                  :alt="pose.label"
                  draggable="false"
                />
                <LoaderCircle
                  v-else-if="pose.status === 'generating'"
                  class="pet-wizard-spin"
                  :size="20"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <AlertCircle
                  v-else-if="pose.status === 'error'"
                  :size="20"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <span v-else class="pet-wizard-pending" aria-hidden="true" />
                <button
                  v-if="(pose.url || pose.status === 'error') && !busy"
                  type="button"
                  class="pet-wizard-refresh"
                  :aria-label="`重新生成${pose.label}`"
                  :title="`重新生成${pose.label}`"
                  @click="retry(pose.id)"
                >
                  <RefreshCw
                    :size="13"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <span class="pet-wizard-pose-label">{{ pose.label }}</span>
              <span
                v-if="pose.status === 'error'"
                class="pet-wizard-pose-error"
                :title="pose.error"
                >失败</span
              >
            </div>
          </div>
        </div>

        <footer class="pet-wizard-foot">
          <template v-if="step === 'edit'">
            <button type="button" class="settings-button" @click="close">
              取消
            </button>
            <button
              type="button"
              class="settings-button primary"
              :disabled="!canStart"
              @click="start"
            >
              开始生成
            </button>
          </template>
          <template v-else-if="step === 'preview' && allDone">
            <button type="button" class="settings-button" @click="close">
              放弃
            </button>
            <button
              type="button"
              class="settings-button primary"
              @click="save"
            >
              保存并切换
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="settings-button"
              :disabled="busy"
              @click="stop"
            >
              {{ busy ? '停止' : '返回' }}
            </button>
            <button
              type="button"
              class="settings-button primary"
              :disabled="busy || !canContinue"
              @click="continueSet"
            >
              继续生成
            </button>
          </template>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.pet-wizard-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--color-overlay);
}
.pet-wizard {
  width: min(680px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
  outline: none;
}
.pet-wizard-head {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 20px 12px;
}
.pet-wizard-head h2 {
  margin: 0;
  font-size: var(--font-size-section);
  font-weight: 650;
  color: var(--color-ink);
}
.pet-wizard-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 20px 12px;
  overflow-y: auto;
}
.pet-wizard-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pet-wizard-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.pet-wizard-info {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--color-muted);
  cursor: help;
}
.pet-wizard-info:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: var(--radius-pill);
}
.pet-wizard-tooltip {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: max-content;
  max-width: min(320px, 70vw);
  padding: 8px 10px;
  border-radius: var(--radius-control);
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: var(--font-size-caption);
  font-weight: 400;
  line-height: 1.5;
  pointer-events: none;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}
.pet-wizard-info:hover .pet-wizard-tooltip,
.pet-wizard-info:focus-visible .pet-wizard-tooltip {
  opacity: 1;
  transform: translateY(0);
}
.pet-wizard-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.pet-wizard-photo,
.pet-wizard-add {
  position: relative;
  width: 82px;
  height: 82px;
  border-radius: var(--radius-control);
  overflow: hidden;
}
.pet-wizard-photo {
  background: var(--color-fill-secondary);
}
.pet-wizard-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pet-wizard-add {
  display: grid;
  place-items: center;
  border: 1px dashed var(--color-line);
  background: var(--color-surface-muted);
  color: var(--color-muted);
  cursor: pointer;
}
.pet-wizard-add:hover {
  border-color: var(--color-brand);
  color: var(--color-brand);
}
.pet-wizard-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-dialog-glass);
  color: var(--color-muted);
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.pet-wizard-remove::before {
  content: '';
  position: absolute;
  inset: -4px;
}
.pet-wizard-remove:hover,
.pet-wizard-remove:focus-visible {
  border-color: transparent;
  background: var(--color-danger);
  color: var(--color-on-brand);
}
.pet-wizard-remove:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.pet-wizard-input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
}
.pet-wizard-input:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}
.pet-wizard-error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
.pet-wizard-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.pet-wizard-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.pet-wizard-pose {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.pet-wizard-stage {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-control);
  background: var(--color-surface-muted);
  overflow: hidden;
}
.pet-wizard-stage img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.pet-wizard-pending {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-action-cover);
}
.pet-wizard-spin {
  color: var(--color-brand);
  animation: pet-wizard-spin 0.9s linear infinite;
}
.pet-wizard-refresh {
  position: absolute;
  top: 5px;
  right: 5px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--color-dialog-glass);
  color: var(--color-ink);
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.15s ease;
}
.pet-wizard-pose:hover .pet-wizard-refresh,
.pet-wizard-refresh:focus-visible {
  opacity: 1;
}
.pet-wizard-pose-label {
  color: var(--color-ink);
  font-size: var(--font-size-label);
  text-align: center;
}
.pet-wizard-pose-error {
  color: var(--color-danger);
  font-size: var(--font-size-label);
  text-align: center;
}
.pet-wizard-foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
  padding: 12px 20px 18px;
  border-top: 0;
}
.pet-wizard-enter-active,
.pet-wizard-leave-active {
  transition:
    opacity 0.18s cubic-bezier(0.2, 0.9, 0.3, 1),
    transform 0.22s cubic-bezier(0.2, 1.15, 0.35, 1);
}
.pet-wizard-enter-from,
.pet-wizard-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.985);
}
@keyframes pet-wizard-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pet-wizard-enter-active,
  .pet-wizard-leave-active,
  .pet-wizard-tooltip,
  .pet-wizard-remove {
    transition: none;
  }
  .pet-wizard-spin {
    animation: none;
  }
}
</style>
