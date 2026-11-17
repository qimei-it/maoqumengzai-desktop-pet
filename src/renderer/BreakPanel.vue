<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Armchair, Eye } from '@lucide/vue'
import type { BreakKind, Command, Snapshot } from '../shared/protocol'
import PanelHeader from './PanelHeader.vue'
import SelectField from './SelectField.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const tab = ref<BreakKind>('sitting')
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

const focus = computed(() => props.state?.focus)
const sitting = computed(() => focus.value?.breakSitting ?? false)
const eyes = computed(() => focus.value?.breakEyes ?? false)
const enabled = computed(() => (tab.value === 'sitting' ? sitting.value : eyes.value))
const interval = computed(() =>
  tab.value === 'sitting'
    ? focus.value?.breakSittingInterval ?? 45
    : focus.value?.breakEyesInterval ?? 20,
)
const intervalOptions = computed(() =>
  tab.value === 'sitting' ? [30, 45, 60, 90] : [20, 30, 40, 60],
)
const nextAt = computed(() =>
  tab.value === 'sitting'
    ? focus.value?.breakSittingNextAt
    : focus.value?.breakEyesNextAt,
)
const nextLabel = computed(() => {
  void now.value
  if (!enabled.value || !nextAt.value) return '已关闭'
  return new Date(nextAt.value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
})
const dnd = computed(() => focus.value?.breakDnd ?? true)
const dndStart = computed(() => focus.value?.breakDndStart ?? 22)
const dndEnd = computed(() => focus.value?.breakDndEnd ?? 8)
/** Nothing to mute while both reminders are off. */
const dndLocked = computed(() => !sitting.value && !eyes.value)
const tabLabel = computed(() =>
  tab.value === 'sitting' ? '久坐提醒' : '用眼提醒',
)

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}
function toggleReminder(): void {
  emit('command', {
    type: 'break-toggle',
    kind: tab.value,
    enabled: !enabled.value,
  })
}
function changeInterval(event: Event): void {
  emit('command', {
    type: 'break-interval',
    kind: tab.value,
    minutes: Number((event.target as HTMLSelectElement).value),
  })
}
function snooze(): void {
  emit('command', { type: 'break-snooze', kind: tab.value, minutes: 10 })
}
function updateDnd(enabledValue: boolean, start: number, end: number): void {
  const safeStart = Math.min(23, Math.max(0, Math.round(start)))
  let safeEnd = Math.min(24, Math.max(1, Math.round(end)))
  if (safeStart === safeEnd) safeEnd = safeStart === 23 ? 24 : safeStart + 1
  emit('command', {
    type: 'break-dnd',
    enabled: enabledValue,
    start: safeStart,
    end: safeEnd,
  })
}
function toggleDnd(): void {
  updateDnd(!dnd.value, dndStart.value, dndEnd.value)
}
function changeDndStart(event: Event): void {
  updateDnd(
    dnd.value,
    Number((event.target as HTMLSelectElement).value),
    dndEnd.value,
  )
}
function changeDndEnd(event: Event): void {
  updateDnd(
    dnd.value,
    dndStart.value,
    Number((event.target as HTMLSelectElement).value),
  )
}
function close(): void {
  emit('command', { type: 'break-close' })
}
</script>

<template>
  <main class="break-shell" @keydown.esc="close">
    <section class="break-surface" aria-label="休息提醒">
      <PanelHeader
        title="休息提醒"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div
        class="break-tabs"
        role="tablist"
        aria-label="休息提醒分类"
        :data-active="tab"
      >
        <span class="break-tabs-thumb" aria-hidden="true" />
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'sitting'"
          :class="{ active: tab === 'sitting' }"
          @click="tab = 'sitting'"
        >
          <Armchair :size="15" :stroke-width="2" aria-hidden="true" />
          久坐提醒
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'eyes'"
          :class="{ active: tab === 'eyes' }"
          @click="tab = 'eyes'"
        >
          <Eye :size="15" :stroke-width="2" aria-hidden="true" />
          用眼提醒
        </button>
      </div>

      <div class="break-body">
        <div class="break-row">
          <span>{{ tabLabel }}</span>
          <button
            type="button"
            class="break-switch"
            role="switch"
            :aria-label="tabLabel"
            :aria-checked="enabled"
            @click="toggleReminder"
          >
            <span class="break-switch-thumb" />
          </button>
        </div>

        <div class="break-row">
          <span>提醒间隔</span>
          <SelectField
            :value="interval"
            min-width="92px"
            :aria-label="`${tabLabel}间隔分钟`"
            @change="changeInterval"
          >
            <option
              v-for="minutes in intervalOptions"
              :key="minutes"
              :value="minutes"
            >
              {{ minutes }} 分钟
            </option>
          </SelectField>
        </div>

        <div class="break-row">
          <span>下次提醒</span>
          <span class="break-next">
            <span class="break-value">{{ nextLabel }}</span>
            <button
              v-if="enabled"
              type="button"
              class="snooze-chip"
              title="延后 10 分钟"
              aria-label="延后 10 分钟"
              @click="snooze"
            >
              延后 10 分钟
            </button>
          </span>
        </div>

        <div class="break-dnd">
          <div class="break-row" :class="{ muted: dndLocked }">
            <span>免打扰</span>
            <button
              type="button"
              class="break-switch"
              role="switch"
              aria-label="免打扰"
              :aria-checked="dnd"
              :disabled="dndLocked"
              @click="toggleDnd"
            >
              <span class="break-switch-thumb" />
            </button>
          </div>
          <div class="break-row" :class="{ muted: dndLocked || !dnd }">
            <span>免打扰时段</span>
            <span class="break-config">
              <SelectField
                :value="dndStart"
                :disabled="dndLocked || !dnd"
                min-width="92px"
                aria-label="免打扰开始时间"
                @change="changeDndStart"
              >
                <option v-for="hour in 24" :key="hour" :value="hour - 1">
                  {{ hourLabel(hour - 1) }}
                </option>
              </SelectField>
              <span class="break-value">–</span>
              <SelectField
                :value="dndEnd"
                :disabled="dndLocked || !dnd"
                min-width="92px"
                aria-label="免打扰结束时间"
                @change="changeDndEnd"
              >
                <option v-for="hour in 24" :key="hour + 1" :value="hour">
                  {{ hourLabel(hour) }}
                </option>
              </SelectField>
            </span>
          </div>
        </div>
      </div>

      <p v-if="error" class="break-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.break-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.break-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.break-tabs {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 10px;
  padding: 4px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
}
.break-tabs-thumb {
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
.break-tabs[data-active='eyes'] .break-tabs-thumb {
  transform: translateX(100%);
}
.break-tabs button {
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
  font-weight: 600;
}
.break-tabs button.active {
  color: var(--color-brand-ink);
}
.break-tabs button:focus-visible {
  outline-offset: -2px;
}
.break-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 12px;
}
.break-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  border-bottom: 1px solid var(--color-line);
  font-size: var(--font-size-body);
}
.break-row.muted {
  color: var(--color-muted);
}
.break-value {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
}
.break-config {
  display: flex;
  align-items: center;
  gap: 6px;
}
.break-switch {
  position: relative;
  width: 42px;
  height: 25px;
  min-height: 25px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-fill-secondary);
}
.break-switch[aria-checked='true'] {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.break-switch-thumb {
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
.break-switch[aria-checked='true'] .break-switch-thumb {
  transform: translateX(17px);
}
.break-switch:disabled {
  opacity: 0.55;
}
.break-next {
  display: flex;
  align-items: center;
  gap: 8px;
}
.break-dnd .break-row:last-child {
  border-bottom: 0;
}
.break-error {
  margin: 10px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
@media (prefers-reduced-motion: reduce) {
  .break-tabs-thumb {
    transition: none;
  }
}
</style>
