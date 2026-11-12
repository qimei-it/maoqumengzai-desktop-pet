<script setup lang="ts">
import { computed } from 'vue'
import { donutMetrics, petSprite } from '../shared/donut'
import DonutMenu from './DonutMenu.vue'

const props = defineProps<{
  scale: number
  actions: readonly string[]
  labels: Record<string, readonly string[]>
  labelSize?: number
  singleLine?: boolean
  active?: string | null
  ariaLabel?: string
  interactive?: boolean
  petImage?: string
  hidePet?: boolean
}>()

const size = computed(() => donutMetrics(props.scale).window)
const petWidth = computed(() => petSprite.width * props.scale)
const petHeight = computed(() => petSprite.height * props.scale)
</script>

<template>
  <div
    class="wheel-preview"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :role="interactive ? 'group' : 'img'"
    :aria-label="ariaLabel"
  >
    <div class="wheel-preview-visual" aria-hidden="true">
      <img
        v-if="petImage && !hidePet"
        class="wheel-preview-pet"
        :src="petImage"
        alt=""
        draggable="false"
        :style="{ width: `${petWidth}px`, height: `${petHeight}px` }"
      />
      <DonutMenu
        :key="actions.join('|')"
        preview
        :scale="scale"
        :actions="actions"
        :labels="labels"
        :label-size="labelSize ?? 11"
        :single-line="singleLine"
        :active="active ?? null"
      />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.wheel-preview {
  position: relative;
  flex: none;
}
.wheel-preview-visual {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.wheel-preview-pet {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  object-fit: contain;
  user-select: none;
}
</style>
