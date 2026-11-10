<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Database,
  Info,
  Monitor,
  Palette,
  Settings,
  Sparkles,
} from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import {
  defaultSettings,
  petScales,
  themeIds,
  themeLabels,
  type SettingsState,
} from '../shared/settings'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const nav = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'desktop', label: '桌面', icon: Monitor },
  { id: 'data', label: '数据', icon: Database },
  { id: 'ai', label: '智能问答', icon: Sparkles },
  { id: 'about', label: '关于', icon: Info },
] as const
const section = ref<(typeof nav)[number]['id']>('appearance')
const apiKey = ref('')
const editingKey = ref(false)

const settings = computed<SettingsState>(
  () => props.state?.settings ?? defaultSettings,
)
const themes = themeIds.map((id) => ({ id, label: themeLabels[id] }))
const configured = computed(() => Boolean(props.state?.ai.configured))
const bellyCount = computed(() => props.state?.belly.length ?? 0)

watch(configured, (value) => {
  if (!value) return
  editingKey.value = false
  apiKey.value = ''
})

function update(patch: Partial<SettingsState>): void {
  emit('command', { type: 'settings-update', patch })
}
function toggle(key: 'launchAtLogin' | 'statusBubbles' | 'musicBubbles'): void {
  update({ [key]: !settings.value[key] })
}
function saveKey(): void {
  const value = apiKey.value.trim()
  if (!value) return
  emit('command', { type: 'ai-config', apiKey: value })
  apiKey.value = ''
}
function close(): void {
  emit('command', { type: 'settings-close' })
}
</script>

<template>
  <main class="settings-shell" @keydown.esc="close">
    <section class="settings-surface" aria-label="设置">
      <PanelHeader
        title="设置"
        :platform="state?.runtime.platform"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      >
        <template #icon>
          <Settings
            :size="17"
            :stroke-width="2"
            aria-hidden="true"
            focusable="false"
          />
        </template>
      </PanelHeader>

      <div class="settings-body">
        <nav class="settings-nav" aria-label="设置分类">
          <button
            v-for="item in nav"
            :key="item.id"
            type="button"
            :class="{ active: section === item.id }"
            :aria-current="section === item.id ? 'page' : undefined"
            @click="section = item.id"
          >
            <component
              :is="item.icon"
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="settings-content">
          <template v-if="section === 'appearance'">
            <h2>外观</h2>
            <div class="settings-row">
              <span class="settings-label">主题</span>
              <div class="settings-segmented" role="group" aria-label="主题">
                <button
                  v-for="theme in themes"
                  :key="theme.id"
                  type="button"
                  :class="{ active: settings.theme === theme.id }"
                  @click="update({ theme: theme.id })"
                >
                  {{ theme.label }}
                </button>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-label">桌宠大小</span>
              <div class="settings-segmented" role="group" aria-label="桌宠大小">
                <button
                  v-for="value in petScales"
                  :key="value"
                  type="button"
                  :class="{ active: settings.scale === value }"
                  @click="update({ scale: value })"
                >
                  {{ value }}×
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="section === 'desktop'">
            <h2>桌面</h2>
            <div class="settings-row">
              <span id="setting-launch" class="settings-label">开机启动</span>
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-launch"
                :aria-checked="settings.launchAtLogin"
                @click="toggle('launchAtLogin')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
            <div class="settings-row">
              <span id="setting-status-bubbles" class="settings-label"
                >状态提示气泡</span
              >
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-status-bubbles"
                :aria-checked="settings.statusBubbles"
                @click="toggle('statusBubbles')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
            <div class="settings-row">
              <span id="setting-music-bubbles" class="settings-label"
                >音乐互动气泡</span
              >
              <button
                type="button"
                class="settings-switch"
                role="switch"
                aria-labelledby="setting-music-bubbles"
                :aria-checked="settings.musicBubbles"
                @click="toggle('musicBubbles')"
              >
                <span class="settings-switch-thumb" />
              </button>
            </div>
          </template>

          <template v-else-if="section === 'data'">
            <h2>数据</h2>
            <div class="settings-row">
              <span class="settings-label">数据目录</span>
              <button
                type="button"
                class="settings-action"
                @click="emit('command', { type: 'settings-open-data' })"
              >
                打开
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label">缓存</span>
              <button
                type="button"
                class="settings-action"
                @click="emit('command', { type: 'settings-clear-cache' })"
              >
                清理
              </button>
            </div>
            <div class="settings-row">
              <span class="settings-label">回收区</span>
              <span class="settings-inline">
                <span class="settings-value">{{ bellyCount }} 项</span>
                <button
                  type="button"
                  class="settings-action"
                  @click="emit('command', { type: 'settings-clear-belly' })"
                >
                  清空
                </button>
              </span>
            </div>
          </template>

          <template v-else-if="section === 'ai'">
            <h2>智能问答</h2>
            <div class="settings-row">
              <span class="settings-label">DeepSeek Key</span>
              <span class="settings-value">{{
                configured ? '已配置' : '未配置'
              }}</span>
            </div>
            <div v-if="!configured || editingKey" class="settings-field">
              <input
                v-model="apiKey"
                type="password"
                autocomplete="off"
                aria-label="DeepSeek API Key"
                placeholder="API Key"
                @keydown.enter="saveKey"
              />
              <button
                type="button"
                class="settings-action"
                :disabled="!apiKey.trim()"
                @click="saveKey"
              >
                保存
              </button>
              <button
                v-if="editingKey"
                type="button"
                class="settings-action"
                @click="
                  editingKey = false;
                  apiKey = '';
                "
              >
                取消
              </button>
            </div>
            <div v-else class="settings-field settings-field-end">
              <button
                type="button"
                class="settings-action"
                @click="editingKey = true"
              >
                替换
              </button>
              <button
                type="button"
                class="settings-action danger"
                @click="emit('command', { type: 'ai-clear' })"
              >
                删除
              </button>
            </div>
          </template>

          <template v-else>
            <h2>关于</h2>
            <div class="settings-row">
              <span class="settings-label">版本</span>
              <span class="settings-value"
                >v{{ state?.runtime.version ?? '0.0.1' }}</span
              >
            </div>
            <div class="settings-row">
              <span class="settings-label">第三方许可</span>
              <button
                type="button"
                class="settings-action"
                @click="emit('command', { type: 'settings-open-licenses' })"
              >
                打开
              </button>
            </div>
          </template>

          <p v-if="error" class="settings-error" role="alert">{{ error }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.settings-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.settings-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.settings-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
}
.settings-nav {
  flex: none;
  width: 148px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-right: 12px;
  border-right: 1px solid var(--color-line);
}
.settings-nav button {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  text-align: left;
  transition:
    background-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out);
}
.settings-nav button:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.settings-nav button.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font-weight: 600;
}
.settings-nav button:focus-visible,
.settings-action:focus-visible,
.settings-segmented button:focus-visible,
.settings-switch:focus-visible {
  outline: 2px solid var(--color-brand-ink);
  outline-offset: 2px;
}
.settings-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding-right: 4px;
  scrollbar-width: thin;
}
.settings-content h2 {
  margin: 0 0 6px;
  font-size: var(--font-size-section);
  line-height: 1.4;
  font-weight: 650;
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  border-bottom: 1px solid var(--color-line);
}
.settings-label {
  font-size: var(--font-size-body);
}
.settings-value {
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.settings-inline {
  display: flex;
  align-items: center;
  gap: 12px;
}
.settings-segmented {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.settings-segmented button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: calc(var(--radius-control) - 3px);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  transition:
    background-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out);
}
.settings-segmented button.active {
  background: var(--color-surface);
  color: var(--color-brand-ink);
  box-shadow: var(--shadow-control);
  font-weight: 600;
}
.settings-switch {
  position: relative;
  flex: none;
  width: 42px;
  height: 25px;
  min-height: 25px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-fill-secondary);
  transition:
    background-color var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out);
}
.settings-switch[aria-checked='true'] {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.settings-switch-thumb {
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
.settings-switch[aria-checked='true'] .settings-switch-thumb {
  transform: translateX(17px);
}
.settings-action {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-brand-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.settings-action:hover:not(:disabled) {
  background: var(--color-brand-soft);
}
.settings-action:disabled {
  color: var(--color-muted);
  cursor: default;
}
.settings-action.danger {
  color: var(--color-danger);
}
.settings-action.danger:hover {
  background: var(--color-danger-soft);
}
.settings-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-line);
}
.settings-field-end {
  justify-content: flex-end;
}
.settings-field input {
  flex: 1;
  min-width: 0;
  height: var(--tap-min);
  padding: 0 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.settings-field input:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.settings-error {
  margin: 12px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .settings-nav button,
  .settings-segmented button,
  .settings-switch,
  .settings-switch-thumb {
    transition: none;
  }
}
</style>
