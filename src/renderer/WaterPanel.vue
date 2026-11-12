<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Droplets, GlassWater, Settings } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  countToday,
  formatClockTime,
  groupByDay,
} from '../shared/focus'
import PanelHeader from './PanelHeader.vue'
import SelectField from './SelectField.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

type WaterTab = 'settings' | 'log'
const tab = ref<WaterTab>('log')
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
const waterInterval = computed(() => focus.value?.waterInterval ?? 60)
const waterStart = computed(() => focus.value?.waterStart ?? 9)
const waterEnd = computed(() => focus.value?.waterEnd ?? 22)
const waterGoal = computed(() => focus.value?.waterGoal ?? 8)
const waterNext = computed(() => {
  const timestamp = focus.value?.waterNextAt
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
})
const log = computed(() => focus.value?.waterLog ?? [])
const groups = computed(() =>
  groupByDay(log.value, (entry) => entry.at, now.value),
)
const todayCount = computed(() =>
  countToday(log.value, (entry) => entry.at, now.value),
)

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
function changeWaterGoal(event: Event): void {
  const goal = Number((event.target as HTMLInputElement).value)
  emit('command', {
    type: 'water-goal',
    goal: Math.min(30, Math.max(1, Math.round(goal || 1))),
  })
}
function snoozeWater(): void {
  emit('command', { type: 'water-snooze', minutes: 10 })
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
function close(): void {
  emit('command', { type: 'water-close' })
}
</script>

<template>
  <main class="water-shell" @keydown.esc="close">
    <section class="water-surface" aria-label="喝水提醒">
      <PanelHeader
        title="喝水提醒"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div
        class="water-tabs"
        role="tablist"
        aria-label="喝水分类"
        :data-active="tab"
      >
        <span class="water-tabs-thumb" aria-hidden="true" />
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'log'"
          :class="{ active: tab === 'log' }"
          @click="tab = 'log'"
        >
          <GlassWater :size="15" :stroke-width="2" aria-hidden="true" />
          记录
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'settings'"
          :class="{ active: tab === 'settings' }"
          @click="tab = 'settings'"
        >
          <Settings :size="15" :stroke-width="2" aria-hidden="true" />
          设置
        </button>
      </div>

      <div v-if="tab === 'settings'" class="water-body">
        <div class="water-row">
          <span id="water-toggle-label">喝水提醒</span>
          <button
            type="button"
            class="water-switch"
            role="switch"
            aria-labelledby="water-toggle-label"
            :aria-checked="focus?.water"
            @click="
              emit('command', { type: 'focus-water', enabled: !focus?.water })
            "
          >
            <span class="water-switch-thumb" />
          </button>
        </div>
        <div class="water-row">
          <span>下次提醒</span>
          <span class="water-next">
            <span class="water-value">{{
              focus?.water ? waterNext : '已关闭'
            }}</span>
            <button
              v-if="focus?.water"
              type="button"
              class="snooze-chip"
              title="延后 10 分钟"
              aria-label="延后 10 分钟"
              @click="snoozeWater"
            >
              延后 10 分钟
            </button>
          </span>
        </div>
        <div class="water-row">
          <span>每日目标</span>
          <span class="water-config">
            <input
              class="water-number"
              type="number"
              min="1"
              max="30"
              :value="waterGoal"
              aria-label="喝水每日目标"
              @change="changeWaterGoal"
            />
            <span class="water-value">次</span>
          </span>
        </div>
        <div class="water-row">
          <span>提醒间隔</span>
          <span class="water-config">
            <input
              class="water-number"
              type="number"
              min="5"
              max="240"
              step="5"
              :value="waterInterval"
              aria-label="喝水提醒间隔分钟"
              @change="changeWaterInterval"
            />
            <span class="water-value">分钟</span>
          </span>
        </div>
        <div class="water-row">
          <span>生效时段</span>
          <span class="water-config">
            <SelectField
              :value="waterStart"
              min-width="72px"
              aria-label="喝水提醒开始时间"
              @change="changeWaterStart"
            >
              <option v-for="hour in 24" :key="hour" :value="hour - 1">
                {{ hourLabel(hour - 1) }}
              </option>
            </SelectField>
            <span class="water-value">–</span>
            <SelectField
              :value="waterEnd"
              min-width="72px"
              aria-label="喝水提醒结束时间"
              @change="changeWaterEnd"
            >
              <option v-for="hour in 24" :key="hour + 1" :value="hour">
                {{ hourLabel(hour) }}
              </option>
            </SelectField>
          </span>
        </div>
      </div>

      <div v-else class="water-body water-records">
        <div class="water-summary">
          <span class="water-today"
            >今日 {{ todayCount }} / {{ waterGoal }} 次</span
          >
          <button
            type="button"
            class="button-glass water-drink"
            @click="emit('command', { type: 'water-drink' })"
          >
            记录一次
          </button>
        </div>
        <div class="water-history">
          <div v-if="groups.length" class="water-history-list panel-scroll">
            <section v-for="group in groups" :key="group.key" class="water-day">
              <div class="water-day-title">
                <span>{{ group.label }}</span>
                <span>{{ group.count }} 次</span>
              </div>
              <div class="water-entry-grid">
                <div
                  v-for="entry in group.items"
                  :key="entry.id"
                  class="water-entry"
                >
                  <Droplets
                    :size="13"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <span>{{ formatClockTime(entry.at) }}</span>
                </div>
              </div>
            </section>
          </div>
          <p v-else class="water-empty">还没有喝水记录</p>
        </div>
      </div>

      <p v-if="error" class="water-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.water-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.water-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.water-tabs {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 10px;
  padding: 4px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
}
.water-tabs-thumb {
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
.water-tabs[data-active='settings'] .water-tabs-thumb {
  transform: translateX(100%);
}
.water-tabs button {
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
}
.water-tabs button.active {
  color: var(--color-brand-ink);
  font-weight: 600;
}
.water-tabs button:focus-visible {
  outline-offset: -2px;
}
.water-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 12px;
}
.water-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  border-bottom: 1px solid var(--color-line);
  font-size: var(--font-size-body);
}
.water-body > .water-row:last-child {
  border-bottom: 0;
}
.water-value {
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.water-next {
  display: flex;
  align-items: center;
  gap: 8px;
}
.water-config {
  display: flex;
  align-items: center;
  gap: 6px;
}
.water-number {
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.water-number {
  width: 58px;
  text-align: right;
}
.water-number:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.water-switch {
  position: relative;
  width: 42px;
  height: 25px;
  min-height: 25px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-fill-secondary);
}
.water-switch[aria-checked='true'] {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.water-switch-thumb {
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
.water-switch[aria-checked='true'] .water-switch-thumb {
  transform: translateX(17px);
}
.water-records {
  padding-top: 14px;
}
.water-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.water-today {
  font-size: var(--font-size-body);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.water-summary .water-drink {
  min-height: 32px;
  height: 32px;
  padding-inline: 14px;
  font-size: var(--font-size-label);
  font-weight: 600;
}
.water-history {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--color-line);
}
.water-history-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.water-day + .water-day {
  margin-top: 8px;
}
.water-day-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.water-entry-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px 6px;
}
.water-entry {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 26px;
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.water-entry svg {
  flex: none;
  color: var(--color-brand);
}
.water-empty {
  margin: auto;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.water-error {
  margin: 10px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
@media (prefers-reduced-motion: reduce) {
  .water-tabs-thumb {
    transition: none;
  }
}
</style>
