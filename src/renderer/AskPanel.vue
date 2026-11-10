<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  KeyRound,
  Send,
  Sparkles,
  Trash2,
} from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import FileTypeIcon from './FileTypeIcon.vue'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const ai = computed(() => props.state?.ai)
const draft = ref('')
const keyDraft = ref('')
const editingKey = ref(false)
const list = ref<HTMLElement>()
const showSetup = computed(
  () => !ai.value?.configured || editingKey.value,
)
const canSave = computed(() => keyDraft.value.trim().length > 0)
const visibleFiles = computed(() => ai.value?.files.slice(0, 3) ?? [])
const extraFiles = computed(() =>
  Math.max(0, (ai.value?.files.length ?? 0) - visibleFiles.value.length),
)

watch(
  () => ai.value?.configured,
  (configured) => {
    if (!configured) return
    editingKey.value = false
    keyDraft.value = ''
  },
)

function scrollToEnd(): void {
  void nextTick(() => {
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  })
}
watch(
  () => [ai.value?.messages.length, ai.value?.busy].join(':'),
  scrollToEnd,
)
onMounted(scrollToEnd)

function close(): void {
  emit('command', { type: 'ai-close' })
}
function send(): void {
  const prompt = draft.value.trim()
  if (!prompt || ai.value?.busy) return
  emit('command', { type: 'ai-send', prompt })
  draft.value = ''
}
function saveKey(): void {
  const apiKey = keyDraft.value.trim()
  if (!apiKey) return
  emit('command', { type: 'ai-config', apiKey })
}
function getKey(): void {
  emit('command', { type: 'ai-keys' })
}
function clearKey(): void {
  emit('command', { type: 'ai-clear' })
  editingKey.value = false
}
</script>

<template>
  <main class="ask-shell" @keydown.esc="close">
    <section class="ask-surface" aria-label="智能问答">
      <PanelHeader
        title="智能问答"
        :platform="state?.runtime.platform"
        @minimize="emit('command', { type: 'panel-control', action: 'minimize' })"
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      >
        <template #icon>
          <Sparkles
            :size="17"
            :stroke-width="2"
            aria-hidden="true"
            focusable="false"
          />
        </template>
        <template #actions>
          <button
            v-if="ai?.configured"
            type="button"
            class="ask-icon-button"
            aria-label="配置 DeepSeek API Key"
            title="配置 DeepSeek API Key"
            @click="editingKey = !editingKey"
          >
            <KeyRound
              :size="16"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />
          </button>
        </template>
      </PanelHeader>

      <form v-if="showSetup" class="ask-setup" @submit.prevent="saveKey">
        <h2>{{ ai?.configured ? '更换 API Key' : '连接 DeepSeek' }}</h2>
        <input
          v-model="keyDraft"
          class="ask-key-input"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="API Key（仅保存在本机）"
          aria-label="DeepSeek API Key"
        />
        <div class="button-pair">
          <button type="button" class="button-soft" @click="getKey">
            获取 Key
          </button>
          <button type="submit" class="button-glass" :disabled="!canSave">
            保存
          </button>
        </div>
        <div class="ask-key-actions">
          <button
            v-if="ai?.configured"
            type="button"
            class="ask-text-button"
            @click="editingKey = false"
          >
            取消
          </button>
          <button
            v-if="ai?.configured"
            type="button"
            class="ask-text-button ask-danger"
            @click="clearKey"
          >
            <Trash2
              :size="14"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />
            清除 Key
          </button>
        </div>
        <p v-if="error" class="ask-error" role="alert">{{ error }}</p>
      </form>

      <template v-else>
        <div
          v-if="ai?.files.length"
          class="ask-files"
          title="文件内容仅在提问时发送给 DeepSeek"
        >
          <span
            v-for="file in visibleFiles"
            :key="file.id"
            class="ask-file"
            :title="file.name"
          >
            <FileTypeIcon :name="file.name" :size="13" />
            {{ file.name }}
          </span>
          <span v-if="extraFiles" class="ask-file">+{{ extraFiles }}</span>
        </div>

        <div ref="list" class="ask-messages" aria-live="polite">
          <article
            v-for="message in ai?.messages"
            :key="message.id"
            class="ask-bubble"
            :class="[message.role, { error: message.error }]"
          >
            {{ message.content }}
          </article>
          <div v-if="ai?.busy" class="ask-typing">正在回答…</div>
        </div>

        <form class="ask-composer" @submit.prevent="send">
          <textarea
            v-model="draft"
            class="ask-input"
            rows="1"
            placeholder="问点什么"
            aria-label="向智能问答提问"
            @keydown.enter.exact.prevent="send"
          ></textarea>
          <button
            type="submit"
            class="ask-send"
            :disabled="!draft.trim() || ai?.busy"
            aria-label="发送"
            title="发送"
          >
            <Send
              :size="17"
              :stroke-width="2"
              aria-hidden="true"
              focusable="false"
            />
          </button>
        </form>
        <p v-if="error" class="ask-error" role="alert">{{ error }}</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.ask-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.ask-surface {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.ask-icon-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
}
.ask-icon-button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.ask-setup {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  padding: 0 6px;
}
.ask-setup h2 {
  margin: 0;
  font-size: var(--font-size-section);
  font-weight: 650;
}
.ask-key-input {
  min-height: var(--tap-min);
  padding: 0 14px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.ask-key-input:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.ask-key-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.ask-text-button {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.ask-text-button:hover {
  background: transparent;
  color: var(--color-ink);
}
.ask-danger {
  color: var(--color-danger);
}
.ask-files {
  display: flex;
  gap: 6px;
  overflow: hidden;
  margin-bottom: 6px;
  flex: none;
}
.ask-file {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 132px;
  padding: 4px 9px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: var(--font-size-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ask-file svg {
  flex: none;
}
.ask-messages {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 2px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-line) transparent;
}
.ask-bubble {
  max-width: 88%;
  padding: 9px 12px;
  border-radius: 14px;
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--font-size-body);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ask-bubble.user {
  align-self: flex-end;
  background: var(--color-brand-soft);
  border-bottom-right-radius: 4px;
}
.ask-bubble.assistant {
  align-self: flex-start;
  border-bottom-left-radius: 4px;
}
.ask-bubble.error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.ask-typing {
  align-self: flex-start;
  padding: 2px 4px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  animation: ask-pulse 1.2s ease-in-out infinite;
}
.ask-composer {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--color-line);
}
.ask-input {
  flex: 1;
  min-height: 40px;
  max-height: 96px;
  padding: 9px 12px;
  border: 1px solid var(--color-line);
  border-radius: 14px;
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
  line-height: 1.4;
  resize: none;
}
.ask-input:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.ask-send {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  border: 1px solid var(--color-brand-ink);
  border-radius: 999px;
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.ask-send:hover:not(:disabled) {
  background: var(--color-brand);
  border-color: var(--color-brand);
}
.ask-send:disabled {
  background: var(--color-disabled-bg);
  border-color: var(--color-line);
  color: var(--color-muted);
  cursor: default;
}
.ask-error {
  margin: 8px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
}
@keyframes ask-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ask-typing {
    animation: none;
  }
}
</style>
