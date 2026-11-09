<script setup lang="ts">
import { computed } from 'vue'
import {
  donutMetrics,
  halfGap,
  TAU,
  wedgePath,
} from '../shared/donut'

const props = defineProps<{
  scale: number
  active: 'stash' | 'convert' | 'eat' | null
  error?: string
  closing?: boolean
}>()

const metrics = computed(() => donutMetrics(props.scale))
const gap = computed(() => (halfGap * Math.PI) / 180)
/** Inset so the soft stroke (6px) lands on the intended radii. */
const inset = 3
const rightWedge = computed(() =>
  wedgePath(
    metrics.value.inner + inset,
    metrics.value.outer - inset,
    gap.value,
    Math.PI - gap.value,
  ),
)
const leftWedge = computed(() =>
  wedgePath(
    metrics.value.inner + inset,
    metrics.value.outer - inset,
    Math.PI + gap.value,
    TAU - gap.value,
  ),
)
const box = computed(() => metrics.value.outer + 34)
const popRight = computed(() => (props.active === 'eat' ? 7 : 0))
const popLeft = computed(() => (props.active === 'convert' ? -7 : 0))
</script>

<template>
  <div
    class="donut"
    :class="{ closing }"
    :style="{
      '--inner': `${metrics.inner}px`,
      '--mid': `${metrics.mid}px`,
      '--thickness': `${metrics.thickness}px`,
      '--sub-outer': `${metrics.subOuter}px`,
      '--box': `${box}px`,
    }"
    role="group"
    aria-label="文件操作轮盘"
  >
    <svg
      class="donut-ring"
      :viewBox="`-${box} -${box} ${box * 2} ${box * 2}`"
      :width="box * 2"
      :height="box * 2"
      aria-hidden="true"
    >
      <g
        class="donut-segment"
        :class="{ active: active === 'eat' }"
        :style="{ transform: `translateX(${popRight}px)` }"
      >
        <path :d="rightWedge" class="donut-slice" />
      </g>
      <g
        class="donut-segment"
        :class="{ active: active === 'convert' }"
        :style="{ transform: `translateX(${popLeft}px)` }"
      >
        <path :d="leftWedge" class="donut-slice" />
      </g>
      <circle
        class="donut-hole"
        :class="{ active: active === 'stash' }"
        :r="metrics.inner"
      />
    </svg>

    <div
      class="donut-label label-right"
      data-region="eat"
      :class="{ active: active === 'eat' }"
      :style="{ left: `calc(50% + ${metrics.mid}px)` }"
    >
      <strong>吃掉</strong>
    </div>
    <div
      class="donut-label label-left"
      data-region="convert"
      :class="{ active: active === 'convert' }"
      :style="{ left: `calc(50% - ${metrics.mid}px)` }"
    >
      <strong>格式转换</strong>
    </div>

    <p
      v-if="error"
      class="donut-hint"
      :style="{ top: `calc(50% + ${metrics.subOuter + 6}px)` }"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.donut {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
  animation: donut-in 260ms cubic-bezier(0.22, 1.4, 0.36, 1) both;
}
.donut-ring {
  position: absolute;
  left: calc(-1 * var(--box));
  top: calc(-1 * var(--box));
  overflow: visible;
}
.donut-segment {
  transition: transform 180ms cubic-bezier(0.22, 1.4, 0.36, 1);
}
.donut-slice {
  fill: var(--color-surface);
  stroke: var(--color-surface);
  stroke-width: 6;
  stroke-linejoin: round;
  filter: drop-shadow(0 6px 18px rgba(31, 38, 77, 0.14));
  transition:
    fill 120ms var(--ease-standard),
    stroke 120ms var(--ease-standard);
}
.donut-segment.active .donut-slice {
  fill: var(--color-brand-ink);
  stroke: var(--color-brand-ink);
}
.donut-hole {
  fill: transparent;
  stroke: var(--color-brand-soft);
  stroke-width: 1.5;
  stroke-dasharray: 4 6;
  transition:
    fill 120ms var(--ease-standard),
    stroke 120ms var(--ease-standard);
}
.donut-hole.active {
  fill: transparent;
  stroke: var(--color-brand-ink);
  stroke-dasharray: none;
  stroke-width: 2.5;
}
.donut-label {
  position: absolute;
  top: 50%;
  width: calc(var(--thickness) - 12px);
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-ink);
  transition:
    color 160ms var(--ease-standard),
    transform 180ms cubic-bezier(0.22, 1.4, 0.36, 1);
}
.donut-label strong {
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-bold);
  line-height: 1.3;
  white-space: nowrap;
}
.donut-label.active {
  color: var(--color-on-brand);
}
.label-right.active {
  transform: translate(calc(-50% + 7px), -50%);
}
.label-left.active {
  transform: translate(calc(-50% - 7px), -50%);
}
.donut-hint {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--font-size-caption);
  color: var(--color-danger);
}
@keyframes donut-in {
  from {
    opacity: 0;
    transform: scale(0.72);
  }
}
.donut.closing {
  animation: donut-out 150ms cubic-bezier(0.4, 0, 1, 1) forwards;
}
@keyframes donut-out {
  to {
    opacity: 0;
    transform: scale(0.78);
  }
}
@media (prefers-reduced-motion: reduce) {
  .donut {
    animation: none;
  }
  .donut-segment,
  .donut-label {
    transition: none;
  }
}
</style>
