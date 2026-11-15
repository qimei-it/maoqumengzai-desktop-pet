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
  ArrowDown,
  Check,
  ChevronDown,
  ChevronRight,
  Component,
  Copy,
  Download,
  Ellipsis,
  Folder,
  FolderClosed,
  FolderInput,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  MessageCirclePlus,
  Minus,
  PenLine,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Square,
  SquareArrowOutUpRight,
  Trash2,
  Wrench,
  X,
} from '@lucide/vue'
import {
  agentModeLabels,
  agentReasoningLabels,
  agentReasoningLevels,
  type AgentAttachmentPick,
  type AgentMessageView,
  type AgentMode,
  type AgentProjectView,
  type AgentReasoning,
  type AgentSessionSummary,
  type AgentSkillDetail,
  type AgentSkillView,
  type AgentTextPart,
} from '../shared/agent'
import {
  deepseekModelIds,
  deepseekModelLabels,
  type DeepSeekModel,
} from '../shared/deepseek'
import type {
  AiTestState,
  Command,
  Snapshot,
} from '../shared/protocol'
import FileTypeIcon from './FileTypeIcon.vue'
import MarkdownView from './MarkdownView.vue'

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

type ConfirmState = {
  kind: 'session' | 'project'
  id: string
  title: string
}

const agent = computed(() => props.state?.agent)
const configured = computed(() => agent.value?.configured === true)
const aiTest = computed<AiTestState>(
  () => props.state?.ai.test ?? { status: 'idle' },
)
const aiTestLatencyClass = computed(() => {
  const latency = aiTest.value.latencyMs ?? 0
  if (latency <= 400) return 'is-fast'
  if (latency <= 1200) return 'is-medium'
  return 'is-slow'
})
const busy = computed(() => agent.value?.busy === true)
const attachmentProgress = computed(
  () => props.state?.agentAttachmentProgress,
)
const parsing = computed(() => Boolean(attachmentProgress.value))
const progressLabel = computed(() => {
  const progress = attachmentProgress.value
  if (!progress) return ''
  const index = Math.min(progress.done + 1, progress.total)
  const stage = progress.stage ? ` · ${progress.stage}` : ''
  return `解析附件 ${index}/${progress.total} · ${progress.name}${stage}`
})
const draft = ref('')
const attachments = ref<AgentAttachmentPick[]>([])
const attachmentError = ref('')
const skillsOpen = ref(false)
const skillQuery = ref('')
const skillBusy = ref(false)
const skillError = ref('')
const skillDetail = ref<AgentSkillDetail | null>(null)
const skillSearchIndex = ref<Record<string, string>>({})
const dropActive = ref(false)
let dragDepth = 0
let dropWatchdog: ReturnType<typeof setTimeout> | undefined
const copiedId = ref<string | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | undefined
const keyDraft = ref('')
const list = ref<HTMLElement>()
const listInner = ref<HTMLElement>()
const composer = ref<HTMLElement>()
const contentWidth = ref(0)
const contentLeft = ref(0)
const contentStyle = computed(() =>
  contentWidth.value > 0
    ? {
        width: `${contentWidth.value}px`,
        marginLeft: `${contentLeft.value}px`,
        marginRight: '0px',
      }
    : {},
)
let composerObserver: ResizeObserver | undefined
const mac = /Mac/i.test(navigator.platform)
const maximized = computed(() => props.state?.agentMaximized === true)

const projects = computed(() => agent.value?.projects ?? [])
const sessions = computed(() => agent.value?.sessions ?? [])
const skills = computed<AgentSkillView[]>(
  () => props.state?.agentSkills ?? [],
)
const filteredSkills = computed(() => {
  const query = skillQuery.value.trim().toLowerCase()
  if (!query) return skills.value
  return skills.value.filter((skill) => {
    const searchable = [
      skill.name,
      skill.description,
      skillSearchIndex.value[skill.id] ?? '',
    ]
      .join('\n')
      .toLowerCase()
    return searchable.includes(query)
  })
})
const pinnedOpen = ref(true)
const projectsOpen = ref(true)
const ungroupedOpen = ref(true)
const expanded = ref<Record<string, boolean>>({})
const menu = ref<MenuState | null>(null)
const dialog = ref<DialogState | null>(null)
const confirm = ref<ConfirmState | null>(null)
const draftName = ref('')
const draftWorkspace = ref('')
const dialogInput = ref<HTMLInputElement>()
const dialogError = ref('')

const mode = computed<AgentMode>(() => agent.value?.mode ?? 'build')
const model = computed<DeepSeekModel>(
  () => agent.value?.model ?? 'deepseek-flash',
)
watch(model, async (value) => {
  if (value !== 'deepseek-v4-pro') return
  const result = await window.mqmz?.pruneAgentAttachments()
  if (!result?.ok || !result.value.length) return
  const removed = new Set(result.value)
  attachments.value = attachments.value.filter(
    (item) => !removed.has(item.id),
  )
})
watch(
  [() => props.state?.agentDraftAttachments, busy],
  ([value, isBusy]) => {
    if (isBusy) return
    attachments.value = value ?? []
  },
  { immediate: true },
)
watch(
  () => skills.value.map((skill) => skill.id).join('|'),
  () => {
    if (skillsOpen.value) void indexSkillContent()
  },
)
const reasoning = computed<AgentReasoning>(
  () => agent.value?.reasoning ?? 'high',
)
const modelMenuOpen = ref(false)
const modelPicker = ref<HTMLElement>()
const workspaceMenuOpen = ref(false)
const workspaceSearch = ref('')
const workspacePicker = ref<HTMLElement>()
const workspaceSearchInput = ref<HTMLInputElement>()
const selectCreatedProject = ref(false)
const workspace = computed(() => agent.value?.workspace ?? null)
const activeSession = computed(() =>
  sessions.value.find((item) => item.id === agent.value?.sessionId),
)
const activeProject = computed(() =>
  projects.value.find(
    (item) => item.id === activeSession.value?.projectId,
  ),
)
const workspaceLabel = computed(() => {
  if (activeProject.value) return activeProject.value.name
  const path = workspace.value
  if (!path) return '选择工作区'
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
})
const filteredProjects = computed(() => {
  const query = workspaceSearch.value.trim().toLowerCase()
  if (!query) return projects.value
  return projects.value.filter((item) =>
    item.name.toLowerCase().includes(query),
  )
})
const title = computed(() => activeSession.value?.title ?? '新会话')
const petName = computed(() => {
  const name = props.state?.settings.petName?.trim()
  return name || '麻薯'
})
const projectDots = '.'.repeat(200)
const longProjectName = computed(() => {
  const name = activeProject.value?.name ?? ''
  const width = [...name].reduce(
    (sum, character) => sum + (/[^\x00-\xff]/.test(character) ? 2 : 1),
    0,
  )
  return width > 16
})
const canSend = computed(
  () =>
    Boolean(draft.value.trim()) &&
    !busy.value &&
    !parsing.value &&
    configured.value,
)
const usage = computed(() => agent.value?.usage ?? { input: 0, output: 0 })

const ungrouped = computed(() =>
  sortSessions(
    sessions.value.filter(
      (session) => !session.projectId && !session.pinned,
    ),
  ),
)
const pinnedSessions = computed(() =>
  sortSessions(sessions.value.filter((session) => session.pinned)),
)

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

function sortSessions(list: AgentSessionSummary[]): AgentSessionSummary[] {
  return [...list].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      right.updatedAt - left.updatedAt,
  )
}

function projectSessions(projectId: string): AgentSessionSummary[] {
  return sortSessions(
    sessions.value.filter(
      (session) =>
        session.projectId === projectId && !session.pinned,
    ),
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

const following = ref(true)
const scrollHover = ref(false)
let followFrame = 0
let lastScrollTop = 0
let messageObserver: ResizeObserver | undefined
const showScrollButton = computed(
  () =>
    !following.value &&
    (agent.value?.messages.length ?? 0) > 0 &&
    !dropActive.value,
)

function syncContentWidth(): void {
  const form = composer.value
  const messages = list.value
  if (!form || !messages) return
  const formRect = form.getBoundingClientRect()
  const listRect = messages.getBoundingClientRect()
  const width = Math.round(formRect.width)
  const left = Math.max(0, Math.round(formRect.left - listRect.left))
  if (width === contentWidth.value && left === contentLeft.value) return
  contentWidth.value = width
  contentLeft.value = left
}

function nearBottom(): boolean {
  const element = list.value
  if (!element) return true
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <= 24
  )
}

function scrollToBottom(): void {
  const element = list.value
  if (!element) return
  element.scrollTop = element.scrollHeight
  lastScrollTop = element.scrollTop
}

function scheduleFollow(): void {
  if (followFrame) return
  followFrame = requestAnimationFrame(() => {
    followFrame = 0
    if (following.value) scrollToBottom()
  })
}

function onMessagesScroll(): void {
  const element = list.value
  if (!element) return
  const top = element.scrollTop
  const movedUp = top < lastScrollTop - 1
  const atBottom = nearBottom()
  if (movedUp) following.value = false
  else if (atBottom) following.value = true
  lastScrollTop = top
  scrollHover.value = false
}

function jumpToBottom(): void {
  following.value = true
  scrollHover.value = false
  scrollToBottom()
}

function scrollButtonClick(): void {
  if (busy.value && !scrollHover.value) return
  jumpToBottom()
}

watch(
  () => agent.value?.sessionId,
  () => {
    following.value = true
    scrollHover.value = false
    lastScrollTop = 0
    skillsOpen.value = false
    skillDetail.value = null
    void nextTick(() => scheduleFollow())
    draft.value = ''
    attachmentError.value = ''
    const session = activeSession.value
    if (session?.projectId)
      expanded.value = {
        ...expanded.value,
        [session.projectId]: true,
      }
  },
  { immediate: true },
)

watch(
  () => agent.value?.messages,
  () => scheduleFollow(),
  { deep: true },
)
watch(busy, () => scheduleFollow())
watch(listInner, (element) => {
  messageObserver?.disconnect()
  messageObserver = undefined
  if (!element) return
  messageObserver = new ResizeObserver(() => scheduleFollow())
  messageObserver.observe(element)
  scheduleFollow()
})
watch(
  [composer, list],
  ([form, messages]) => {
    composerObserver?.disconnect()
    composerObserver = undefined
    if (!form) return
    composerObserver = new ResizeObserver(() => syncContentWidth())
    composerObserver.observe(form)
    if (messages) composerObserver.observe(messages)
    syncContentWidth()
    scheduleFollow()
  },
  { immediate: true },
)

async function addAttachments(): Promise<void> {
  if (busy.value || parsing.value) return
  attachmentError.value = ''
  const result = await window.mqmz!.pickAgentAttachments()
  if (!result.ok) {
    attachmentError.value = result.error
    return
  }
  const known = new Set(attachments.value.map((item) => item.id))
  attachments.value = [
    ...attachments.value,
    ...result.value.added.filter((item) => !known.has(item.id)),
  ]
}

function assistantText(message: AgentMessageView): string {
  return message.parts
    .filter((part): part is AgentTextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim()
}

async function copyOutput(message: AgentMessageView): Promise<void> {
  const text = assistantText(message)
  if (!text) return
  const result = await window.mqmz?.copyAgentOutput(text)
  if (!result?.ok) {
    attachmentError.value = result?.error ?? '复制失败。'
    return
  }
  copiedId.value = message.id
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyTimer = undefined
    copiedId.value = null
  }, 1200)
}

async function saveSource(id: string): Promise<void> {
  const result = await window.mqmz?.saveAgentSource(id)
  if (!result?.ok)
    attachmentError.value = result?.error ?? '保存文件失败。'
}

function removeAttachment(id: string): void {
  attachments.value = attachments.value.filter((item) => item.id !== id)
  void window.mqmz!.releaseAgentAttachment(id)
}

function cancelParsing(): void {
  void window.mqmz!.cancelAgentAttachmentParsing()
}

const dropLabel = computed(() =>
  busy.value ? '当前回复结束后再添加附件' : '添加到当前对话',
)

function hasFileDrag(event: DragEvent): boolean {
  if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) return true
  return Array.from(event.dataTransfer?.items ?? []).some(
    (item) => item.kind === 'file',
  )
}

function clearDropWatchdog(): void {
  if (!dropWatchdog) return
  clearTimeout(dropWatchdog)
  dropWatchdog = undefined
}

function armDropWatchdog(): void {
  clearDropWatchdog()
  dropWatchdog = setTimeout(() => {
    dropWatchdog = undefined
    dragDepth = 0
    dropActive.value = false
  }, 700)
}

function onDragEnter(event: DragEvent): void {
  if (skillsOpen.value || !hasFileDrag(event) || parsing.value) return
  event.preventDefault()
  dragDepth += 1
  dropActive.value = true
  armDropWatchdog()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = busy.value ? 'none' : 'copy'
}

function onDragOver(event: DragEvent): void {
  if (!dropActive.value) return
  event.preventDefault()
  armDropWatchdog()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = busy.value ? 'none' : 'copy'
}

function onDragLeave(): void {
  if (!dropActive.value) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    clearDropWatchdog()
    dropActive.value = false
  }
}

async function onDrop(event: DragEvent): Promise<void> {
  const files = [...(event.dataTransfer?.files ?? [])]
  if (skillsOpen.value) return
  if (!hasFileDrag(event) && !files.length) return
  event.preventDefault()
  clearDropWatchdog()
  dragDepth = 0
  dropActive.value = false
  if (!files.length) return
  if (parsing.value) {
    attachmentError.value = '正在解析附件，请稍候。'
    return
  }
  if (busy.value) {
    attachmentError.value = '当前回复结束后再添加附件。'
    return
  }
  attachmentError.value = ''
  const result = await window.mqmz!.attachAgentFiles(files)
  if (!result.ok) {
    attachmentError.value = result.error
    return
  }
  const known = new Set(attachments.value.map((item) => item.id))
  attachments.value = [
    ...attachments.value,
    ...result.value.added.filter((item) => !known.has(item.id)),
  ]
}

function send(): void {
  const prompt = draft.value.trim()
  if (!prompt || busy.value || parsing.value || !configured.value) return
  const attachmentIds = attachments.value.map((item) => item.id)
  modelMenuOpen.value = false
  emit('command', {
    type: 'agent-send',
    prompt,
    ...(attachmentIds.length ? { attachmentIds } : {}),
  })
  draft.value = ''
  attachments.value = []
  attachmentError.value = ''
  following.value = true
  scrollHover.value = false
  void nextTick(() => scheduleFollow())
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
  skillsOpen.value = false
  skillDetail.value = null
  emit('command', { type: 'agent-session-new' })
}
function newChatIn(projectId: string): void {
  skillsOpen.value = false
  skillDetail.value = null
  emit('command', { type: 'agent-project-new', projectId })
}
function selectSession(id: string): void {
  skillsOpen.value = false
  skillDetail.value = null
  emit('command', { type: 'agent-session-select', id })
}
function openSkills(): void {
  skillsOpen.value = true
  skillDetail.value = null
  skillError.value = ''
  closeMenu()
  modelMenuOpen.value = false
  workspaceMenuOpen.value = false
  void indexSkillContent()
}
async function indexSkillContent(
  list: AgentSkillView[] = skills.value,
): Promise<void> {
  const entries = await Promise.all(
    list.map(async (skill) => {
      const result = await window.mqmz?.readAgentSkill(skill.id)
      return [skill.id, result?.ok ? result.value.content : ''] as const
    }),
  )
  skillSearchIndex.value = Object.fromEntries(entries)
}
async function refreshSkills(): Promise<void> {
  if (skillBusy.value) return
  skillBusy.value = true
  skillError.value = ''
  const result = await window.mqmz?.refreshAgentSkills()
  if (!result?.ok) skillError.value = result?.error ?? '刷新技能失败。'
  else await indexSkillContent(result.value)
  skillBusy.value = false
}
async function addSkill(): Promise<void> {
  if (skillBusy.value) return
  skillBusy.value = true
  skillError.value = ''
  const result = await window.mqmz?.addAgentSkill()
  if (!result?.ok) skillError.value = result?.error ?? '添加技能失败。'
  else if (result.value.length) {
    if (result.value.length === 1) skillDetail.value = result.value[0]
    void nextTick(() => indexSkillContent())
  }
  skillBusy.value = false
}
async function openSkill(skill: AgentSkillView): Promise<void> {
  skillError.value = ''
  const result = await window.mqmz?.readAgentSkill(skill.id)
  if (result?.ok) skillDetail.value = result.value
  else skillError.value = result?.error ?? '读取技能失败。'
}
async function toggleSkill(): Promise<void> {
  const detail = skillDetail.value
  if (!detail || skillBusy.value) return
  skillBusy.value = true
  skillError.value = ''
  const result = await window.mqmz?.setAgentSkillEnabled(
    detail.id,
    !detail.enabled,
  )
  if (result?.ok)
    skillDetail.value = { ...detail, enabled: result.value.enabled }
  else skillError.value = result?.error ?? '修改技能失败。'
  skillBusy.value = false
}
async function revealSkill(): Promise<void> {
  const detail = skillDetail.value
  if (!detail) return
  const result = await window.mqmz?.revealAgentSkill(detail.id)
  if (!result?.ok)
    skillError.value = result?.error ?? '打开技能目录失败。'
}
async function removeSkill(): Promise<void> {
  const detail = skillDetail.value
  if (!detail) return
  skillError.value = ''
  const result = await window.mqmz?.removeAgentSkill(detail.id)
  if (!result?.ok) {
    skillError.value = result?.error ?? '卸载技能失败。'
    return
  }
  if (result.value) {
    skillDetail.value = null
    void nextTick(() => indexSkillContent())
  }
}
function closeSkillDetail(): void {
  skillDetail.value = null
  skillError.value = ''
}
function removeSession(id: string): void {
  confirm.value = { kind: 'session', id, title: '删除这个对话？' }
}
function deleteSessionFromMenu(session: AgentSessionSummary): void {
  closeMenu()
  removeSession(session.id)
}
function confirmRemove(): void {
  const pending = confirm.value
  if (!pending) return
  confirm.value = null
  if (pending.kind === 'session') {
    emit('command', { type: 'agent-session-delete', id: pending.id })
    return
  }
  emit('command', { type: 'agent-project-delete', id: pending.id })
  if (dialog.value?.kind === 'edit-project') closeDialog()
}
function setMode(value: AgentMode): void {
  if (mode.value === value) return
  emit('command', { type: 'agent-mode', mode: value })
}
function setModel(value: DeepSeekModel): void {
  modelMenuOpen.value = false
  if (model.value === value) return
  emit('command', { type: 'agent-model', model: value })
}
function setReasoning(value: AgentReasoning): void {
  modelMenuOpen.value = false
  if (reasoning.value === value) return
  emit('command', { type: 'agent-reasoning', reasoning: value })
}
function toggleWorkspaceMenu(): void {
  if (busy.value) return
  modelMenuOpen.value = false
  workspaceMenuOpen.value = !workspaceMenuOpen.value
  if (!workspaceMenuOpen.value) return
  workspaceSearch.value = ''
  void nextTick(() => workspaceSearchInput.value?.focus())
}
function closeWorkspaceMenu(): void {
  workspaceMenuOpen.value = false
  workspaceSearch.value = ''
}
function selectWorkspaceProject(projectId: string | null): void {
  closeWorkspaceMenu()
  emit('command', { type: 'agent-workspace', projectId })
}
function createProjectFromWorkspace(): void {
  closeWorkspaceMenu()
  openCreateProject(true)
}
function openApiKeySettings(): void {
  emit('command', { type: 'settings-section', section: 'ai' })
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
function testDraftKey(): void {
  const apiKey = keyDraft.value.trim()
  if (!apiKey || aiTest.value.status === 'testing') return
  emit('command', { type: 'ai-test', apiKey })
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

function openCreateProject(autoSelect = false): void {
  draftName.value = ''
  draftWorkspace.value = ''
  dialogError.value = ''
  selectCreatedProject.value = autoSelect
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
  selectCreatedProject.value = false
}
async function runDialogCommand(
  command: Command,
): Promise<Snapshot | true | null> {
  const api = window.mqmz
  if (!api) {
    emit('command', command)
    return true
  }
  const result = await api.command(command)
  if (!result.ok) {
    dialogError.value = result.error
    return null
  }
  return result.value
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
  if (!path) return
  const autoSelect = selectCreatedProject.value
  const snapshot = await runDialogCommand({
    type: 'agent-project-create',
    name,
    workspace: path,
  })
  if (!snapshot) return
  closeDialog()
  if (autoSelect && snapshot !== true) {
    const created = snapshot.agent.projects.find(
      (item) => item.workspace === path,
    )
    if (created)
      emit('command', { type: 'agent-workspace', projectId: created.id })
  }
}
async function saveProject(): Promise<void> {
  if (dialog.value?.kind !== 'edit-project') return
  const project = editProject.value
  if (!project) return
  const name = draftName.value.trim()
  const path = draftWorkspace.value.trim()
  if (!path) return
  const saved = await runDialogCommand({
    type: 'agent-project-update',
    id: project.id,
    ...(name !== project.name ? { name } : {}),
    ...(path !== project.workspace ? { workspace: path } : {}),
  })
  if (saved) closeDialog()
}
function removeProject(): void {
  if (dialog.value?.kind !== 'edit-project') return
  const project = editProject.value
  if (!project) return
  confirm.value = {
    kind: 'project',
    id: project.id,
    title: '移除这个项目？',
  }
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
  confirm.value = {
    kind: 'project',
    id: project.id,
    title: '移除这个项目？',
  }
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
async function saveSessionFromMenu(
  session: AgentSessionSummary,
): Promise<void> {
  closeMenu()
  const result = await window.mqmz?.saveAgentSession(session.id)
  if (!result?.ok)
    attachmentError.value = result?.error ?? '保存对话失败。'
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
  if (confirm.value) confirm.value = null
  else if (modelMenuOpen.value) modelMenuOpen.value = false
  else if (workspaceMenuOpen.value) closeWorkspaceMenu()
  else if (menu.value) menu.value = null
  else if (dialog.value) dialog.value = null
  else if (skillDetail.value) skillDetail.value = null
  else if (skillsOpen.value) skillsOpen.value = false
}
function onDocumentMouseDown(event: MouseEvent): void {
  const target = event.target as Node
  if (modelMenuOpen.value && !modelPicker.value?.contains(target))
    modelMenuOpen.value = false
  if (workspaceMenuOpen.value && !workspacePicker.value?.contains(target))
    closeWorkspaceMenu()
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousedown', onDocumentMouseDown)
  void nextTick(() => scheduleFollow())
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousedown', onDocumentMouseDown)
  clearDropWatchdog()
  messageObserver?.disconnect()
  composerObserver?.disconnect()
  if (followFrame) cancelAnimationFrame(followFrame)
  if (copyTimer) clearTimeout(copyTimer)
})

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
    <section
      class="agent-surface"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <aside class="agent-side">
        <div
          class="agent-side-head"
          @mousedown="onHeaderMouseDown"
          @dblclick="onHeaderDoubleClick"
        ></div>

        <div class="agent-side-top">
          <button type="button" class="agent-new-chat" @click="newSession">
            <MessageCirclePlus
              :size="12"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span>新建对话</span>
          </button>
          <button
            type="button"
            class="agent-new-chat agent-skills-entry"
            :class="{ active: skillsOpen }"
            :aria-current="skillsOpen ? 'page' : undefined"
            @click="openSkills"
          >
            <Component
              :size="12"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span>技能</span>
          </button>
        </div>

        <div class="agent-side-scroll">
          <section v-if="pinnedSessions.length" class="agent-section">
            <div class="agent-section-head">
              <button
                type="button"
                class="agent-section-title"
                :aria-expanded="pinnedOpen"
                @click="pinnedOpen = !pinnedOpen"
              >
                <span>置顶</span>
                <ChevronDown
                  v-if="pinnedOpen"
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
            </div>

            <div v-if="pinnedOpen">
              <div
                v-for="session in pinnedSessions"
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
                <span class="agent-row-actions">
                  <button
                    type="button"
                    class="agent-row-button"
                    aria-label="取消置顶"
                    title="取消置顶"
                    @click.stop="toggleSessionPin(session)"
                  >
                    <PinOff
                      :size="15"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    class="agent-row-button"
                    aria-label="删除对话"
                    title="删除"
                    @click.stop="deleteSessionFromMenu(session)"
                  >
                    <Trash2
                      :size="15"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                </span>
              </div>
            </div>
          </section>

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
                @click="openCreateProject()"
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
            class="agent-settings"
            aria-label="设置"
            title="设置"
            @click="openApiKeySettings"
          >
            <Settings :size="16" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <section class="agent-main">
        <header
          class="agent-head"
          @mousedown="onHeaderMouseDown"
          @dblclick="onHeaderDoubleClick"
        >
          <h1 class="agent-title">{{ skillsOpen ? '技能' : title }}</h1>
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
        <div
          v-if="!skillsOpen && parsing"
          class="agent-parse-banner"
          role="status"
        >
          <LoaderCircle
            class="agent-parse-spinner"
            :size="14"
            :stroke-width="2"
            aria-hidden="true"
          />
          <span class="agent-parse-label">{{ progressLabel }}</span>
          <button
            type="button"
            class="agent-parse-cancel"
            @click="cancelParsing"
          >
            取消
          </button>
        </div>
        <div
          v-if="!skillsOpen && dropActive"
          class="agent-drop-hint"
          aria-hidden="true"
        >
          <div class="agent-drop-hint-inner">
            <Plus :size="16" :stroke-width="2" aria-hidden="true" />
            <span>{{ dropLabel }}</span>
          </div>
        </div>

        <template v-if="skillsOpen">
          <div class="agent-skills-page">
            <div class="agent-skills-toolbar">
              <label class="agent-skills-search">
                <Search
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <input
                  v-model="skillQuery"
                  type="search"
                  placeholder="搜索技能"
                  aria-label="搜索技能"
                />
              </label>
              <button
                type="button"
                class="agent-icon-button"
                :disabled="skillBusy"
                aria-label="刷新技能"
                title="刷新技能"
                @click="refreshSkills"
              >
                <RefreshCw
                  :class="{ 'is-spinning': skillBusy }"
                  :size="15"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="agent-button primary agent-skills-add"
                :disabled="skillBusy"
                @click="addSkill"
              >
                <Plus
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                添加
              </button>
            </div>
            <p v-if="skillError" class="agent-error">{{ skillError }}</p>
            <div v-if="filteredSkills.length" class="agent-skills-grid">
              <button
                v-for="skill in filteredSkills"
                :key="skill.id"
                type="button"
                class="agent-skill-card"
                :class="{ disabled: !skill.enabled }"
                @click="openSkill(skill)"
              >
                <span class="agent-skill-icon">
                  <Component
                    :size="17"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
                <span class="agent-skill-text">
                  <span class="agent-skill-name">{{ skill.name }}</span>
                  <span class="agent-skill-description">{{
                    skill.description
                  }}</span>
                </span>
                <Check
                  v-if="skill.enabled"
                  class="agent-skill-check"
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
            </div>
            <p v-else-if="skills.length" class="agent-skills-empty">
              没有找到匹配的技能
            </p>
            <p v-else class="agent-skills-empty">
              还没有技能，点击“添加”导入技能包
            </p>
          </div>

          <div
            v-if="skillDetail"
            class="agent-skill-detail-layer"
          >
            <div
              class="agent-skill-detail"
              role="dialog"
              aria-modal="true"
              :aria-label="`${skillDetail.name} 技能`"
            >
              <header class="agent-skill-detail-head">
                <span class="agent-skill-icon is-large">
                  <Component
                    :size="20"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
                <div class="agent-skill-detail-title">
                  <h2>
                    {{ skillDetail.name }}
                    <span>Skill</span>
                  </h2>
                  <p>{{ skillDetail.description }}</p>
                </div>
                <div class="agent-skill-detail-actions">
                  <button
                    type="button"
                    class="agent-skill-switch"
                    role="switch"
                    :aria-checked="skillDetail.enabled"
                    :aria-label="
                      skillDetail.enabled ? '禁用技能' : '启用技能'
                    "
                    @click="toggleSkill"
                  >
                    <span />
                  </button>
                  <button
                    type="button"
                    class="agent-icon-button"
                    aria-label="在 Finder 中打开"
                    title="在 Finder 中打开"
                    @click="revealSkill"
                  >
                    <FolderOpen
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </header>
              <p v-if="skillError" class="agent-error">{{ skillError }}</p>
              <div class="agent-skill-detail-content">
                <MarkdownView
                  v-if="skillDetail.content"
                  :text="skillDetail.content"
                />
                <p v-else class="agent-skills-empty">
                  这个技能没有说明。
                </p>
              </div>
              <footer class="agent-skill-detail-foot">
                <button
                  type="button"
                  class="agent-button danger"
                  @click="removeSkill"
                >
                  卸载
                </button>
                <button
                  type="button"
                  class="agent-button"
                  @click="closeSkillDetail"
                >
                  关闭
                </button>
              </footer>
            </div>
          </div>
        </template>

        <template v-else-if="!configured">
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
                class="agent-text-button agent-get-key"
                @click="getKey"
              >
                获取 API Key
                <SquareArrowOutUpRight
                  class="agent-external-icon"
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
              <div class="agent-setup-buttons">
                <span
                  v-if="aiTest.status === 'testing'"
                  class="agent-latency"
                  >测试中…</span
                >
                <span
                  v-else-if="aiTest.status === 'ok'"
                  class="agent-latency"
                  :class="aiTestLatencyClass"
                  >{{ aiTest.latencyMs }} ms</span
                >
                <span
                  v-else-if="aiTest.status === 'error'"
                  class="agent-latency is-slow"
                  :title="aiTest.error"
                  >测试失败</span
                >
                <button
                  type="button"
                  class="agent-button agent-test-key"
                  :disabled="
                    !keyDraft.trim() || aiTest.status === 'testing'
                  "
                  @click="testDraftKey"
                >
                  测试延迟
                </button>
                <button
                  type="button"
                  class="agent-button primary agent-save-key"
                  :disabled="!keyDraft.trim()"
                  @click="saveKey"
                >
                  保存
                </button>
              </div>
            </div>
            <p
              v-if="error || agent?.error || attachmentError"
              class="agent-error"
            >
              {{ error || agent?.error || attachmentError }}
            </p>
          </div>
        </template>

        <template v-else>
          <div ref="list" class="agent-messages" @scroll="onMessagesScroll">
            <div ref="listInner" class="agent-messages-inner" :style="contentStyle">
              <div
                v-if="!(agent?.messages ?? []).length"
                class="agent-empty"
              >
                <p v-if="activeProject">
                  我们今天要在
                  <span class="agent-empty-project">
                    <span class="agent-empty-project-name">
                      {{ activeProject.name }}
                    </span>
                    <span
                      class="agent-empty-project-dots"
                      aria-hidden="true"
                      >{{ projectDots }}</span
                    >
                  </span>
                  里做些什么呢？<br v-if="longProjectName" />我可以完成好多任务哦～
                </p>
                <p v-else>
                  今天我们要做点什么？我可以处理待办、文件和邮件哦～
                </p>
              </div>
              <article
                v-for="message in agent?.messages ?? []"
                :key="message.id"
                class="agent-message"
                :class="message.role"
              >
                <div
                  v-if="message.attachments?.length"
                  class="agent-message-files"
                >
                  <span
                    v-for="file in message.attachments"
                    :key="file.id"
                    class="agent-message-file"
                    :title="file.name"
                  >
                    <FileTypeIcon :name="file.name" :size="16" />
                    <span>{{ file.name }}</span>
                    <button
                      v-if="file.canSave"
                      type="button"
                      class="agent-message-file-save"
                      :aria-label="`保存附件 ${file.name}`"
                      :title="`保存 ${file.name}`"
                      @click="saveSource(file.id)"
                    >
                      <Download
                        :size="12"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                    </button>
                  </span>
                </div>
                <template
                  v-for="(part, index) in message.parts"
                  :key="index"
                >
                  <MarkdownView
                    v-if="
                      part.type === 'text' &&
                      message.role === 'assistant'
                    "
                    :text="part.text"
                    :streaming="busy"
                  />
                  <p v-else-if="part.type === 'text'" class="agent-text">
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
                    <div
                      v-if="part.artifacts?.length"
                      class="agent-artifacts"
                    >
                      <button
                        v-for="artifact in part.artifacts"
                        :key="artifact.id"
                        type="button"
                        class="agent-artifact"
                        :aria-label="`保存 ${artifact.name}`"
                        :title="`保存 ${artifact.name}`"
                        @click="saveSource(artifact.id)"
                      >
                        <FileTypeIcon :name="artifact.name" :size="14" />
                        <span>{{ artifact.name }}</span>
                        <Download
                          :size="12"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                </template>
                <div
                  v-if="
                    message.role === 'assistant' &&
                    assistantText(message)
                  "
                  class="agent-message-actions"
                >
                  <button
                    type="button"
                    class="agent-message-action"
                    :aria-label="
                      copiedId === message.id ? '已复制' : '复制'
                    "
                    :title="copiedId === message.id ? '已复制' : '复制'"
                    @click="copyOutput(message)"
                  >
                    <Check
                      v-if="copiedId === message.id"
                      :size="14"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <Copy
                      v-else
                      :size="14"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </article>
              <p v-if="busy" class="agent-running">正在执行…</p>
            </div>
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
            <button
              v-if="showScrollButton"
              type="button"
              class="agent-scroll-button"
              :class="{ 'is-thinking': busy && !scrollHover }"
              :aria-label="
                busy && !scrollHover ? '正在输出' : '回到底部'
              "
              :title="busy && !scrollHover ? '正在输出' : '回到底部'"
              @mouseenter="scrollHover = true"
              @mouseleave="scrollHover = false"
              @click="scrollButtonClick"
            >
              <span
                v-if="busy && !scrollHover"
                class="agent-thinking-dots"
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
              </span>
              <ArrowDown
                v-else
                :size="16"
                :stroke-width="2"
                aria-hidden="true"
              />
            </button>
            <form ref="composer" class="agent-composer" @submit.prevent="send">
              <div
                v-if="attachments.length"
                class="agent-attachments"
                aria-label="已添加的附件"
              >
                <span
                  v-for="item in attachments"
                  :key="item.id"
                  class="agent-attachment"
                >
                  <FileTypeIcon :name="item.name" :size="16" />
                  <span
                    class="agent-attachment-name"
                    :title="item.detail ? `${item.name} · ${item.detail}` : item.name"
                  >
                    {{ item.name }}
                  </span>
                  <button
                    type="button"
                    class="agent-attachment-remove"
                    :aria-label="`移除附件 ${item.name}`"
                    :title="`移除 ${item.name}`"
                    @click="removeAttachment(item.id)"
                  >
                    <X :size="11" :stroke-width="2" aria-hidden="true" />
                  </button>
                </span>
              </div>
              <textarea
                v-model="draft"
                class="agent-input"
                rows="1"
                :placeholder="`让“${petName}”来帮你工作`"
                aria-label="给智能体发送指令"
                @keydown.enter.exact.prevent="send"
              ></textarea>
              <div class="agent-composer-row">
                <div class="agent-composer-tools">
                  <button
                    type="button"
                    class="agent-attach"
                    :disabled="busy || parsing"
                    aria-label="添加附件"
                    title="添加附件"
                    @click="addAttachments"
                  >
                    <Plus
                      :size="14"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                  <div ref="workspacePicker" class="agent-workspace-picker">
                    <button
                      type="button"
                      class="agent-workspace-select"
                      :disabled="busy"
                      :title="
                        activeProject?.workspace ??
                        workspace ??
                        '选择对话工作区'
                      "
                      aria-label="选择对话工作区"
                      :aria-expanded="workspaceMenuOpen"
                      aria-haspopup="dialog"
                      @click="toggleWorkspaceMenu"
                    >
                      <Folder
                        :size="13"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                      <span class="agent-workspace-name">
                        {{ workspaceLabel }}
                      </span>
                    </button>

                    <div
                      v-if="workspaceMenuOpen"
                      class="agent-workspace-menu"
                      role="dialog"
                      aria-label="选择项目"
                    >
                      <label class="agent-workspace-search">
                        <Search
                          :size="14"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <input
                          ref="workspaceSearchInput"
                          v-model="workspaceSearch"
                          type="text"
                          placeholder="搜索项目"
                          aria-label="搜索项目"
                        />
                      </label>

                      <div
                        class="agent-workspace-list"
                        role="listbox"
                        aria-label="项目"
                      >
                        <button
                          v-for="project in filteredProjects"
                          :key="project.id"
                          type="button"
                          class="agent-workspace-option"
                          role="option"
                          :aria-selected="activeProject?.id === project.id"
                          @click="selectWorkspaceProject(project.id)"
                        >
                          <Folder
                            :size="14"
                            :stroke-width="2"
                            aria-hidden="true"
                          />
                          <span class="agent-workspace-option-name">
                            {{ project.name }}
                          </span>
                          <Check
                            v-if="activeProject?.id === project.id"
                            :size="14"
                            :stroke-width="2"
                            aria-hidden="true"
                          />
                        </button>
                        <p
                          v-if="!filteredProjects.length"
                          class="agent-workspace-empty"
                        >
                          {{
                            projects.length
                              ? '没有匹配的项目'
                              : '暂无项目'
                          }}
                        </p>
                      </div>

                      <div class="agent-workspace-divider"></div>
                      <button
                        type="button"
                        class="agent-workspace-action"
                        @click="createProjectFromWorkspace"
                      >
                        <FolderPlus
                          :size="14"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        新建项目
                      </button>
                      <button
                        type="button"
                        class="agent-workspace-action"
                        @click="selectWorkspaceProject(null)"
                      >
                        <X
                          :size="14"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        不在项目中工作
                      </button>
                    </div>
                  </div>
                  <div
                    class="agent-modes"
                    :data-mode="mode"
                    role="group"
                    aria-label="执行模式"
                  >
                    <span class="agent-modes-thumb" aria-hidden="true"></span>
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
                </div>

                <div class="agent-composer-trailing">
                  <div ref="modelPicker" class="agent-model-picker">
                    <button
                      type="button"
                      class="agent-model-trigger"
                      :disabled="busy"
                      :aria-expanded="modelMenuOpen"
                      aria-haspopup="menu"
                      :aria-label="`选择模型，当前 ${deepseekModelLabels[model]}，推理强度${agentReasoningLabels[reasoning]}`"
                      @click="modelMenuOpen = !modelMenuOpen"
                    >
                      <span class="agent-model-name">
                        {{ deepseekModelLabels[model] }}
                      </span>
                      <span class="agent-model-effort">
                        {{ agentReasoningLabels[reasoning] }}
                      </span>
                      <ChevronDown
                        :size="12"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                    </button>

                    <div
                      v-if="modelMenuOpen"
                      class="agent-model-menu"
                      role="menu"
                      aria-label="模型与推理强度"
                    >
                      <p class="agent-model-group">模型</p>
                      <button
                        v-for="id in deepseekModelIds"
                        :key="id"
                        type="button"
                        class="agent-model-option"
                        role="menuitemradio"
                        :aria-checked="model === id"
                        @click="setModel(id)"
                      >
                        <Check
                          v-if="model === id"
                          :size="14"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <span
                          v-else
                          class="agent-model-check-space"
                          aria-hidden="true"
                        ></span>
                        <span>{{ deepseekModelLabels[id] }}</span>
                      </button>
                      <div class="agent-model-divider"></div>
                      <p class="agent-model-group">推理强度</p>
                      <button
                        v-for="level in agentReasoningLevels"
                        :key="level"
                        type="button"
                        class="agent-model-option"
                        role="menuitemradio"
                        :aria-checked="reasoning === level"
                        @click="setReasoning(level)"
                      >
                        <Check
                          v-if="reasoning === level"
                          :size="14"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <span
                          v-else
                          class="agent-model-check-space"
                          aria-hidden="true"
                        ></span>
                        <span>{{ agentReasoningLabels[level] }}</span>
                      </button>
                    </div>
                  </div>
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
                      class="agent-send-plane"
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
              <p
                v-if="attachmentError || error || agent?.error"
                class="agent-error"
              >
                {{ attachmentError || error || agent?.error }}
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
            class="agent-menu-item"
            role="menuitem"
            :disabled="busy && menuSession.id === agent?.sessionId"
            :title="
              busy && menuSession.id === agent?.sessionId
                ? '正在输出，请稍后再保存'
                : '保存为 Markdown'
            "
            @click="saveSessionFromMenu(menuSession)"
          >
            <Save :size="14" :stroke-width="2" aria-hidden="true" />
            保存为 Markdown
          </button>
          <button
            type="button"
            class="agent-menu-item danger"
            role="menuitem"
            @click="deleteSessionFromMenu(menuSession)"
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
            v-if="
              dialog.kind === 'rename-session' ||
              dialog.kind === 'move-session'
            "
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
              :disabled="!draftWorkspace.trim()"
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

    <div
      v-if="confirm"
      class="agent-modal-layer"
      @mousedown.self="confirm = null"
    >
      <div
        class="agent-modal agent-confirm"
        role="alertdialog"
        aria-modal="true"
        :aria-label="confirm.title"
      >
        <h2 class="agent-confirm-title">{{ confirm.title }}</h2>
        <p v-if="confirm.kind === 'project'" class="agent-confirm-note">
          项目下的对话会移动到未分组。
        </p>
        <footer class="agent-modal-foot">
          <span class="agent-modal-spacer" />
          <button
            type="button"
            class="agent-button"
            @click="confirm = null"
          >
            取消
          </button>
          <button
            type="button"
            class="agent-button danger"
            @click="confirmRemove"
          >
            确认
          </button>
        </footer>
      </div>
    </div>
  </main>
</template>

<style scoped>
.agent-shell {
  --agent-shell-inset: 7px;
  --agent-side-width: 248px;
  --agent-frame-split: calc(
    var(--agent-shell-inset) + var(--agent-side-width)
  );
  height: 100vh;
  padding: var(--agent-shell-inset);
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.agent-shell.is-maximized {
  padding: var(--agent-shell-inset);
  background: linear-gradient(
    90deg,
    var(--color-surface-muted) 0 var(--agent-frame-split),
    var(--color-canvas) var(--agent-frame-split)
  );
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
  width: var(--agent-side-width);
  min-width: 0;
  border-right: 1px solid var(--color-line);
  background: var(--color-surface-muted);
}
.agent-side-head {
  height: 44px;
  -webkit-app-region: drag;
}
.agent-shell.is-mac .agent-side-head {
  height: 32px;
}
.agent-side-top {
  flex: none;
  padding: 0 var(--space-2) var(--space-2);
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
.agent-skills-entry {
  margin-top: 2px;
  font-weight: 500;
}
.agent-skills-entry.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-skills-entry.active svg {
  color: var(--color-brand-ink);
}
.agent-section {
  margin-top: var(--space-4);
}
.agent-side-scroll > .agent-section:first-child {
  margin-top: var(--space-2);
}
.agent-side-foot {
  flex: none;
  padding: var(--space-2) var(--space-2) var(--space-3);
}
.agent-settings {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-settings:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-settings:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
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
  font-size: var(--font-size-label);
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
  min-height: 24px;
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
.agent-project-row:hover,
.agent-project-row:focus-within {
  background: var(--color-brand-soft);
}
.agent-project-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
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
  min-height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
}
.agent-row-button:hover,
.agent-row-button:focus-visible {
  background: var(--color-surface);
  color: var(--color-brand-ink);
}
.agent-project-sessions {
  padding-top: var(--space-2);
}
.agent-project-sessions .agent-session {
  padding-left: calc(26px + var(--space-3));
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
.agent-session:hover,
.agent-session:focus-within {
  background: var(--color-brand-soft);
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
.agent-session .session-menu:hover,
.agent-session .session-menu:focus-visible {
  background: var(--color-surface);
  color: var(--color-brand-ink);
}
.agent-session.active .session-menu {
  background: var(--color-brand-soft);
}
.agent-session.active .agent-row-button:hover,
.agent-session.active .agent-row-button:focus-visible {
  background: var(--color-surface);
  color: var(--color-brand-ink);
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
.agent-main {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.agent-parse-banner {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  min-height: 32px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-surface-muted);
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.agent-parse-spinner {
  flex: none;
  animation: agent-parse-spin 0.9s linear infinite;
}
.agent-parse-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-parse-cancel {
  flex: none;
  min-height: 24px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-brand-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.agent-parse-cancel:hover {
  background: var(--color-brand-soft);
}
.agent-parse-cancel:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
@keyframes agent-parse-spin {
  to {
    transform: rotate(360deg);
  }
}
.agent-drop-hint {
  position: absolute;
  inset: 56px var(--space-3) var(--space-3);
  z-index: 30;
  display: grid;
  place-items: center;
  border: 1px dashed var(--color-brand);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-brand-soft) 92%, transparent);
  color: var(--color-brand-ink);
  pointer-events: none;
}
.agent-drop-hint-inner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-label);
  font-weight: 650;
  white-space: nowrap;
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
  flex: 1;
  min-height: 0;
  padding: var(--space-6) 0 var(--space-4);
  overflow-x: hidden;
  overflow-y: auto;
  user-select: text;
}
.agent-messages-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  width: calc(100% - 32px);
  min-height: 100%;
  margin: 0 auto;
}
.agent-empty {
  max-width: 100%;
  margin: auto;
  color: var(--color-ink);
  font-size: 18px;
  line-height: 1.6;
  text-align: center;
}
.agent-empty p {
  margin: 0;
}
.agent-empty-project {
  position: relative;
  display: inline-block;
  max-width: 100%;
  padding-bottom: 3px;
  color: var(--color-ink);
  vertical-align: baseline;
}
.agent-empty-project-name {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.agent-empty-project-dots {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  color: var(--color-brand);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 2px;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
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
  max-width: 55%;
  padding: 8px 12px;
  border-radius: var(--radius-card) var(--radius-card) var(--radius-xs)
    var(--radius-card);
  background: var(--color-brand-soft);
}
.agent-message-files {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-width: 84%;
}
.agent-message.user .agent-message-files {
  justify-content: flex-end;
}
.agent-message-file {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 220px;
  padding: 3px var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
  color: var(--color-ink);
  font-size: var(--font-size-label);
}
.agent-message-file > svg {
  flex: none;
  color: var(--color-muted);
}
.agent-message-file > img {
  flex: none;
}
.agent-message-file > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-message-file-save {
  display: grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  min-height: 18px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--color-muted);
}
.agent-message-file-save:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-message-file-save:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-message-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.agent-message-action {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-message-action:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-message-action:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-message-action svg {
  flex: none;
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
.agent-artifacts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 8px 10px;
  border-top: 1px solid var(--color-line);
}
.agent-artifact {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 100%;
  min-height: 26px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.agent-artifact > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-artifact > svg {
  flex: none;
  color: var(--color-muted);
}
.agent-artifact:hover {
  border-color: var(--color-brand);
  color: var(--color-brand-ink);
}
.agent-artifact:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
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
  position: relative;
  flex: none;
  padding: var(--space-3) var(--space-8) var(--space-5);
}
.agent-scroll-button {
  position: absolute;
  top: -40px;
  left: 50%;
  z-index: 6;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-circle);
  background: var(--color-surface);
  color: var(--color-muted);
  box-shadow: var(--shadow-control);
  transform: translateX(-50%);
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-scroll-button:not(.is-thinking) {
  cursor: pointer;
}
.agent-scroll-button.is-thinking {
  cursor: default;
}
.agent-scroll-button:hover {
  border-color: var(--color-brand);
  color: var(--color-brand-ink);
}
.agent-scroll-button:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.agent-thinking-dots {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 16px;
}
.agent-thinking-dots span {
  width: 4px;
  height: 4px;
  border-radius: var(--radius-circle);
  background: currentColor;
  animation: agent-dot-wave 1.15s ease-in-out infinite;
}
.agent-thinking-dots span:nth-child(2) {
  animation-delay: 0.15s;
}
.agent-thinking-dots span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes agent-dot-wave {
  0%,
  60%,
  100% {
    opacity: 0.45;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-4px);
  }
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
  min-height: 52px;
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  row-gap: var(--space-2);
  min-width: 0;
}
.agent-composer-tools {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
}
.agent-attach {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-attach:hover:not(:disabled) {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-attach:disabled {
  cursor: default;
  opacity: 0.5;
}
.agent-attach:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-workspace-select {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: var(--space-1);
  max-width: 132px;
  min-height: 24px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-workspace-select:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-workspace-select svg {
  flex: none;
}
.agent-workspace-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace-select:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-workspace-picker {
  position: relative;
  display: inline-flex;
  min-width: 0;
}
.agent-workspace-select:disabled {
  cursor: default;
  opacity: 0.55;
}
.agent-workspace-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: 280px;
  max-height: 360px;
  padding: var(--space-1);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}
.agent-workspace-search {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  min-height: 32px;
  padding: 0 var(--space-2);
  color: var(--color-muted);
}
.agent-workspace-search svg {
  flex: none;
}
.agent-workspace-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  outline: none;
}
.agent-workspace-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  overflow: auto;
}
.agent-workspace-option {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 32px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-workspace-option:hover {
  background: var(--color-fill-secondary);
}
.agent-workspace-option[aria-selected='true'] {
  background: var(--color-fill-secondary);
  font-weight: 600;
}
.agent-workspace-option > svg:first-child {
  flex: none;
  color: var(--color-muted);
}
.agent-workspace-option > svg:last-child {
  flex: none;
  color: var(--color-brand-ink);
}
.agent-workspace-option-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-workspace-empty {
  margin: 0;
  padding: var(--space-2);
  color: var(--color-subtle);
  font-size: var(--font-size-label);
}
.agent-workspace-divider {
  flex: none;
  height: 1px;
  margin: var(--space-1) var(--space-2);
  background: var(--color-line);
}
.agent-workspace-action {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 32px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-workspace-action:hover {
  background: var(--color-fill-secondary);
}
.agent-workspace-action svg {
  flex: none;
  color: var(--color-muted);
}
.agent-workspace-option:focus-visible,
.agent-workspace-action:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -1px;
}
.agent-attachments {
  display: flex;
  flex-wrap: nowrap;
  gap: var(--space-2);
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.agent-attachments::-webkit-scrollbar {
  display: none;
}
.agent-attachment {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
  max-width: 220px;
  height: 28px;
  padding: 0 var(--space-1) 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
  color: var(--color-ink);
  font-size: var(--font-size-label);
}
.agent-attachment > img {
  flex: none;
}
.agent-attachment-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-attachment-remove {
  display: grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  min-height: 18px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--color-muted);
}
.agent-attachment-remove:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.agent-attachment-remove:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -1px;
}
.agent-modes {
  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  margin-left: var(--space-2);
  padding: 2px;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
}
.agent-modes-thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc(50% - 2px);
  border-radius: calc(var(--radius-control) - 2px);
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  pointer-events: none;
  transition: transform var(--motion-slide) var(--ease-spring);
}
.agent-modes[data-mode='build'] .agent-modes-thumb {
  transform: translateX(100%);
}
.agent-modes button {
  position: relative;
  z-index: 1;
  min-height: 24px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: calc(var(--radius-control) - 2px);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  font-weight: 500;
  transition: color var(--motion-fast) var(--ease-standard);
}
.agent-modes button:disabled {
  cursor: default;
  opacity: 0.6;
}
.agent-modes button.active {
  background: transparent;
  color: var(--color-brand-ink);
  font-weight: 600;
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
  margin-left: auto;
}
.agent-model-picker {
  position: relative;
  display: inline-flex;
  min-width: 0;
}
.agent-model-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 226px;
  min-height: 28px;
  padding: 0 var(--space-1) 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-model-trigger:hover:not(:disabled) {
  background: var(--color-surface);
}
.agent-model-trigger:disabled {
  cursor: default;
  opacity: 0.6;
}
.agent-model-trigger > svg {
  flex: none;
  color: var(--color-muted);
}
.agent-model-name {
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-model-effort {
  flex: none;
  margin-left: var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.agent-model-trigger:focus-visible,
.agent-model-option:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -1px;
}
.agent-model-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 30;
  width: 240px;
  padding: var(--space-1);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}
.agent-model-group {
  margin: 0;
  padding: 4px var(--space-2) 2px;
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
  font-weight: 600;
}
.agent-model-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 28px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-model-option:hover {
  background: var(--color-fill-secondary);
}
.agent-model-option[aria-checked='true'] {
  color: var(--color-brand-ink);
  font-weight: 600;
}
.agent-model-option > svg {
  flex: none;
}
.agent-model-check-space {
  flex: none;
  width: 14px;
}
.agent-model-divider {
  height: 1px;
  margin: var(--space-1) var(--space-2);
  background: var(--color-line);
}
.agent-send {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  min-height: 32px;
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
/* The paper plane's optical center sits up-right of its bounding box. */
.agent-send-plane {
  transform: translate(-0.5px, 0.75px);
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
  min-height: 28px;
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
  min-height: 28px;
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
.agent-icon-button:disabled {
  background: transparent;
  color: var(--color-muted);
  cursor: default;
  opacity: 0.45;
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
  justify-content: space-between;
  gap: var(--space-3);
}
.agent-setup-buttons {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.agent-get-key {
  flex: none;
  gap: 6px;
  padding: 0;
  white-space: nowrap;
}
.agent-external-icon {
  flex: none;
  width: 1em;
  height: 1em;
}
.agent-test-key,
.agent-save-key {
  flex: none;
  padding: 0 var(--space-3);
}
.agent-save-key {
  min-width: 56px;
}
.agent-latency {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.agent-latency.is-fast {
  color: var(--color-success);
}
.agent-latency.is-medium {
  color: var(--color-warning);
}
.agent-latency.is-slow {
  color: var(--color-danger);
}
.agent-skills-page {
  flex: 1;
  min-height: 0;
  padding: var(--space-6) var(--space-8) var(--space-5);
  overflow: auto;
}
.agent-skills-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.agent-skills-search {
  display: flex;
  flex: 0 1 320px;
  align-items: center;
  gap: var(--space-2);
  width: 320px;
  max-width: calc(100% - 116px);
  min-width: 0;
  min-height: 36px;
  margin-left: auto;
  margin-right: 0;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-muted);
}
.agent-skills-search:focus-within {
  border-color: var(--color-brand);
}
.agent-skills-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.agent-skills-search input::placeholder {
  color: var(--color-muted);
}
.agent-skills-add {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
}
.agent-skills-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-5);
}
.agent-skill-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  min-height: 64px;
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  text-align: left;
  transition: border-color var(--motion-fast) var(--ease-standard);
}
.agent-skill-card:hover {
  border-color: var(--color-brand);
}
.agent-skill-card.disabled {
  opacity: 0.55;
}
.agent-skill-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-control);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-skill-icon.is-large {
  width: 40px;
  height: 40px;
}
.agent-skill-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.agent-skill-name {
  overflow: hidden;
  font-size: var(--font-size-label);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-skill-description {
  overflow: hidden;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-skill-check {
  flex: none;
  color: var(--color-success);
}
.agent-skills-empty {
  margin: var(--space-8) 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  text-align: center;
}
.agent-icon-button svg.is-spinning {
  animation: agent-spin 0.9s linear infinite;
}
.agent-skill-detail-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: var(--color-overlay);
}
.agent-skill-detail {
  display: flex;
  flex-direction: column;
  width: min(620px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  padding: var(--space-6);
  border-radius: var(--radius-stage);
  background: var(--color-canvas);
  box-shadow: var(--mqmz-panel-shadow);
}
.agent-skill-detail-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}
.agent-skill-detail-title {
  flex: 1;
  min-width: 0;
}
.agent-skill-detail-title h2 {
  margin: 0;
  font-size: var(--font-size-section-lg);
  font-weight: 650;
  line-height: 1.35;
}
.agent-skill-detail-title h2 span {
  margin-left: var(--space-1);
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 500;
}
.agent-skill-detail-title p {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.agent-skill-detail-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-2);
}
.agent-skill-detail-content {
  flex: 1;
  min-height: 0;
  margin-top: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  overflow: auto;
}
.agent-skill-detail-content :deep(.agent-markdown) {
  font-size: var(--font-size-label);
}
.agent-skill-detail-foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.agent-skill-switch {
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
.agent-skill-switch span {
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
.agent-skill-switch[aria-checked='true'] {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.agent-skill-switch[aria-checked='true'] span {
  transform: translateX(17px);
}
.agent-skill-switch:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
@keyframes agent-spin {
  to {
    transform: rotate(360deg);
  }
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
.agent-menu-item:disabled {
  background: transparent;
  color: var(--color-muted);
  cursor: default;
  opacity: 0.55;
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
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-line);
}
.agent-confirm {
  width: min(360px, calc(100vw - 48px));
}
.agent-confirm-title {
  margin: 0;
  font-size: var(--font-size-title);
  font-weight: 650;
}
.agent-confirm-note {
  margin: var(--space-3) 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-body);
  line-height: 1.5;
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
@media (min-width: 921px) {
  .agent-composer-wrap {
    padding-inline: 0;
  }
  .agent-composer {
    width: max(625px, 75%);
    margin-inline: auto;
  }
  .agent-input {
    min-height: 64px;
  }
  .agent-messages-inner {
    width: max(625px, 75%);
  }
  .agent-composer-meta,
  .agent-approval {
    width: max(625px, 75%);
    margin-inline: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .agent-running,
  .agent-parse-spinner,
  .agent-thinking-dots span {
    animation: none;
  }
  .agent-session,
  .agent-project-row,
  .agent-new-chat,
  .agent-section-action,
  .agent-row-actions,
  .agent-composer,
  .agent-modes button,
  .agent-modes-thumb,
  .agent-attach,
  .agent-workspace-select,
  .agent-settings,
  .agent-model-trigger,
  .agent-message-action,
  .agent-artifact,
  .agent-attachment-remove,
  .agent-send,
  .agent-icon-button,
  .agent-scroll-button {
    transition: none;
  }
}
</style>
