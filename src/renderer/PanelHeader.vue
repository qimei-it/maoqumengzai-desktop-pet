<script setup lang="ts">
import { computed } from 'vue'
import { Minus, Square, X } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    title: string
    platform?: string
    resizable?: boolean
  }>(),
  { platform: '', resizable: false },
)
const emit = defineEmits<{
  minimize: []
  maximize: []
  close: []
}>()

const mac = computed(() => {
  if (props.platform) return props.platform === 'darwin'
  return /Mac/i.test(navigator.platform)
})
</script>

<template>
  <header
    class="panel-header"
    :data-platform="mac ? 'darwin' : 'win32'"
  >
    <div v-if="mac" class="panel-mac-controls">
      <button
        type="button"
        class="panel-mac-dot close"
        aria-label="关闭"
        title="关闭"
        @click="emit('close')"
      ></button>
      <button
        type="button"
        class="panel-mac-dot minimize"
        aria-label="最小化"
        title="最小化"
        @click="emit('minimize')"
      ></button>
      <button
        type="button"
        class="panel-mac-dot zoom"
        aria-label="最大化"
        title="固定尺寸"
        disabled
        @click="emit('maximize')"
      ></button>
    </div>

    <div class="panel-title">
      <slot name="icon" />
      <h1>{{ title }}</h1>
    </div>

    <div class="panel-actions">
      <slot name="actions" />
    </div>

    <div v-if="!mac" class="panel-win-controls">
      <button
        type="button"
        class="panel-win-button"
        aria-label="最小化"
        title="最小化"
        @click="emit('minimize')"
      >
        <Minus :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="panel-win-button"
        aria-label="最大化"
        title="固定尺寸"
        :disabled="!resizable"
        @click="emit('maximize')"
      >
        <Square :size="12" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="panel-win-button panel-win-close"
        aria-label="关闭"
        title="关闭"
        @click="emit('close')"
      >
        <X :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.panel-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  margin: calc(-1 * var(--mqmz-panel-padding) + 8px) 0 12px;
  -webkit-app-region: drag;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  pointer-events: none;
}
.panel-title h1 {
  margin: 0;
  font-size: var(--font-size-section);
  line-height: 1.35;
  font-weight: 650;
  white-space: nowrap;
}
.panel-actions {
  position: absolute;
  right: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}
.panel-mac-controls {
  position: absolute;
  left: calc(-1 * var(--mqmz-panel-padding) + 7px);
  top: 50%;
  display: flex;
  gap: 8px;
  transform: translateY(-50%);
  -webkit-app-region: no-drag;
}
.panel-mac-dot {
  width: 14px;
  height: 14px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  box-shadow: var(--mqmz-window-dot-shadow);
}
.panel-mac-dot.close {
  background: radial-gradient(
    circle at 35% 25%,
    var(--mqmz-window-close-hi),
    var(--mqmz-window-close) 46%,
    var(--mqmz-window-close-lo) 100%
  );
}
.panel-mac-dot.minimize {
  background: radial-gradient(
    circle at 35% 25%,
    var(--mqmz-window-minimize-hi),
    var(--mqmz-window-minimize) 46%,
    var(--mqmz-window-minimize-lo) 100%
  );
}
.panel-mac-dot.zoom {
  background: radial-gradient(
    circle at 35% 25%,
    var(--mqmz-window-zoom-hi),
    var(--mqmz-window-zoom) 46%,
    var(--mqmz-window-zoom-lo) 100%
  );
}
.panel-mac-dot:disabled {
  opacity: 0.45;
  cursor: default;
}
.panel-mac-dot:hover:not(:disabled) {
  filter: brightness(1.08);
}
.panel-win-controls {
  position: absolute;
  right: calc(-1 * var(--mqmz-panel-padding));
  top: -8px;
  display: flex;
  height: 32px;
  -webkit-app-region: no-drag;
}
.panel-win-button {
  display: grid;
  place-items: center;
  width: 46px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-ink);
}
.panel-win-button:hover:not(:disabled) {
  background: var(--color-fill-secondary);
}
.panel-win-button:disabled {
  opacity: 0.4;
  cursor: default;
}
.panel-win-close:hover {
  background: var(--color-danger);
  color: var(--color-on-brand);
}
.panel-header[data-platform='win32'] .panel-actions {
  right: 146px;
}
@media (prefers-reduced-motion: reduce) {
  .panel-mac-dot {
    filter: none;
  }
}
</style>
