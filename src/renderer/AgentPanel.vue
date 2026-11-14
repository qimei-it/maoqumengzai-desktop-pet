<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Ellipsis,
  Folder,
  FolderClosed,
  FolderInput,
  FolderOpen,
  FolderPlus,
  KeyRound,
  MessageCirclePlus,
  Minus,
  PenLine,
  Pin,
  Send,
  Settings,
  Square,
  Trash2,
  Wrench,
  X,
} from '@lucide/vue'
import {
  agentModeLabels,
  type AgentMode,
  type AgentProjectView,
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

type MenuState =
  | { kind: 'project'; id: string; x: number; y: number }
  | { kind: 'session'; id: string; x: number; y: number }

type DialogState =
  | { kind: 'create-project' }
  | { kind: 'edit-project'; id: string }
  | { kind: 'rename-session'; id: string }
  | { kind: 'move-session'; id: string }

const agent = computed(() => props.state?.agent)
const configured = computed(() => agent.value?.configured === true)
const busy = computed(() => agent.value?.busy === true)
const draft = ref('')
const keyDraft = ref('')
const list = ref<HTMLElement>()
const mac = /Mac/i.test(navigator.platform)
const maximized = computed(() => props.state?.agentMaximized === true)

const projects = computed(() => agent.value?.projects ?? [])
const sessions = computed(() => agent.value?.sessions ?? [])
const projectsOpen = ref(true)
const ungroupedOpen = ref(true)
const expanded = ref<Record<string, boolean>>({})
const menu = ref<MenuState | null>(null)
const dialog = ref<DialogState | null>(null)
const draftName = ref('')
const draftWorkspace = ref('')
const dialogInput = ref<HTMLInputElement>()
const dialogError = ref('')

const mode = computed<AgentMode>(() => agent.value?.mode ?? 'build')
const model = computed<DeepSeekModel>(
  () => agent.value?.model ?? 'deepseek-flash',
)
const activeSession = computed(() =>
  sessions.value.find((item) => item.id === agent.value?.sessionId),
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

const ungrouped = computed(() => sortSessions(
  sessions.value.filter((session) => !session.projectId),
))

const menuProject = computed(() =>
  menu.value?.kind === 'project'
    ? projects.value.find((item) => item.id === menu.value?.id)
    : undefined,
)
const menuSession = computed(() =>
  menu.value?.kind === 'session'
    ? sessions.value.find((item) => item.id === menu.value?.id)
    : undefined,
)
const editProject = computed(() => {
  const state = dialog.value
  if (state?.kind !== 'edit-project') return undefined
  return projects.value.find((item) => item.id === state.id)
})
const renameSession = computed(() => {
  const state = dialog.value
  if (state?.kind !== 'rename-session') return undefined
  return sessions.value.find((item) => item.id === state.id)
})
const moveSession = computed(() => {
  const state = dialog.value
  if (state?.kind !== 'move-session') return undefined
  return sessions.value.find((item) => item.id === state.id)
})

function groupName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function sortSessions(list: AgentSessionSummary[]): AgentSessionSummary[] {
  return [...list].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      right.updatedAt - left.updatedAt,
  )
}

function projectSessions(projectId: string): AgentSessionSummary[] {
  return sortSessions(
    sessions.value.filter((session) => session.projectId === projectId),
  )
}

function isProjectOpen(id: string): boolean {
  return expanded.value[id] === true
}
function toggleProject(id: string): void {
  expanded.value = {
    ...expanded.value,
    [id]: !isProjectOpen(id),
  }
}

watch(
  () => agent.value?.sessionId,
  () => {
    const session = activeSession.value
    if (session?.projectId)
      expanded.value = {
        ...expanded.value,
        [session.projectId]: true,
      }
  },
  { immediate: true },
)

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
function windowAction(action: 'minimize' | 'maximize' | 'close'): void {
  emit('command', { type: 'panel-control', action })
}
/** Snapshot the state before the native drag region may zoom the window. */
let headerPressMaximized = false
function onHeaderMouseDown(): void {
  headerPressMaximized = maximized.value
}
function onHeaderDoubleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('button')) return
  const before = headerPressMaximized
  window.setTimeout(() => {
    if (maximized.value !== before) return
    emit('command', { type: 'panel-control', action: 'maximize' })
  }, 220)
}

function newSession(): void {
  emit('command', { type: 'agent-session-new' })
}
function newChatIn(projectId: string): void {
  emit('command', { type: 'agent-project-new', projectId })
}
function selectSession(id: string): void {
  emit('command', { type: 'agent-session-select', id })
}
function removeSession(id: string): void {
  if (!window.confirm('删除这个对话？')) return
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

function openMenu(
  kind: 'project' | 'session',
  id: string,
  event: MouseEvent,
): void {
  event.stopPropagation()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = {
    kind,
    id,
    x: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 190)),
    y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 228)),
  }
}
function closeMenu(): void {
  menu.value = null
}

function openCreateProject(): void {
  draftName.value = ''
  draftWorkspace.value = ''
  dialogError.value = ''
  dialog.value = { kind: 'create-project' }
  focusDialogInput()
}
function openEditProject(id: string): void {
  const project = projects.value.find((item) => item.id === id)
  if (!project) return
  draftName.value = project.name
  draftWorkspace.value = project.workspace
  dialogError.value = ''
  dialog.value = { kind: 'edit-project', id }
  focusDialogInput()
}
function openRenameSession(id: string): void {
  const session = sessions.value.find((item) => item.id === id)
  if (!session) return
  draftName.value = session.title
  dialogError.value = ''
  dialog.value = { kind: 'rename-session', id }
  focusDialogInput()
}
function openMoveSession(id: string): void {
  dialogError.value = ''
  dialog.value = { kind: 'move-session', id }
}
function focusDialogInput(): void {
  void nextTick(() => {
    dialogInput.value?.focus()
    dialogInput.value?.select()
  })
}
function closeDialog(): void {
  dialog.value = null
  dialogError.value = ''
}
async function runDialogCommand(command: Command): Promise<boolean> {
  const api = window.mqmz
  if (!api) {
    emit('command', command)
    return true
  }
  const result = await api.command(command)
  if (!result.ok) {
    dialogError.value = result.error
    return false
  }
  return true
}
async function pickFolder(): Promise<void> {
  const result = await window.mqmz?.pickDirectory()
  if (!result) return
  if (!result.ok) {
    dialogError.value = result.error
    return
  }
  if (result.value) draftWorkspace.value = result.value
}
async function createProject(): Promise<void> {
  const name = draftName.value.trim()
  const path = draftWorkspace.value.trim()
  if (!name || !path) return
  const saved = await runDialogCommand({
    type: 'agent-project-create',
    name,
    workspace: path,
  })
  if (saved) closeDialog()
}
async function saveProject(): Promise<void> {
  if (dialog.value?.kind !== 'edit-project') return
  const project = editProject.value
  if (!project) return
  const name = draftName.value.trim()
  const path = draftWorkspace.value.trim()
  if (!name || !path) return
  const saved = await runDialogCommand({
    type: 'agent-project-update',
    id: project.id,
    ...(name !== project.name ? { name } : {}),
    ...(path !== project.workspace ? { workspace: path } : {}),
  })
  if (saved) closeDialog()
}
async function removeProject(): Promise<void> {
  if (dialog.value?.kind !== 'edit-project') return
  const project = editProject.value
  if (!project) return
  if (!window.confirm('移除这个项目？项目下的对话会移动到未分组。')) return
  const removed = await runDialogCommand({
    type: 'agent-project-delete',
    id: project.id,
  })
  if (removed) closeDialog()
}
function toggleProjectPin(project: AgentProjectView): void {
  emit('command', {
    type: 'agent-project-pin',
    id: project.id,
    pinned: !project.pinned,
  })
  closeMenu()
}
function revealProject(project: AgentProjectView): void {
  emit('command', { type: 'agent-project-reveal', id: project.id })
  closeMenu()
}
function editProjectFromMenu(project: AgentProjectView): void {
  closeMenu()
  openEditProject(project.id)
}
function deleteProjectFromMenu(project: AgentProjectView): void {
  closeMenu()
  if (!window.confirm('移除这个项目？项目下的对话会移动到未分组。')) return
  emit('command', { type: 'agent-project-delete', id: project.id })
}
function renameFromMenu(session: AgentSessionSummary): void {
  closeMenu()
  openRenameSession(session.id)
}
function toggleSessionPin(session: AgentSessionSummary): void {
  emit('command', {
    type: 'agent-session-pin',
    id: session.id,
    pinned: !session.pinned,
  })
  closeMenu()
}
function moveFromMenu(session: AgentSessionSummary): void {
  closeMenu()
  openMoveSession(session.id)
}
async function saveRename(): Promise<void> {
  if (dialog.value?.kind !== 'rename-session') return
  const name = draftName.value.trim()
  if (!name) return
  const saved = await runDialogCommand({
    type: 'agent-session-rename',
    id: dialog.value.id,
    title: name,
  })
  if (saved) closeDialog()
}
async function moveTo(projectId: string | null): Promise<void> {
  if (dialog.value?.kind !== 'move-session') return
  const moved = await runDialogCommand({
    type: 'agent-session-move',
    id: dialog.value.id,
    projectId,
  })
  if (moved) closeDialog()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (menu.value) menu.value = null
  else if (dialog.value) dialog.value = null
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

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
  <main
    class="agent-shell"
    :class="{ 'is-mac': mac, 'is-maximized': maximized }"
  >
    <section class="agent-surface">
      <aside class="agent-side">
        <div
          class="agent-side-head"
          @mousedown="onHeaderMouseDown"
          @dblclick="onHeaderDoubleClick"
        ></div>

        <div class="agent-side-scroll">
          <button type="button" class="agent-new-chat" @click="newSession">
            <MessageCirclePlus
              :size="16"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span>新建对话</span>
          </button>

          <section class="agent-section">
            <div class="agent-section-head">
              <button
                type="button"
                class="agent-section-title"
                :aria-expanded="projectsOpen"
                @click="projectsOpen = !projectsOpen"
              >
                <span>项目</span>
                <ChevronDown
                  v-if="projectsOpen"
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
              </button>
              <button
                type="button"
                class="agent-section-action"
                aria-label="添加项目"
                title="添加项目"
                @click="openCreateProject"
              >
                <FolderPlus
                  :size="15"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div v-if="projectsOpen">
              <div
                v-for="project in projects"
                :key="project.id"
                class="agent-project"
              >
                <div
                  class="agent-project-row"
                  :title="project.workspace"
                  @click="toggleProject(project.id)"
                >
                  <FolderOpen
                    v-if="isProjectOpen(project.id)"
                    :size="15"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <FolderClosed
                    v-else
                    :size="15"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <span class="agent-project-name">{{ project.name }}</span>
                  <Pin
                    v-if="project.pinned"
                    class="agent-pin"
                    :size="11"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <span class="agent-row-actions">
                    <button
                      type="button"
                      class="agent-row-button"
                      aria-label="项目菜单"
                      title="项目菜单"
                      @click.stop="
                        openMenu('project', project.id, $event)
                      "
                    >
                      <Ellipsis
                        :size="15"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      class="agent-row-button"
                      :aria-label="`在${project.name}中新建对话`"
                      title="新建对话"
                      @click.stop="newChatIn(project.id)"
                    >
                      <MessageCirclePlus
                        :size="15"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                    </button>
                  </span>
                </div>

                <div
                  v-if="isProjectOpen(project.id)"
                  class="agent-project-sessions"
                >
                  <p
                    v-if="!projectSessions(project.id).length"
                    class="agent-session-empty"
                  >
                    暂无对话
                  </p>
                  <div
                    v-for="session in projectSessions(project.id)"
                    :key="session.id"
                    class="agent-session"
                    :class="{ active: session.id === agent?.sessionId }"
                    role="button"
                    tabindex="0"
                    :aria-current="session.id === agent?.sessionId"
                    @click="selectSession(session.id)"
                    @keydown.enter.prevent="selectSession(session.id)"
                  >
                    <Pin
                      v-if="session.pinned"
                      class="agent-pin"
                      :size="11"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <span class="agent-session-text">{{
                      session.title
                    }}</span>
                    <button
                      type="button"
                      class="agent-row-button session-menu"
                      aria-label="对话菜单"
                      title="对话菜单"
                      @click.stop="
                        openMenu('session', session.id, $event)
                      "
                    >
                      <Ellipsis
                        :size="15"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>
              </div>

              <p v-if="!projects.length" class="agent-side-empty">
                暂无项目
              </p>
            </div>
          </section>

          <section class="agent-section">
            <div class="agent-section-head">
              <button
                type="button"
                class="agent-section-title"
                :aria-expanded="ungroupedOpen"
                @click="ungroupedOpen = !ungroupedOpen"
              >
                <span>未分组</span>
                <ChevronDown
                  v-if="ungroupedOpen"
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
              </button>
              <button
                type="button"
                class="agent-section-action"
                aria-label="新建对话"
                title="新建对话"
                @click="newSession"
              >
                <MessageCirclePlus
                  :size="15"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div v-if="ungroupedOpen">
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
                <Pin
                  v-if="session.pinned"
                  class="agent-pin"
                  :size="11"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <span class="agent-session-text">{{ session.title }}</span>
                <button
                  type="button"
                  class="agent-row-button session-menu"
                  aria-label="对话菜单"
                  title="对话菜单"
                  @click.stop="openMenu('session', session.id, $event)"
                >
                  <Ellipsis
                    :size="15"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <p v-if="!ungrouped.length" class="agent-side-empty">
                暂无对话
              </p>
            </div>
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
        <header
          class="agent-head"
          @mousedown="onHeaderMouseDown"
          @dblclick="onHeaderDoubleClick"
        >
          <h1 class="agent-title">{{ title }}</h1>
          <div v-if="!mac" class="agent-window-controls">
            <button
              type="button"
              class="agent-window-button"
              aria-label="最小化"
              title="最小化"
              @click="windowAction('minimize')"
            >
              <Minus :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="agent-window-button"
              :aria-label="maximized ? '还原' : '最大化'"
              :title="maximized ? '还原' : '最大化'"
              @click="windowAction('maximize')"
            >
              <Copy
                v-if="maximized"
                :size="12"
                :stroke-width="2"
                aria-hidden="true"
              />
              <Square
                v-else
                :size="12"
                :stroke-width="2"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="agent-window-button close"
              aria-label="关闭"
              title="关闭"
              @click="windowAction('close')"
            >
              <X :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
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

    <div
      v-if="menu"
      class="agent-menu-layer"
      @mousedown.self="closeMenu"
    >
      <div
        class="agent-menu"
        role="menu"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      >
        <template v-if="menuProject">
          <button
            type="button"
            class="agent-menu-item"
            role="menuitem"
            @click="toggleProjectPin(menuProject)"
          >
            <Pin :size="14" :stroke-width="2" aria-hidden="true" />
            {{ menuProject.pinned ? '取消置顶' : '置顶' }}
          </button>
          <button
            type="button"
            class="agent-menu-item"
            role="menuitem"
            @click="editProjectFromMenu(menuProject)"
          >
            <Settings :size="14" :stroke-width="2" aria-hidden="true" />
            编辑
          </button>
          <button
            type="button"
            class="agent-menu-item"
            role="menuitem"
            @click="revealProject(menuProject)"
          >
            <FolderOpen :size="14" :stroke-width="2" aria-hidden="true" />
            {{ mac ? '在 Finder 中打开' : '在资源管理器中打开' }}
          </button>
          <button
            type="button"
            class="agent-menu-item danger"
            role="menuitem"
            @click="deleteProjectFromMenu(menuProject)"
          >
            <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
            删除
          </button>
        </template>

        <template v-else-if="menuSession">
          <button
            type="button"
            class="agent-menu-item"
            role="menuitem"
            @click="renameFromMenu(menuSession)"
          >
            <PenLine :size="14" :stroke-width="2" aria-hidden="true" />
            重命名
          </button>
          <button
            type="button"
            class="agent-menu-item"
            role="menuitem"
            @click="toggleSessionPin(menuSession)"
          >
            <Pin :size="14" :stroke-width="2" aria-hidden="true" />
            {{ menuSession.pinned ? '取消置顶' : '置顶' }}
          </button>
          <button
            type="button"
            class="agent-menu-item"
            role="menuitem"
            @click="moveFromMenu(menuSession)"
          >
            <FolderInput :size="14" :stroke-width="2" aria-hidden="true" />
            移动
          </button>
          <button
            type="button"
            class="agent-menu-item danger"
            role="menuitem"
            @click="
              closeMenu();
              removeSession(menuSession.id)
            "
          >
            <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
            删除
          </button>
        </template>
      </div>
    </div>

    <div
      v-if="dialog"
      class="agent-modal-layer"
      @mousedown.self="closeDialog"
    >
      <div
        class="agent-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="
          dialog.kind === 'create-project'
            ? '创建项目'
            : dialog.kind === 'edit-project'
              ? '编辑项目'
              : dialog.kind === 'rename-session'
                ? '重命名对话'
                : '移动对话'
        "
      >
        <header class="agent-modal-head">
          <h2>
            {{
              dialog.kind === 'create-project'
                ? '创建项目'
                : dialog.kind === 'edit-project'
                  ? '编辑项目'
                  : dialog.kind === 'rename-session'
                    ? '重命名对话'
                    : '移动对话'
            }}
          </h2>
          <button
            type="button"
            class="agent-icon-button"
            aria-label="关闭"
            title="关闭"
            @click="closeDialog"
          >
            <X :size="15" :stroke-width="2" aria-hidden="true" />
          </button>
        </header>

        <template v-if="dialog.kind === 'move-session'">
          <div class="agent-move-list">
            <button
              type="button"
              class="agent-move-row"
              :class="{ active: !moveSession?.projectId }"
              @click="moveTo(null)"
            >
              <Folder :size="15" :stroke-width="2" aria-hidden="true" />
              <span>未分组</span>
            </button>
            <button
              v-for="project in projects"
              :key="project.id"
              type="button"
              class="agent-move-row"
              :class="{ active: moveSession?.projectId === project.id }"
              @click="moveTo(project.id)"
            >
              <Folder
                :size="15"
                :stroke-width="2"
                aria-hidden="true"
              />
              <span>{{ project.name }}</span>
            </button>
            <p v-if="!projects.length" class="agent-side-empty">
              暂无项目
            </p>
          </div>
        </template>

        <template v-else>
          <label class="agent-field">
            <PenLine
              v-if="dialog.kind === 'rename-session'"
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
            />
            <Folder
              v-else
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
            />
            <input
              ref="dialogInput"
              v-model="draftName"
              :placeholder="
                dialog.kind === 'rename-session'
                  ? '对话名称'
                  : '项目名称'
              "
              :aria-label="
                dialog.kind === 'rename-session'
                  ? '对话名称'
                  : '项目名称'
              "
              @keydown.enter.prevent="
                dialog.kind === 'create-project'
                  ? createProject()
                  : dialog.kind === 'edit-project'
                    ? saveProject()
                    : saveRename()
              "
            />
          </label>

          <template v-if="dialog.kind !== 'rename-session'">
            <p class="agent-modal-label">源文件夹</p>
            <div class="agent-folder-row">
              <Folder :size="15" :stroke-width="2" aria-hidden="true" />
              <span class="agent-folder-path">{{
                draftWorkspace || '尚未选择文件夹'
              }}</span>
              <button
                type="button"
                class="agent-text-button"
                @click="pickFolder"
              >
                选择
              </button>
            </div>
          </template>

          <p v-if="dialogError" class="agent-error agent-dialog-error">
            {{ dialogError }}
          </p>

          <footer class="agent-modal-foot">
            <button
              v-if="dialog.kind === 'edit-project'"
              type="button"
              class="agent-button danger"
              @click="removeProject"
            >
              移除本地项目
            </button>
            <span class="agent-modal-spacer" />
            <button
              type="button"
              class="agent-button"
              @click="closeDialog"
            >
              取消
            </button>
            <button
              v-if="dialog.kind === 'rename-session'"
              type="button"
              class="agent-button primary"
              :disabled="!draftName.trim()"
              @click="saveRename"
            >
              保存
            </button>
            <button
              v-else
              type="button"
              class="agent-button primary"
              :disabled="!draftName.trim() || !draftWorkspace.trim()"
              @click="
                dialog.kind === 'create-project'
                  ? createProject()
                  : saveProject()
              "
            >
              {{ dialog.kind === 'create-project' ? '创建项目' : '保存' }}
            </button>
          </footer>
        </template>
      </div>
    </div>
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
.agent-shell.is-maximized {
  padding: 0;
}
.agent-shell.is-maximized .agent-surface {
  border-radius: 0;
  box-shadow: none;
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
  width: 248px;
  min-width: 0;
  border-right: 1px solid var(--color-line);
  background: var(--color-surface-muted);
}
.agent-side-head {
  height: 44px;
  -webkit-app-region: drag;
}
.agent-shell.is-mac .agent-side-head {
  height: 58px;
}
.agent-side-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 var(--space-2) var(--space-4);
}
.agent-new-chat {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 34px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 600;
  text-align: left;
}
.agent-new-chat svg {
  color: var(--color-muted);
}
.agent-new-chat:hover {
  background: var(--color-surface);
}
.agent-section {
  margin-top: var(--space-4);
}
.agent-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 28px;
  padding: 0 var(--space-2) 0 var(--space-3);
}
.agent-section-title {
  display: inline-flex;
  flex: 1;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-subtle);
  font: inherit;
  font-size: var(--font-size-caption);
  font-weight: 600;
  text-align: left;
}
.agent-section-title:hover {
  color: var(--color-muted);
}
.agent-section-action {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.agent-section-head:hover .agent-section-action,
.agent-section-action:focus-visible {
  opacity: 1;
}
.agent-section-action:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-project {
  margin-top: var(--space-1);
}
.agent-project-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 30px;
  padding: 0 var(--space-2) 0 var(--space-3);
  border-radius: var(--radius-control);
  color: var(--color-ink);
  font-size: var(--font-size-label);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.agent-project-row > svg {
  flex: none;
  color: var(--color-muted);
}
.agent-project-row:hover {
  background: var(--color-surface);
}
.agent-project-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-pin {
  flex: none;
  color: var(--color-subtle);
}
.agent-row-actions {
  position: absolute;
  top: 50%;
  right: var(--space-1);
  display: flex;
  align-items: center;
  gap: 1px;
  padding-left: var(--space-2);
  border-radius: var(--radius-sm);
  background: inherit;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.agent-project-row:hover .agent-row-actions,
.agent-session:hover .agent-row-actions,
.agent-row-actions:focus-within {
  opacity: 1;
}
.agent-row-button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
}
.agent-row-button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-project-sessions {
  padding-left: 26px;
}
.agent-session {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 30px;
  padding: 0 var(--space-2) 0 var(--space-3);
  border-radius: var(--radius-control);
  color: var(--color-ink);
  font-size: var(--font-size-label);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
}
.agent-session:hover {
  background: var(--color-surface);
}
.agent-session.active {
  background: var(--color-brand-soft);
}
.agent-session-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-session .session-menu {
  position: absolute;
  top: 50%;
  right: var(--space-1);
  background: inherit;
  opacity: 0;
  transform: translateY(-50%);
}
.agent-session:hover .session-menu,
.agent-session .session-menu:focus-visible {
  opacity: 1;
}
.agent-session-empty {
  margin: 0;
  padding: 4px var(--space-3);
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
}
.agent-side-empty {
  margin: 0;
  padding: 4px var(--space-3);
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
}
.agent-project-row:focus-visible,
.agent-session:focus-visible,
.agent-new-chat:focus-visible,
.agent-section-title:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -2px;
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
.agent-window-controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
  -webkit-app-region: no-drag;
}
.agent-window-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
}
.agent-window-button:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}
.agent-window-button.close:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.agent-window-button:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
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
.agent-button.danger {
  border-color: transparent;
  background: var(--color-danger-soft);
  color: var(--color-danger);
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
.agent-menu-layer,
.agent-modal-layer {
  position: fixed;
  inset: 0;
  z-index: 50;
}
.agent-menu-layer {
  background: transparent;
}
.agent-modal-layer {
  display: grid;
  place-items: center;
  background: var(--color-overlay);
}
.agent-menu {
  position: fixed;
  min-width: 176px;
  padding: var(--space-1);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--mqmz-panel-shadow);
}
.agent-menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 30px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-menu-item svg {
  flex: none;
  color: var(--color-muted);
}
.agent-menu-item:hover {
  background: var(--color-fill-secondary);
}
.agent-menu-item.danger {
  color: var(--color-danger);
}
.agent-menu-item.danger svg {
  color: var(--color-danger);
}
.agent-modal {
  width: min(440px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: var(--space-6);
  border-radius: var(--radius-stage);
  background: var(--color-canvas);
  box-shadow: var(--mqmz-panel-shadow);
}
.agent-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-5);
}
.agent-modal-head h2 {
  margin: 0;
  font-size: var(--font-size-title);
  font-weight: 650;
}
.agent-field {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 42px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-muted);
}
.agent-field:focus-within {
  border-color: var(--color-brand);
}
.agent-field input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
  outline: none;
}
.agent-modal-label {
  margin: var(--space-5) 0 var(--space-2);
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.agent-folder-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 42px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-muted);
}
.agent-folder-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--color-ink);
  font-size: var(--font-size-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-dialog-error {
  margin: var(--space-3) 0 0;
  text-align: left;
}
.agent-modal-foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-6);
}
.agent-modal-spacer {
  flex: 1;
}
.agent-move-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow: auto;
}
.agent-move-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-move-row svg {
  color: var(--color-muted);
}
.agent-move-row:hover {
  background: var(--color-fill-secondary);
}
.agent-move-row.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
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
  .agent-project-row,
  .agent-new-chat,
  .agent-section-action,
  .agent-row-actions,
  .agent-composer,
  .agent-modes button,
  .agent-send,
  .agent-icon-button {
    transition: none;
  }
}
</style>
