<script setup lang="ts">
import { dismissToast, toastItems } from './toasts'
</script>

<template>
  <TransitionGroup name="toast" tag="div" class="toast-stack">
    <div
      v-for="toast in toastItems"
      :key="toast.id"
      class="toast-item"
      :class="`toast-${toast.type}`"
      role="status"
      @click="dismissToast(toast.id)"
    >
      {{ toast.message }}
    </div>
  </TransitionGroup>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.toast-item {
  width: min(100%, 560px);
  padding: 10px 14px;
  border: 0;
  border-radius: var(--radius-control);
  box-shadow: var(--mqmz-panel-shadow);
  color: var(--color-ink);
  font-size: var(--font-size-label);
  line-height: 1.5;
  text-align: left;
  pointer-events: auto;
  cursor: pointer;
}
.toast-error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.toast-warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.toast-success {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--motion-fast) var(--ease-out),
    transform var(--motion-slow) var(--ease-out);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
