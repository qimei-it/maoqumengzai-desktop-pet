<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import type { UpdateState } from '../shared/update'
import appIcon from '../../resources/icons/app-icon.png'

const props = defineProps<{ state: UpdateState }>()
const emit = defineEmits<{ cancel: []; install: []; close: [] }>()
const dialog = ref<HTMLElement | null>(null)
const cancelling = ref(false)
const downloaded = computed(() => props.state.status === 'downloaded')
const percent = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.state.percent ?? 0))),
)

watch(() => props.state.status, () => { cancelling.value = false })
void nextTick(() => dialog.value?.querySelector<HTMLElement>('.update-action')?.focus())

function cancel(): void {
  if (cancelling.value) return
  cancelling.value = true
  emit('cancel')
}
function escape(): void {
  if (downloaded.value) emit('close')
  else cancel()
}
function trapFocus(event: KeyboardEvent): void {
  const buttons = Array.from(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
  if (!buttons.length) { event.preventDefault(); return }
  const first = buttons[0]!
  const last = buttons[buttons.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div class="update-overlay">
    <section
      ref="dialog"
      class="update-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
      tabindex="-1"
      @keydown.esc.stop="escape"
      @keydown.tab="trapFocus"
    >
      <button
        v-if="downloaded"
        type="button"
        class="update-close"
        aria-label="关闭"
        @click="emit('close')"
      ><X :size="18" :stroke-width="2" aria-hidden="true" /></button>
      <img class="update-icon" :src="appIcon" alt="毛趣萌仔" />
      <h2 id="update-title">{{ downloaded ? '更新已下载' : '下载更新' }}</h2>
      <div class="update-version">v{{ state.version }}</div>
      <div class="update-progress-head">
        <span>{{ downloaded ? '下载完成' : '下载进度' }}</span>
        <span>{{ percent }}%</span>
      </div>
      <div
        class="update-progress"
        role="progressbar"
        aria-label="下载进度"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="percent"
      ><span :style="{ width: `${percent}%` }" /></div>
      <button
        v-if="downloaded"
        type="button"
        class="settings-button primary update-action"
        @click="emit('install')"
      >安装</button>
      <button
        v-else
        type="button"
        class="settings-button update-action"
        :disabled="cancelling"
        @click="cancel"
      >{{ cancelling ? '取消中' : '取消' }}</button>
    </section>
  </div>
</template>

<style scoped>
.update-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--color-overlay);
}
.update-dialog {
  position: relative;
  width: min(340px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px;
  border-radius: var(--radius-sheet);
  background: var(--color-canvas);
  box-shadow: var(--mqmz-panel-shadow);
  outline: none;
}
.update-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-muted);
}
.update-close:hover { background: var(--color-fill-secondary); }
.update-icon { width: 72px; height: 72px; object-fit: contain; }
.update-dialog h2 { margin: 12px 0 0; font-size: var(--font-size-section); }
.update-version { margin-top: 6px; color: var(--color-muted); }
.update-progress-head {
  align-self: stretch;
  display: flex;
  justify-content: space-between;
  margin-top: 22px;
  color: var(--color-ink);
  font-size: var(--font-size-label);
}
.update-progress {
  align-self: stretch;
  height: 8px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
}
.update-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-brand-ink);
  transition: width var(--motion-fast) var(--ease-standard);
}
.update-action { align-self: stretch; margin-top: 22px; }
@media (prefers-reduced-motion: reduce) {
  .update-progress span { transition: none; }
}
</style>
