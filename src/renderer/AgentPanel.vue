<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  AlertTriangle,
  Folder,
  KeyRound,
  Plus,
  Send,
  Square,
  Trash2,
  Wrench,
  X,
} from '@lucide/vue'
import { agentModeLabels, type AgentMode } from '../shared/agent'
import {
  deepseekModelIds,
  deepseekModelLabels,
  type DeepSeekModel,
} from '../shared/deepseek'
import type { Command, Snapshot } from '../shared/protocol'
import SegmentedControl from './SegmentedControl.vue'
import SelectField from './SelectField.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

const agent = computed(() => props.state?.agent)
const configured = computed(() => agent.value?.configured === true)
const busy = computed(() => agent.value?.busy === true)
const draft = ref('')
const keyDraft = ref('')
const list = ref<HTMLElement>()
const mac = /Mac/i.test(navigator.platform)

const modeOptions = [
  { value: 'plan', label: agentModeLabels.plan },
  { value: 'build', label: agentModeLabels.build },
] as const
const mode = computed<AgentMode>(() => agent.value?.mode ?? 'build')
const model = computed<DeepSeekModel>(
  () => agent.value?.model ?? 'deepseek-flash',
)
const activeSession = computed(() =>
  agent.value?.sessions.find((item) => item.id === agent.value?.sessionId),
)
const title = computed(() => activeSession.value?.title ?? '新会话')
const workspace = computed(() => {
  const path = agent.value?.workspace
  if (!path) return '选择工作区'
  return path.split('/').filter(Boolean).pop() ?? path
})
const canSend = computed(
  () => Boolean(draft.value.trim()) && !busy.value && configured.value,
)
const usage = computed(() => agent.value?.usage ?? { input: 0, output: 0 })

function scrollToEnd(): void {
  void nextTick(() => {
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  })
}
watch(
  () => agent.value?.messages,
  scrollToEnd,
  { deep: true },
)

function send(): void {
  const prompt = draft.value.trim()
  if (!prompt || busy.value || !configured.value) return
  emit('command', { type: 'agent-send', prompt })
  draft.value = ''
}
function stop(): void {
  emit('command', { type: 'agent-cancel' })
}
function close(): void {
  emit('command', { type: 'agent-close' })
}
function newSession(): void {
  emit('command', { type: 'agent-session-new' })
}
function selectSession(id: string): void {
  emit('command', { type: 'agent-session-select', id })
}
function removeSession(id: string): void {
  if (!window.confirm('删除这个会话？')) return
  emit('command', { type: 'agent-session-delete', id })
}
function chooseWorkspace(): void {
  emit('command', { type: 'agent-workspace' })
}
function setMode(value: string | number): void {
  emit('command', { type: 'agent-mode', mode: value as AgentMode })
}
function setModel(value: string | number): void {
  emit('command', {
    type: 'agent-model',
    model: value as DeepSeekModel,
  })
}
function approve(id: string): void {
  emit('command', { type: 'agent-approve', id })
}
function deny(id: string): void {
  emit('command', { type: 'agent-deny', id })
}
function saveKey(): void {
  const apiKey = keyDraft.value.trim()
  if (!apiKey) return
  emit('command', { type: 'agent-config', apiKey })
  keyDraft.value = ''
}
function getKey(): void {
  emit('command', { type: 'agent-keys' })
}

function timeLabel(stamp: number): string {
  const diff = Date.now() - stamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  const date = new Date(stamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString())
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const statusLabels: Record<string, string> = {
  running: '执行中',
  awaiting: '待确认',
  done: '完成',
  error: '失败',
  denied: '已拒绝',
}
function statusLabel(status: string): string {
  return statusLabels[status] ?? status
}
</script>

<template>
  <main class="agent-shell" :class="{ 'is-mac': mac }">
    <section class="agent-surface">
      <aside class="agent-side">
        <div class="agent-side-head">
          <span class="agent-side-title">会话</span>
          <button
            type="button"
            class="agent-icon-button"
            aria-label="新建会话"
            title="新建会话"
            @click="newSession"
          >
            <Plus :size="16" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
        <div class="agent-sessions">
          <div
            v-for="session in agent?.sessions ?? []"
            :key="session.id"
            class="agent-session"
            :class="{ active: session.id === agent?.sessionId }"
            role="button"
            tabindex="0"
            :aria-current="session.id === agent?.sessionId"
            @click="selectSession(session.id)"
            @keydown.enter.prevent="selectSession(session.id)"
          >
            <span class="agent-session-text">{{ session.title }}</span>
            <span class="agent-session-time">{{
              timeLabel(session.updatedAt)
            }}</span>
            <button
              type="button"
              class="agent-session-delete"
              aria-label="删除会话"
              title="删除会话"
              @click.stop="removeSession(session.id)"
            >
              <Trash2 :size="12" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
          <p v-if="!(agent?.sessions ?? []).length" class="agent-side-empty">
            还没有会话
          </p>
        </div>
        <div class="agent-side-foot">
          <button
            type="button"
            class="agent-workspace"
            :title="agent?.workspace ?? '选择 shell 工作区'"
            @click="chooseWorkspace"
          >
            <Folder :size="14" :stroke-width="2" aria-hidden="true" />
            <span>{{ workspace }}</span>
          </button>
        </div>
      </aside>

      <section class="agent-main">
        <header class="agent-head">
          <h1 class="agent-title">{{ title }}</h1>
          <div class="agent-head-actions">
            <SegmentedControl
              :model-value="mode"
              :options="modeOptions"
              :disabled="busy"
              aria-label="执行模式"
              @update="setMode"
            />
            <SelectField
              :model-value="model"
              :disabled="busy"
              aria-label="对话模型"
              @update:model-value="setModel"
            >
              <option
                v-for="id in deepseekModelIds"
                :key="id"
                :value="id"
              >
                {{ deepseekModelLabels[id] }}
              </option>
            </SelectField>
            <button
              type="button"
              class="agent-icon-button"
              aria-label="关闭"
              title="关闭"
              @click="close"
            >
              <X :size="16" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div v-if="!configured" class="agent-setup">
          <h2>连接 DeepSeek</h2>
          <input
            v-model="keyDraft"
            class="agent-key-input"
            type="password"
            placeholder="API Key"
            aria-label="DeepSeek API Key"
            @keydown.enter.prevent="saveKey"
          />
          <div class="agent-setup-actions">
            <button
              type="button"
              class="agent-button primary"
              :disabled="!keyDraft.trim()"
              @click="saveKey"
            >
              保存
            </button>
            <button type="button" class="agent-text-button" @click="getKey">
              <KeyRound :size="14" :stroke-width="2" aria-hidden="true" />
              获取 API Key
            </button>
          </div>
          <p v-if="error || agent?.error" class="agent-error">
            {{ error || agent?.error }}
          </p>
        </div>

        <template v-else>
          <div ref="list" class="agent-messages">
            <div
              v-if="!(agent?.messages ?? []).length"
              class="agent-empty"
            >
              <p>问点什么，或者让我处理待办、文件、邮件和设置。</p>
            </div>
            <article
              v-for="message in agent?.messages ?? []"
              :key="message.id"
              class="agent-message"
              :class="message.role"
            >
              <template
                v-for="(part, index) in message.parts"
                :key="index"
              >
                <p v-if="part.type === 'text'" class="agent-text">
                  {{ part.text }}
                </p>
                <div
                  v-else
                  class="agent-tool"
                  :data-status="part.status"
                >
                  <div class="agent-tool-head">
                    <Wrench
                      :size="13"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <span class="agent-tool-title">{{ part.title }}</span>
                    <span class="agent-tool-status">{{
                      statusLabel(part.status)
                    }}</span>
                  </div>
                  <pre v-if="part.output" class="agent-tool-output">{{
                    part.output
                  }}</pre>
                </div>
              </template>
            </article>
            <p v-if="busy" class="agent-running">正在执行…</p>
          </div>

          <div v-if="agent?.approval" class="agent-approval">
            <div class="agent-approval-head">
              <AlertTriangle
                :size="15"
                :stroke-width="2"
                aria-hidden="true"
              />
              <span>需要确认</span>
              <span class="agent-approval-reason">{{
                agent.approval.reason
              }}</span>
            </div>
            <p class="agent-approval-title">
              {{ agent.approval.title }}
            </p>
            <pre class="agent-approval-args">{{ agent.approval.args }}</pre>
            <div class="agent-approval-actions">
              <button
                type="button"
                class="agent-button"
                @click="deny(agent.approval.id)"
              >
                拒绝
              </button>
              <button
                type="button"
                class="agent-button primary"
                @click="approve(agent.approval.id)"
              >
                批准
              </button>
            </div>
          </div>

          <form class="agent-composer" @submit.prevent="send">
            <textarea
              v-model="draft"
              class="agent-input"
              rows="1"
              placeholder="交给智能体一条指令"
              aria-label="给智能体发送指令"
              @keydown.enter.exact.prevent="send"
            ></textarea>
            <button
              v-if="busy"
              type="button"
              class="agent-send stop"
              aria-label="停止"
              title="停止"
              @click="stop"
            >
              <Square :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
            <button
              v-else
              type="submit"
              class="agent-send"
              :disabled="!canSend"
              aria-label="发送"
              title="发送"
            >
              <Send :size="16" :stroke-width="2" aria-hidden="true" />
            </button>
          </form>
          <div class="agent-foot">
            <span class="agent-usage">
              {{ usage.input }} / {{ usage.output }} tokens
            </span>
            <p v-if="error || agent?.error" class="agent-error">
              {{ error || agent?.error }}
            </p>
          </div>
        </template>
      </section>
    </section>
  </main>
</template>

<style scoped>
.agent-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.agent-surface {
  display: flex;
  height: 100%;
  overflow: hidden;
  border-radius: var(--radius-sheet);
  background: var(--color-canvas);
  box-shadow: var(--mqmz-panel-shadow);
}
.agent-side {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 216px;
  min-width: 0;
  border-right: 1px solid var(--color-line);
  background: var(--color-surface-muted);
}
.agent-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 var(--space-4) 0 var(--space-6);
  -webkit-app-region: drag;
}
.agent-shell.is-mac .agent-side-head {
  height: 60px;
  align-items: flex-end;
  padding-bottom: var(--space-3);
}
.agent-side-head button {
  -webkit-app-region: no-drag;
}
.agent-side-title {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 600;
  letter-spacing: 0.02em;
}
.agent-sessions {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 var(--space-3) var(--space-3);
}
.agent-session {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.agent-session:hover {
  background: var(--color-surface);
}
.agent-session.active {
  background: var(--color-brand-soft);
}
.agent-session:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -2px;
}
.agent-session-text {
  overflow: hidden;
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-session-time {
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
}
.agent-session-delete {
  position: absolute;
  top: 50%;
  right: var(--space-2);
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-subtle);
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.agent-session:hover .agent-session-delete,
.agent-session-delete:focus-visible {
  opacity: 1;
}
.agent-session-delete:hover {
  background: var(--color-surface);
  color: var(--color-danger);
}
.agent-side-empty {
  margin: var(--space-8) 0;
  color: var(--color-subtle);
  font-size: var(--font-size-label);
  text-align: center;
}
.agent-side-foot {
  flex: none;
  padding: var(--space-3);
  border-top: 1px solid var(--color-line);
}
.agent-workspace {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 30px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-workspace span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}
.agent-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.agent-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-4);
  height: 52px;
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-line);
  -webkit-app-region: drag;
}
.agent-head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  -webkit-app-region: no-drag;
}
.agent-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: var(--font-size-section);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-messages {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-5);
  min-height: 0;
  padding: var(--space-6) var(--space-8);
  overflow: auto;
  user-select: text;
}
.agent-empty {
  margin: auto;
  color: var(--color-subtle);
  font-size: var(--font-size-body);
  text-align: center;
}
.agent-empty p {
  margin: 0;
}
.agent-message {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.agent-message.user {
  align-items: flex-end;
}
.agent-text {
  margin: 0;
  font-size: var(--font-size-body);
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.agent-message.user .agent-text {
  max-width: 84%;
  padding: 8px 12px;
  border-radius: var(--radius-card) var(--radius-card) var(--radius-xs)
    var(--radius-card);
  background: var(--color-brand-soft);
}
.agent-tool {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
}
.agent-tool-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 7px 10px;
  color: var(--color-muted);
}
.agent-tool-title {
  flex: 1;
  overflow: hidden;
  color: var(--color-ink);
  font-size: var(--font-size-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-tool-status {
  flex: none;
  font-size: var(--font-size-caption);
}
.agent-tool[data-status='running'] .agent-tool-status,
.agent-tool[data-status='awaiting'] .agent-tool-status {
  color: var(--color-brand-ink);
}
.agent-tool[data-status='done'] .agent-tool-status {
  color: var(--color-success);
}
.agent-tool[data-status='error'] .agent-tool-status {
  color: var(--color-danger);
}
.agent-tool[data-status='denied'] .agent-tool-status {
  color: var(--color-subtle);
}
.agent-tool-output {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid var(--color-line);
  color: var(--color-ink);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--font-size-caption);
  line-height: 1.55;
  max-height: 240px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.agent-running {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  animation: agent-pulse 1.2s ease-in-out infinite;
}
.agent-approval {
  flex: none;
  margin: var(--space-3) var(--space-8) 0;
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-card);
  background: var(--color-warning-soft);
  user-select: text;
}
.agent-approval-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-warning);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.agent-approval-reason {
  margin-left: auto;
  color: var(--color-muted);
  font-weight: 400;
}
.agent-approval-title {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-body);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.agent-approval-args {
  margin: var(--space-2) 0 0;
  max-height: 140px;
  overflow: auto;
  color: var(--color-muted);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--font-size-caption);
  line-height: 1.5;
  white-space: pre-wrap;
}
.agent-approval-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.agent-composer {
  display: flex;
  flex: none;
  align-items: flex-end;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-8) var(--space-3);
}
.agent-input {
  flex: 1;
  min-height: 40px;
  max-height: 140px;
  padding: 9px 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
  line-height: 1.5;
  resize: none;
}
.agent-input:focus-visible,
.agent-key-input:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-send {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--color-brand-ink);
  border-radius: var(--radius-circle);
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}
.agent-send:hover:not(:disabled) {
  border-color: var(--color-brand);
  background: var(--color-brand);
}
.agent-send:disabled {
  border-color: var(--color-line);
  background: var(--color-disabled-bg);
  color: var(--color-muted);
  cursor: default;
}
.agent-send.stop {
  border-color: var(--color-line);
  background: var(--color-surface);
  color: var(--color-ink);
}
.agent-send.stop:hover {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.agent-foot {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  min-height: 22px;
  padding: 0 var(--space-8) var(--space-4);
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
}
.agent-usage {
  flex: none;
}
.agent-error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
  text-align: right;
  overflow-wrap: anywhere;
}
.agent-icon-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-circle);
  background: transparent;
  color: var(--color-muted);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-icon-button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-icon-button:focus-visible,
.agent-button:focus-visible,
.agent-text-button:focus-visible,
.agent-session-delete:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.agent-button {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.agent-button:hover:not(:disabled) {
  border-color: var(--color-brand);
}
.agent-button.primary {
  border-color: transparent;
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.agent-button.primary:hover:not(:disabled) {
  border-color: var(--color-brand);
  background: var(--color-brand);
}
.agent-button:disabled {
  border-color: var(--color-line);
  background: var(--color-disabled-bg);
  color: var(--color-muted);
  cursor: default;
}
.agent-text-button {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 32px;
  padding: 0 var(--space-2);
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.agent-text-button:hover {
  color: var(--color-ink);
}
.agent-setup {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-4);
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 0 var(--space-8);
}
.agent-setup h2 {
  margin: 0;
  font-size: var(--font-size-section);
  font-weight: 650;
}
.agent-key-input {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.agent-setup-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.agent-setup-actions .agent-button {
  flex: 1;
}
@keyframes agent-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .agent-running {
    animation: none;
  }
  .agent-session,
  .agent-session-delete,
  .agent-send {
    transition: none;
  }
}
</style>
