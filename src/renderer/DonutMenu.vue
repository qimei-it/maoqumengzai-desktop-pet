<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  donutMetrics,
  midAngle,
  outlinePath,
  pointAt,
  popOut,
  sliceActions,
  sliceCornerRadius,
  sliceCount,
  sliceGap,
  sliceLabelColumns,
  span,
  wedge,
  type DropAction,
} from '../shared/donut'
import { createChannel, isSettled, stepSpring } from '../shared/spring'

const props = defineProps<{
  scale: number
  active: string | null
  error?: string
  closing?: boolean
  actions?: readonly string[]
  labels?: Record<string, readonly string[]>
  labelSize?: number
  ariaLabel?: string
  singleLine?: boolean
}>()
const actions = computed(() => props.actions ?? sliceActions)
const labels = computed<Record<string, readonly string[]>>(
  () => props.labels ?? sliceLabelColumns,
)
const count = computed(() => actions.value.length)

/** Filee's spring: 320/20 pops out with a small bounce, 36 settles without one. */
const popSpring = { stiffness: 320, damping: 20, mass: 1 }
const settleSpring = { stiffness: 320, damping: 36, mass: 1 }
/** Clockwise petal wave: each slice follows the previous one. */
const openDuration = 0.26
const openStagger = 0.016
const closeDuration = 0.12
const closeStagger = 0.016

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const metrics = computed(() => donutMetrics(props.scale))
const box = computed(() => metrics.value.outer + 30)
/** Soft halo: a radial gradient just outside the rim, never inside the hole. */
const shadowRadius = computed(() => metrics.value.outer + 22)
const shadowStops = computed(() => ({
  inner: (metrics.value.outer - 16) / shadowRadius.value,
  peak: (metrics.value.outer - 1) / shadowRadius.value,
}))
const shadowOpacity = computed(
  () =>
    open.value.reduce((total, value) => total + value, 0) /
    Math.max(1, count.value),
)

const wedges = computed(() => {
  const m = metrics.value
  const step = span(count.value)
  const gap = sliceGap * props.scale
  const corner = sliceCornerRadius * props.scale
  const fontSize = (props.labelSize ?? 11) * props.scale
  return actions.value.map((action, index) => {
    const mid = midAngle(index, count.value)
    // Short labels stay in one vertical column. Longer labels use two
    // horizontal rows split by word (格式 / 转换, 批量 / 重命名).
    const columns = labels.value[action] ?? [action]
    const lineHeight = fontSize * (props.singleLine ? 1.15 : 1.25)
    const charWidth = fontSize * 1.08
    const center = pointAt(m.mid, mid)
    const chars = Array.from(columns.join(''))
    const horizontal = Math.abs(Math.cos(mid)) >= 0.5
    const glyphs = props.singleLine
      ? horizontal
        ? chars.map((char, charIndex) => ({
            char,
            x:
              center.x -
              ((chars.length - 1) * charWidth) / 2 +
              charIndex * charWidth,
            y: center.y,
          }))
        : chars.map((char, charIndex) => ({
            char,
            x: center.x,
            y:
              center.y +
              (charIndex - (chars.length - 1) / 2) * lineHeight,
          }))
      : columns.length === 1
        ? Array.from(columns[0]).map((char, charIndex) => ({
            char,
            x: center.x,
            y:
              center.y +
              (charIndex - (columns[0].length - 1) / 2) * lineHeight,
          }))
        : columns.flatMap((row, rowIndex) => {
            const rowChars = Array.from(row)
            const width = (rowChars.length - 1) * charWidth
            return rowChars.map((char, charIndex) => ({
              char,
              x: center.x - width / 2 + charIndex * charWidth,
              y: center.y + (rowIndex - (columns.length - 1) / 2) * lineHeight,
            }))
          })
    return {
      action,
      label: columns.join(''),
      d: outlinePath(wedge(m.inner, m.outer, mid, step, gap, corner)),
      glyphs,
    }
  })
})

const open = ref<number[]>(new Array(count.value).fill(reducedMotion ? 1 : 0))
const hover = ref<number[]>(new Array(count.value).fill(0))
const channels = Array.from({ length: count.value }, () => createChannel(0))

let frame = 0
let clock = 0
let lastFrame = 0
let closeStartedAt = 0
const openAtClose = new Array(count.value).fill(1)

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function easeInCubic(t: number): number {
  return t * t * t
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function tick(now: number): void {
  frame = 0
  const delta = clamp((now - lastFrame) / 1000, 0, 0.05)
  lastFrame = now
  clock += delta

  let busy = false
  if (props.closing) {
    open.value = openAtClose.map((value, index) => {
      const delay = index * closeStagger
      const progress = clamp(
        (clock - closeStartedAt - delay) / closeDuration,
        0,
        1,
      )
      if (progress < 1) busy = true
      return value * (1 - easeInCubic(progress))
    })
  } else {
    open.value = open.value.map((_, index) => {
      const delay = Math.min(index * openStagger, 0.064)
      const progress = clamp((clock - delay) / openDuration, 0, 1)
      if (progress < 1) busy = true
      return easeOutCubic(progress)
    })
  }

  const nextHover = hover.value.slice()
  for (let index = 0; index < count.value; index += 1) {
    const target = props.active === actions.value[index] ? 1 : 0
    if (reducedMotion) {
      channels[index] = { value: target, velocity: 0 }
      nextHover[index] = target
      continue
    }
    channels[index] = stepSpring(
      channels[index],
      target,
      target > 0 ? popSpring : settleSpring,
      delta,
    )
    nextHover[index] = channels[index].value
    if (!isSettled(channels[index], target, 0.001)) busy = true
  }
  hover.value = nextHover

  if (busy) frame = requestAnimationFrame(tick)
}

function syncHoverTargets(): void {
  hover.value = actions.value.map((action) => (props.active === action ? 1 : 0))
  channels.forEach((channel, index) => {
    channel.value = hover.value[index]
    channel.velocity = 0
  })
}

function start(): void {
  if (reducedMotion) {
    syncHoverTargets()
    return
  }
  if (frame) return
  lastFrame = performance.now()
  frame = requestAnimationFrame(tick)
}

function isHot(index: number): boolean {
  return hover.value[index] > 0.5
}

function emphasis(index: number): number {
  return clamp(hover.value[index], 0, 1)
}

function sliceTransform(index: number): string {
  const offset = pointAt(
    popOut * props.scale * hover.value[index],
    midAngle(index, count.value),
  )
  const scale =
    (0.78 + 0.22 * open.value[index]) * (1 + hover.value[index] * 0.025)
  return [
    `translate(${offset.x.toFixed(2)} ${offset.y.toFixed(2)})`,
    `scale(${scale.toFixed(4)})`,
  ].join(' ')
}

watch(
  () => props.closing,
  (closing) => {
    if (!closing) return
    openAtClose.splice(0, count.value, ...open.value)
    closeStartedAt = clock
    start()
  },
)

watch(
  () => props.active,
  () => start(),
)

onMounted(() => {
  start()
})

onUnmounted(() => {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
})
</script>

<template>
  <div
    class="donut"
    :style="{ '--box': `${box}px` }"
    role="group"
    :aria-label="ariaLabel ?? '文件操作轮盘'"
  >
    <svg
      class="donut-ring"
      :viewBox="`-${box} -${box} ${box * 2} ${box * 2}`"
      :width="box * 2"
      :height="box * 2"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="mqmz-donut-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="rgb(39, 32, 28)" stop-opacity="0" />
          <stop
            :offset="shadowStops.inner"
            stop-color="rgb(39, 32, 28)"
            stop-opacity="0"
          />
          <stop
            :offset="shadowStops.peak"
            stop-color="rgb(39, 32, 28)"
            stop-opacity="0.2"
          />
          <stop offset="1" stop-color="rgb(39, 32, 28)" stop-opacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        cx="0"
        cy="4"
        :rx="shadowRadius"
        :ry="shadowRadius"
        fill="url(#mqmz-donut-shadow)"
        :opacity="shadowOpacity"
      />
      <g
        v-for="(slice, index) in wedges"
        :key="slice.action"
        class="donut-segment"
        :class="{ active: isHot(index) }"
        :data-region="slice.action"
        :transform="sliceTransform(index)"
        :opacity="Math.max(0, Math.min(1, open[index]))"
      >
        <path :d="slice.d" class="donut-slice" />
        <path
          :d="slice.d"
          class="donut-accent"
          :style="{ opacity: emphasis(index) }"
        />
        <text
          v-for="(glyph, position) in slice.glyphs"
          :key="`${slice.action}-${position}`"
          class="donut-label"
          :class="{ hot: isHot(index) }"
          :x="glyph.x"
          :y="glyph.y"
          :style="{ fontSize: `${(labelSize ?? 11) * scale}px` }"
          text-anchor="middle"
          dominant-baseline="central"
        >
          {{ glyph.char }}
        </text>
      </g>
    </svg>

    <p
      v-if="error"
      class="donut-hint"
      :style="{ top: `calc(50% + ${metrics.outer + 6}px)` }"
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
}
.donut-ring {
  position: absolute;
  left: calc(-1 * var(--box));
  top: calc(-1 * var(--box));
  overflow: visible;
}
.donut-slice {
  fill: var(--color-surface);
  stroke: var(--color-line);
  stroke-width: 1;
  stroke-linejoin: round;
}
.donut-accent {
  fill: var(--color-brand-ink);
  stroke: var(--color-brand-ink);
  stroke-width: 1;
  stroke-linejoin: round;
  pointer-events: none;
}
.donut-label {
  font-weight: var(--font-weight-bold);
  fill: var(--color-ink);
  pointer-events: none;
  transition: fill 120ms var(--ease-standard);
}
.donut-label.hot {
  fill: var(--color-on-brand);
}
.donut-hint {
  position: absolute;
  left: 0;
  transform: translate(-50%, -50%);
  margin: 0;
  max-width: calc(var(--box) * 2 - 24px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--font-size-caption);
  color: var(--color-danger);
}
@media (prefers-reduced-motion: reduce) {
  .donut-label {
    transition: none;
  }
}
</style>
