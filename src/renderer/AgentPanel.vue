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
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Component,
  Copy,
  Download,
  Ellipsis,
  Eraser,
  Film,
  Folder,
  FolderClosed,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  LoaderCircle,
  MessageCirclePlus,
  Minus,
  PenLine,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShieldExclamationPoint,
  ShieldQuestionMark,
  SlidersHorizontal,
  Square,
  SquareArrowOutUpRight,
  Trash2,
  Volume2,
  Wrench,
  X,
} from '@lucide/vue'
import {
  agentModeLabels,
  agentReasoningLabels,
  agentToolPolicies,
  agentToolPolicyLabels,
  agentApprovalModeHints,
  agentApprovalModeLabels,
  agentApprovalModes,
  agentReasoningLevels,
  maxAgentNameChars,
  type AgentApprovalMode,
  type AgentAttachmentPick,
  type AgentMessageView,
  type AgentMode,
  type AgentProjectView,
  type AgentReasoning,
  type AgentSessionSummary,
  type AgentSkillDetail,
  type AgentSkillView,
  type AgentTextPart,
  type AgentToolPart,
} from '../shared/agent'
import { deepseekModelIds } from '../shared/deepseek'
import {
  agentModels,
  agentModelLabels,
  modelInfo,
  type AgentModelId,
} from '../shared/agent-models'
import {
  defaultGenerationParams,
  generationRatios,
  h3VideoResolutions,
  imageAreas,
  imageFormats,
  imageRatios,
  normalizeGenerationParams,
  speechEmotionLabels,
  speechEmotions,
  speechFormats,
  speechVoices,
  type GenerationParams,
} from '../shared/generation'
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
  | { kind: 'project-policy'; id: string }

type ConfirmState = {
  kind: 'session' | 'project' | 'clear-session'
  id: string
  title: string
}

const agent = computed(() => props.state?.agent)
const panelToast = ref('')
let panelToastTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => agent.value?.error,
  (message) => {
    if (!message) return
    panelToast.value = message
    if (panelToastTimer) clearTimeout(panelToastTimer)
    panelToastTimer = setTimeout(() => {
      panelToast.value = ''
      panelToastTimer = undefined
    }, 4000)
  },
)
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
const attachmentPreviews = ref<Record<string, string>>({})
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
const pendingSend = ref(false)
let pendingSendTimer: ReturnType<typeof setTimeout> | undefined
let pendingSendBase = 0
let pendingDraft = ''
let pendingDraftAttachments: AgentAttachmentPick[] = []
const retryingAttachmentId = ref<string | null>(null)
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
  const direct = skills.value.filter((skill) =>
    `${skill.name}\n${skill.description}`.toLowerCase().includes(query),
  )
  if (direct.length) return direct
  return skills.value
    .filter((skill) =>
      (skillSearchIndex.value[skill.id] ?? '')
        .toLowerCase()
        .includes(query),
    )
    .slice(0, 30)
})
const skillCategoryOrder = [
  '用户技能',
  '通用工具',
  '论文科研',
  '文档办公',
  '设计开发',
  '内容创作',
  '创意工具',
  '电商运营',
]
const skillPreviewLimit = 12
type SkillCategoryFilter = 'all' | 'enabled' | 'disabled'
const skillCategoryFilters = ref<Record<string, SkillCategoryFilter>>({})
const expandedSkillCategories = ref<Record<string, boolean>>({})
watch(skillQuery, () => {
  skillCategoryFilters.value = {}
  expandedSkillCategories.value = {}
})
function setSkillCategoryFilter(
  category: string,
  filter: SkillCategoryFilter,
): void {
  skillCategoryFilters.value = {
    ...skillCategoryFilters.value,
    [category]: filter,
  }
}
const skillGroups = computed(() => {
  const groups = new Map<string, AgentSkillView[]>()
  for (const category of skillCategoryOrder)
    groups.set(category, [])
  for (const skill of filteredSkills.value) {
    const category =
      skill.category.trim() ||
      (skill.builtin ? '其他' : '用户技能')
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category)!.push(skill)
  }
  const searching = Boolean(skillQuery.value.trim())
  return [...groups.entries()]
    .map(([category, items]) => {
      const sorted = [...items].sort(
        (left, right) =>
          Number(right.enabled) - Number(left.enabled) ||
          left.name.localeCompare(right.name, 'zh-CN'),
      )
      const filter = skillCategoryFilters.value[category] ?? 'all'
      const matching = sorted.filter((skill) =>
        filter === 'enabled'
          ? skill.enabled
          : filter === 'disabled'
            ? !skill.enabled
            : true,
      )
      const expanded = expandedSkillCategories.value[category] === true
      const cap =
        filter === 'enabled' || searching || expanded
          ? matching.length
          : skillPreviewLimit
      const visible = matching.slice(0, cap)
      const enabledCount = sorted.filter((skill) => skill.enabled).length
      return {
        category,
        items: sorted,
        visible,
        hidden: Math.max(0, matching.length - visible.length),
        matchingCount: matching.length,
        enabledCount,
        disabledCount: sorted.length - enabledCount,
        filter,
        expanded,
      }
    })
    .filter(
      (group) =>
        group.visible.length ||
        (!searching && skillCategoryOrder.includes(group.category)),
    )
})
function toggleSkillCategory(category: string): void {
  expandedSkillCategories.value = {
    ...expandedSkillCategories.value,
    [category]: !expandedSkillCategories.value[category],
  }
}
const pinnedOpen = ref(true)
const projectsOpen = ref(true)
const ungroupedOpen = ref(true)
const expanded = ref<Record<string, boolean>>({})
const menu = ref<MenuState | null>(null)
const dialog = ref<DialogState | null>(null)
const confirm = ref<ConfirmState | null>(null)
const sessionQuery = ref('')
const expandedTools = ref<Record<string, boolean>>({})
const speakingId = ref<string | null>(null)
const recording = ref(false)
const transcribing = ref(false)
let voiceRecorder:
  | {
      context: AudioContext
      stream: MediaStream
      source: MediaStreamAudioSourceNode
      processor: ScriptProcessorNode
      mute: GainNode
      chunks: Float32Array[]
      timer?: ReturnType<typeof setTimeout>
    }
  | undefined
const expandedReasoning = ref<Record<string, boolean>>({})
const editingMessage = ref<{ id: string } | null>(null)
const editDraft = ref('')
const editInput = ref<HTMLTextAreaElement>()
const sessionSearchInput = ref<HTMLInputElement>()
const skillSearchInput = ref<HTMLInputElement>()
const composerInput = ref<HTMLTextAreaElement>()
const archivedOpen = ref(false)
const draftName = ref('')
const draftWorkspace = ref('')
const dialogInput = ref<HTMLInputElement>()
const dialogError = ref('')

const mode = computed<AgentMode>(() => agent.value?.mode ?? 'build')
const approvalMode = computed<AgentApprovalMode>(
  () => agent.value?.approvalMode ?? 'ask',
)
const model = computed<AgentModelId>(
  () => agent.value?.model ?? 'deepseek-flash',
)
const currentModel = computed(() => modelInfo(model.value))
const modelReasoning = computed(() => currentModel.value?.reasoning === true)
const reasoningLevels = computed(() =>
  model.value === 'MiniMax-M3.1-Flash'
    ? agentReasoningLevels.filter((level) => level !== 'off')
    : agentReasoningLevels,
)
const reasoningLabel = computed(() =>
  model.value === 'MiniMax-M3.1-Flash' && reasoning.value === 'off'
    ? agentReasoningLabels.low
    : agentReasoningLabels[reasoning.value],
)
const generationKind = computed(() => currentModel.value?.kind ?? 'text')
const showGenerationParams = computed(
  () => generationKind.value !== 'text',
)
const minimaxConfigured = computed(
  () => props.state?.ai.minimax.configured === true,
)
const modelConfigured = computed(() =>
  currentModel.value?.provider === 'minimax'
    ? minimaxConfigured.value
    : configured.value,
)
const miniMaxModels = agentModels.filter(
  (item) => item.provider === 'minimax',
)
const generationParamsKey = 'mqmz.agent.generation-params'
function loadGenerationParams(): GenerationParams {
  try {
    return normalizeGenerationParams(
      JSON.parse(localStorage.getItem(generationParamsKey) ?? 'null'),
    )
  } catch {
    return normalizeGenerationParams(defaultGenerationParams)
  }
}
const generationParams = ref<GenerationParams>(loadGenerationParams())
const generationMenuOpen = ref(false)
const generationPicker = ref<HTMLElement>()
watch(
  generationParams,
  (value) => {
    try {
      localStorage.setItem(generationParamsKey, JSON.stringify(value))
    } catch {
      // Ignore quota or private-mode storage failures.
    }
  },
  { deep: true },
)
watch(model, () => {
  generationMenuOpen.value = false
})
function setVideoParam(patch: Partial<GenerationParams['video']>): void {
  generationParams.value = {
    ...generationParams.value,
    video: { ...generationParams.value.video, ...patch },
  }
}
function setImageParam(patch: Partial<GenerationParams['image']>): void {
  generationParams.value = {
    ...generationParams.value,
    image: { ...generationParams.value.image, ...patch },
  }
}
function setSpeechParam(patch: Partial<GenerationParams['speech']>): void {
  generationParams.value = {
    ...generationParams.value,
    speech: { ...generationParams.value.speech, ...patch },
  }
}
function ratioLabel(value: string): string {
  return value === 'auto' ? '自动' : value
}
function rangeStyle(
  value: number,
  min: number,
  max: number,
): Record<string, string> {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return { '--range-ratio': String(ratio) }
}
function segmentStyle(
  values: readonly string[],
  active: string,
): Record<string, string> {
  const index = Math.max(0, values.indexOf(active))
  return {
    '--segment-index': String(index),
    '--segment-count': String(Math.max(1, values.length)),
  }
}
function generationPayload(): GenerationParams {
  return JSON.parse(JSON.stringify(generationParams.value)) as GenerationParams
}
function onVoiceChange(event: Event): void {
  setSpeechParam({ voiceId: (event.target as HTMLSelectElement).value })
}
const generationLabel = computed(() => {
  const params = generationParams.value
  if (generationKind.value === 'image')
    return `${params.image.area} · ${
      params.image.ratio === 'auto' ? '自动比例' : params.image.ratio
    } · ${params.image.count} 张`
  if (generationKind.value === 'video')
    return `${params.video.resolution} · ${params.video.ratio} · ${params.video.duration} 秒`
  if (generationKind.value === 'speech') {
    const voice =
      speechVoices.find((item) => item.id === params.speech.voiceId)?.label ??
      params.speech.voiceId
    return `${voice} · ${params.speech.speed.toFixed(1)}x`
  }
  return ''
})
const pendingFlashSend = ref(false)
const proBlocked = computed(
  () =>
    model.value === 'deepseek-v4-pro' &&
    attachments.value.some(
      (item) => item.needsModelUpload && item.kind !== 'video',
    ),
)
watch(model, (value) => {
  if (value !== 'deepseek-flash' || !pendingFlashSend.value) return
  pendingFlashSend.value = false
  void nextTick(() => send())
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
  attachments,
  async (items) => {
    const ids = new Set(items.map((item) => item.id))
    attachmentPreviews.value = Object.fromEntries(
      Object.entries(attachmentPreviews.value).filter(([id]) => ids.has(id)),
    )
    for (const item of items) {
      if (item.kind !== 'image' || attachmentPreviews.value[item.id])
        continue
      const result = await window.mqmz?.readAgentAttachmentPreview(item.id)
      if (!result?.ok || !result.value) continue
      if (!attachments.value.some((entry) => entry.id === item.id)) continue
      attachmentPreviews.value = {
        ...attachmentPreviews.value,
        [item.id]: result.value,
      }
    }
  },
  { deep: true },
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
const approvalMenuOpen = ref(false)
const approvalPicker = ref<HTMLElement>()
const approvalIcons = {
  ask: ShieldQuestionMark,
  auto: ShieldCheck,
  full: ShieldExclamationPoint,
}
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
  if (!path) return '选择项目'
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
    !pendingSend.value &&
    !proBlocked.value &&
    modelConfigured.value,
)
const usage = computed(() => agent.value?.usage ?? { input: 0, output: 0 })

const ungrouped = computed(() =>
  sortSessions(
    sessions.value.filter(
      (session) =>
        !session.projectId && !session.pinned && !session.archived,
    ),
  ),
)
const pinnedSessions = computed(() =>
  sortSessions(
    sessions.value.filter(
      (session) => session.pinned && !session.archived,
    ),
  ),
)
const archivedSessions = computed(() =>
  sortSessions(sessions.value.filter((session) => session.archived)),
)
const lastAssistantId = computed(() => {
  const messages = agent.value?.messages ?? []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') return messages[index].id
  }
  return null
})
const sessionQueryText = computed(() => sessionQuery.value.trim().toLowerCase())
const matchedSessions = computed(() => {
  const query = sessionQueryText.value
  if (!query) return []
  return sortSessions(
    sessions.value.filter((session) =>
      session.title.toLowerCase().includes(query),
    ),
  )
})

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
const dialogNameLength = computed(
  () => Array.from(draftName.value.trim()).length,
)
const dialogNameOverLimit = computed(
  () => dialogNameLength.value > maxAgentNameChars,
)
const dialogNameLimitHint = computed(() =>
  dialog.value?.kind === 'rename-session'
    ? `标题最多 ${maxAgentNameChars} 个字符`
    : `项目名称最多 ${maxAgentNameChars} 个字符`,
)
const moveSession = computed(() => {
  const state = dialog.value
  if (state?.kind !== 'move-session') return undefined
  return sessions.value.find((item) => item.id === state.id)
})
const policyProject = computed(() => {
  const state = dialog.value
  if (state?.kind !== 'project-policy') return undefined
  return projects.value.find((item) => item.id === state.id)
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
        session.projectId === projectId &&
        !session.pinned &&
        !session.archived,
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
watch(
  () => agent.value?.messages.length,
  () => {
    if (!pendingSend.value) return
    if (!pendingSendLanded()) return
    settlePendingSend()
    pendingDraft = ''
    pendingDraftAttachments = []
  },
)
watch(busy, (value) => {
  scheduleFollow()
  if (value || !pendingSend.value) return
  if (!pendingSendLanded()) restorePendingDraft()
  settlePendingSend()
})
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

function startEdit(message: AgentMessageView): void {
  if (busy.value) return
  editingMessage.value = { id: message.id }
  editDraft.value = assistantText(message)
  void nextTick(() => editInput.value?.focus())
}
function submitEdit(): void {
  if (!editingMessage.value || !editDraft.value.trim()) return
  emit('command', {
    type: 'agent-message-edit',
    id: editingMessage.value.id,
    prompt: editDraft.value.trim(),
  })
  editingMessage.value = null
  following.value = true
  scrollHover.value = false
  void nextTick(() => scheduleFollow())
}
function regenerateLast(): void {
  if (busy.value) return
  emit('command', { type: 'agent-message-regenerate' })
  following.value = true
  scrollHover.value = false
  void nextTick(() => scheduleFollow())
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

function isReasoningOpen(id: string): boolean {
  return expandedReasoning.value[id] === true
}
function toggleReasoning(id: string): void {
  expandedReasoning.value = {
    ...expandedReasoning.value,
    [id]: !expandedReasoning.value[id],
  }
}
function isToolExpanded(id: string): boolean {
  return expandedTools.value[id] === true
}
function toggleTool(id: string): void {
  expandedTools.value = {
    ...expandedTools.value,
    [id]: !expandedTools.value[id],
  }
}
async function copyToolOutput(part: AgentToolPart): Promise<void> {
  const text = part.output?.trim()
  if (!text) return
  const result = await window.mqmz?.copyAgentOutput(text)
  if (!result?.ok) {
    attachmentError.value = result?.error ?? '复制失败。'
    return
  }
  copiedId.value = part.id
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyTimer = undefined
    copiedId.value = null
  }, 1200)
}

async function openSource(id: string): Promise<void> {
  const result = await window.mqmz?.openAgentSource(id)
  if (!result?.ok)
    attachmentError.value = result?.error ?? '打开文件失败。'
}

async function saveSource(id: string): Promise<void> {
  const result = await window.mqmz?.saveAgentSource(id)
  if (!result?.ok)
    attachmentError.value = result?.error ?? '保存文件失败。'
}

async function saveSourceAs(id: string): Promise<void> {
  const result = await window.mqmz?.saveAgentSourceAs(id)
  if (!result?.ok)
    attachmentError.value = result?.error ?? '保存文件失败。'
}

async function revealSource(id: string): Promise<void> {
  const result = await window.mqmz?.revealAgentSource(id)
  if (!result?.ok)
    attachmentError.value = result?.error ?? '打开文件目录失败。'
}

function mediaDownloadLabel(kind: 'image' | 'video' | 'audio'): string {
  if (kind === 'image') return '下载图像'
  if (kind === 'video') return '下载视频'
  return '下载音频'
}

function mediaKindLabel(kind: 'image' | 'video' | 'audio'): string {
  if (kind === 'image') return '图片'
  if (kind === 'video') return '视频'
  return '音频'
}

function removeAttachment(id: string): void {
  attachments.value = attachments.value.filter((item) => item.id !== id)
  void window.mqmz!.releaseAgentAttachment(id)
}

async function retryAttachment(id: string): Promise<void> {
  if (retryingAttachmentId.value) return
  retryingAttachmentId.value = id
  attachmentError.value = ''
  const result = await window.mqmz?.retryAgentAttachment(id)
  if (!result?.ok)
    attachmentError.value = result?.error ?? '重试上传失败。'
  retryingAttachmentId.value = null
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

async function toggleSpeak(message: AgentMessageView): Promise<void> {
  if (speakingId.value === message.id) {
    speakingId.value = null
    await window.mqmz?.stopAgentSpeech()
    return
  }
  const text = assistantText(message)
  if (!text) return
  speakingId.value = message.id
  const result = await window.mqmz?.speakAgentText(text)
  if (speakingId.value === message.id) speakingId.value = null
  if (!result?.ok)
    attachmentError.value = result?.error ?? '朗读失败。'
}

function resampleVoice(
  input: Float32Array,
  from: number,
  to: number,
): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const length = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const floor = Math.floor(position)
    const fraction = position - floor
    output[index] =
      (input[floor] ?? 0) * (1 - fraction) +
      (input[floor + 1] ?? 0) * fraction
  }
  return output
}

function encodeVoiceWav(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(offset + index, value.charCodeAt(index))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true)
  }
  return new Uint8Array(buffer)
}

function releaseVoiceRecorder(): void {
  const current = voiceRecorder
  if (!current) return
  voiceRecorder = undefined
  if (current.timer) clearTimeout(current.timer)
  current.source.disconnect()
  current.processor.disconnect()
  current.mute.disconnect()
  current.stream.getTracks().forEach((track) => track.stop())
  void current.context.close().catch(() => {})
}

async function finishRecording(): Promise<void> {
  const current = voiceRecorder
  if (!current || !recording.value) return
  recording.value = false
  if (current.timer) clearTimeout(current.timer)
  current.source.disconnect()
  current.processor.disconnect()
  current.mute.disconnect()
  current.stream.getTracks().forEach((track) => track.stop())
  const sampleRate = current.context.sampleRate
  await current.context.close().catch(() => {})
  voiceRecorder = undefined
  const total = current.chunks.reduce(
    (sum, chunk) => sum + chunk.length,
    0,
  )
  if (total < sampleRate * 0.3) {
    attachmentError.value = '录音太短，请再说一次。'
    return
  }
  const merged = new Float32Array(total)
  let offset = 0
  for (const chunk of current.chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  const wav = encodeVoiceWav(
    resampleVoice(merged, sampleRate, 16_000),
    16_000,
  )
  transcribing.value = true
  const result = await window.mqmz?.transcribeAgentVoice(wav)
  transcribing.value = false
  if (!result?.ok) {
    attachmentError.value = result?.error ?? '语音转写失败。'
    return
  }
  const text = result.value.trim()
  if (!text) {
    attachmentError.value = '没有识别到语音内容。'
    return
  }
  draft.value = draft.value.trim()
    ? `${draft.value.trimEnd()} ${text}`
    : text
  void nextTick(() => composerInput.value?.focus())
}

async function toggleRecording(): Promise<void> {
  if (recording.value) {
    await finishRecording()
    return
  }
  if (busy.value || parsing.value || transcribing.value) return
  attachmentError.value = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const processor = context.createScriptProcessor(4096, 1, 1)
    const chunks: Float32Array[] = []
    processor.onaudioprocess = (event) => {
      const data = new Float32Array(
        event.inputBuffer.getChannelData(0),
      )
      event.outputBuffer.getChannelData(0).fill(0)
      if (recording.value) chunks.push(data)
    }
    const mute = context.createGain()
    mute.gain.value = 0
    source.connect(processor)
    processor.connect(mute)
    mute.connect(context.destination)
    voiceRecorder = { context, stream, source, processor, mute, chunks }
    recording.value = true
    voiceRecorder.timer = setTimeout(() => {
      if (recording.value) void finishRecording()
    }, 120_000)
  } catch {
    attachmentError.value = '无法访问麦克风，请检查系统权限。'
  }
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  if (busy.value || parsing.value) return
  const hasImage = [...(event.clipboardData?.items ?? [])].some((item) =>
    item.type.startsWith('image/'),
  )
  if (!hasImage) return
  event.preventDefault()
  attachmentError.value = ''
  const result = await window.mqmz?.attachAgentClipboardImage()
  if (!result?.ok) {
    attachmentError.value = result?.error ?? '粘贴图片失败。'
    return
  }
  if (!result.value) return
  const known = new Set(attachments.value.map((item) => item.id))
  attachments.value = [
    ...attachments.value,
    ...result.value.added.filter((item) => !known.has(item.id)),
  ]
  if (result.value.skipped.length)
    attachmentError.value = `未添加 ${result.value.skipped[0]}`
}

function pendingSendLanded(): boolean {
  return (agent.value?.messages ?? [])
    .slice(pendingSendBase)
    .some((message) => message.role === 'user')
}
function settlePendingSend(): void {
  pendingSend.value = false
  if (pendingSendTimer) clearTimeout(pendingSendTimer)
  pendingSendTimer = undefined
}
function restorePendingDraft(): void {
  if (!draft.value.trim()) draft.value = pendingDraft
  if (!attachments.value.length)
    attachments.value = pendingDraftAttachments
  pendingDraft = ''
  pendingDraftAttachments = []
}
function send(): void {
  const prompt = draft.value.trim()
  if (
    !prompt ||
    busy.value ||
    parsing.value ||
    pendingSend.value ||
    retryingAttachmentId.value ||
    !modelConfigured.value
  )
    return
  const attachmentIds = attachments.value.map((item) => item.id)
  modelMenuOpen.value = false
  attachmentError.value = ''
  pendingSend.value = true
  pendingSendBase = agent.value?.messages.length ?? 0
  pendingDraft = prompt
  pendingDraftAttachments = [...attachments.value]
  if (pendingSendTimer) clearTimeout(pendingSendTimer)
  pendingSendTimer = setTimeout(() => {
    pendingSendTimer = undefined
    if (!pendingSend.value) return
    if (!pendingSendLanded()) restorePendingDraft()
    settlePendingSend()
  }, 5000)
  draft.value = ''
  attachments.value = []
  emit('command', {
    type: 'agent-send',
    prompt,
    ...(attachmentIds.length ? { attachmentIds } : {}),
    ...(showGenerationParams.value
      ? { generation: generationPayload() }
      : {}),
  })
  following.value = true
  scrollHover.value = false
  void nextTick(() => scheduleFollow())
}
function stop(): void {
  emit('command', { type: 'agent-cancel' })
}
function retryTurn(): void {
  emit('command', { type: 'agent-retry' })
  following.value = true
  scrollHover.value = false
  void nextTick(() => scheduleFollow())
}
function windowAction(action: 'minimize' | 'maximize' | 'close'): void {
  emit('command', { type: 'panel-control', action })
}
function onFrameDoubleClick(event: MouseEvent): void {
  if (event.target !== event.currentTarget) return
  emit('command', { type: 'panel-control', action: 'toggle-default' })
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
  sessionQuery.value = ''
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
  approvalMenuOpen.value = false
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
function archiveFromMenu(session: AgentSessionSummary): void {
  closeMenu()
  emit('command', {
    type: 'agent-session-archive',
    id: session.id,
    archived: true,
  })
}
function unarchiveFromMenu(session: AgentSessionSummary): void {
  closeMenu()
  emit('command', {
    type: 'agent-session-archive',
    id: session.id,
    archived: false,
  })
}
function clearFromMenu(session: AgentSessionSummary): void {
  closeMenu()
  confirm.value = {
    kind: 'clear-session',
    id: session.id,
    title: '清空这个对话？',
  }
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
  if (pending.kind === 'clear-session') {
    emit('command', { type: 'agent-session-clear', id: pending.id })
    return
  }
  emit('command', { type: 'agent-project-delete', id: pending.id })
  if (dialog.value?.kind === 'edit-project') closeDialog()
}
function setMode(value: AgentMode): void {
  if (mode.value === value) return
  emit('command', { type: 'agent-mode', mode: value })
}
function toggleApprovalMenu(): void {
  if (busy.value) return
  modelMenuOpen.value = false
  workspaceMenuOpen.value = false
  approvalMenuOpen.value = !approvalMenuOpen.value
}
function selectApprovalMode(value: AgentApprovalMode): void {
  approvalMenuOpen.value = false
  if (approvalMode.value === value) return
  emit('command', { type: 'agent-approval-mode', mode: value })
}
function setModel(value: AgentModelId): void {
  modelMenuOpen.value = false
  if (model.value === value) return
  if (value !== 'deepseek-flash') pendingFlashSend.value = false
  if (value === 'MiniMax-M3.1-Flash' && reasoning.value === 'off')
    emit('command', { type: 'agent-reasoning', reasoning: 'low' })
  emit('command', { type: 'agent-model', model: value })
}
function switchToFlashAndSend(): void {
  if (busy.value || !draft.value.trim()) return
  if (model.value === 'deepseek-flash') {
    send()
    return
  }
  pendingFlashSend.value = true
  emit('command', { type: 'agent-model', model: 'deepseek-flash' })
}
function setReasoning(value: AgentReasoning): void {
  modelMenuOpen.value = false
  if (reasoning.value === value) return
  emit('command', { type: 'agent-reasoning', reasoning: value })
}
function toggleWorkspaceMenu(): void {
  if (busy.value) return
  modelMenuOpen.value = false
  approvalMenuOpen.value = false
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
function approveSame(id: string): void {
  emit('command', { type: 'agent-approve-same', id })
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
  if (dialogNameOverLimit.value) {
    dialogError.value = dialogNameLimitHint.value
    return
  }
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
  if (dialogNameOverLimit.value) {
    dialogError.value = dialogNameLimitHint.value
    return
  }
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
function openProjectPolicy(project: AgentProjectView): void {
  closeMenu()
  dialog.value = { kind: 'project-policy', id: project.id }
}
function setProjectPolicy(
  policy: (typeof agentToolPolicies)[number],
): void {
  if (dialog.value?.kind !== 'project-policy') return
  emit('command', {
    type: 'agent-project-policy',
    id: dialog.value.id,
    policy,
  })
  closeDialog()
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
  if (dialogNameOverLimit.value) {
    dialogError.value = dialogNameLimitHint.value
    return
  }
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

function focusComposer(): void {
  skillsOpen.value = false
  skillDetail.value = null
  void nextTick(() => composerInput.value?.focus())
}
function focusSearch(): void {
  if (skillsOpen.value) {
    void nextTick(() => skillSearchInput.value?.focus())
    return
  }
  void nextTick(() => {
    sessionSearchInput.value?.focus()
    sessionSearchInput.value?.select()
  })
}
function onKeydown(event: KeyboardEvent): void {
  const modifier = mac ? event.metaKey : event.ctrlKey
  if (modifier && !event.altKey && !event.shiftKey) {
    const key = event.key.toLowerCase()
    if (key === 'n') {
      event.preventDefault()
      newSession()
      return
    }
    if (key === 'k') {
      event.preventDefault()
      focusComposer()
      return
    }
    if (key === 'f') {
      event.preventDefault()
      focusSearch()
      return
    }
    if (key === '.') {
      event.preventDefault()
      stop()
      return
    }
  }
  if (event.key !== 'Escape') return
  if (editingMessage.value) editingMessage.value = null
  else if (confirm.value) confirm.value = null
  else if (generationMenuOpen.value) generationMenuOpen.value = false
  else if (modelMenuOpen.value) modelMenuOpen.value = false
  else if (approvalMenuOpen.value) approvalMenuOpen.value = false
  else if (workspaceMenuOpen.value) closeWorkspaceMenu()
  else if (menu.value) menu.value = null
  else if (dialog.value) dialog.value = null
  else if (skillDetail.value) skillDetail.value = null
  else if (skillsOpen.value) skillsOpen.value = false
  else if (busy.value) stop()
}
function onDocumentMouseDown(event: MouseEvent): void {
  const target = event.target as Node
  if (
    generationMenuOpen.value &&
    !generationPicker.value?.contains(target)
  )
    generationMenuOpen.value = false
  if (modelMenuOpen.value && !modelPicker.value?.contains(target))
    modelMenuOpen.value = false
  if (approvalMenuOpen.value && !approvalPicker.value?.contains(target))
    approvalMenuOpen.value = false
  if (workspaceMenuOpen.value && !workspacePicker.value?.contains(target))
    closeWorkspaceMenu()
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousedown', onDocumentMouseDown)
  void nextTick(() => scheduleFollow())
})
onUnmounted(() => {
  releaseVoiceRecorder()
  recording.value = false
  void window.mqmz?.stopAgentSpeech()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousedown', onDocumentMouseDown)
  clearDropWatchdog()
  messageObserver?.disconnect()
  composerObserver?.disconnect()
  if (followFrame) cancelAnimationFrame(followFrame)
  if (copyTimer) clearTimeout(copyTimer)
  if (pendingSendTimer) clearTimeout(pendingSendTimer)
  if (panelToastTimer) clearTimeout(panelToastTimer)
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
    @dblclick="onFrameDoubleClick"
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
          <label class="agent-session-search">
            <Search :size="14" :stroke-width="2" aria-hidden="true" />
            <input
              ref="sessionSearchInput"
              v-model="sessionQuery"
              type="text"
              placeholder="搜索对话"
              aria-label="搜索对话"
              autocomplete="off"
            />
            <button
              v-if="sessionQuery"
              type="button"
              class="agent-session-search-clear"
              aria-label="清空搜索"
              title="清空搜索"
              @click="sessionQuery = ''"
            >
              <X :size="12" :stroke-width="2" aria-hidden="true" />
            </button>
          </label>
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
          <section v-if="sessionQueryText" class="agent-section">
            <div class="agent-section-head">
              <span class="agent-section-title">搜索结果</span>
            </div>
            <div
              v-for="session in matchedSessions"
              :key="session.id"
              class="agent-session"
              :class="{ active: session.id === agent?.sessionId }"
              role="button"
              tabindex="0"
              :aria-current="session.id === agent?.sessionId"
              @click="selectSession(session.id)"
              @keydown.enter.prevent="selectSession(session.id)"
            >
              <Archive
                v-if="session.archived"
                class="agent-archive-mark"
                :size="11"
                :stroke-width="2"
                aria-hidden="true"
              />
              <Pin
                v-else-if="session.pinned"
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
            <p v-if="!matchedSessions.length" class="agent-side-empty">
              没有找到匹配的对话
            </p>
          </section>


          <section
            v-if="!sessionQueryText && pinnedSessions.length"
            class="agent-section"
          >
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

          <section v-if="!sessionQueryText" class="agent-section">
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

          <section v-if="!sessionQueryText" class="agent-section">
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

          <section
            v-if="!sessionQueryText && archivedSessions.length"
            class="agent-section"
          >
            <div class="agent-section-head">
              <button
                type="button"
                class="agent-section-title"
                :aria-expanded="archivedOpen"
                @click="archivedOpen = !archivedOpen"
              >
                <span>已归档</span>
                <ChevronDown
                  v-if="archivedOpen"
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
            <div v-if="archivedOpen">
              <div
                v-for="session in archivedSessions"
                :key="session.id"
                class="agent-session"
                :class="{ active: session.id === agent?.sessionId }"
                role="button"
                tabindex="0"
                :aria-current="session.id === agent?.sessionId"
                @click="selectSession(session.id)"
                @keydown.enter.prevent="selectSession(session.id)"
              >
                <Archive
                  class="agent-archive-mark"
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
              <span class="agent-skills-total"
                >共 {{ skills.length }} 个技能</span
              >
              <label class="agent-skills-search">
                <Search
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <input
                  ref="skillSearchInput"
                  v-model="skillQuery"
                  type="text"
                  placeholder="搜索技能"
                  aria-label="搜索技能"
                  autocomplete="off"
                />
                <button
                  v-if="skillQuery"
                  type="button"
                  class="agent-skills-search-clear"
                  aria-label="清空搜索"
                  title="清空搜索"
                  @click="skillQuery = ''"
                >
                  <X
                    :size="12"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </button>
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
            <template v-if="filteredSkills.length">
              <section
                v-for="group in skillGroups"
                :key="group.category"
                class="agent-skill-group"
              >
                <div class="agent-skill-group-head">
                  <div class="agent-skill-group-title">
                    <h3>{{ group.category }}</h3>
                    <span class="agent-skill-group-count">{{
                      group.items.length
                    }}</span>
                  </div>
                  <div
                    class="agent-skills-filter"
                    role="tablist"
                    :aria-label="`${group.category}筛选`"
                  >
                    <span
                      class="agent-skills-filter-thumb"
                      :class="group.filter"
                      aria-hidden="true"
                    ></span>
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="group.filter === 'all'"
                      :class="{ active: group.filter === 'all' }"
                      @click="setSkillCategoryFilter(group.category, 'all')"
                    >
                      全部
                    </button>
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="group.filter === 'enabled'"
                      :class="{ active: group.filter === 'enabled' }"
                      @click="
                        setSkillCategoryFilter(group.category, 'enabled')
                      "
                    >
                      已启用 {{ group.enabledCount }}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="group.filter === 'disabled'"
                      :class="{ active: group.filter === 'disabled' }"
                      @click="
                        setSkillCategoryFilter(group.category, 'disabled')
                      "
                    >
                      未启用 {{ group.disabledCount }}
                    </button>
                  </div>
                </div>
                <div
                  v-if="group.visible.length"
                  class="agent-skills-grid"
                >
                  <button
                    v-for="skill in group.visible"
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
                      <span class="agent-skill-name-row">
                        <span class="agent-skill-name">{{
                          skill.name
                        }}</span>
                        <span
                          v-if="skill.requires"
                          class="agent-skill-requires"
                          :title="skill.requires"
                          >需配置</span
                        >
                      </span>
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
                <p v-else class="agent-skills-empty">暂无技能</p>
                <button
                  v-if="
                    group.hidden > 0 ||
                    (group.expanded && group.matchingCount > 12)
                  "
                  type="button"
                  class="agent-skills-more"
                  :class="{ 'is-collapse': group.hidden === 0 }"
                  @click="toggleSkillCategory(group.category)"
                >
                  {{
                    group.hidden > 0
                      ? `显示全部 ${group.matchingCount} 个`
                      : '收起'
                  }}
                </button>
              </section>
            </template>
            <p v-else-if="skillQuery.trim()" class="agent-skills-empty">
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
                    <span>{{
                      skillDetail.builtin ? '内置 Skill' : 'Skill'
                    }}</span>
                  </h2>
                  <p>{{ skillDetail.description }}</p>
                  <p
                    v-if="skillDetail.requires"
                    class="agent-skill-detail-requires"
                  >
                    依赖：{{ skillDetail.requires }}
                  </p>
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
                      :size="22"
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
                  v-if="!skillDetail.builtin"
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
              v-if="error || attachmentError"
              class="agent-error"
            >
              {{ error || attachmentError }}
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
              <div
                v-if="agent?.contextCompacted"
                class="agent-context-notice"
                role="status"
              >
                <Archive :size="14" aria-hidden="true" />
                <span>较早的 {{ agent.contextCompacted }} 条消息已压缩为摘要</span>
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
                      :aria-label="`打开附件 ${file.name}`"
                      :title="`打开 ${file.name}`"
                      @click="openSource(file.id)"
                    >
                      <SquareArrowOutUpRight
                        :size="12"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                    </button>
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
                    v-else-if="part.type === 'reasoning'"
                    class="agent-reasoning"
                  >
                    <button
                      type="button"
                      class="agent-reasoning-head"
                      :aria-expanded="isReasoningOpen(message.id)"
                      :aria-label="
                        isReasoningOpen(message.id)
                          ? '收起思考过程'
                          : '展开思考过程'
                      "
                      @click="toggleReasoning(message.id)"
                    >
                      <ChevronDown
                        v-if="isReasoningOpen(message.id)"
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
                      <span>思考过程</span>
                    </button>
                    <pre
                      v-if="isReasoningOpen(message.id)"
                      class="agent-reasoning-text"
                      >{{ part.text }}</pre
                    >
                  </div>
                  <div
                    v-else-if="part.type === 'media'"
                    class="agent-media"
                    :data-status="part.status"
                  >
                    <div
                      v-if="part.items.length"
                      class="agent-media-grid"
                      :data-kind="part.items[0]?.kind"
                    >
                      <figure
                        v-for="item in part.items"
                        :key="item.id"
                        class="agent-media-item"
                        :data-status="item.status ?? 'done'"
                      >
                        <div
                          v-if="(item.status ?? 'done') === 'running'"
                          class="agent-media-placeholder"
                          :data-kind="item.kind"
                          role="status"
                          :aria-label="`${mediaKindLabel(item.kind)}生成中`"
                        >
                          <span class="agent-media-spinner">
                            <LoaderCircle
                              class="is-spinning"
                              :size="16"
                              :stroke-width="2"
                              aria-hidden="true"
                            />
                          </span>
                        </div>
                        <template v-else-if="item.url">
                          <div class="agent-media-head">
                            <button
                              type="button"
                              class="agent-media-reveal"
                              :aria-label="`${mediaDownloadLabel(item.kind)} ${item.name}`"
                              @click="revealSource(item.id)"
                            >
                              <ImageIcon
                                v-if="item.kind === 'image'"
                                :size="14"
                                :stroke-width="2"
                                aria-hidden="true"
                              />
                              <Film
                                v-else-if="item.kind === 'video'"
                                :size="14"
                                :stroke-width="2"
                                aria-hidden="true"
                              />
                              <AudioLines
                                v-else
                                :size="14"
                                :stroke-width="2"
                                aria-hidden="true"
                              />
                              <span>{{ mediaDownloadLabel(item.kind) }}</span>
                              <span
                                v-if="item.directory || item.path"
                                class="agent-media-path"
                                role="tooltip"
                              >
                                {{ item.directory || item.path }}
                              </span>
                            </button>
                            <button
                              type="button"
                              class="agent-media-save-as"
                              :aria-label="`另存为 ${item.name}`"
                              :title="`另存为 ${item.name}`"
                              @click="saveSourceAs(item.id)"
                            >
                              <Download
                                :size="14"
                                :stroke-width="2"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                          <div class="agent-media-frame">
                            <img
                              v-if="item.kind === 'image'"
                              :src="item.url"
                              :alt="item.name"
                              loading="lazy"
                            />
                            <video
                              v-else-if="item.kind === 'video'"
                              :src="item.url"
                              controls
                              preload="metadata"
                            ></video>
                            <audio
                              v-else
                              :src="item.url"
                              controls
                              preload="metadata"
                            ></audio>
                          </div>
                        </template>
                        <p v-else class="agent-media-failed">
                          {{ item.error || '生成失败' }}
                        </p>
                      </figure>
                    </div>
                    <p
                      v-if="part.text && part.status !== 'running'"
                      class="agent-media-note"
                    >
                      {{ part.text }}
                    </p>
                  </div>
                  <div
                    v-else
                    class="agent-tool"
                    :data-status="part.status"
                  >
                    <div class="agent-tool-head">
                      <button
                        v-if="part.output"
                        type="button"
                        class="agent-tool-toggle"
                        :aria-expanded="isToolExpanded(part.id)"
                        :aria-label="
                          isToolExpanded(part.id)
                            ? '收起输出'
                            : '展开完整输出'
                        "
                        :title="
                          isToolExpanded(part.id)
                            ? '收起输出'
                            : '展开完整输出'
                        "
                        @click="toggleTool(part.id)"
                      >
                        <ChevronDown
                          v-if="isToolExpanded(part.id)"
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
                        <Wrench
                          :size="13"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <span class="agent-tool-title">{{
                          part.title
                        }}</span>
                      </button>
                      <span v-else class="agent-tool-static">
                        <Wrench
                          :size="13"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <span class="agent-tool-title">{{
                          part.title
                        }}</span>
                      </span>
                      <span class="agent-tool-status">{{
                        statusLabel(part.status)
                      }}</span>
                      <button
                        v-if="part.output"
                        type="button"
                        class="agent-tool-action"
                        :aria-label="
                          copiedId === part.id
                            ? '已复制输出'
                            : '复制输出'
                        "
                        :title="
                          copiedId === part.id
                            ? '已复制输出'
                            : '复制输出'
                        "
                        @click="copyToolOutput(part)"
                      >
                        <Check
                          v-if="copiedId === part.id"
                          :size="13"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <Copy
                          v-else
                          :size="13"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    <pre
                      v-if="part.output && isToolExpanded(part.id)"
                      class="agent-tool-output"
                      >{{ part.output }}</pre
                    >
                    <div
                      v-if="part.artifacts?.length"
                      class="agent-artifacts"
                    >
                      <span
                        v-for="artifact in part.artifacts"
                        :key="artifact.id"
                        class="agent-artifact-group"
                      >
                        <button
                          type="button"
                          class="agent-artifact"
                          :aria-label="`保存 ${artifact.name}`"
                          :title="`保存 ${artifact.name}`"
                          @click="saveSource(artifact.id)"
                        >
                          <FileTypeIcon
                            :name="artifact.name"
                            :size="14"
                          />
                          <span>{{ artifact.name }}</span>
                          <Download
                            :size="12"
                            :stroke-width="2"
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          type="button"
                          class="agent-artifact-open"
                          :aria-label="`打开 ${artifact.name}`"
                          :title="`打开 ${artifact.name}`"
                          @click="openSource(artifact.id)"
                        >
                          <SquareArrowOutUpRight
                            :size="12"
                            :stroke-width="2"
                            aria-hidden="true"
                          />
                        </button>
                      </span>
                    </div>
                  </div>
                </template>
                <div
                  v-if="
                    (message.role === 'assistant' ||
                      message.role === 'user') &&
                    assistantText(message)
                  "
                  class="agent-message-actions"
                >
                  <template v-if="message.role === 'assistant'">
                    <button
                      v-if="!busy"
                      type="button"
                      class="agent-message-action"
                      :aria-label="
                        speakingId === message.id ? '停止朗读' : '朗读'
                      "
                      :title="
                        speakingId === message.id ? '停止朗读' : '朗读'
                      "
                      @click="toggleSpeak(message)"
                    >
                      <Square
                        v-if="speakingId === message.id"
                        :size="12"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                      <Volume2
                        v-else
                        :size="14"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                    </button>
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
                    <button
                      v-if="
                        message.id === lastAssistantId &&
                        !busy &&
                        !agent?.retryLabel
                      "
                      type="button"
                      class="agent-message-action"
                      aria-label="重新生成"
                      title="重新生成"
                      @click="regenerateLast"
                    >
                      <RotateCcw
                        :size="14"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="agent-message-action"
                    :disabled="busy"
                    aria-label="编辑并重发"
                    title="编辑并重发"
                    @click="startEdit(message)"
                  >
                    <PenLine
                      :size="14"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </article>
              <p v-if="busy" class="agent-running">正在执行…</p>
              <div
                v-else-if="agent?.retryLabel"
                class="agent-retry-row"
              >
                <button
                  type="button"
                  class="agent-retry-action"
                  @click="retryTurn"
                >
                  <RefreshCw :size="14" :stroke-width="2" aria-hidden="true" />
                  {{ agent.retryLabel }}
                </button>
              </div>
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
                class="agent-button"
                :title="`本会话不再确认 ${agent.approval.name}`"
                @click="approveSame(agent.approval.id)"
              >
                同类允许
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
              <div class="agent-composer-context">
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
                <div ref="workspacePicker" class="agent-workspace-picker">
                  <button
                    type="button"
                    class="agent-workspace-select"
                    :disabled="busy"
                    :title="
                      activeProject?.workspace ??
                      workspace ??
                      '选择项目'
                    "
                    aria-label="选择项目"
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
              </div>
              <div
                v-if="attachments.length"
                class="agent-attachments"
                aria-label="已添加的附件"
              >
                <span
                  v-for="item in attachments"
                  :key="item.id"
                  class="agent-attachment"
                  :class="{ 'is-error': item.uploadError }"
                >
                  <img
                    v-if="attachmentPreviews[item.id]"
                    class="agent-attachment-thumb"
                    :src="attachmentPreviews[item.id]"
                    alt=""
                  />
                  <FileTypeIcon v-else :name="item.name" :size="16" />
                  <span
                    class="agent-attachment-name"
                    :title="
                      item.uploadError
                        ? `${item.name} · ${item.uploadError}`
                        : item.detail
                          ? `${item.name} · ${item.detail}`
                          : item.name
                    "
                  >
                    {{ item.name }}
                  </span>
                  <button
                    v-if="
                      item.uploadError && item.needsModelUpload
                    "
                    type="button"
                    class="agent-attachment-retry"
                    :disabled="retryingAttachmentId === item.id"
                    :aria-label="`重试上传 ${item.name}`"
                    :title="item.uploadError"
                    @click="retryAttachment(item.id)"
                  >
                    <RefreshCw
                      :class="{
                        'is-spinning': retryingAttachmentId === item.id,
                      }"
                      :size="11"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
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
                ref="composerInput"
                v-model="draft"
                class="agent-input"
                rows="1"
                :placeholder="`让“${petName}”来帮你工作`"
                aria-label="给智能体发送指令"
                @paste="onPaste"
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
                      :size="15"
                      :stroke-width="2.5"
                      aria-hidden="true"
                    />
                  </button>
                  <div ref="approvalPicker" class="agent-approval-picker">
                    <button
                      type="button"
                      class="agent-approval-select"
                      :class="{ 'is-full': approvalMode === 'full' }"
                      :disabled="busy"
                      :aria-expanded="approvalMenuOpen"
                      aria-haspopup="dialog"
                      aria-label="批准模式"
                      :title="agentApprovalModeHints[approvalMode]"
                      @click="toggleApprovalMenu"
                    >
                      <component
                        :is="approvalIcons[approvalMode]"
                        :size="13"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                      <span>{{ agentApprovalModeLabels[approvalMode] }}</span>
                    </button>
                    <div
                      v-if="approvalMenuOpen"
                      class="agent-approval-menu"
                      role="dialog"
                      aria-label="批准模式"
                    >
                      <button
                        v-for="option in agentApprovalModes"
                        :key="option"
                        type="button"
                        class="agent-approval-option"
                        :class="{ 'is-danger': option === 'full' }"
                        role="menuitemradio"
                        :aria-checked="approvalMode === option"
                        :title="agentApprovalModeHints[option]"
                        @click="selectApprovalMode(option)"
                      >
                        <component
                          :is="approvalIcons[option]"
                          :size="14"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <span class="agent-approval-copy">
                          <span class="agent-approval-label">{{
                            agentApprovalModeLabels[option]
                          }}</span>
                          <span class="agent-approval-hint">{{
                            agentApprovalModeHints[option]
                          }}</span>
                        </span>
                        <Check
                          v-if="approvalMode === option"
                          class="agent-approval-check"
                          :size="14"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                  <div
                    v-if="showGenerationParams"
                    ref="generationPicker"
                    class="agent-generation"
                  >
                    <button
                      type="button"
                      class="agent-generation-trigger"
                      :aria-expanded="generationMenuOpen"
                      aria-haspopup="dialog"
                      :aria-label="`生成参数，当前 ${generationLabel}`"
                      @click="generationMenuOpen = !generationMenuOpen"
                    >
                      <SlidersHorizontal
                        :size="12"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                      <span>{{ generationLabel }}</span>
                    </button>
                    <div
                      v-if="generationMenuOpen"
                      class="agent-generation-menu"
                      role="dialog"
                      aria-label="生成参数"
                    >
                      <template v-if="generationKind === 'video'">
                        <p class="agent-generation-label">清晰度</p>
                        <div
                          class="agent-generation-segment"
                          :style="segmentStyle(h3VideoResolutions, generationParams.video.resolution)"
                        >
                          <span
                            class="agent-generation-segment-thumb"
                            aria-hidden="true"
                          ></span>
                          <button
                            v-for="value in h3VideoResolutions"
                            :key="value"
                            type="button"
                            :class="{
                              active:
                                generationParams.video.resolution === value,
                            }"
                            @click="setVideoParam({ resolution: value })"
                          >
                            {{ value }}
                          </button>
                        </div>
                        <p class="agent-generation-label">画面比例</p>
                        <div
                          class="agent-generation-segment is-compact"
                          :style="segmentStyle(generationRatios, generationParams.video.ratio)"
                        >
                          <span
                            class="agent-generation-segment-thumb"
                            aria-hidden="true"
                          ></span>
                          <button
                            v-for="value in generationRatios"
                            :key="value"
                            type="button"
                            :class="{
                              active: generationParams.video.ratio === value,
                            }"
                            @click="setVideoParam({ ratio: value })"
                          >
                            {{ ratioLabel(value) }}
                          </button>
                        </div>
                        <div class="agent-generation-heading">
                          <p>视频时长</p>
                          <span>{{ generationParams.video.duration }} 秒</span>
                        </div>
                        <div
                          class="agent-generation-slider"
                          :style="rangeStyle(generationParams.video.duration, 4, 15)"
                        >
                          <span
                            class="agent-generation-slider-fill"
                            aria-hidden="true"
                          ></span>
                          <span
                            class="agent-generation-slider-thumb"
                            aria-hidden="true"
                          ></span>
                          <input
                            v-model.number="generationParams.video.duration"
                            class="agent-generation-range"
                            type="range"
                            min="4"
                            max="15"
                            step="1"
                            aria-label="视频时长"
                          />
                        </div>
                      </template>
                      <template v-else-if="generationKind === 'image'">
                        <p class="agent-generation-label">输出尺寸</p>
                        <div
                          class="agent-generation-segment"
                          :style="segmentStyle(imageAreas, generationParams.image.area)"
                        >
                          <span
                            class="agent-generation-segment-thumb"
                            aria-hidden="true"
                          ></span>
                          <button
                            v-for="value in imageAreas"
                            :key="value"
                            type="button"
                            :class="{
                              active: generationParams.image.area === value,
                            }"
                            @click="setImageParam({ area: value })"
                          >
                            {{ value }}
                          </button>
                        </div>
                        <p class="agent-generation-label">画面比例</p>
                        <div
                          class="agent-generation-segment is-compact"
                          :style="segmentStyle(imageRatios, generationParams.image.ratio)"
                        >
                          <span
                            class="agent-generation-segment-thumb"
                            aria-hidden="true"
                          ></span>
                          <button
                            v-for="value in imageRatios"
                            :key="value"
                            type="button"
                            :class="{
                              active: generationParams.image.ratio === value,
                            }"
                            @click="setImageParam({ ratio: value })"
                          >
                            {{ ratioLabel(value) }}
                          </button>
                        </div>
                        <p class="agent-generation-label">输出格式</p>
                        <div
                          class="agent-generation-segment"
                          :style="segmentStyle(imageFormats, generationParams.image.format)"
                        >
                          <span
                            class="agent-generation-segment-thumb"
                            aria-hidden="true"
                          ></span>
                          <button
                            v-for="value in imageFormats"
                            :key="value"
                            type="button"
                            :class="{
                              active: generationParams.image.format === value,
                            }"
                            @click="setImageParam({ format: value })"
                          >
                            {{ value.toUpperCase() }}
                          </button>
                        </div>
                        <div class="agent-generation-heading">
                          <p>生成数量</p>
                          <span>{{ generationParams.image.count }} 张</span>
                        </div>
                        <div
                          class="agent-generation-slider"
                          :style="rangeStyle(generationParams.image.count, 1, 10)"
                        >
                          <span
                            class="agent-generation-slider-fill"
                            aria-hidden="true"
                          ></span>
                          <span
                            class="agent-generation-slider-thumb"
                            aria-hidden="true"
                          ></span>
                          <input
                            v-model.number="generationParams.image.count"
                            class="agent-generation-range"
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            aria-label="生成数量"
                          />
                        </div>
                      </template>
                      <template v-else>
                        <p class="agent-generation-label">音色</p>
                        <select
                          class="agent-generation-select"
                          :value="generationParams.speech.voiceId"
                          aria-label="音色"
                          @change="onVoiceChange"
                        >
                          <option
                            v-for="voice in speechVoices"
                            :key="voice.id"
                            :value="voice.id"
                          >
                            {{ voice.label }}
                          </option>
                        </select>
                        <div class="agent-generation-heading">
                          <p>语速</p>
                          <span>{{ generationParams.speech.speed.toFixed(1) }}x</span>
                        </div>
                        <div
                          class="agent-generation-slider"
                          :style="rangeStyle(generationParams.speech.speed, 0.5, 2)"
                        >
                          <span
                            class="agent-generation-slider-fill"
                            aria-hidden="true"
                          ></span>
                          <span
                            class="agent-generation-slider-thumb"
                            aria-hidden="true"
                          ></span>
                          <input
                            v-model.number="generationParams.speech.speed"
                            class="agent-generation-range"
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.1"
                            aria-label="语速"
                          />
                        </div>
                        <p class="agent-generation-label">情绪</p>
                        <div
                          class="agent-generation-segment is-compact"
                          :style="segmentStyle(speechEmotions, generationParams.speech.emotion)"
                        >
                          <span
                            class="agent-generation-segment-thumb"
                            aria-hidden="true"
                          ></span>
                          <button
                            v-for="value in speechEmotions"
                            :key="value || 'auto'"
                            type="button"
                            :class="{
                              active: generationParams.speech.emotion === value,
                            }"
                            @click="setSpeechParam({ emotion: value })"
                          >
                            {{ speechEmotionLabels[value] }}
                          </button>
                        </div>
                        <p class="agent-generation-label">输出格式</p>
                        <div
                          class="agent-generation-segment"
                          :style="segmentStyle(speechFormats, generationParams.speech.format)"
                        >
                          <span
                            class="agent-generation-segment-thumb"
                            aria-hidden="true"
                          ></span>
                          <button
                            v-for="value in speechFormats"
                            :key="value"
                            type="button"
                            :class="{
                              active: generationParams.speech.format === value,
                            }"
                            @click="setSpeechParam({ format: value })"
                          >
                            {{ value.toUpperCase() }}
                          </button>
                        </div>
                      </template>
                    </div>
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
                      :aria-label="`选择模型，当前 ${agentModelLabels[model]}${
                        modelReasoning
                          ? `，推理强度${reasoningLabel}`
                          : ''
                      }`"
                      @click="modelMenuOpen = !modelMenuOpen"
                    >
                      <span class="agent-model-name">
                        {{ agentModelLabels[model] }}
                      </span>
                      <span v-if="modelReasoning" class="agent-model-effort">
                        {{ reasoningLabel }}
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
                      <p class="agent-model-group">DeepSeek</p>
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
                        <span>{{ agentModelLabels[id] }}</span>
                      </button>
                      <p class="agent-model-group">MiniMax</p>
                      <button
                        v-for="item in miniMaxModels"
                        :key="item.id"
                        type="button"
                        class="agent-model-option"
                        role="menuitemradio"
                        :aria-checked="model === item.id"
                        :disabled="!minimaxConfigured"
                        :title="
                          minimaxConfigured
                            ? undefined
                            : '先在设置中添加 MiniMax API Key'
                        "
                        @click="setModel(item.id as AgentModelId)"
                      >
                        <Check
                          v-if="model === item.id"
                          :size="14"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                        <span
                          v-else
                          class="agent-model-check-space"
                          aria-hidden="true"
                        ></span>
                        <span>{{ item.label }}</span>
                      </button>
                      <template v-if="modelReasoning">
                        <div class="agent-model-divider"></div>
                        <p class="agent-model-group">推理强度</p>
                        <button
                          v-for="level in reasoningLevels"
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
                      </template>
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
                    <ArrowUp
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
              <div v-if="proBlocked" class="agent-pro-hint">
                <span>当前模型只支持文字附件</span>
                <button
                  type="button"
                  class="agent-pro-switch"
                  :disabled="busy || !draft.trim()"
                  @click="switchToFlashAndSend"
                >
                  切换 Flash 继续
                </button>
              </div>
              <p
                v-else-if="attachmentError || error"
                class="agent-error"
              >
                {{ attachmentError || error }}
              </p>
            </div>
          </div>
        </template>
      </section>
    </section>

    <Transition name="agent-toast">
      <div
        v-if="panelToast"
        class="agent-toast"
        role="status"
        @click="panelToast = ''"
      >
        {{ panelToast }}
      </div>
    </Transition>

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
            @click="openProjectPolicy(menuProject)"
          >
            <Shield :size="14" :stroke-width="2" aria-hidden="true" />
            工具权限
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
            class="agent-menu-item"
            role="menuitem"
            :disabled="busy && menuSession.id === agent?.sessionId"
            @click="clearFromMenu(menuSession)"
          >
            <Eraser :size="14" :stroke-width="2" aria-hidden="true" />
            清空对话
          </button>
          <button
            v-if="!menuSession.archived"
            type="button"
            class="agent-menu-item"
            role="menuitem"
            @click="archiveFromMenu(menuSession)"
          >
            <Archive :size="14" :stroke-width="2" aria-hidden="true" />
            归档
          </button>
          <button
            v-else
            type="button"
            class="agent-menu-item"
            role="menuitem"
            @click="unarchiveFromMenu(menuSession)"
          >
            <ArchiveRestore
              :size="14"
              :stroke-width="2"
              aria-hidden="true"
            />
            取消归档
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
                : dialog.kind === 'move-session'
                  ? '移动对话'
                  : '工具权限'
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
                    : dialog.kind === 'move-session'
                      ? '移动对话'
                      : '工具权限'
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

        <template v-if="dialog.kind === 'project-policy'">
          <div class="agent-move-list">
            <button
              v-for="policy in agentToolPolicies"
              :key="policy"
              type="button"
              class="agent-move-row"
              :class="{
                active: policyProject?.toolPolicy === policy,
              }"
              @click="setProjectPolicy(policy)"
            >
              <Check
                v-if="policyProject?.toolPolicy === policy"
                :size="15"
                :stroke-width="2"
                aria-hidden="true"
              />
              <Shield
                v-else
                :size="15"
                :stroke-width="2"
                aria-hidden="true"
              />
              <span>{{ agentToolPolicyLabels[policy] }}</span>
            </button>
          </div>
        </template>

        <template v-else-if="dialog.kind === 'move-session'">
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
            <span
              class="agent-field-count"
              :class="{ 'is-over': dialogNameOverLimit }"
              >{{ dialogNameLength }}/{{ maxAgentNameChars }}</span
            >
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

          <p
            v-if="dialogNameOverLimit || dialogError"
            class="agent-error agent-dialog-error"
          >
            {{ dialogNameOverLimit ? dialogNameLimitHint : dialogError }}
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
              :disabled="!draftName.trim() || dialogNameOverLimit"
              @click="saveRename"
            >
              保存
            </button>
            <button
              v-else
              type="button"
              class="agent-button primary"
              :disabled="!draftWorkspace.trim() || dialogNameOverLimit"
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
      v-if="editingMessage"
      class="agent-modal-layer"
      @mousedown.self="editingMessage = null"
    >
      <div
        class="agent-modal agent-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="编辑消息"
      >
        <header class="agent-modal-head">
          <h2>编辑消息</h2>
        </header>
        <textarea
          ref="editInput"
          v-model="editDraft"
          class="agent-edit-input"
          rows="6"
          aria-label="消息内容"
          @keydown.enter.meta.prevent="submitEdit"
          @keydown.enter.ctrl.prevent="submitEdit"
        ></textarea>
        <footer class="agent-modal-foot">
          <span class="agent-modal-spacer" />
          <button
            type="button"
            class="agent-button"
            @click="editingMessage = null"
          >
            取消
          </button>
          <button
            type="button"
            class="agent-button primary"
            :disabled="!editDraft.trim()"
            @click="submitEdit"
          >
            保存并发送
          </button>
        </footer>
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
        <p
          v-if="confirm.kind === 'clear-session'"
          class="agent-confirm-note"
        >
          消息和附件记录会被清空，对话会保留。
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
  position: relative;
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
.agent-session-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 32px;
  margin-bottom: 6px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-muted);
}
.agent-session-search:focus-within {
  border-color: var(--color-brand);
}
.agent-session-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.agent-session-search input::placeholder {
  color: var(--color-muted);
}
.agent-session-search-clear {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-circle);
  background: transparent;
  color: var(--color-muted);
}
.agent-session-search-clear:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.agent-session-search-clear:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-archive-mark {
  flex: none;
  color: var(--color-muted);
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
.agent-context-notice {
  display: flex;
  align-items: center;
  align-self: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
  color: var(--color-muted);
  font-size: var(--font-size-label);
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
.agent-reasoning {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface-muted);
}
.agent-reasoning-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-reasoning-head:hover {
  color: var(--color-ink);
}
.agent-reasoning-head:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-reasoning-text {
  max-height: 240px;
  margin: 0;
  padding: 8px 10px;
  overflow: auto;
  border-top: 1px solid var(--color-line);
  color: var(--color-muted);
  font-size: var(--font-size-label);
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
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
.agent-tool-toggle,
.agent-tool-static {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  text-align: left;
}
.agent-tool-toggle:hover {
  color: var(--color-brand-ink);
}
.agent-tool-toggle:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-tool-toggle svg,
.agent-tool-static svg {
  flex: none;
}
.agent-tool-action {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
}
.agent-tool-action:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-tool-action:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
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
.agent-artifact-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.agent-artifact-open {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-muted);
}
.agent-artifact-open:hover {
  border-color: var(--color-brand);
  color: var(--color-brand-ink);
}
.agent-artifact-open:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
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
.agent-retry-row {
  display: flex;
  justify-content: flex-start;
}
.agent-retry-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  transition:
    background var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}
.agent-retry-action:hover {
  background: var(--color-fill-secondary);
}
.agent-retry-action:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
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
.agent-composer-context {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 34px;
  margin: -10px -10px 0 -12px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--color-line);
  border-radius: calc(var(--radius-stage) - 1px)
    calc(var(--radius-stage) - 1px) 0 0;
  background: var(--color-fill-secondary);
}
.agent-composer-context .agent-workspace-select {
  max-width: 260px;
  color: var(--color-ink);
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
  color: var(--color-ink);
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
  width: 220px;
  max-width: calc(100vw - 24px);
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
.agent-attachment-thumb {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-xs);
  object-fit: cover;
}
.agent-attachment-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-attachment.is-error {
  background: var(--color-danger-soft);
}
.agent-attachment.is-error .agent-attachment-name {
  color: var(--color-danger);
}
.agent-attachment-retry {
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
  color: var(--color-danger);
}
.agent-attachment-retry:hover {
  background: var(--color-danger-soft);
}
.agent-attachment-retry:disabled {
  cursor: default;
  opacity: 0.55;
}
.agent-attachment-retry:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -1px;
}
.agent-attachment-retry svg.is-spinning {
  animation: agent-spin 0.9s linear infinite;
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
.agent-approval-picker {
  position: relative;
  display: inline-flex;
  min-width: 0;
}
.agent-approval-select {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
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
.agent-approval-select:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-approval-select:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-approval-select:disabled {
  cursor: default;
  opacity: 0.55;
}
.agent-approval-select svg {
  flex: none;
}
.agent-approval-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: 268px;
  padding: var(--space-1);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}
.agent-approval-option {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
  min-height: 52px;
  padding: 8px var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-approval-option:hover {
  background: var(--color-fill-secondary);
}
.agent-approval-option > svg:first-child {
  flex: none;
  margin-top: 1px;
  color: var(--color-muted);
}
.agent-approval-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.agent-approval-label {
  font-size: var(--font-size-label);
  line-height: 1.4;
}
.agent-approval-hint {
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  line-height: 1.4;
}
.agent-approval-option.is-danger .agent-approval-label,
.agent-approval-option.is-danger .agent-approval-hint,
.agent-approval-option.is-danger > svg:first-child {
  color: var(--color-danger);
}
.agent-approval-select.is-full {
  color: var(--color-danger);
}
.agent-approval-check {
  flex: none;
  margin-left: auto;
  color: var(--color-brand);
}
.agent-approval-option:focus-visible {
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
.agent-model-option:disabled {
  cursor: default;
  opacity: 0.45;
}
.agent-generation {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: var(--space-2);
}
.agent-generation-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  transition: color var(--motion-fast) var(--ease-standard);
}
.agent-generation-trigger:hover {
  color: var(--color-brand-ink);
}
.agent-generation-trigger:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-generation-trigger > svg {
  flex: none;
}
.agent-generation-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: 320px;
  max-height: min(440px, 60vh);
  padding: var(--space-3);
  overflow: auto;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}
.agent-generation-label {
  margin: 0 0 var(--space-1);
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
  font-weight: 700;
}
.agent-generation-label:not(:first-child) {
  margin-top: var(--space-3);
}
.agent-generation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: var(--space-3) 0 var(--space-1);
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
  font-weight: 700;
}
.agent-generation-heading p {
  margin: 0;
  font-weight: 700;
}
.agent-generation-heading span {
  color: var(--color-ink);
  font-weight: 700;
}
.agent-generation-segment {
  position: relative;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-control);
  background: var(--color-surface-muted);
}
.agent-generation-segment-thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  z-index: 0;
  width: calc((100% - 4px) / var(--segment-count, 1));
  border-radius: calc(var(--radius-control) - 2px);
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  pointer-events: none;
  transform: translateX(calc(var(--segment-index, 0) * 100%));
  transition: transform var(--motion-normal) var(--ease-spring);
}
.agent-generation-segment button {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 26px;
  padding: 0 4px;
  border: 0;
  border-radius: calc(var(--radius-control) - 2px);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-caption);
  font-weight: 700;
  white-space: nowrap;
  transition: color var(--motion-fast) var(--ease-standard);
}
.agent-generation-segment button:hover {
  color: var(--color-ink);
}
.agent-generation-segment button.active {
  background: transparent;
  color: var(--color-brand-ink);
  font-weight: 700;
}
.agent-generation-segment button:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: -1px;
}
.agent-generation-segment.is-compact button {
  padding: 0 2px;
  font-size: var(--font-size-caption);
}
.agent-generation-select {
  width: 100%;
  min-height: 30px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-caption);
}
.agent-generation-slider {
  position: relative;
  display: flex;
  align-items: center;
  height: 24px;
}
.agent-generation-slider::before {
  position: absolute;
  right: 7px;
  left: 7px;
  height: 4px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-line);
  content: '';
}
.agent-generation-slider-fill {
  position: absolute;
  left: 7px;
  width: calc((100% - 14px) * var(--range-ratio, 0));
  height: 4px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-brand);
  transition: width var(--motion-normal) var(--ease-spring);
}
.agent-generation-slider-thumb {
  position: absolute;
  top: 50%;
  left: calc(7px + (100% - 14px) * var(--range-ratio, 0));
  z-index: 2;
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-brand);
  border-radius: var(--radius-circle);
  background: var(--color-surface);
  box-shadow: var(--shadow-control);
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition:
    left var(--motion-normal) var(--ease-spring),
    transform var(--motion-fast) var(--ease-spring);
}
.agent-generation-slider:hover .agent-generation-slider-thumb {
  transform: translate(-50%, -50%) scale(1.12);
}
.agent-generation-slider:has(.agent-generation-range:active)
  .agent-generation-slider-thumb {
  transform: translate(-50%, -50%) scale(1.2);
}
.agent-generation-slider:has(.agent-generation-range:focus-visible)
  .agent-generation-slider-thumb {
  outline: var(--mqmz-focus-ring);
  outline-offset: 2px;
}
.agent-generation-range {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 24px;
  margin: 0;
  appearance: none;
  background: transparent;
}
.agent-generation-range::-webkit-slider-runnable-track {
  height: 4px;
  background: transparent;
}
.agent-generation-range::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border: 0;
  border-radius: var(--radius-circle);
  appearance: none;
  background: transparent;
  box-shadow: none;
}
.agent-generation-range:focus-visible {
  outline: none;
}
.agent-media {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 100%;
}
.agent-media-grid {
  display: grid;
  gap: var(--space-2);
}
.agent-media-grid[data-kind='image'] {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  width: min(100%, 440px);
}
.agent-media-grid[data-kind='video'] {
  width: min(100%, 480px);
}
.agent-media-grid[data-kind='audio'] {
  width: min(100%, 420px);
}
.agent-media-item {
  position: relative;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
}
.agent-media-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 34px;
  padding: 4px 6px 4px 10px;
  border-radius: var(--radius-card) var(--radius-card) 0 0;
}
.agent-media-reveal {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-brand-ink);
  font: inherit;
  font-size: var(--font-size-label);
  text-align: left;
}
.agent-media-reveal > svg {
  flex: none;
  width: 14px;
  height: 14px;
}
.agent-media-reveal:hover > span:not(.agent-media-path) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.agent-media-reveal:focus-visible,
.agent-media-save-as:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-media-path {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  width: max-content;
  max-width: min(420px, 70vw);
  padding: 8px 10px;
  border-radius: var(--radius-control);
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: var(--font-size-caption);
  font-weight: 400;
  line-height: 1.5;
  overflow-wrap: anywhere;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-2px);
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}
.agent-media-reveal:hover .agent-media-path,
.agent-media-reveal:focus-visible .agent-media-path {
  opacity: 1;
  transform: translateY(0);
}
.agent-media-save-as {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  min-height: 26px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.agent-media-save-as:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
}
.agent-media-frame {
  overflow: hidden;
  border-top: 1px solid var(--color-line);
  border-radius: 0 0 var(--radius-card) var(--radius-card);
}
.agent-media-frame img,
.agent-media-frame video {
  display: block;
  width: 100%;
  max-height: 360px;
  background: var(--color-surface-muted);
  object-fit: contain;
}
.agent-media-frame audio {
  display: block;
  width: 100%;
  padding: var(--space-2);
}
.agent-media-placeholder {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: calc(var(--radius-card) - 1px);
  background-color: var(--color-surface-muted);
  background-image: radial-gradient(
    var(--color-line) 1px,
    transparent 1.2px
  );
  background-size: 10px 10px;
}
.agent-media-placeholder[data-kind='image'] {
  aspect-ratio: 1 / 1;
}
.agent-media-placeholder[data-kind='video'] {
  aspect-ratio: 16 / 9;
}
.agent-media-placeholder[data-kind='audio'] {
  aspect-ratio: 5 / 2;
}
.agent-media-spinner {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-surface);
  color: var(--color-brand-ink);
  box-shadow: var(--shadow-control);
}
.agent-media-spinner svg.is-spinning {
  animation: agent-spin 0.9s linear infinite;
}
.agent-media-failed {
  margin: 0;
  padding: var(--space-3);
  color: var(--color-warning);
  font-size: var(--font-size-caption);
}
.agent-media-note {
  margin: 0;
  color: var(--color-warning);
  font-size: var(--font-size-caption);
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
.agent-pro-hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.agent-pro-switch {
  min-height: 24px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-brand-ink);
  font: inherit;
  font-size: var(--font-size-label);
  transition: background var(--motion-fast) var(--ease-standard);
}
.agent-pro-switch:hover {
  background: var(--color-fill-secondary);
}
.agent-pro-switch:disabled {
  cursor: default;
  opacity: 0.55;
}
.agent-pro-switch:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
  line-height: 1.5;
  text-align: right;
  overflow-wrap: anywhere;
}
.agent-toast {
  position: absolute;
  top: 48px;
  left: 50%;
  z-index: 60;
  max-width: min(560px, calc(100% - 64px));
  padding: 8px 14px;
  border-radius: var(--radius-card);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  box-shadow: var(--shadow-overlay);
  font-size: var(--font-size-label);
  line-height: 1.5;
  text-align: center;
  overflow-wrap: anywhere;
  transform: translateX(-50%);
}
.agent-toast-enter-active,
.agent-toast-leave-active {
  transition: opacity var(--motion-fast) var(--ease-out);
}
.agent-toast-enter-from,
.agent-toast-leave-to {
  opacity: 0;
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
.agent-skills-filter {
  position: relative;
  display: grid;
  flex: none;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 220px;
  padding: 2px;
  border-radius: var(--radius-pill);
  background: var(--color-fill-secondary);
}
.agent-skills-filter-thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc((100% - 4px) / 3);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  pointer-events: none;
  transition: transform var(--motion-normal) var(--ease-spring);
}
.agent-skills-filter-thumb.enabled {
  transform: translateX(100%);
}
.agent-skills-filter-thumb.disabled {
  transform: translateX(200%);
}
.agent-skills-filter button {
  position: relative;
  z-index: 1;
  min-height: 26px;
  padding: 0 var(--space-1);
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-caption);
}
.agent-skills-filter button.active {
  color: var(--color-ink);
}
.agent-skills-filter button:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-skills-more {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  justify-content: center;
  min-width: 88px;
  min-height: 30px;
  padding: 0 var(--space-8);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
}
.agent-skills-more.is-collapse {
  min-width: 0;
}
.agent-skills-more:hover {
  border-color: var(--color-brand);
  color: var(--color-brand-ink);
}
.agent-skills-more:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-skills-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.agent-skills-total {
  flex: none;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  white-space: nowrap;
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
  border-radius: var(--radius-pill);
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
.agent-skills-search-clear {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-circle);
  background: transparent;
  color: var(--color-muted);
}
.agent-skills-search-clear:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.agent-skills-search-clear:focus-visible {
  outline: var(--mqmz-focus-ring);
  outline-offset: 1px;
}
.agent-skills-add {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
}
.agent-skill-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.agent-skill-group:first-of-type {
  margin-top: var(--space-8);
}
.agent-skill-group + .agent-skill-group {
  margin-top: var(--space-6);
}
.agent-skill-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
}
.agent-skill-group-title {
  display: flex;
  align-items: baseline;
  gap: 2px;
  min-width: 0;
}
.agent-skill-group-title h3 {
  margin: 0;
  font-size: var(--font-size-label);
  font-weight: 650;
}
.agent-skill-group-count {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 400;
}
.agent-skills-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-5);
}
@media (min-width: 1100px) {
  .agent-skills-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
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
.agent-skill-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.agent-skill-name {
  flex: 0 1 auto;
  overflow: hidden;
  font-size: var(--font-size-label);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-skill-requires {
  flex: none;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--color-brand-soft);
  color: var(--color-brand-ink);
  font-size: var(--font-size-caption);
  line-height: 18px;
  white-space: nowrap;
}
.agent-skill-detail-requires {
  margin: var(--space-1) 0 0;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  line-height: 1.5;
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
  width: 38px;
  height: 22px;
  min-height: 22px;
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
  width: 16px;
  height: 16px;
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
  transform: translateX(18px);
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
.agent-field-count {
  flex: none;
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
  font-variant-numeric: tabular-nums;
}
.agent-field-count.is-over {
  color: var(--color-danger);
}
.agent-edit-input {
  width: 100%;
  min-height: 132px;
  padding: var(--space-3);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  outline: none;
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
  line-height: 1.55;
  resize: vertical;
}
.agent-edit-input:focus {
  border-color: var(--color-brand);
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
  .agent-thinking-dots span,
  .agent-attachment-retry svg.is-spinning,
  .agent-media-spinner svg.is-spinning {
    animation: none;
  }
  .agent-skills-filter-thumb {
    transition: none;
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
  .agent-media-path,
  .agent-media-save-as,
  .agent-generation-segment-thumb,
  .agent-generation-slider-fill,
  .agent-generation-slider-thumb,
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
