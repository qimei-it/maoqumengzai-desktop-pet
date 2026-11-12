<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Armchair,
  ChevronDown,
  ChevronUp,
  Coffee,
  Pause,
  Play,
  RotateCcw,
  Timer,
} from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  countToday,
  focusCycleDone,
  focusPhaseLabels,
  focusStats,
  type FocusStatsPeriod,
  formatCalendarDate,
  formatClockTime,
  groupByDay,
} from '../shared/focus'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

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
const remaining = computed(() => focus.value?.remaining ?? 0)
const timeParts = computed(() => {
  const total = Math.max(0, remaining.value)
  return {
    minutes: String(Math.floor(total / 60)).padStart(2, '0'),
    seconds: String(total % 60).padStart(2, '0'),
  }
})
const completed = computed(() => focus.value?.completed ?? 0)
/** Focus sessions finished in the current four-session round. */
const cycleDone = computed(() =>
  focusCycleDone(completed.value, focus.value?.phase ?? 'focus'),
)
const sessions = computed(() => focus.value?.sessions ?? [])
const statsPeriod = ref<FocusStatsPeriod>('week')
const stats = computed(() =>
  focusStats(sessions.value, now.value, statsPeriod.value),
)
const statsLabel = computed(
  () =>
    `${statsPeriod.value === 'week' ? '本周' : '本月'} ${stats.value.count} 次 · ${stats.value.minutes} 分钟`,
)
const statsMax = computed(() =>
  Math.max(1, ...stats.value.buckets.map((bucket) => bucket.minutes)),
)
function statsBarHeight(minutes: number): string {
  if (minutes <= 0) return '2px'
  return `${Math.max(4, Math.round((minutes / statsMax.value) * 30))}px`
}
const groups = computed(() =>
  groupByDay(
    sessions.value,
    (session) => session.endedAt,
    now.value,
  ),
)
const todayCount = computed(() =>
  countToday(sessions.value, (session) => session.endedAt, now.value),
)
const dateLabel = computed(() => formatCalendarDate(now.value))
const phases = ['focus', 'short', 'long'] as const
const phaseIcons = {
  focus: Timer,
  short: Coffee,
  long: Armchair,
} as const
const activePhase = computed(() => focus.value?.phase ?? 'focus')

function bumpDuration(unit: 'minutes' | 'seconds', delta: number): void {
  emit('command', { type: 'focus-duration-bump', unit, delta })
}
function choosePhase(phase: (typeof phases)[number]): void {
  emit('command', { type: 'focus-phase', phase })
}
function toggleTimer(): void {
  emit('command', {
    type: focus.value?.running ? 'focus-pause' : 'focus-start',
  })
}
function resetTimer(): void {
  emit('command', { type: 'focus-reset' })
}
function close(): void {
  emit('command', { type: 'pomodoro-close' })
}
</script>

<template>
  <main class="focus-shell" @keydown.esc="close">
    <section class="focus-surface" aria-label="番茄时钟">
      <PanelHeader
        title="番茄时钟"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div
        class="focus-phases"
        role="group"
        aria-label="计时阶段"
        :data-active="activePhase"
      >
        <span class="focus-phases-thumb" aria-hidden="true" />
        <button
          v-for="phase in phases"
          :key="phase"
          type="button"
          :class="{ active: activePhase === phase }"
          :aria-pressed="activePhase === phase"
          :title="
            phase === 'focus'
              ? '每 4 次专注后进入长休'
              : undefined
          "
          @click="choosePhase(phase)"
        >
          <component
            :is="phaseIcons[phase]"
            :size="15"
            :stroke-width="2"
            aria-hidden="true"
          />
          {{ focusPhaseLabels[phase] }}
          <span v-if="phase === 'focus'" class="focus-cycle">
            {{ cycleDone }}/4
          </span>
        </button>
      </div>

      <div
        class="focus-time"
        role="timer"
        aria-live="off"
        :aria-label="`${focusPhaseLabels[activePhase]} ${timeParts.minutes} 分 ${timeParts.seconds} 秒`"
      >
        <div class="focus-time-unit">
          <button
            type="button"
            class="focus-time-arrow"
            aria-label="增加分钟"
            @click="bumpDuration('minutes', 1)"
          >
            <ChevronUp :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
          <div class="focus-time-value">
            <span class="focus-time-number">{{ timeParts.minutes }}</span>
          </div>
          <button
            type="button"
            class="focus-time-arrow"
            aria-label="减少分钟"
            @click="bumpDuration('minutes', -1)"
          >
            <ChevronDown :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>

        <span class="focus-time-colon" aria-hidden="true">:</span>

        <div class="focus-time-unit">
          <button
            type="button"
            class="focus-time-arrow"
            aria-label="增加秒"
            @click="bumpDuration('seconds', 5)"
          >
            <ChevronUp :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
          <div class="focus-time-value">
            <span class="focus-time-number">{{ timeParts.seconds }}</span>
          </div>
          <button
            type="button"
            class="focus-time-arrow"
            aria-label="减少秒"
            @click="bumpDuration('seconds', -5)"
          >
            <ChevronDown :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="focus-meta">
        <span class="focus-date">{{ dateLabel }}</span>
        <span class="focus-count">今日 {{ todayCount }} 次</span>
      </div>

      <div class="focus-stats" aria-label="专注统计">
        <div class="focus-stats-head">
          <div class="focus-stats-tabs" role="tablist" aria-label="统计周期">
            <button
              type="button"
              role="tab"
              :aria-selected="statsPeriod === 'week'"
              :class="{ active: statsPeriod === 'week' }"
              @click="statsPeriod = 'week'"
            >
              周
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="statsPeriod === 'month'"
              :class="{ active: statsPeriod === 'month' }"
              @click="statsPeriod = 'month'"
            >
              月
            </button>
          </div>
          <span class="focus-stats-total">{{ statsLabel }}</span>
        </div>
        <div class="focus-stats-chart" role="img" :aria-label="statsLabel">
          <span
            v-for="bucket in stats.buckets"
            :key="bucket.key"
            class="focus-stats-bar"
            :title="`${bucket.title}：${bucket.minutes} 分钟`"
          >
            <span
              class="focus-stats-fill"
              :class="{ empty: bucket.minutes === 0 }"
              :style="{ height: statsBarHeight(bucket.minutes) }"
            />
            <span class="focus-stats-label">{{ bucket.label }}</span>
          </span>
        </div>
      </div>

      <div class="focus-history" aria-label="专注记录">
        <div v-if="groups.length" class="focus-history-list panel-scroll">
          <section v-for="group in groups" :key="group.key" class="focus-day">
            <div class="focus-day-title">
              <span>{{ group.label }}</span>
              <span>{{ group.count }} 次</span>
            </div>
            <div
              v-for="session in group.items"
              :key="session.id"
              class="focus-session"
            >
              <span>{{ formatClockTime(session.endedAt) }}</span>
              <span>{{ session.minutes }} 分钟</span>
            </div>
          </section>
        </div>
        <p v-else class="focus-empty">还没有专注记录</p>
      </div>

      <div class="focus-controls">
        <button type="button" class="button-glass" @click="toggleTimer">
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
          @click="resetTimer"
        >
          <RotateCcw :size="17" :stroke-width="2" aria-hidden="true" />
        </button>
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
.focus-phases {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 10px;
  padding: 4px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
}
.focus-phases-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 8px) / 3);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  transition: transform var(--motion-slide) var(--ease-spring);
  will-change: transform;
}
.focus-phases[data-active='short'] .focus-phases-thumb {
  transform: translateX(100%);
}
.focus-phases[data-active='long'] .focus-phases-thumb {
  transform: translateX(200%);
}
.focus-phases button {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 34px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  transition: color var(--motion-fast) var(--ease-standard);
}
.focus-phases button.active {
  color: var(--color-brand-ink);
  font-weight: 600;
}
.focus-phases button svg {
  flex: none;
}
.focus-phases button:focus-visible {
  outline-offset: -2px;
}
.focus-cycle {
  color: var(--color-brand);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.focus-time {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin: 8px 0 0;
  color: var(--color-ink);
}
.focus-time-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.focus-time-value {
  position: relative;
  display: flex;
  align-items: center;
}
.focus-time-number {
  display: inline-block;
  min-width: 3ch;
  text-align: center;
  color: var(--color-ink);
  font-size: 52px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: 1px;
}
.focus-time-colon {
  color: var(--color-muted);
  font-size: 52px;
  font-weight: 650;
  line-height: 1.1;
  /* The colon glyph sits low in its em box; centre its ink with the digits. */
  transform: translateY(-6px);
}
.focus-time-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease-standard),
    background var(--motion-fast) var(--ease-standard);
}
.focus-time-arrow:hover {
  background: var(--color-fill-secondary);
  color: var(--color-brand-ink);
}
.focus-time-arrow:active {
  color: var(--color-brand);
}
.focus-time-arrow:focus-visible {
  outline-offset: -2px;
}
.focus-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.focus-date {
  font-variant-numeric: tabular-nums;
}
.focus-count {
  color: var(--color-brand-ink);
  font-weight: 600;
}
.focus-stats {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.focus-stats-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.focus-stats-tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-pill);
  background: var(--color-canvas);
}
.focus-stats-tabs button {
  min-height: 22px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.focus-stats-tabs button.active {
  background: var(--color-surface);
  color: var(--color-brand-ink);
  font-weight: 600;
  box-shadow: var(--shadow-control);
}
.focus-stats-tabs button:focus-visible {
  outline-offset: -2px;
}
.focus-stats-total {
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.focus-stats-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 46px;
  margin-top: 6px;
}
.focus-stats-bar {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 3px;
}
.focus-stats-fill {
  flex: none;
  width: 100%;
  max-width: 26px;
  border-radius: 4px 4px 2px 2px;
  background: var(--color-brand);
  opacity: 0.78;
}
.focus-stats-fill.empty {
  background: var(--color-line);
  opacity: 1;
}
.focus-stats-label {
  color: var(--color-muted);
  font-size: 10px;
  line-height: 1;
}
.focus-history {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--color-line);
}
.focus-history-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.focus-day + .focus-day {
  margin-top: 8px;
}
.focus-day-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.focus-session {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding-left: 2px;
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
}
.focus-session span:last-child {
  color: var(--color-muted);
}
.focus-empty {
  margin: auto;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.focus-controls {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.focus-controls .button-glass {
  flex: 1;
  gap: 6px;
}
.focus-controls .button-soft {
  width: var(--tap-min);
  height: var(--tap-min);
  padding: 0;
  flex: none;
}
.focus-error {
  margin: 10px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
@media (prefers-reduced-motion: reduce) {
  .focus-phases-thumb,
  .focus-stats-tabs button {
    transition: none;
  }
}
</style>
