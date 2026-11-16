<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, PawPrint } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import PanelHeader from './PanelHeader.vue'
import catBase from './assets/pet/ragdoll/base.png'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const name = ref(props.state?.settings.petName ?? '麻薯')
const saved = ref(false)
const value = computed(() => name.value.trim())
const cover = computed(
  () => props.state?.petAssets?.poses.base ?? catBase,
)
const styleName = computed(
  () => props.state?.petAssets?.styleName ?? '默认',
)
const species = computed(() => (props.state?.petAssets ? '自定义' : '布偶猫'))
const canSave = computed(
  () => value.value.length > 0 && value.value !== props.state?.settings.petName,
)

watch(
  () => props.state?.settings.petName,
  (next) => {
    if (next) name.value = next
  },
)
function save(): void {
  if (!canSave.value) return
  emit('command', {
    type: 'settings-update',
    patch: { petName: value.value },
  })
  saved.value = true
  window.setTimeout(() => {
    saved.value = false
  }, 1200)
}
function close(): void {
  emit('command', { type: 'profile-close' })
}
</script>

<template>
  <main class="profile-shell" @keydown.esc="close">
    <section class="profile-surface" aria-label="宠物档案">
      <PanelHeader
        title="宠物档案"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div class="profile-portrait">
        <img :src="cover" :alt="name || '麻薯'" draggable="false" />
      </div>

      <div class="profile-body">
        <div class="profile-row">
          <span class="profile-label">
            <PawPrint :size="15" :stroke-width="2" aria-hidden="true" />
            名字
          </span>
          <span class="profile-edit">
            <input
              v-model="name"
              type="text"
              maxlength="20"
              aria-label="宠物名字"
              @keydown.enter.prevent="save"
            />
            <button
              type="button"
              class="profile-save"
              :disabled="!canSave"
              aria-label="保存名字"
              title="保存"
              @click="save"
            >
              <Check :size="14" :stroke-width="2.2" aria-hidden="true" />
            </button>
          </span>
        </div>
        <div class="profile-row">
          <span class="profile-label">品种</span>
          <span class="profile-value">{{ species }}</span>
        </div>
        <div class="profile-row">
          <span class="profile-label">形象</span>
          <span class="profile-value">{{ styleName }}</span>
        </div>
      </div>

      <p v-if="saved" class="profile-notice" role="status">名字已保存</p>
      <p v-if="error" class="profile-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.profile-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.profile-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.profile-portrait {
  display: grid;
  place-items: center;
  height: 236px;
  margin-top: 12px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.profile-portrait img {
  width: 180px;
  height: 180px;
  object-fit: contain;
}
.profile-body {
  display: flex;
  flex-direction: column;
  margin-top: 6px;
}
.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  border-bottom: 1px solid var(--color-line);
  font-size: var(--font-size-body);
}
.profile-row:last-child {
  border-bottom: 0;
}
.profile-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-ink);
}
.profile-value {
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.profile-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}
.profile-edit input {
  width: 150px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.profile-edit input:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.profile-save {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.profile-save:disabled {
  background: var(--color-fill-secondary);
  color: var(--color-muted);
}
.profile-notice {
  margin: 10px 0 0;
  color: var(--color-brand-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.profile-error {
  margin: 10px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
</style>
