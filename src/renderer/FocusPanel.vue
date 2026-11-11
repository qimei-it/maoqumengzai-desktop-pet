<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Check,
  Circle,
  Droplets,
  ListTodo,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Timer,
  Trash2,
} from '@lucide/vue'
import type { Command, FocusTab, Snapshot } from '../shared/protocol'
import { focusPhaseLabels, formatFocus } from '../shared/focus'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()
const draft = ref('')

const tab = computed<FocusTab>(() => props.state?.focusTab ?? 'focus')
const focus = computed(() => props.state?.focus)
const remaining = computed(() => formatFocus(focus.value?.remaining ?? 0))
const completed = computed(() => focus.value?.completed ?? 0)
const waterInterval = computed(() => focus.value?.waterInterval ?? 60)
const waterStart = computed(() => focus.value?.waterStart ?? 9)
const waterEnd = computed(() => focus.value?.waterEnd ?? 22)
const waterNext = computed(() => {
  const timestamp = focus.value?.waterNextAt
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
})
const phases = ['focus', 'short', 'long'] as const

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}
function updateWaterConfig(interval: number, start: number, end: number): void {
  const safeStart = Math.min(23, Math.max(0, Math.round(start)))
  const safeEnd = Math.min(24, Math.max(1, Math.round(end)))
  if (safeStart >= safeEnd) return
  emit('command', {
    type: 'focus-water-config',
    interval: Math.min(240, Math.max(5, Math.round(interval))),
    start: safeStart,
    end: safeEnd,
  })
}
function changeWaterInterval(event: Event): void {
  updateWaterConfig(
    Number((event.target as HTMLInputElement).value),
    waterStart.value,
    waterEnd.value,
  )
}
function changeWaterStart(event: Event): void {
  const start = Number((event.target as HTMLSelectElement).value)
  updateWaterConfig(
    waterInterval.value,
    start,
    start >= waterEnd.value ? Math.min(24, start + 1) : waterEnd.value,
  )
}
function changeWaterEnd(event: Event): void {
  const end = Number((event.target as HTMLSelectElement).value)
  updateWaterConfig(
    waterInterval.value,
    end <= waterStart.value ? Math.max(0, end - 1) : waterStart.value,
    end,
  )
}
function openTab(next: FocusTab): void {
  emit('command', { type: 'focus-open', tab: next })
}
function addTodo(): void {
  const text = draft.value.trim()
  if (!text) return
  emit('command', { type: 'todo-add', text })
  draft.value = ''
}
function close(): void {
  emit('command', { type: 'focus-close' })
}
</script>

<template>
  <main class="focus-shell" @keydown.esc="close">
    <section class="focus-surface" aria-label="专注">
      <PanelHeader
        title="专注"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div class="focus-tabs" role="group" aria-label="专注分类">
        <button
          type="button"
          :class="{ active: tab === 'focus' }"
          @click="openTab('focus')"
        >
          <Timer :size="15" :stroke-width="2" aria-hidden="true" />
          番茄时钟
        </button>
        <button
          type="button"
          :class="{ active: tab === 'water' }"
          @click="openTab('water')"
        >
          <Droplets :size="15" :stroke-width="2" aria-hidden="true" />
          喝水
        </button>
        <button
          type="button"
          :class="{ active: tab === 'todo' }"
          @click="openTab('todo')"
        >
          <ListTodo :size="15" :stroke-width="2" aria-hidden="true" />
          待办
        </button>
      </div>

      <div v-if="tab === 'focus'" class="focus-body">
        <div class="focus-phases" role="group" aria-label="计时阶段">
          <button
            v-for="phase in phases"
            :key="phase"
            type="button"
            :class="{ active: focus?.phase === phase }"
            @click="emit('command', { type: 'focus-phase', phase })"
          >
            {{ focusPhaseLabels[phase] }}
          </button>
        </div>
        <div class="focus-clock" aria-live="polite">{{ remaining }}</div>
        <div class="focus-meta">
          <span>{{ focus?.running ? '进行中' : '已暂停' }}</span>
          <span class="focus-dots" aria-label="每四次专注后长休">
            <span
              v-for="index in 4"
              :key="index"
              :class="{ done: index <= completed % 4 || (completed > 0 && completed % 4 === 0) }"
            />
          </span>
        </div>
        <div class="focus-controls">
          <button
            type="button"
            class="button-glass"
            @click="
              emit('command', {
                type: focus?.running ? 'focus-pause' : 'focus-start',
              })
            "
          >
            <Pause
              v-if="focus?.running"
              :size="17"
              :stroke-width="2"
              aria-hidden="true"
            />
            <Play
              v-else
              :size="17"
              :stroke-width="2"
              aria-hidden="true"
            />
            {{ focus?.running ? '暂停' : '开始' }}
          </button>
          <button
            type="button"
            class="button-soft"
            aria-label="重置"
            title="重置"
            @click="emit('command', { type: 'focus-reset' })"
          >
            <RotateCcw :size="17" :stroke-width="2" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="button-soft"
            aria-label="跳过"
            title="跳过"
            @click="emit('command', { type: 'focus-skip' })"
          >
            <SkipForward :size="17" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div v-else-if="tab === 'water'" class="focus-body">
        <div class="focus-row">
          <span id="water-toggle-label">喝水提醒</span>
          <button
            type="button"
            class="focus-switch"
            role="switch"
            aria-labelledby="water-toggle-label"
            :aria-checked="focus?.water"
            @click="
              emit('command', { type: 'focus-water', enabled: !focus?.water })
            "
          >
            <span class="focus-switch-thumb" />
          </button>
        </div>
        <div class="focus-row">
          <span>下次提醒</span>
          <span class="focus-value">{{ focus?.water ? waterNext : '已关闭' }}</span>
        </div>
        <div class="focus-row">
          <span>提醒间隔</span>
          <span class="focus-config">
            <input
              class="focus-number"
              type="number"
              min="5"
              max="240"
              step="5"
              :value="waterInterval"
              aria-label="喝水提醒间隔分钟"
              @change="changeWaterInterval"
            />
            <span class="focus-value">分钟</span>
          </span>
        </div>
        <div class="focus-row">
          <span>生效时段</span>
          <span class="focus-config">
            <select
              class="focus-select"
              :value="waterStart"
              aria-label="喝水提醒开始时间"
              @change="changeWaterStart"
            >
              <option v-for="hour in 24" :key="hour" :value="hour - 1">
                {{ hourLabel(hour - 1) }}
              </option>
            </select>
            <span class="focus-value">–</span>
            <select
              class="focus-select"
              :value="waterEnd"
              aria-label="喝水提醒结束时间"
              @change="changeWaterEnd"
            >
              <option v-for="hour in 24" :key="hour + 1" :value="hour">
                {{ hourLabel(hour) }}
              </option>
            </select>
          </span>
        </div>
      </div>

      <div v-else class="focus-body focus-todos">
        <div class="focus-add">
          <input
            v-model="draft"
            type="text"
            maxlength="200"
            placeholder="添加待办"
            aria-label="添加待办"
            @keydown.enter="addTodo"
          />
          <button
            type="button"
            class="button-glass"
            :disabled="!draft.trim()"
            @click="addTodo"
          >
            <Plus :size="16" :stroke-width="2" aria-hidden="true" />
            添加
          </button>
        </div>
        <div v-if="focus?.todos.length" class="focus-todo-list">
          <div v-for="todo in focus.todos" :key="todo.id" class="focus-todo">
            <button
              type="button"
              class="focus-check"
              :class="{ done: todo.done }"
              :aria-label="todo.done ? '标记未完成' : '标记完成'"
              @click="emit('command', { type: 'todo-toggle', id: todo.id })"
            >
              <Check
                v-if="todo.done"
                :size="13"
                :stroke-width="2.4"
                aria-hidden="true"
              />
              <Circle v-else :size="13" :stroke-width="2" aria-hidden="true" />
            </button>
            <span :class="{ done: todo.done }">{{ todo.text }}</span>
            <button
              type="button"
              class="focus-remove"
              aria-label="删除待办"
              title="删除待办"
              @click="emit('command', { type: 'todo-remove', id: todo.id })"
            >
              <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p v-else class="focus-empty">还没有待办</p>
      </div>

      <p v-if="error" class="focus-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.focus-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.focus-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.focus-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  padding: 3px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.focus-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 8px;
  border: 0;
  border-radius: calc(var(--radius-control) - 3px);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.focus-tabs button.active {
  background: var(--color-surface);
  color: var(--color-brand-ink);
  box-shadow: var(--shadow-control);
  font-weight: 600;
}
.focus-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 16px;
}
.focus-phases {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.focus-phases button {
  min-height: 32px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.focus-phases button.active {
  border-color: transparent;
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font-weight: 600;
}
.focus-clock {
  margin: 26px 0 6px;
  text-align: center;
  font-size: 58px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: 1px;
}
.focus-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.focus-dots {
  display: flex;
  gap: 5px;
}
.focus-dots span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--color-line);
}
.focus-dots span.done {
  background: var(--color-brand-ink);
}
.focus-controls {
  display: flex;
  gap: 8px;
  margin-top: auto;
}
.focus-controls .button-glass {
  flex: 1;
  gap: 6px;
}
.focus-controls .button-soft {
  width: 48px;
  flex: none;
}
.focus-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  border-bottom: 1px solid var(--color-line);
  font-size: var(--font-size-body);
}
.focus-value {
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.focus-config {
  display: flex;
  align-items: center;
  gap: 6px;
}
.focus-number,
.focus-select {
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.focus-number {
  width: 58px;
  text-align: right;
}
.focus-select {
  min-width: 72px;
}
.focus-number:focus-visible,
.focus-select:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.focus-switch {
  position: relative;
  width: 42px;
  height: 25px;
  min-height: 25px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-fill-secondary);
}
.focus-switch[aria-checked='true'] {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.focus-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 19px;
  height: 19px;
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  transition: transform var(--motion-fast) var(--ease-out);
}
.focus-switch[aria-checked='true'] .focus-switch-thumb {
  transform: translateX(17px);
}
.focus-todos {
  padding-top: 12px;
}
.focus-add {
  display: flex;
  gap: 8px;
}
.focus-add input {
  flex: 1;
  min-width: 0;
  height: var(--tap-min);
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.focus-add .button-glass {
  flex: none;
  gap: 5px;
  padding-inline: 14px;
}
.focus-todo-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 10px;
}
.focus-todo {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 42px;
  border-bottom: 1px solid var(--color-line);
}
.focus-todo > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-body);
}
.focus-todo > span.done {
  color: var(--color-muted);
  text-decoration: line-through;
}
.focus-check,
.focus-remove {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
}
.focus-check.done {
  color: var(--color-brand-ink);
}
.focus-remove:hover {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}
.focus-empty {
  margin: auto;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.focus-error {
  margin: 10px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
.focus-tabs button:focus-visible,
.focus-phases button:focus-visible,
.focus-switch:focus-visible,
.focus-check:focus-visible,
.focus-remove:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .focus-switch-thumb {
    transition: none;
  }
}
</style>
