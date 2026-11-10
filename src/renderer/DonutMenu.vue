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
  sliceLabels,
  span,
  wedge,
  type DropAction,
} from '../shared/donut'
import { createChannel, isSettled, stepSpring } from '../shared/spring'

const props = defineProps<{
  scale: number
  active: DropAction | null
  error?: string
  closing?: boolean
}>()

/** Filee's spring: 320/20 pops out with a small bounce, 36 settles without one. */
const popSpring = { stiffness: 320, damping: 20, mass: 1 }
const settleSpring = { stiffness: 320, damping: 36, mass: 1 }
/** Filee's open wave: 300ms with a 12ms stagger per slice, capped at 72ms. */
const openDuration = 0.3
const openStagger = 0.012
const closeDuration = 0.14

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const metrics = computed(() => donutMetrics(props.scale))
const box = computed(() => metrics.value.outer + 30)

const wedges = computed(() => {
  const m = metrics.value
  const step = span(sliceCount)
  const gap = sliceGap * props.scale
  const corner = sliceCornerRadius * props.scale
  const fontSize = 14 * props.scale
  return sliceActions.map((action, index) => {
    const mid = midAngle(index, sliceCount)
    const label = sliceLabels[action]
    const chars = Array.from(label)
    const arcStep = Math.min(
      (fontSize * 1.16) / m.mid,
      (step * 0.82) / Math.max(1, chars.length),
    )
    const offsetOf = (position: number) =>
      (position - (chars.length - 1) / 2) * arcStep
    // Characters stay upright and stack top-to-bottom; the column follows the
    // ring by walking the glyph anchors along the slice's arc.
    const first = pointAt(m.mid, mid + offsetOf(0))
    const last = pointAt(m.mid, mid + offsetOf(chars.length - 1))
    const reversed = first.y > last.y
    const glyphs = chars.map((char, position) => {
      const angle = mid + (reversed ? -offsetOf(position) : offsetOf(position))
      const point = pointAt(m.mid, angle)
      return { char, x: point.x, y: point.y }
    })
    return {
      action,
      label,
      d: outlinePath(wedge(m.inner, m.outer, mid, step, gap, corner)),
      glyphs,
    }
  })
})

const open = ref<number[]>(new Array(sliceCount).fill(reducedMotion ? 1 : 0))
const hover = ref<number[]>(new Array(sliceCount).fill(0))
const channels = Array.from({ length: sliceCount }, () => createChannel(0))

let frame = 0
let clock = 0
let lastFrame = 0
let closeStartedAt = 0
const openAtClose = new Array(sliceCount).fill(1)

function easeOutBack(t: number): number {
  const c1 = 0.8
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
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
    const progress = clamp((clock - closeStartedAt) / closeDuration, 0, 1)
    open.value = openAtClose.map((value) => value * (1 - easeInCubic(progress)))
    busy = progress < 1
  } else {
    open.value = open.value.map((_, index) => {
      const delay = Math.min(index * openStagger, 0.072)
      const progress = clamp((clock - delay) / openDuration, 0, 1)
      if (progress < 1) busy = true
      return easeOutBack(progress)
    })
  }

  const nextHover = hover.value.slice()
  for (let index = 0; index < sliceCount; index += 1) {
    const target = props.active === sliceActions[index] ? 1 : 0
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
  hover.value = sliceActions.map((action) => (props.active === action ? 1 : 0))
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
    midAngle(index, sliceCount),
  )
  const scale =
    (0.78 + 0.22 * open.value[index]) * (1 + hover.value[index] * 0.025)
  const rotate = ((1 - Math.min(open.value[index], 1)) * -0.12 * 180) / Math.PI
  return [
    `translate(${offset.x.toFixed(2)} ${offset.y.toFixed(2)})`,
    `rotate(${rotate.toFixed(3)})`,
    `scale(${scale.toFixed(4)})`,
  ].join(' ')
}

watch(
  () => props.closing,
  (closing) => {
    if (!closing) return
    openAtClose.splice(0, sliceCount, ...open.value)
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
          :style="{ fontSize: `${14 * scale}px` }"
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
  filter: drop-shadow(0 6px 18px rgba(31, 38, 77, 0.14));
}
.donut-slice {
  fill: var(--color-surface);
  stroke: var(--color-line);
  stroke-width: 1;
  stroke-linejoin: round;
}
.donut-accent {
  fill: var(--color-brand-ink);
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
