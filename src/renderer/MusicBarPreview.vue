<script setup lang="ts">
import { computed } from 'vue'
import {
  EyeOff,
  Pause,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from '@lucide/vue'
import type { MusicBarStyle } from '../shared/settings'

const props = defineProps<{ variant: MusicBarStyle }>()

const bars = {
  compact: { width: 432, height: 50, scale: 0.7 },
  double: { width: 280, height: 108, scale: 0.66 },
  minimal: { width: 288, height: 50, scale: 0.7 },
} as const

const bar = computed(() => bars[props.variant])
const barStyle = computed(() => ({
  width: `${bar.value.width}px`,
  height: `${bar.value.height}px`,
  transform: `scale(${bar.value.scale})`,
}))
const controls = [
  { icon: Shuffle, size: 16, filled: false, className: '' },
  { icon: SkipBack, size: 18, filled: true, className: 'transport' },
  { icon: Pause, size: 18, filled: true, className: 'transport' },
  { icon: SkipForward, size: 18, filled: true, className: 'transport' },
  { icon: Repeat, size: 16, filled: false, className: '' },
  { icon: Volume2, size: 18, filled: true, className: 'pill-volume' },
]
</script>

<template>
  <span
    class="bar-preview-stage"
    :class="`preview-${variant}-stage`"
    aria-hidden="true"
  >
    <span
      class="pill-surface preview-bar"
      :class="{
        double: variant === 'double',
        minimal: variant === 'minimal',
      }"
      :style="barStyle"
    >
      <span class="pill-now">
        <span class="pill-cover preview-cover" />
        <span v-if="variant !== 'minimal'" class="pill-meta preview-meta">
          <span class="preview-line preview-title" />
          <span class="preview-lines">
            <span class="preview-line" />
            <span v-if="variant === 'double'" class="preview-line" />
          </span>
        </span>
      </span>

      <span class="pill-group pill-controls">
        <span
          v-for="(control, index) in controls"
          :key="index"
          class="pill-button"
          :class="control.className"
        >
          <component
            :is="control.icon"
            :size="control.size"
            :stroke-width="2"
            :fill="control.filled ? 'currentColor' : 'none'"
          />
        </span>
      </span>

      <span class="pill-hide">
        <EyeOff :size="16" :stroke-width="2" />
      </span>
    </span>
  </span>
</template>

<style scoped>
.bar-preview-stage {
  position: relative;
  display: block;
  flex: none;
  overflow: hidden;
}
.preview-compact-stage {
  width: 302px;
  height: 35px;
}
.preview-double-stage {
  width: 185px;
  height: 71px;
}
.preview-minimal-stage {
  width: 202px;
  height: 35px;
}
.preview-bar {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  pointer-events: none;
}
.preview-cover {
  background: var(--color-brand);
}
.preview-meta {
  justify-content: center;
}
.preview-title {
  width: 64%;
  height: 6px;
  background: var(--color-muted);
}
.preview-lines {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 84%;
}
.preview-line {
  display: block;
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: var(--color-line);
}
</style>
