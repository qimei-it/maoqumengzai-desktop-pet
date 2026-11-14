<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Inbox,
  KeyRound,
  Plus,
  Send,
  Square,
  Trash2,
  Wrench,
  X,
} from '@lucide/vue'
import {
  agentModeLabels,
  type AgentMode,
  type AgentSessionSummary,
} from '../shared/agent'
import {
  deepseekModelIds,
  deepseekModelLabels,
  type DeepSeekModel,
} from '../shared/deepseek'
import type { Command, Snapshot } from '../shared/protocol'
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
const collapsed = ref<Record<string, boolean>>({})

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
  return groupName(path)
})
const canSend = computed(
  () => Boolean(draft.value.trim()) && !busy.value && configured.value,
)
const usage = computed(() => agent.value?.usage ?? { input: 0, output: 0 })

function groupName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

const projectGroups = computed(() => {
  const groups = new Map<string, AgentSessionSummary[]>()
  for (const session of agent.value?.sessions ?? []) {
    if (!session.workspace) continue
    const list = groups.get(session.workspace) ?? []
    list.push(session)
    groups.set(session.workspace, list)
  }
  return [...groups.entries()]
    .map(([path, sessions]) => ({
      path,
      name: groupName(path),
      sessions,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
})

const ungrouped = computed(() =>
  (agent.value?.sessions ?? []).filter((session) => !session.workspace),
)

function isOpen(path: string): boolean {
  return !collapsed.value[path]
}
function toggleGroup(path: string): void {
  collapsed.value = {
    ...collapsed.value,
    [path]: isOpen(path),
  }
}

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
function newSessionIn(path: string): void {
  emit('command', { type: 'agent-project-new', workspace: path })
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
function setMode(value: AgentMode): void {
  if (mode.value === value) return
  emit('command', { type: 'agent-mode', mode: value })
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

        <div class="agent-side-scroll">
          <section class="agent-section">
            <div class="agent-section-head">
              <Folder :size="12" :stroke-width="2" aria-hidden="true" />
              <span>项目</span>
            </div>

            <div
              v-for="group in projectGroups"
              :key="group.path"
              class="agent-project"
            >
              <div class="agent-project-row" :title="group.path">
                <button
                  type="button"
                  class="agent-project-toggle"
                  :aria-expanded="isOpen(group.path)"
                  @click="toggleGroup(group.path)"
                >
                  <ChevronDown
                    v-if="isOpen(group.path)"
                    :size="12"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <ChevronRight
                    v-else
                    :size="12"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <FolderOpen
                    v-if="isOpen(group.path)"
                    :size="14"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <Folder
                    v-else
                    :size="14"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <span class="agent-project-name">{{ group.name }}</span>
                </button>
                <button
                  type="button"
                  class="agent-project-new"
                  :aria-label="`在${group.name}中新建会话`"
                  title="新建会话"
                  @click="newSessionIn(group.path)"
                >
                  <Plus :size="13" :stroke-width="2" aria-hidden="true" />
                </button>
              </div>

              <div v-if="isOpen(group.path)" class="agent-project-sessions">
                <div
                  v-for="session in group.sessions"
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
                    <Trash2
                      :size="12"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            </div>

            <p v-if="!projectGroups.length" class="agent-side-empty">
              还没有项目
            </p>
          </section>

          <section class="agent-section">
            <div class="agent-section-head">
              <Inbox :size="12" :stroke-width="2" aria-hidden="true" />
              <span>未分组</span>
            </div>
            <div
              v-for="session in ungrouped"
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
            <p v-if="!ungrouped.length" class="agent-side-empty">
              没有未分组会话
            </p>
          </section>
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
          <button
            v-if="!mac"
            type="button"
            class="agent-icon-button"
            aria-label="关闭"
            title="关闭"
            @click="close"
          >
            <X :size="15" :stroke-width="2" aria-hidden="true" />
          </button>
        </header>

        <template v-if="!configured">
          <div class="agent-setup">
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
        </template>

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

          <div class="agent-composer-wrap">
            <form class="agent-composer" @submit.prevent="send">
              <textarea
                v-model="draft"
                class="agent-input"
                rows="1"
                placeholder="交给智能体一条指令"
                aria-label="给智能体发送指令"
                @keydown.enter.exact.prevent="send"
              ></textarea>
              <div class="agent-composer-row">
                <div class="agent-modes" role="group" aria-label="执行模式">
                  <button
                    type="button"
                    :disabled="busy"
                    :class="{ active: mode === 'plan' }"
                    :aria-pressed="mode === 'plan'"
                    @click="setMode('plan')"
                  >
                    {{ agentModeLabels.plan }}
                  </button>
                  <button
                    type="button"
                    :disabled="busy"
                    :class="{ active: mode === 'build' }"
                    :aria-pressed="mode === 'build'"
                    @click="setMode('build')"
                  >
                    {{ agentModeLabels.build }}
                  </button>
                </div>

                <div class="agent-composer-trailing">
                  <span class="agent-model">
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
                  </span>
                  <button
                    v-if="busy"
                    type="button"
                    class="agent-send stop"
                    aria-label="停止"
                    title="停止"
                    @click="stop"
                  >
                    <Square
                      :size="13"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    v-else
                    type="submit"
                    class="agent-send"
                    :disabled="!canSend"
                    aria-label="发送"
                    title="发送"
                  >
                    <Send
                      :size="15"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            </form>
            <div class="agent-composer-meta">
              <span class="agent-usage">
                {{ usage.input }} / {{ usage.output }} tokens
              </span>
              <p v-if="error || agent?.error" class="agent-error">
                {{ error || agent?.error }}
              </p>
            </div>
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
  width: 224px;
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
}
.agent-side-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 var(--space-3) var(--space-4);
}
.agent-section + .agent-section {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-line);
}
.agent-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
  font-weight: 600;
}
.agent-project {
  margin-top: var(--space-1);
}
.agent-project-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  border-radius: var(--radius-control);
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.agent-project-row:hover {
  background: var(--color-surface);
}
.agent-project-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  min-height: 30px;
  padding: 0 var(--space-2) 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  text-align: left;
}
.agent-project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-project-new {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-right: var(--space-1);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-subtle);
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.agent-project-row:hover .agent-project-new,
.agent-project-new:focus-visible {
  opacity: 1;
}
.agent-project-new:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-project-sessions {
  padding: 2px 0 2px var(--space-5);
}
.agent-session {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: var(--space-2) var(--space-3);
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
.agent-session:focus-visible,
.agent-project-toggle:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -2px;
}
.agent-session-text {
  overflow: hidden;
  padding-right: 18px;
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 500;
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
  margin: var(--space-2) 0 var(--space-2);
  padding: 0 var(--space-3);
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
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
  height: 48px;
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-line);
  -webkit-app-region: drag;
}
.agent-head button {
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
  padding: var(--space-6) var(--space-8) var(--space-4);
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
  max-height: 200px;
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
  margin: 0 var(--space-8) var(--space-2);
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
.agent-composer-wrap {
  flex: none;
  padding: var(--space-3) var(--space-8) var(--space-5);
}
.agent-composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 10px 10px 8px 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-stage);
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}
.agent-composer:focus-within {
  border-color: var(--color-brand);
}
.agent-input {
  width: 100%;
  min-height: 44px;
  max-height: 140px;
  padding: 2px 2px 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
  line-height: 1.55;
  resize: none;
  outline: none;
}
.agent-composer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
}
.agent-modes {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.agent-modes button {
  min-height: 24px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: calc(var(--radius-control) - 2px);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 500;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-modes button:disabled {
  cursor: default;
  opacity: 0.6;
}
.agent-modes button.active {
  background: var(--color-surface);
  color: var(--color-brand-ink);
  font-weight: 600;
  box-shadow: var(--shadow-control);
}
.agent-modes button:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -1px;
}
.agent-composer-trailing {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.agent-model {
  display: inline-flex;
  min-width: 0;
}
.agent-model :deep(select) {
  height: 28px;
  padding: 0 24px 0 8px;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.agent-model :deep(.select-field-icon) {
  right: 6px;
  color: var(--color-muted);
}
.agent-send {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
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
.agent-composer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  min-height: 18px;
  padding: var(--space-2) var(--space-2) 0;
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
.agent-text-button:focus-visible {
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
.agent-key-input:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
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
  .agent-project-row,
  .agent-project-new,
  .agent-composer,
  .agent-modes button,
  .agent-send,
  .agent-icon-button {
    transition: none;
  }
}
</style>
