<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    size?: 'sm' | 'md'
    wide?: boolean
    minWidth?: string
  }>(),
  { size: 'sm', wide: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <span
    class="select-field"
    :class="[`select-field-${props.size}`, { 'select-field-wide': props.wide }]"
    :style="
      props.minWidth ? { '--select-min-width': props.minWidth } : undefined
    "
  >
    <select
      v-bind="$attrs"
      :value="props.modelValue !== undefined ? props.modelValue : $attrs.value"
      @change="onChange"
    >
      <slot />
    </select>
    <ChevronDown
      class="select-field-icon"
      :size="14"
      :stroke-width="2"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.select-field {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  min-width: var(--select-min-width, 0);
}
.select-field select {
  width: auto;
  height: 30px;
  padding: 0 26px 0 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  appearance: none;
  -webkit-appearance: none;
}
.select-field-wide {
  flex: 1 1 auto;
  width: 100%;
}
.select-field-wide select {
  width: 100%;
}
.select-field-md select {
  height: var(--tap-min);
  padding-left: 10px;
  font-size: var(--font-size-body);
}
.select-field-icon {
  position: absolute;
  top: 50%;
  right: 8px;
  pointer-events: none;
  color: var(--color-muted);
  transform: translateY(-50%);
}
.select-field select:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
</style>
