<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string | number
  options: ReadonlyArray<{ value: string | number; label: string }>
  ariaLabel?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ update: [value: string | number] }>()

const selected = computed(() =>
  Math.max(
    0,
    props.options.findIndex((option) => option.value === props.modelValue),
  ),
)
</script>

<template>
  <div
    class="segmented"
    :style="{ '--seg-count': options.length }"
    role="group"
    :aria-label="ariaLabel"
  >
    <span
      class="segmented-thumb"
      :style="{ transform: `translateX(${selected * 100}%)` }"
    />
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :disabled="disabled"
      :class="{ active: option.value === modelValue }"
      :aria-pressed="option.value === modelValue"
      @click="emit('update', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--seg-count), minmax(0, 1fr));
  gap: 0;
  padding: 3px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.segmented-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 6px) / var(--seg-count));
  border-radius: calc(var(--radius-control) - 2px);
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  transition: transform var(--motion-slow) var(--ease-out);
}
.segmented button {
  position: relative;
  z-index: 1;
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: calc(var(--radius-control) - 2px);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  white-space: nowrap;
  transition: color var(--motion-fast) var(--ease-out);
}
.segmented button.active {
  color: var(--color-brand-ink);
}
.segmented button:disabled {
  cursor: default;
  opacity: 0.6;
}
.segmented button:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: -2px;
}
@media (prefers-reduced-motion: reduce) {
  .segmented-thumb {
    transition: none;
  }
}
</style>
