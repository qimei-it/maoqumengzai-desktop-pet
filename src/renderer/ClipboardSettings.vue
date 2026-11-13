<script setup lang="ts">
import { clipboardTextLimit } from '../shared/clipboard'
import type { ClipboardConfig } from '../shared/clipboard'
import SelectField from './SelectField.vue'

const props = defineProps<{
  config: ClipboardConfig
  clearCount?: number
}>()
const emit = defineEmits<{
  update: [patch: Partial<ClipboardConfig>]
  clear: []
}>()

const maxOptions = [30, 50, 100, 200, 500]
const retentionOptions = [
  { value: 1, label: '1 天' },
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 0, label: '永久' },
]

function toggle(key: 'enabled' | 'ignoreSensitive'): void {
  emit('update', { [key]: !props.config[key] })
}
function changeMax(event: Event): void {
  emit('update', { maxItems: Number((event.target as HTMLSelectElement).value) })
}
function changeRetention(event: Event): void {
  emit('update', {
    retentionDays: Number((event.target as HTMLSelectElement).value),
  })
}
</script>

<template>
  <div class="clip-settings">
    <div class="clip-setting-row">
      <span>监听剪贴板</span>
      <button
        type="button"
        class="clip-setting-switch"
        role="switch"
        aria-label="监听剪贴板"
        :aria-checked="config.enabled"
        @click="toggle('enabled')"
      >
        <span class="clip-setting-switch-thumb" />
      </button>
    </div>
    <div class="clip-setting-row">
      <span>字符上限</span>
      <span class="clip-setting-value">
        {{ clipboardTextLimit.toLocaleString('zh-CN') }} 字
      </span>
    </div>
    <div class="clip-setting-row">
      <span>记录上限</span>
      <SelectField
        :value="config.maxItems"
        min-width="96px"
        aria-label="剪贴板记录上限"
        @change="changeMax"
      >
        <option v-for="value in maxOptions" :key="value" :value="value">
          {{ value }} 条
        </option>
      </SelectField>
    </div>
    <div class="clip-setting-row">
      <span>保留期限</span>
      <SelectField
        :value="config.retentionDays"
        min-width="96px"
        aria-label="剪贴板保留期限"
        @change="changeRetention"
      >
        <option
          v-for="option in retentionOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </SelectField>
    </div>
    <div v-if="clearCount !== undefined" class="clip-setting-row">
      <span>剪贴板</span>
      <span class="clip-setting-actions">
        <span class="clip-setting-value">{{ clearCount }} 项</span>
        <button
          type="button"
          class="settings-button danger"
          :disabled="clearCount === 0"
          @click="emit('clear')"
        >
          清空
        </button>
      </span>
    </div>
    <div class="clip-setting-row">
      <span>忽略敏感内容</span>
      <button
        type="button"
        class="clip-setting-switch"
        role="switch"
        aria-label="忽略敏感内容"
        :aria-checked="config.ignoreSensitive"
        @click="toggle('ignoreSensitive')"
      >
        <span class="clip-setting-switch-thumb" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.clip-settings {
  display: flex;
  flex-direction: column;
}
.clip-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  border-bottom: 1px solid var(--color-line);
  font-size: var(--font-size-body);
}
.clip-setting-row:last-child {
  border-bottom: 0;
}
.clip-setting-value {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
}
.clip-setting-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.clip-setting-switch {
  position: relative;
  width: 42px;
  height: 25px;
  min-height: 25px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-fill-secondary);
}
.clip-setting-switch[aria-checked='true'] {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.clip-setting-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 19px;
  height: 19px;
  border-radius: 999px;
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  transition: transform var(--motion-fast) var(--ease-out);
}
.clip-setting-switch[aria-checked='true'] .clip-setting-switch-thumb {
  transform: translateX(17px);
}
@media (prefers-reduced-motion: reduce) {
  .clip-setting-switch-thumb {
    transition: none;
  }
}
</style>
