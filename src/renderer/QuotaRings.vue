<script setup lang="ts">
import { computed } from 'vue'
import { ringMetrics } from '../shared/ai-quota'

const props = withDefaults(
  defineProps<{
    outer?: number
    inner?: number
    color: string
    size?: number
  }>(),
  { size: 52 },
)

const center = computed(() => props.size / 2)
const outerRadius = computed(() => props.size * 0.39)
const innerRadius = computed(() => props.size * 0.26)
const outerStroke = computed(() => props.size * 0.09)
const innerStroke = computed(() => props.size * 0.075)
const outerRing = computed(() => ringMetrics(props.outer, outerRadius.value))
const innerRing = computed(() => ringMetrics(props.inner, innerRadius.value))
</script>

<template>
  <svg
    class="quota-rings"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${size} ${size}`"
    fill="none"
    aria-hidden="true"
  >
    <g :transform="`rotate(-90 ${center} ${center})`">
      <circle
        :cx="center"
        :cy="center"
        :r="outerRadius"
        :stroke="color"
        :stroke-width="outerStroke"
        stroke-opacity="0.16"
      />
      <circle
        v-if="outer !== undefined"
        class="quota-ring-arc"
        :cx="center"
        :cy="center"
        :r="outerRadius"
        :stroke="color"
        :stroke-width="outerStroke"
        stroke-linecap="round"
        :stroke-dasharray="outerRing.circumference"
        :stroke-dashoffset="outerRing.offset"
      />
      <circle
        :cx="center"
        :cy="center"
        :r="innerRadius"
        :stroke="color"
        :stroke-width="innerStroke"
        stroke-opacity="0.16"
      />
      <circle
        v-if="inner !== undefined"
        class="quota-ring-arc"
        :cx="center"
        :cy="center"
        :r="innerRadius"
        :stroke="color"
        :stroke-width="innerStroke"
        stroke-linecap="round"
        :stroke-dasharray="innerRing.circumference"
        :stroke-dashoffset="innerRing.offset"
      />
    </g>
  </svg>
</template>

<style scoped>
.quota-rings {
  display: block;
  flex: none;
}
.quota-ring-arc {
  transition: stroke-dashoffset 420ms var(--ease-out);
}
@media (prefers-reduced-motion: reduce) {
  .quota-ring-arc {
    transition: none;
  }
}
</style>
