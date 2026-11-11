<script setup lang="ts">
import { computed } from 'vue'
import type { Snapshot } from '../shared/protocol'
import { focusDurations, formatFocus } from '../shared/focus'

const props = defineProps<{ state?: Snapshot }>()
const focus = computed(() => props.state?.focus)
const remaining = computed(() => focus.value?.remaining ?? 0)
const progress = computed(() =>
  Math.max(0, Math.min(1, remaining.value / focusDurations.focus)),
)
const radius = 25
const circumference = 2 * Math.PI * radius
const offset = computed(() => circumference * (1 - progress.value))
</script>

<template>
  <main
    class="focus-badge-shell"
    :aria-label="`专注剩余 ${formatFocus(remaining)}`"
  >
    <div class="focus-badge-ring">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="focus-badge-track" cx="32" cy="32" :r="radius" />
        <circle
          class="focus-badge-progress"
          cx="32"
          cy="32"
          :r="radius"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="offset"
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span>{{ formatFocus(remaining) }}</span>
    </div>
  </main>
</template>

<style scoped>
.focus-badge-shell {
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: center;
  background: transparent;
}
.focus-badge-ring {
  position: relative;
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-stage);
}
.focus-badge-ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.focus-badge-track {
  fill: none;
  stroke: var(--color-line);
  stroke-width: 4;
}
.focus-badge-progress {
  fill: none;
  stroke: var(--color-brand-ink);
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s linear;
}
.focus-badge-ring span {
  position: relative;
  color: var(--color-brand-ink);
  font-size: 12.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .focus-badge-progress {
    transition: none;
  }
}
</style>
