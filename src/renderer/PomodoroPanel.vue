<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Pause, Play, RotateCcw } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  countToday,
  focusPhaseLabels,
  formatCalendarDate,
  formatClockTime,
  formatFocus,
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
const remaining = computed(() => formatFocus(focus.value?.remaining ?? 0))
const completed = computed(() => focus.value?.completed ?? 0)
/** Sessions finished inside the current four-session cycle. */
const cycleDone = computed(() =>
  completed.value % 4 === 0 && completed.value > 0 ? 4 : completed.value % 4,
)
const sessions = computed(() => focus.value?.sessions ?? [])
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

      <div class="focus-phases" role="group" aria-label="计时阶段">
        <button
          v-for="phase in phases"
          :key="phase"
          type="button"
          :class="{ active: focus?.phase === phase }"
          :title="
            phase === 'long'
              ? '每 4 次专注后进入长休'
              : undefined
          "
          @click="emit('command', { type: 'focus-phase', phase })"
        >
          {{ focusPhaseLabels[phase] }}
          <span v-if="phase === 'long'" class="focus-cycle">
            {{ cycleDone }}/4
          </span>
        </button>
      </div>

      <div class="focus-clock" aria-live="polite">{{ remaining }}</div>

      <div class="focus-meta">
        <span class="focus-date">{{ dateLabel }}</span>
        <span class="focus-count">今日 {{ todayCount }} 次</span>
      </div>

      <div class="focus-history" aria-label="专注记录">
        <div v-if="groups.length" class="focus-history-list">
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
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-top: 10px;
}
.focus-phases button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
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
.focus-cycle {
  color: var(--color-brand);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.focus-clock {
  margin: 22px 0 4px;
  text-align: center;
  font-size: 56px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: 1px;
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
</style>
