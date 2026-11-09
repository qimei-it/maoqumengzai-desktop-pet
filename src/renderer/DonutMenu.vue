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
  summary: string
  error?: string
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
const box = computed(() => metrics.value.subOuter + 26)
const popRight = computed(() => (props.active === 'eat' ? 7 : 0))
const popLeft = computed(() => (props.active === 'convert' ? -7 : 0))
const hint = computed(() => {
  if (props.active === 'stash') return '松开 · 暂存到置物架'
  if (props.active === 'convert') return '松开 · 格式转换（引擎待接入）'
  if (props.active === 'eat') return '松开 · 吃掉（7 天可取回）'
  return props.summary
})
</script>

<template>
  <div
    class="donut"
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
      <small>收进肚子 · 7 天可取回</small>
    </div>
    <div
      class="donut-label label-left"
      data-region="convert"
      :class="{ active: active === 'convert' }"
      :style="{ left: `calc(50% - ${metrics.mid}px)` }"
    >
      <strong>格式转换</strong>
      <small>引擎接入后可用</small>
    </div>

    <p
      class="donut-hint"
      :class="{ warn: !!error }"
      :style="{ top: `calc(50% + ${metrics.subOuter + 6}px)` }"
    >
      {{ error || hint }}
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
  animation: donut-in 180ms var(--ease-standard) both;
}
.donut-ring {
  position: absolute;
  left: calc(-1 * var(--box));
  top: calc(-1 * var(--box));
  overflow: visible;
}
.donut-segment {
  transition: transform 120ms var(--ease-standard);
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
  width: calc(var(--thickness) - 15px);
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  text-align: center;
  color: var(--color-ink);
  transition:
    color 120ms var(--ease-standard),
    transform 120ms var(--ease-standard);
}
.donut-label strong {
  font-size: var(--font-size-section);
  font-weight: var(--font-weight-bold);
  line-height: 1.25;
}
.donut-label small {
  font-size: var(--font-size-caption);
  line-height: 1.35;
  color: var(--color-muted);
}
.donut-label.active {
  color: var(--color-on-brand);
}
.donut-label.active small {
  color: var(--color-on-brand);
  opacity: 0.85;
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
  color: var(--color-muted);
}
.donut-hint.warn {
  color: var(--color-danger);
}
@keyframes donut-in {
  from {
    opacity: 0;
    transform: scale(0.86);
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
