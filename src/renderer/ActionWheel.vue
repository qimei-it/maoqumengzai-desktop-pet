<script setup lang="ts">
import { computed } from 'vue'
import {
  Archive,
  ChevronLeft,
  FileOutput,
  Fish,
  type LucideIcon,
} from '@lucide/vue'
import type { LocalFile } from '../shared/protocol'
import {
  petalPositions,
  summarizeBatch,
  wheelRadius,
} from '../shared/wheel'

type Petal = {
  id: 'stash' | 'convert' | 'eat' | 'target'
  label: string
  hint: string
  icon: LucideIcon
  tone: 'primary' | 'neutral' | 'danger' | 'muted'
  disabled?: boolean
  target?: string
}

const props = defineProps<{
  files: LocalFile[]
  level: 'actions' | 'convert'
  scale: number
  targets: string[]
  busy: boolean
}>()
const emit = defineEmits<{
  stash: []
  convert: []
  eat: []
  back: []
  close: []
  target: [target: string]
}>()

const radius = computed(() => wheelRadius(props.scale))
const petals = computed<Petal[]>(() => {
  if (props.level === 'convert') {
    if (!props.targets.length) {
      return [
        {
          id: 'target',
          label: '暂不支持',
          hint: '这批文件的类型暂时不能统一转换',
          icon: FileOutput,
          tone: 'muted',
          disabled: true,
        },
      ]
    }
    return props.targets.map(
      (target): Petal => ({
        id: 'target',
        label: target,
        hint: `${target}：转换引擎接入后可用`,
        icon: FileOutput,
        tone: 'muted',
        disabled: true,
        target,
      }),
    )
  }
  return [
    {
      id: 'stash',
      label: '暂存',
      hint: '留在桌宠旁边，随时按住拖出',
      icon: Archive,
      tone: 'primary',
    },
    {
      id: 'convert',
      label: '转换',
      hint: '选择目标格式；引擎尚未接入',
      icon: FileOutput,
      tone: 'neutral',
    },
    {
      id: 'eat',
      label: '吃掉',
      hint: '收进桌宠的肚子，7 天内可取回',
      icon: Fish,
      tone: 'danger',
    },
  ]
})
const placements = computed(() =>
  petalPositions(petals.value.length, radius.value, -90, props.level === 'convert'),
)
const summary = computed(() => {
  if (props.level === 'convert') return '格式转换引擎尚未接入'
  return summarizeBatch(props.files)
})
function style(index: number) {
  const point = placements.value[index]
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
  }
}
function activate(petal: Petal): void {
  if (props.busy || petal.disabled) return
  if (petal.id === 'stash') emit('stash')
  else if (petal.id === 'convert') emit('convert')
  else if (petal.id === 'eat') emit('eat')
  else if (petal.target) emit('target', petal.target)
}
</script>

<template>
  <div
    class="wheel"
    role="group"
    aria-label="文件操作"
    :style="{ '--wheel-radius': `${radius}px` }"
    @pointerdown.stop
  >
    <button
      v-for="(petal, index) in petals"
      :key="petal.id + (petal.target ?? '')"
      type="button"
      class="wheel-petal"
      :class="`tone-${petal.tone}`"
      :style="style(index)"
      :disabled="petal.disabled || busy"
      :aria-label="petal.hint"
      :title="petal.hint"
      :data-petal="petal.id"
      @click="activate(petal)"
    >
      <span class="wheel-petal-icon">
        <component
          :is="petal.icon"
          :size="20"
          :stroke-width="2"
          aria-hidden="true"
          focusable="false"
        />
      </span>
      <span class="wheel-petal-label">{{ petal.label }}</span>
    </button>

    <div class="wheel-footer">
      <button
        v-if="level === 'convert'"
        type="button"
        class="wheel-back"
        @click="emit('back')"
      >
        <ChevronLeft
          :size="14"
          :stroke-width="2"
          aria-hidden="true"
          focusable="false"
        />
        返回
      </button>
      <p class="wheel-summary" :class="{ muted: level === 'convert' }">
        {{ summary }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.wheel {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}
.wheel-petal {
  position: absolute;
  width: 88px;
  min-height: 0;
  height: 62px;
  padding: 7px 4px 6px;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: var(--shadow-button-3d);
  pointer-events: auto;
  animation: wheel-in 160ms var(--ease-standard) both;
}
.wheel-petal:hover:not(:disabled) {
  background: var(--color-brand-soft);
  border-color: var(--color-brand-highlight);
}
.wheel-petal:active:not(:disabled) {
  transform: translate(-50%, -50%) scale(0.97);
}
.wheel-petal:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.wheel-petal:disabled {
  cursor: default;
  opacity: 1;
  background: var(--color-fill-secondary);
  color: var(--color-muted);
  box-shadow: none;
}
.wheel-petal-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.wheel-petal-label {
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}
.tone-primary .wheel-petal-icon {
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.tone-danger .wheel-petal-icon {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.tone-danger .wheel-petal-label {
  color: var(--color-danger);
}
.wheel-petal:disabled .wheel-petal-icon {
  background: var(--color-line);
  color: var(--color-muted);
}
.wheel-footer {
  position: absolute;
  left: 0;
  top: calc(var(--wheel-radius) + 22px);
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.wheel-summary {
  margin: 0;
  padding: 5px 11px;
  max-width: 250px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  font-size: var(--font-size-caption);
  color: var(--color-ink);
}
.wheel-summary.muted {
  color: var(--color-muted);
}
.wheel-back {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 28px;
  padding: 4px 10px 4px 6px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  color: var(--color-brand-ink);
  font-size: var(--font-size-caption);
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
  pointer-events: auto;
}
.wheel-back:hover {
  background: var(--color-brand-soft);
}
@keyframes wheel-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.9);
  }
}
@media (prefers-reduced-motion: reduce) {
  .wheel-petal {
    animation: none;
  }
}
</style>
