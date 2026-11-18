<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  Flag,
  Folder,
  FolderOpen,
  FolderPlus,
  ListPlus,
  ListTodo,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  X,
  Zap,
} from '@lucide/vue'
import type {
  Command,
  FocusTodo,
  Snapshot,
  TodoFocusTarget,
  TodoList,
  TodoListColor,
  TodoRepeat,
} from '../shared/protocol'
import { defaultTodoListIcon } from '../shared/protocol'
import {
  endOfLocalDay,
  formatDueLabel,
  fromDateTimeLocalValue,
  isSameLocalDay,
  toDateTimeLocalValue,
} from '../shared/todo-time'
import {
  filterFxemoji,
  fxemojiById,
  fxemojiCategories,
  fxemojiUrl,
  type FxEmojiCategory,
} from './fxemoji'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()
const maximized = computed(() => props.state?.todoMaximized === true)

function toggleDefault(): void {
  emit('command', { type: 'panel-control', action: 'toggle-default' })
}
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
    toggleDefault()
  }, 220)
}
function onFrameDoubleClick(event: MouseEvent): void {
  if (event.target !== event.currentTarget) return
  toggleDefault()
}

type SmartId = 'all' | 'today' | 'urgent' | 'flagged' | 'open' | 'done'
type Selection =
  | { kind: 'smart'; id: SmartId }
  | { kind: 'list'; id: string }
  | { kind: 'tag'; id: string }
  | { kind: 'group'; id: string }

const repeatOptions: readonly { value: TodoRepeat; label: string }[] = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '每个工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
]
const repeatLabels = Object.fromEntries(
  repeatOptions.map((option) => [option.value, option.label]),
) as Record<TodoRepeat, string>

const smartLists = [
  { id: 'all', label: '全部', icon: ListTodo },
  { id: 'today', label: '今天', icon: CalendarDays },
  { id: 'urgent', label: '紧急', icon: Zap },
  { id: 'flagged', label: '旗标', icon: Flag },
  { id: 'open', label: '未完成', icon: Circle },
  { id: 'done', label: '已完成', icon: CircleCheck },
] as const satisfies readonly { id: SmartId; label: string; icon: Component }[]

const draft = ref('')
const selection = ref<Selection>({ kind: 'smart', id: 'all' })
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  nowTimer = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
})
onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer)
  if (highlightTimer) clearTimeout(highlightTimer)
})

const todos = computed(() => props.state?.focus.todos ?? [])
const lists = computed(() => props.state?.focus.todoLists ?? [])
const groups = computed(() => props.state?.focus.todoGroups ?? [])
const todoTags = computed(() => props.state?.focus.todoTags ?? [])
const activeList = computed(() => {
  const current = selection.value
  return current.kind === 'list'
    ? lists.value.find((list) => list.id === current.id)
    : undefined
})
const activeSmart = computed<SmartId | undefined>(() =>
  selection.value.kind === 'smart' ? selection.value.id : undefined,
)
const activeTag = computed<string | undefined>(() =>
  selection.value.kind === 'tag' ? selection.value.id : undefined,
)
const activeGroup = computed(() =>
  selection.value.kind === 'group'
    ? groups.value.find((group) => group.id === selection.value.id)
    : undefined,
)

const smartCounts = computed<Record<SmartId, number>>(() => {
  const value = todos.value
  return {
    all: value.length,
    today: value.filter(
      (todo) => todo.dueAt !== null && isSameLocalDay(todo.dueAt, now.value),
    ).length,
    urgent: value.filter((todo) => todo.urgent).length,
    flagged: value.filter((todo) => todo.flagged).length,
    open: value.filter((todo) => !todo.done).length,
    done: value.filter((todo) => todo.done).length,
  }
})
const listCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const todo of todos.value)
    if (todo.listId)
      counts.set(todo.listId, (counts.get(todo.listId) ?? 0) + 1)
  return counts
})
const ungrouped = computed(() =>
  lists.value.filter((list) => !list.groupId),
)
function listsOf(groupId: string) {
  return lists.value.filter((list) => list.groupId === groupId)
}

const visible = computed(() => {
  if (selection.value.kind === 'list')
    return todos.value.filter((todo) => todo.listId === selection.value.id)
  if (selection.value.kind === 'group') {
    const id = selection.value.id
    const listIds = new Set(
      lists.value
        .filter((list) =>
          id === UNGROUPED_ID ? !list.groupId : list.groupId === id,
        )
        .map((list) => list.id),
    )
    return todos.value.filter(
      (todo) => todo.listId !== null && listIds.has(todo.listId),
    )
  }
  if (selection.value.kind === 'tag')
    return todos.value.filter((todo) =>
      selection.value.id
        ? todo.tags.includes(selection.value.id)
        : todo.tags.length > 0,
    )
  const smart = selection.value.id
  if (smart === 'today')
    return todos.value.filter(
      (todo) => todo.dueAt !== null && isSameLocalDay(todo.dueAt, now.value),
    )
  if (smart === 'urgent') return todos.value.filter((todo) => todo.urgent)
  if (smart === 'flagged') return todos.value.filter((todo) => todo.flagged)
  if (smart === 'open') return todos.value.filter((todo) => !todo.done)
  if (smart === 'done') return todos.value.filter((todo) => todo.done)
  return todos.value
})
/** Completed items sink below open ones so the list keeps its pace. */
const ordered = computed(() => [
  ...visible.value.filter((todo) => !todo.done),
  ...visible.value.filter((todo) => todo.done),
])
const visibleDone = computed(() => visible.value.some((todo) => todo.done))
const canAdd = computed(() => {
  if (selection.value.kind === 'smart' && selection.value.id === 'done')
    return false
  // A group is an aggregate view; new todos belong to a concrete list.
  if (selection.value.kind === 'group') return false
  // "All tags" is a cross-tag view; a new todo needs a concrete tag to appear.
  if (selection.value.kind === 'tag' && !selection.value.id) return false
  return true
})
const heading = computed(() => {
  if (activeList.value) return activeList.value.name
  if (selection.value.kind === 'group')
    return activeGroup.value?.name ?? '未分组'
  if (selection.value.kind === 'tag')
    return selection.value.id ? `#${selection.value.id}` : '所有标签'
  return smartLists.find((item) => item.id === activeSmart.value)?.label ?? '全部'
})
const emptyText = computed(() => {
  if (selection.value.kind === 'list') return '清单里还没有待办'
  if (selection.value.kind === 'group') return '这个组里还没有待办'
  if (selection.value.kind === 'tag')
    return selection.value.id ? '没有带这个标签的待办' : '还没有带标签的待办'
  if (activeSmart.value === 'done') return '还没有已完成事项'
  if (activeSmart.value === 'today') return '今天没有安排'
  if (activeSmart.value === 'urgent') return '没有紧急事项'
  if (activeSmart.value === 'flagged') return '没有旗标事项'
  return '没有待办事项'
})

const listColors: {
  value: TodoListColor
  label: string
  token: string
}[] = [
  { value: 'red', label: '红色', token: '#ff453a' },
  { value: 'orange', label: '橙色', token: '#ff9f0a' },
  { value: 'amber', label: '金色', token: '#ffb340' },
  { value: 'yellow', label: '黄色', token: '#ffd60a' },
  { value: 'green', label: '绿色', token: '#30d158' },
  { value: 'teal', label: '青色', token: '#32d6c8' },
  { value: 'blue', label: '蓝色', token: '#0a84ff' },
  { value: 'sky', label: '天蓝', token: '#64d2ff' },
  { value: 'pink', label: '粉色', token: '#ff375f' },
  { value: 'brown', label: '棕色', token: '#b08968' },
  { value: 'gray', label: '灰色', token: '#aeaeb2' },
  { value: 'slate', label: '紫色', token: '#bf5af2' },
]

function listColorToken(color: TodoListColor): string {
  return listColors.find((item) => item.value === color)?.token ?? 'var(--color-info)'
}

const newGroupOpen = ref(false)
const groupDraft = ref('')
const groupInput = ref<HTMLInputElement>()
const collapsedGroups = ref<Record<string, boolean>>({})
const UNGROUPED_ID = '__ungrouped__'
const groupMenu = ref<{ id: string; x: number; y: number } | null>(null)
const tagMenu = ref<{ tag: string; x: number; y: number } | null>(null)
const renamingTag = ref<string | null>(null)
const tagRenameDraft = ref('')
const tagRenameInput = ref<HTMLInputElement | null>(null)
const repeatMenu = ref<{ id: string; x: number; y: number } | null>(null)
const renamingGroupId = ref<string | null>(null)
const renameDraft = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function setRenameInput(element: unknown): void {
  renameInput.value = (element as HTMLInputElement | null) ?? null
}
function setTagRenameInput(element: unknown): void {
  tagRenameInput.value = (element as HTMLInputElement | null) ?? null
}

function isGroupCollapsed(id: string): boolean {
  return collapsedGroups.value[id] === true
}
function toggleGroup(id: string): void {
  collapsedGroups.value = {
    ...collapsedGroups.value,
    [id]: !isGroupCollapsed(id),
  }
}
function nameExists(
  name: string,
  exceptListId?: string,
  exceptGroupId?: string,
): boolean {
  const value = name.trim().toLowerCase()
  if (!value) return false
  return [
    ...groups.value
      .filter((group) => group.id !== exceptGroupId)
      .map((group) => group.name),
    ...lists.value
      .filter((list) => list.id !== exceptListId)
      .map((list) => list.name),
  ].some((existing) => existing.trim().toLowerCase() === value)
}

type ListEditorState = {
  mode: 'create' | 'edit'
  id?: string
  groupId: string | null
  name: string
  color: TodoListColor
  icon: string
}
const editor = ref<ListEditorState | null>(null)
const editorNameInput = ref<HTMLInputElement>()
const iconCategory = ref<FxEmojiCategory>('all')
const iconPickerOpen = ref(false)
const editorIcons = computed(() => filterFxemoji('', iconCategory.value))
const editorIconUrl = computed(() =>
  editor.value ? fxemojiUrl(editor.value.icon) : '',
)
const editorColorToken = computed(() =>
  listColorToken(editor.value?.color ?? 'blue'),
)

function selectSmart(id: SmartId): void {
  closeEditing()
  selection.value = { kind: 'smart', id }
}
function selectList(id: string): void {
  closeEditing()
  selection.value = { kind: 'list', id }
}
function selectTag(id: string): void {
  closeEditing()
  selection.value = { kind: 'tag', id }
}
function selectGroup(id: string): void {
  closeEditing()
  selection.value = { kind: 'group', id }
}
const itemList = ref<HTMLElement | null>(null)
const highlightId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | undefined
const reduceMotion = window.matchMedia?.(
  '(prefers-reduced-motion: reduce)',
).matches
/** Opens the list holding a reminded todo and flashes that row. */
function revealTodo(target: TodoFocusTarget): void {
  const todo = todos.value.find((item) => item.id === target.todoId)
  const listId = todo?.listId ?? target.listId
  closeEditing()
  const list = listId
    ? lists.value.find((item) => item.id === listId)
    : undefined
  const groupKey = list ? (list.groupId ?? UNGROUPED_ID) : undefined
  if (groupKey && isGroupCollapsed(groupKey))
    collapsedGroups.value = { ...collapsedGroups.value, [groupKey]: false }
  selection.value =
    listId && list
      ? { kind: 'list', id: listId }
      : { kind: 'smart', id: 'all' }
  if (todo) {
    highlightId.value = target.todoId
    if (highlightTimer) clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      highlightId.value = null
    }, 2400)
  }
  emit('command', { type: 'todo-focus-ack', nonce: target.nonce })
  void nextTick(() => {
    if (!todo) return
    itemList.value
      ?.querySelector<HTMLElement>(`[data-todo-id="${target.todoId}"]`)
      ?.scrollIntoView({
        block: 'center',
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
  })
}
watch(
  () => props.state?.todoFocus,
  (target) => {
    if (target) revealTodo(target)
  },
  { immediate: true },
)
function addTodo(): void {
  const text = draft.value.trim()
  if (!text || !canAdd.value) return
  // Smart categories only tag the todo; they never assign it to a group or a
  // custom list. Only an explicitly selected list owns the new todo.
  const id = selection.value.kind === 'list' ? selection.value.id : null
  const smart = selection.value.kind === 'smart' ? selection.value.id : null
  const tag =
    selection.value.kind === 'tag' && selection.value.id
      ? selection.value.id
      : null
  emit('command', {
    type: 'todo-add',
    text,
    listId: id,
    dueAt: smart === 'today' ? endOfLocalDay(now.value) : null,
    urgent: smart === 'urgent',
    flagged: smart === 'flagged',
    tags: tag ? [tag] : [],
  })
  draft.value = ''
}
function clearDone(): void {
  emit('command', {
    type: 'todo-clear-done',
    ids: visible.value.filter((todo) => todo.done).map((todo) => todo.id),
  })
}
function toggleField(
  id: string,
  field: 'urgent' | 'flagged',
  value: boolean,
): void {
  emit('command', { type: 'todo-update', id, patch: { [field]: value } })
}

type DueEditorState = { id: string; value: string; existing: number | null }
const dueEditor = ref<DueEditorState | null>(null)
const dueInput = ref<HTMLInputElement>()

async function openDueEditor(todo: FocusTodo): Promise<void> {
  dueEditor.value = {
    id: todo.id,
    existing: todo.dueAt,
    value: toDateTimeLocalValue(todo.dueAt ?? endOfLocalDay(now.value)),
  }
  await nextTick()
  dueInput.value?.focus()
}
function closeDueEditor(): void {
  dueEditor.value = null
}
function saveDueEditor(): void {
  const current = dueEditor.value
  if (!current) return
  const dueAt = fromDateTimeLocalValue(current.value)
  emit('command', {
    type: 'todo-update',
    id: current.id,
    patch: { dueAt },
  })
  dueEditor.value = null
}
function clearDueEditor(): void {
  const current = dueEditor.value
  if (!current) return
  emit('command', {
    type: 'todo-update',
    id: current.id,
    patch: { dueAt: null },
  })
  dueEditor.value = null
}

const noteDrafts = ref<Record<string, string>>({})
const tagDrafts = ref<Record<string, string>>({})
const activeTagRow = ref<string | null>(null)

function noteValue(todo: FocusTodo): string {
  return noteDrafts.value[todo.id] ?? todo.notes
}
function onNoteInput(todo: FocusTodo, event: Event): void {
  noteDrafts.value = {
    ...noteDrafts.value,
    [todo.id]: (event.target as HTMLTextAreaElement).value,
  }
}
function saveNote(todo: FocusTodo): void {
  const value = noteDrafts.value[todo.id]
  if (value === undefined) return
  const notes = value.slice(0, 2000)
  noteDrafts.value = { ...noteDrafts.value, [todo.id]: notes }
  if (notes !== todo.notes)
    emit('command', {
      type: 'todo-update',
      id: todo.id,
      patch: { notes },
    })
}
function tagDraftValue(todo: FocusTodo): string {
  return tagDrafts.value[todo.id] ?? ''
}
function setTagDraft(todo: FocusTodo, event: Event): void {
  tagDrafts.value = {
    ...tagDrafts.value,
    [todo.id]: (event.target as HTMLInputElement).value,
  }
}
function focusTagInput(todo: FocusTodo): void {
  activeTagRow.value = todo.id
}
function blurTagInput(todo: FocusTodo): void {
  if (activeTagRow.value === todo.id) activeTagRow.value = null
}
function tagSuggestionsFor(todo: FocusTodo): string[] {
  return todoTags.value.filter((tag) => !todo.tags.includes(tag))
}
function addInlineTag(todo: FocusTodo, value?: string): void {
  if (todo.tags.length >= 10) return
  const tag = (value ?? tagDrafts.value[todo.id] ?? '')
    .trim()
    .replace(/^#+/, '')
    .slice(0, 20)
  if (!tag) return
  const tags = [...new Set([...todo.tags, tag])].slice(0, 10)
  emit('command', {
    type: 'todo-update',
    id: todo.id,
    patch: { tags },
  })
  tagDrafts.value = { ...tagDrafts.value, [todo.id]: '' }
}
function removeInlineTag(todo: FocusTodo, tag: string): void {
  emit('command', {
    type: 'todo-update',
    id: todo.id,
    patch: { tags: todo.tags.filter((item) => item !== tag) },
  })
}

const editingId = ref<string | null>(null)
const titleDrafts = ref<Record<string, string>>({})

function titleValue(todo: FocusTodo): string {
  return titleDrafts.value[todo.id] ?? todo.text
}
function onTitleInput(todo: FocusTodo, event: Event): void {
  titleDrafts.value = {
    ...titleDrafts.value,
    [todo.id]: (event.target as HTMLInputElement).value,
  }
}
function saveTitle(todo: FocusTodo): void {
  const value = titleDrafts.value[todo.id]
  if (value === undefined) return
  const text = value.trim().slice(0, 200)
  titleDrafts.value = {
    ...titleDrafts.value,
    [todo.id]: text || todo.text,
  }
  if (text && text !== todo.text)
    emit('command', {
      type: 'todo-update',
      id: todo.id,
      patch: { text },
    })
}
function commitEdit(id: string): void {
  const todo = todos.value.find((item) => item.id === id)
  if (!todo) return
  saveTitle(todo)
  saveNote(todo)
}
async function startEdit(todo: FocusTodo): Promise<void> {
  if (editingId.value === todo.id) return
  if (editingId.value) commitEdit(editingId.value)
  editingId.value = todo.id
  await nextTick()
  document
    .querySelector<HTMLInputElement>('.todo-item.editing .todo-title-input')
    ?.focus()
}
function closeEditing(): void {
  if (editingId.value) commitEdit(editingId.value)
  editingId.value = null
}
function handleEscape(): void {
  if (repeatMenu.value) {
    closeRepeatMenu()
    return
  }
  if (groupMenu.value) {
    closeGroupMenu()
    return
  }
  if (tagMenu.value) {
    closeTagMenu()
    return
  }
  if (renamingTag.value) {
    cancelTagRename()
    return
  }
  if (editingId.value) {
    closeEditing()
    return
  }
  close()
}
function handleShellClick(event: MouseEvent): void {
  if (!editingId.value) return
  const path = event.composedPath()
  const element = (node: EventTarget): node is HTMLElement =>
    node instanceof HTMLElement
  if (
    path.some(
      (node) =>
        element(node) &&
        node.classList.contains('todo-item') &&
        node.classList.contains('editing'),
    )
  )
    return
  if (
    path.some(
      (node) =>
        element(node) &&
        node.classList.contains('todo-content') &&
        node.classList.contains('view'),
    )
  )
    return
  if (
    path.some(
      (node) =>
        element(node) &&
        (node.classList.contains('todo-due-backdrop') ||
          node.classList.contains('todo-editor-backdrop') ||
          node.classList.contains('todo-group-menu-backdrop') ||
          node.classList.contains('todo-icon-popover-backdrop')),
    )
  )
    return
  closeEditing()
}
watch(todos, (value) => {
  if (editingId.value && !value.some((todo) => todo.id === editingId.value))
    editingId.value = null
  if (
    repeatMenu.value &&
    !value.some((todo) => todo.id === repeatMenu.value?.id)
  )
    closeRepeatMenu()
})
function close(): void {
  emit('command', { type: 'todo-close' })
}

async function openGroupInput(): Promise<void> {
  editor.value = null
  newGroupOpen.value = true
  groupDraft.value = ''
  await nextTick()
  groupInput.value?.focus()
}
function createGroup(): void {
  const name = groupDraft.value.trim()
  if (!name) return
  if (nameExists(name)) {
    groupInput.value?.setCustomValidity('组名已存在')
    groupInput.value?.reportValidity()
    return
  }
  emit('command', { type: 'todo-group-add', name })
  newGroupOpen.value = false
  groupDraft.value = ''
}
function cancelGroupInput(): void {
  newGroupOpen.value = false
  groupDraft.value = ''
}
function clearGroupValidity(): void {
  groupInput.value?.setCustomValidity('')
}
function clearEditorNameValidity(): void {
  editorNameInput.value?.setCustomValidity('')
}
function handleGroupFocusOut(event: FocusEvent): void {
  if (!newGroupOpen.value || groupDraft.value.trim()) return
  const form = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (next && form?.contains(next)) return
  cancelGroupInput()
}
async function openListEditor(
  groupId: string | null,
  list?: TodoList,
): Promise<void> {
  newGroupOpen.value = false
  editor.value = list
    ? {
        mode: 'edit',
        id: list.id,
        groupId: list.groupId,
        name: list.name,
        color: list.color,
        icon: list.icon,
      }
    : {
        mode: 'create',
        groupId,
        name: '',
        color: 'blue',
        icon: defaultTodoListIcon,
      }
  iconPickerOpen.value = false
  const category = list
    ? fxemojiById(list.icon)?.category
    : 'common'
  iconCategory.value = fxemojiCategories.some((item) => item.id === category)
    ? (category as FxEmojiCategory)
    : 'common'
  await nextTick()
  editorNameInput.value?.focus()
}
function closeEditor(): void {
  iconPickerOpen.value = false
  editor.value = null
}
function selectIcon(id: string): void {
  if (!editor.value) return
  editor.value.icon = id
  iconPickerOpen.value = false
}
function saveList(): void {
  const current = editor.value
  if (!current) return
  const name = current.name.trim()
  if (!name) return
  if (nameExists(name, current.id)) {
    editorNameInput.value?.setCustomValidity('名称已存在')
    editorNameInput.value?.reportValidity()
    return
  }
  const icon = fxemojiById(current.icon) ? current.icon : defaultTodoListIcon
  if (current.mode === 'edit' && current.id) {
    emit('command', {
      type: 'todo-list-update',
      id: current.id,
      name,
      color: current.color,
      icon,
    })
  } else {
    emit('command', {
      type: 'todo-list-add',
      name,
      groupId: current.groupId,
      color: current.color,
      icon,
    })
  }
  editor.value = null
  iconPickerOpen.value = false
}
function removeList(id: string): void {
  if (selection.value.kind === 'list' && selection.value.id === id)
    selection.value = { kind: 'smart', id: 'all' }
  emit('command', { type: 'todo-list-remove', id })
}
function removeGroup(id: string): void {
  closeGroupMenu()
  if (renamingGroupId.value === id) cancelGroupRename()
  if (selection.value.kind === 'group' && selection.value.id === id)
    selection.value = { kind: 'smart', id: 'all' }
  emit('command', { type: 'todo-group-remove', id })
}
async function openGroupMenu(event: MouseEvent, id: string): Promise<void> {
  const x = Math.max(8, Math.min(event.clientX, window.innerWidth - 172))
  const y = Math.max(8, Math.min(event.clientY, window.innerHeight - 96))
  groupMenu.value = { id, x, y }
  await nextTick()
  document
    .querySelector<HTMLButtonElement>('.todo-group-menu button')
    ?.focus()
}
function closeGroupMenu(): void {
  groupMenu.value = null
}
function openActiveGroupMenu(event: MouseEvent): void {
  const current = selection.value
  if (current.kind !== 'group' || current.id === UNGROUPED_ID) return
  void openGroupMenu(event, current.id)
}
function openSelectionListEditor(): void {
  const current = selection.value
  if (current.kind !== 'group') return
  void openListEditor(current.id === UNGROUPED_ID ? null : current.id)
}
function createListFromMenu(id: string): void {
  closeGroupMenu()
  void openListEditor(id === UNGROUPED_ID ? null : id)
}
const repeatMenuTodo = computed(() =>
  repeatMenu.value
    ? todos.value.find((todo) => todo.id === repeatMenu.value?.id)
    : undefined,
)
async function openRepeatMenu(
  event: MouseEvent,
  todo: FocusTodo,
): Promise<void> {
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  const x = Math.max(
    8,
    Math.min(rect?.left ?? event.clientX, window.innerWidth - 172),
  )
  const y = Math.max(
    8,
    Math.min(
      (rect?.bottom ?? event.clientY) + 4,
      window.innerHeight - 210,
    ),
  )
  repeatMenu.value = { id: todo.id, x, y }
  await nextTick()
  document
    .querySelector<HTMLButtonElement>('.todo-repeat-menu button')
    ?.focus()
}
function closeRepeatMenu(): void {
  repeatMenu.value = null
}
function chooseRepeat(repeat: TodoRepeat): void {
  const menu = repeatMenu.value
  if (!menu) return
  const todo = repeatMenuTodo.value
  // Reminders ties repeat rules to a date. Give an undated todo today's
  // deadline so the next occurrence stays on the calendar schedule.
  const dueAt =
    repeat !== 'none' && todo?.dueAt === null
      ? endOfLocalDay(Date.now())
      : undefined
  emit('command', {
    type: 'todo-update',
    id: menu.id,
    patch: dueAt === undefined ? { repeat } : { repeat, dueAt },
  })
  closeRepeatMenu()
}
function deleteGroupFromMenu(id: string): void {
  closeGroupMenu()
  removeGroup(id)
}
async function startRenameGroup(id: string): Promise<void> {
  const group = groups.value.find((item) => item.id === id)
  if (!group) return
  closeGroupMenu()
  renamingGroupId.value = id
  renameDraft.value = group.name
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}
function cancelGroupRename(): void {
  renamingGroupId.value = null
  renameDraft.value = ''
}
function clearRenameValidity(): void {
  renameInput.value?.setCustomValidity('')
}
function saveGroupRename(id: string): void {
  if (renamingGroupId.value !== id) return
  const name = renameDraft.value.trim()
  if (!name) {
    cancelGroupRename()
    return
  }
  if (nameExists(name, undefined, id)) {
    renameInput.value?.setCustomValidity('组名已存在')
    renameInput.value?.reportValidity()
    return
  }
  emit('command', { type: 'todo-group-update', id, name })
  cancelGroupRename()
}
async function openTagMenu(event: MouseEvent, tag: string): Promise<void> {
  const x = Math.max(8, Math.min(event.clientX, window.innerWidth - 172))
  const y = Math.max(8, Math.min(event.clientY, window.innerHeight - 96))
  tagMenu.value = { tag, x, y }
  await nextTick()
  document.querySelector<HTMLButtonElement>('.todo-tag-menu button')?.focus()
}
function closeTagMenu(): void {
  tagMenu.value = null
}
async function startRenameTag(tag: string): Promise<void> {
  closeTagMenu()
  renamingTag.value = tag
  tagRenameDraft.value = tag
  await nextTick()
  tagRenameInput.value?.focus()
  tagRenameInput.value?.select()
}
function cancelTagRename(): void {
  renamingTag.value = null
  tagRenameDraft.value = ''
}
function saveTagRename(tag: string): void {
  if (renamingTag.value !== tag) return
  const next = tagRenameDraft.value.trim().replace(/^#+/, '').slice(0, 20)
  if (!next || next === tag) {
    cancelTagRename()
    return
  }
  if (selection.value.kind === 'tag' && selection.value.id === tag)
    selection.value = { kind: 'tag', id: next }
  emit('command', { type: 'todo-tag-rename', from: tag, to: next })
  cancelTagRename()
}
function deleteTagFromMenu(tag: string): void {
  closeTagMenu()
  if (selection.value.kind === 'tag' && selection.value.id === tag)
    selection.value = { kind: 'tag', id: '' }
  emit('command', { type: 'todo-tag-remove', tag })
}

watch(lists, (value) => {
  const current = selection.value
  if (
    current.kind === 'list' &&
    !value.some((list) => list.id === current.id)
  )
    selection.value = { kind: 'smart', id: 'all' }
  if (
    current.kind === 'group' &&
    current.id === UNGROUPED_ID &&
    !value.some((list) => !list.groupId)
  )
    selection.value = { kind: 'smart', id: 'all' }
})
watch(groups, (value) => {
  const current = selection.value
  if (
    current.kind === 'group' &&
    current.id !== UNGROUPED_ID &&
    !value.some((group) => group.id === current.id)
  )
    selection.value = { kind: 'smart', id: 'all' }
  if (
    renamingGroupId.value &&
    !value.some((group) => group.id === renamingGroupId.value)
  )
    cancelGroupRename()
  if (
    groupMenu.value &&
    !value.some((group) => group.id === groupMenu.value?.id)
  )
    closeGroupMenu()
})
watch(todoTags, (value) => {
  const current = selection.value
  if (current.kind === 'tag' && current.id && !value.includes(current.id))
    selection.value = { kind: 'tag', id: '' }
  if (renamingTag.value && !value.includes(renamingTag.value))
    cancelTagRename()
  if (tagMenu.value && !value.includes(tagMenu.value.tag)) closeTagMenu()
})
</script>

<template>
  <main
    class="todo-shell"
    :class="{ 'is-maximized': maximized }"
    @keydown.esc="handleEscape"
    @click="handleShellClick"
    @dblclick="onFrameDoubleClick"
  >
    <section class="todo-surface" aria-label="待办清单">
      <PanelHeader
        title="待办清单"
        :platform="state?.runtime.platform"
        :resizable="true"
        :maximized="maximized"
        @mousedown="onHeaderMouseDown"
        @dblclick="onHeaderDoubleClick"
        @maximize="toggleDefault"
        @minimize="
          emit('command', { type: 'panel-control', action: 'minimize' })
        "
        @close="emit('command', { type: 'panel-control', action: 'close' })"
      />

      <div class="todo-body">
        <aside class="todo-rail">
          <div class="todo-smart-list" role="tablist" aria-label="待办分类">
            <button
              v-for="item in smartLists"
              :key="item.id"
              type="button"
              role="tab"
              class="todo-smart"
              :class="[item.id, { active: activeSmart === item.id }]"
              :aria-selected="activeSmart === item.id"
              @click="selectSmart(item.id)"
            >
              <span class="todo-smart-top">
                <span class="todo-smart-glyph">
                  <component
                    :is="item.icon"
                    :size="22"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
                <span class="todo-smart-count">{{ smartCounts[item.id] }}</span>
              </span>
              <span class="todo-smart-name">{{ item.label }}</span>
            </button>
          </div>

          <div class="todo-lists-panel panel-scroll">
            <div class="todo-rail-title">
              <span>我的清单</span>
              <span class="todo-rail-title-actions">
                <button
                  type="button"
                  class="todo-rail-action"
                  aria-label="新建清单"
                  title="新建清单"
                  @click="openListEditor(null)"
                >
                  <ListPlus
                    :size="14"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  class="todo-rail-action"
                  aria-label="新建组"
                  title="新建组"
                  @click="openGroupInput"
                >
                  <FolderPlus :size="14" :stroke-width="2" aria-hidden="true" />
                </button>
              </span>
            </div>

            <form
              v-if="newGroupOpen"
              class="todo-inline"
              @submit.prevent="createGroup"
              @focusout="handleGroupFocusOut"
            >
              <input
                ref="groupInput"
                v-model="groupDraft"
                type="text"
                maxlength="40"
                placeholder="组名称"
                aria-label="组名称"
                @input="clearGroupValidity"
                @keydown.esc.stop.prevent="cancelGroupInput"
              />
              <button
                type="button"
                class="todo-inline-cancel"
                aria-label="取消新建组"
                title="取消"
                @click="cancelGroupInput"
              >
                <X :size="14" :stroke-width="2" aria-hidden="true" />
              </button>
              <button
                type="submit"
                class="todo-inline-submit"
                aria-label="创建组"
                :disabled="!groupDraft.trim()"
              >
                <Check :size="14" :stroke-width="2" aria-hidden="true" />
              </button>
            </form>

          <div
            v-for="group in groups"
            :key="group.id"
            class="todo-rail-group"
          >
            <div
              class="todo-group-row"
              :class="{
                selected:
                  selection.kind === 'group' && selection.id === group.id,
              }"
              @click="selectGroup(group.id)"
              @contextmenu.prevent.stop="openGroupMenu($event, group.id)"
            >
              <button
                type="button"
                class="todo-group-toggle"
                :aria-expanded="!isGroupCollapsed(group.id)"
                :aria-label="
                  isGroupCollapsed(group.id) ? '展开组' : '收起组'
                "
                @click.stop="toggleGroup(group.id)"
              >
                <ChevronRight
                  v-if="isGroupCollapsed(group.id)"
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <ChevronDown
                  v-else
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
              <FolderOpen
                v-if="!isGroupCollapsed(group.id)"
                class="todo-group-folder"
                :size="14"
                :stroke-width="2"
                aria-hidden="true"
              />
              <Folder
                v-else
                class="todo-group-folder"
                :size="14"
                :stroke-width="2"
                aria-hidden="true"
              />
              <input
                v-if="renamingGroupId === group.id"
                :ref="setRenameInput"
                v-model="renameDraft"
                class="todo-group-rename"
                type="text"
                maxlength="40"
                aria-label="组名称"
                @click.stop
                @input="clearRenameValidity"
                @keydown.enter.prevent="saveGroupRename(group.id)"
                @keydown.esc.stop.prevent="cancelGroupRename"
                @blur="saveGroupRename(group.id)"
              />
              <span v-else class="todo-group-name">{{ group.name }}</span>
            </div>
            <template v-if="!isGroupCollapsed(group.id)">
              <div
                v-for="list in listsOf(group.id)"
                :key="list.id"
                class="todo-list-row"
                :class="{
                  active:
                    selection.kind === 'list' && selection.id === list.id,
                }"
              >
                <button
                  type="button"
                  class="todo-list-item"
                  :class="{ active: selection.kind === 'list' && selection.id === list.id }"
                  :aria-current="
                    selection.kind === 'list' && selection.id === list.id
                      ? 'true'
                      : undefined
                  "
                  @click="selectList(list.id)"
                >
                  <span
                    class="todo-list-avatar"
                    :style="{ background: listColorToken(list.color) }"
                    :data-icon="list.icon"
                    :data-color="list.color"
                  >
                    <img :src="fxemojiUrl(list.icon)" alt="" loading="lazy" />
                  </span>
                  <span class="todo-list-name">{{ list.name }}</span>
                  <span class="todo-list-count">{{
                    listCounts.get(list.id) ?? 0
                  }}</span>
                </button>
                <span class="todo-list-actions">
                  <button
                    type="button"
                    class="todo-list-action"
                    aria-label="编辑清单"
                    title="编辑清单"
                    @click="openListEditor(list.groupId, list)"
                  >
                    <Pencil :size="12" :stroke-width="2" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="todo-list-action danger"
                    aria-label="删除清单"
                    title="删除清单"
                    @click="removeList(list.id)"
                  >
                    <Trash2 :size="12" :stroke-width="2" aria-hidden="true" />
                  </button>
                </span>
              </div>
            </template>
          </div>

          <div v-if="ungrouped.length" class="todo-rail-group">
            <div
              class="todo-group-row"
              :class="{
                selected:
                  selection.kind === 'group' && selection.id === UNGROUPED_ID,
              }"
              @click="selectGroup(UNGROUPED_ID)"
            >
              <button
                type="button"
                class="todo-group-toggle"
                :aria-expanded="!isGroupCollapsed(UNGROUPED_ID)"
                :aria-label="
                  isGroupCollapsed(UNGROUPED_ID) ? '展开组' : '收起组'
                "
                @click.stop="toggleGroup(UNGROUPED_ID)"
              >
                <ChevronRight
                  v-if="isGroupCollapsed(UNGROUPED_ID)"
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <ChevronDown
                  v-else
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
              <FolderOpen
                v-if="!isGroupCollapsed(UNGROUPED_ID)"
                class="todo-group-folder"
                :size="14"
                :stroke-width="2"
                aria-hidden="true"
              />
              <Folder
                v-else
                class="todo-group-folder"
                :size="14"
                :stroke-width="2"
                aria-hidden="true"
              />
              <span class="todo-group-name">未分组</span>
            </div>
            <template v-if="!isGroupCollapsed(UNGROUPED_ID)">
              <div
                v-for="list in ungrouped"
                :key="list.id"
                class="todo-list-row"
                :class="{
                  active:
                    selection.kind === 'list' && selection.id === list.id,
                }"
              >
                <button
                  type="button"
                  class="todo-list-item"
                  :class="{ active: selection.kind === 'list' && selection.id === list.id }"
                  :aria-current="
                    selection.kind === 'list' && selection.id === list.id
                      ? 'true'
                      : undefined
                  "
                  @click="selectList(list.id)"
                >
                  <span
                    class="todo-list-avatar"
                    :style="{ background: listColorToken(list.color) }"
                    :data-icon="list.icon"
                    :data-color="list.color"
                  >
                    <img :src="fxemojiUrl(list.icon)" alt="" loading="lazy" />
                  </span>
                  <span class="todo-list-name">{{ list.name }}</span>
                  <span class="todo-list-count">{{
                    listCounts.get(list.id) ?? 0
                  }}</span>
                </button>
                <span class="todo-list-actions">
                  <button
                    type="button"
                    class="todo-list-action"
                    aria-label="编辑清单"
                    title="编辑清单"
                    @click="openListEditor(list.groupId, list)"
                  >
                    <Pencil :size="12" :stroke-width="2" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="todo-list-action danger"
                    aria-label="删除清单"
                    title="删除清单"
                    @click="removeList(list.id)"
                  >
                    <Trash2 :size="12" :stroke-width="2" aria-hidden="true" />
                  </button>
                </span>
              </div>
            </template>
          </div>

          </div>
          <section class="todo-tags-panel panel-scroll" aria-label="我的标签">
            <div class="todo-rail-title">
              <span>我的标签</span>
            </div>
            <div v-if="todoTags.length" class="todo-tag-chips">
              <button
                type="button"
                class="todo-tag-chip"
                :class="{ active: activeTag === '' }"
                @click="selectTag('')"
              >
                所有标签
              </button>
              <template v-for="tag in todoTags" :key="tag">
                <input
                  v-if="renamingTag === tag"
                  :ref="setTagRenameInput"
                  v-model="tagRenameDraft"
                  class="todo-tag-chip todo-tag-rename"
                  type="text"
                  maxlength="20"
                  aria-label="标签名称"
                  @click.stop
                  @keydown.enter.prevent="saveTagRename(tag)"
                  @keydown.esc.stop.prevent="cancelTagRename"
                  @blur="saveTagRename(tag)"
                />
                <button
                  v-else
                  type="button"
                  class="todo-tag-chip"
                  :class="{ active: activeTag === tag }"
                  @click="selectTag(tag)"
                  @contextmenu.prevent.stop="openTagMenu($event, tag)"
                >
                  #{{ tag }}
                </button>
              </template>
            </div>
            <p v-else class="todo-tags-empty">还没有标签</p>
          </section>
        </aside>

        <section class="todo-main">
          <div class="todo-main-head">
            <h2
              class="todo-main-title"
              @contextmenu.prevent.stop="openActiveGroupMenu"
            >
              {{ heading }}
              <span class="todo-main-count">{{ visible.length }}</span>
            </h2>
            <button
              v-if="visibleDone"
              type="button"
              class="todo-clear"
              @click="clearDone"
            >
              清除已完成
            </button>
            <button
              v-if="selection.kind === 'group'"
              type="button"
              class="todo-main-action"
              :aria-label="
                selection.id === UNGROUPED_ID
                  ? '在未分组新建清单'
                  : '在组内新建清单'
              "
              title="新建清单"
              @click="openSelectionListEditor"
            >
              <ListPlus :size="16" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>

          <form v-if="canAdd" class="todo-add" @submit.prevent="addTodo">
            <input
              v-model="draft"
              type="text"
              maxlength="200"
              placeholder="新建待办"
              aria-label="新建待办"
            />
            <button
              type="submit"
              class="todo-add-submit button-glass"
              aria-label="添加"
              title="添加"
              :disabled="!draft.trim()"
            >
              <Plus :size="18" :stroke-width="2.2" aria-hidden="true" />
            </button>
          </form>

          <div class="todo-list">
            <ul v-if="ordered.length" ref="itemList" class="todo-items panel-scroll">
              <li
                v-for="todo in ordered"
                :key="todo.id"
                class="todo-item"
                :class="{
                  editing: editingId === todo.id,
                  revealed: highlightId === todo.id,
                }"
                :data-todo-id="todo.id"
                @keydown.esc.stop.prevent="closeEditing"
              >
                <button
                  type="button"
                  class="todo-check"
                  :class="{ done: todo.done }"
                  :aria-pressed="todo.done"
                  :aria-label="todo.done ? '标记未完成' : '标记完成'"
                  @click="emit('command', { type: 'todo-toggle', id: todo.id })"
                >
                  <Check
                    v-if="todo.done"
                    :size="12"
                    :stroke-width="2.6"
                    aria-hidden="true"
                  />
                </button>

                <div
                  v-if="editingId !== todo.id"
                  class="todo-content view"
                  @click="startEdit(todo)"
                >
                  <span class="todo-text" :class="{ done: todo.done }">
                    {{ todo.text }}
                  </span>
                  <span
                    v-if="
                      todo.dueAt !== null ||
                      todo.tags.length ||
                      todo.repeat !== 'none'
                    "
                    class="todo-view-meta"
                  >
                    <span
                      v-if="todo.dueAt !== null"
                      class="todo-view-due"
                      :class="{
                        today: isSameLocalDay(todo.dueAt, now),
                        overdue: todo.dueAt < now,
                      }"
                    >
                      {{ formatDueLabel(todo.dueAt, now) }}
                    </span>
                    <span
                      v-if="todo.repeat !== 'none'"
                      class="todo-view-repeat"
                    >
                      <Repeat
                        :size="11"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                      {{ repeatLabels[todo.repeat] }}
                    </span>
                    <span
                      v-for="tag in todo.tags"
                      :key="tag"
                      class="todo-view-tag"
                    >
                      #{{ tag }}
                    </span>
                  </span>
                </div>

                <div v-else class="todo-content edit">
                  <input
                    class="todo-title-input"
                    :value="titleValue(todo)"
                    type="text"
                    maxlength="200"
                    aria-label="待办标题"
                    @input="onTitleInput(todo, $event)"
                    @blur="saveTitle(todo)"
                    @keydown.enter.prevent="closeEditing"
                  />
                  <textarea
                    class="todo-notes"
                    :value="noteValue(todo)"
                    rows="1"
                    maxlength="2000"
                    placeholder="备注"
                    aria-label="备注"
                    @input="onNoteInput(todo, $event)"
                    @blur="saveNote(todo)"
                  />
                  <div class="todo-inline-tags">
                    <span
                      v-for="tag in todo.tags"
                      :key="tag"
                      class="todo-inline-tag"
                    >
                      #{{ tag }}
                      <button
                        type="button"
                        aria-label="移除标签"
                        title="移除标签"
                        @click="removeInlineTag(todo, tag)"
                      >
                        <X :size="10" :stroke-width="2.4" aria-hidden="true" />
                      </button>
                    </span>
                    <input
                      class="todo-tag-input"
                      :value="tagDraftValue(todo)"
                      type="text"
                      maxlength="20"
                      :placeholder="
                        todo.tags.length >= 10
                          ? '最多 10 个标签'
                          : '添加标签'
                      "
                      :disabled="todo.tags.length >= 10"
                      aria-label="添加标签"
                      @input="setTagDraft(todo, $event)"
                      @focus="focusTagInput(todo)"
                      @blur="blurTagInput(todo)"
                      @keydown.enter.prevent="addInlineTag(todo)"
                    />
                    <div
                      v-if="
                        activeTagRow === todo.id &&
                        todo.tags.length < 10 &&
                        tagSuggestionsFor(todo).length
                      "
                      class="todo-tag-suggestions"
                    >
                      <span class="todo-tag-suggestions-title">标签</span>
                      <button
                        v-for="tag in tagSuggestionsFor(todo)"
                        :key="tag"
                        type="button"
                        @mousedown.prevent="addInlineTag(todo, tag)"
                      >
                        #{{ tag }}
                      </button>
                    </div>
                  </div>
                  <div class="todo-edit-toolbar">
                    <button
                      type="button"
                      class="todo-edit-due"
                      :class="{ active: todo.dueAt !== null }"
                      :aria-label="
                        todo.dueAt !== null ? '修改截止日期' : '设置截止日期'
                      "
                      title="截止日期"
                      @click="openDueEditor(todo)"
                    >
                      <CalendarDays
                        :size="14"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                      <span>{{
                        todo.dueAt !== null
                          ? formatDueLabel(todo.dueAt, now)
                          : '添加日期'
                      }}</span>
                    </button>
                    <button
                      type="button"
                      class="todo-edit-due todo-edit-repeat"
                      :class="{ active: todo.repeat !== 'none' }"
                      :aria-label="
                        todo.repeat === 'none'
                          ? '设置重复'
                          : `重复：${repeatLabels[todo.repeat]}`
                      "
                      title="重复"
                      @click="openRepeatMenu($event, todo)"
                    >
                      <Repeat
                        :size="14"
                        :stroke-width="2"
                        aria-hidden="true"
                      />
                      <span>{{
                        todo.repeat === 'none'
                          ? '重复'
                          : repeatLabels[todo.repeat]
                      }}</span>
                    </button>
                    <button
                      type="button"
                      class="todo-edit-tool urgent"
                      :class="{ active: todo.urgent }"
                      :aria-pressed="todo.urgent"
                      aria-label="标记紧急"
                      title="紧急"
                      @click="toggleField(todo.id, 'urgent', !todo.urgent)"
                    >
                      <Zap :size="14" :stroke-width="2" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="todo-edit-tool flag"
                      :class="{ active: todo.flagged }"
                      :aria-pressed="todo.flagged"
                      aria-label="标记旗标"
                      title="旗标"
                      @click="toggleField(todo.id, 'flagged', !todo.flagged)"
                    >
                      <Flag :size="14" :stroke-width="2" aria-hidden="true" />
                    </button>
                    <span class="todo-edit-spacer" />
                    <button
                      type="button"
                      class="todo-edit-tool danger"
                      aria-label="删除待办"
                      title="删除待办"
                      @click="
                        emit('command', { type: 'todo-remove', id: todo.id })
                      "
                    >
                      <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            </ul>
            <p v-else class="todo-empty">{{ emptyText }}</p>
          </div>
        </section>
      </div>

      <div
        v-if="groupMenu"
        class="todo-group-menu-backdrop"
        @pointerdown.self="closeGroupMenu"
        @contextmenu.prevent
      >
        <div
          class="todo-group-menu"
          role="menu"
          :style="{
            left: `${groupMenu.x}px`,
            top: `${groupMenu.y}px`,
          }"
          @click.stop
        >
          <button
            type="button"
            role="menuitem"
            @click="createListFromMenu(groupMenu.id)"
          >
            新建清单
          </button>
          <button
            type="button"
            role="menuitem"
            @click="startRenameGroup(groupMenu.id)"
          >
            重命名
          </button>
          <button
            type="button"
            role="menuitem"
            class="danger"
            @click="deleteGroupFromMenu(groupMenu.id)"
          >
            删除
          </button>
        </div>
      </div>

      <div
        v-if="tagMenu"
        class="todo-group-menu-backdrop"
        @pointerdown.self="closeTagMenu"
        @contextmenu.prevent
      >
        <div
          class="todo-group-menu todo-tag-menu"
          role="menu"
          :style="{
            left: `${tagMenu.x}px`,
            top: `${tagMenu.y}px`,
          }"
          @click.stop
        >
          <button
            type="button"
            role="menuitem"
            @click="startRenameTag(tagMenu.tag)"
          >
            重命名
          </button>
          <button
            type="button"
            role="menuitem"
            class="danger"
            @click="deleteTagFromMenu(tagMenu.tag)"
          >
            删除
          </button>
        </div>
      </div>

      <div
        v-if="repeatMenu"
        class="todo-group-menu-backdrop"
        @pointerdown.self="closeRepeatMenu"
        @contextmenu.prevent
      >
        <div
          class="todo-group-menu todo-repeat-menu"
          role="menu"
          aria-label="重复规则"
          :style="{
            left: `${repeatMenu.x}px`,
            top: `${repeatMenu.y}px`,
          }"
        >
          <button
            v-for="option in repeatOptions"
            :key="option.value"
            type="button"
            role="menuitemradio"
            :aria-checked="repeatMenuTodo?.repeat === option.value"
            :class="{
              active: repeatMenuTodo?.repeat === option.value,
            }"
            @click="chooseRepeat(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div v-if="dueEditor" class="todo-due-backdrop" @click.self="closeDueEditor">
        <section
          class="todo-due-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="截止日期"
          @keydown.esc.stop.prevent="closeDueEditor"
        >
          <h2>截止日期</h2>
          <input
            ref="dueInput"
            v-model="dueEditor.value"
            type="datetime-local"
            step="60"
            aria-label="截止日期和时间"
            @keydown.enter.prevent="saveDueEditor"
          />
          <div class="todo-due-actions">
            <button
              v-if="dueEditor.existing !== null"
              type="button"
              class="todo-editor-button soft todo-due-clear"
              @click="clearDueEditor"
            >
              清除
            </button>
            <span class="todo-due-spacer" />
            <button
              type="button"
              class="todo-editor-button soft"
              @click="closeDueEditor"
            >
              取消
            </button>
            <button
              type="button"
              class="todo-editor-button primary"
              :disabled="!dueEditor.value"
              @click="saveDueEditor"
            >
              保存
            </button>
          </div>
        </section>
      </div>

      <div v-if="editor" class="todo-editor-backdrop">
        <section
          class="todo-editor"
          role="dialog"
          aria-modal="true"
          aria-label="清单设置"
          @keydown.esc.stop.prevent="closeEditor"
        >
          <header class="todo-editor-title">
            <h2>{{ editor.mode === 'create' ? '新建清单' : '编辑清单' }}</h2>
          </header>

          <div class="todo-editor-body">
            <label class="todo-editor-name">
              <span class="todo-editor-label">名称</span>
              <input
                ref="editorNameInput"
                v-model="editor.name"
                type="text"
                maxlength="40"
                placeholder="清单名称"
                aria-label="清单名称"
                @input="clearEditorNameValidity"
                @keydown.enter.prevent="saveList"
              />
            </label>

            <div class="todo-editor-options">
              <div class="todo-editor-section todo-editor-colors-section">
                <span class="todo-editor-label">颜色</span>
                <div
                  class="todo-editor-colors"
                  role="group"
                  aria-label="清单颜色"
                >
                  <button
                    v-for="color in listColors"
                    :key="color.value"
                    type="button"
                    class="todo-editor-color"
                    :class="{ active: editor.color === color.value }"
                    :style="{ background: color.token }"
                    :aria-label="color.label"
                    :aria-pressed="editor.color === color.value"
                    :title="color.label"
                    @click="editor.color = color.value"
                  >
                    <Check
                      v-if="editor.color === color.value"
                      :size="11"
                      :stroke-width="3"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>

              <div class="todo-editor-section todo-editor-icon-section">
                <span class="todo-editor-label">图标</span>
                <div class="todo-editor-previews">
                  <button
                    type="button"
                    class="todo-editor-preview-mini"
                    aria-label="选择图标"
                    title="选择图标"
                    @click="iconPickerOpen = true"
                  >
                    <img :src="editorIconUrl" alt="" />
                  </button>
                  <span
                    class="todo-editor-preview"
                    :style="{ background: editorColorToken }"
                    aria-hidden="true"
                  >
                    <img :src="editorIconUrl" alt="" />
                  </span>
                </div>
              </div>
            </div>

            <div class="todo-editor-actions">
              <button
                type="button"
                class="todo-editor-button soft"
                @click="closeEditor"
              >
                取消
              </button>
              <button
                type="button"
                class="todo-editor-button primary"
                :disabled="!editor.name.trim()"
                @click="saveList"
              >
                {{ editor.mode === 'create' ? '创建' : '保存' }}
              </button>
            </div>
          </div>
        </section>

        <div
          v-if="iconPickerOpen"
          class="todo-icon-popover-backdrop"
          @click.self="iconPickerOpen = false"
        >
          <section
            class="todo-icon-popover"
            role="dialog"
            aria-modal="true"
            aria-label="选择图标"
            @keydown.esc.stop.prevent="iconPickerOpen = false"
          >
            <div class="todo-icon-grid panel-scroll">
              <button
                v-for="icon in editorIcons"
                :key="icon.id"
                type="button"
                class="todo-icon-choice"
                :class="{ active: editor.icon === icon.id }"
                :aria-label="icon.label"
                :aria-pressed="editor.icon === icon.id"
                :title="icon.label"
                @click="selectIcon(icon.id)"
              >
                <img :src="icon.url" alt="" loading="lazy" />
              </button>
            </div>
            <div
              class="todo-icon-tabs"
              role="tablist"
              aria-label="图标分类"
            >
              <button
                v-for="category in fxemojiCategories"
                :key="category.id"
                type="button"
                role="tab"
                class="todo-icon-tab"
                :class="{ active: iconCategory === category.id }"
                :aria-selected="iconCategory === category.id"
                @click="iconCategory = category.id"
              >
                {{ category.label }}
              </button>
            </div>
          </section>
        </div>
      </div>

      <p v-if="error" class="todo-error" role="alert">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.todo-shell {
  height: 100vh;
  padding: 7px;
  background: transparent;
  color: var(--color-ink);
  user-select: none;
}
.todo-shell.is-maximized {
  padding: 0;
}
.todo-shell.is-maximized .todo-surface {
  border-radius: 0;
  box-shadow: none;
}
.todo-surface {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--mqmz-panel-padding) var(--mqmz-panel-padding) var(--space-6);
  background: var(--color-canvas);
  border-radius: var(--radius-sheet);
  box-shadow: var(--mqmz-panel-shadow);
}
.todo-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 20px;
}
.todo-rail {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.todo-lists-panel {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  background: var(--color-surface-muted);
  border-radius: var(--radius-card);
}
/* Keep the rounded list flush with the second category card above instead of
   letting the shared scrollbar gutter widen it by 8px. */
.todo-lists-panel.panel-scroll {
  width: 100%;
  margin-right: 0;
}
.todo-smart-list {
  flex: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.todo-smart {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  min-height: 74px;
  padding: 8px 9px;
  overflow: hidden;
  border: 0;
  border-radius: var(--radius-card);
  background-color: var(--card-color);
  background-image: linear-gradient(
    90deg,
    color-mix(in srgb, var(--card-color) 84%, var(--color-on-brand)) 0%,
    var(--card-color) 100%
  );
  color: var(--color-on-brand);
  text-align: left;
  transition:
    transform var(--motion-normal) var(--ease-spring),
    box-shadow var(--motion-fast) var(--ease-standard);
}
.todo-smart::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  pointer-events: none;
  transition: box-shadow var(--motion-fast) var(--ease-standard);
}
.todo-smart > * {
  position: relative;
  z-index: 1;
}
.todo-smart.all {
  --card-color: var(--color-brand);
}
.todo-smart.today {
  --card-color: #5b9be6;
}
.todo-smart.urgent {
  --card-color: #e8748f;
}
.todo-smart.flagged {
  --card-color: #efb06b;
}
.todo-smart.open {
  --card-color: #8f9ba0;
}
.todo-smart.done {
  --card-color: #5fbf82;
}
.todo-smart:hover {
  transform: translateY(-1px);
}
.todo-smart.active::after {
  box-shadow: 0 0 0 2px var(--color-on-brand) inset;
}
.todo-smart-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.todo-smart-glyph {
  display: grid;
  place-items: center;
  filter: drop-shadow(0 1px 2px var(--color-overlay));
}
.todo-smart-count {
  font-size: 15px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-shadow: 0 1px 2px var(--color-overlay);
}
.todo-smart-name {
  min-width: 0;
  margin-top: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-body);
  font-weight: 600;
  text-shadow: 0 1px 2px var(--color-overlay);
}
.todo-rail-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 2px 4px 7px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.todo-lists-panel .todo-rail-title {
  margin-top: 4px;
}
.todo-rail-title-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.todo-rail-action {
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
.todo-rail-action:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}
.todo-rail-group {
  min-width: 0;
}
.todo-group-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  margin: 6px 0 2px;
  padding-left: 7px;
  border-radius: var(--radius-control);
  cursor: pointer;
}
.todo-group-row.selected {
  background: var(--color-fill-secondary);
}
.todo-group-row.selected .todo-group-name {
  color: var(--color-ink);
}
.todo-group-rename {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--color-brand);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.todo-group-rename:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-brand-soft);
}
.todo-group-toggle {
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-muted);
}
.todo-group-toggle:hover {
  color: var(--color-ink);
}
.todo-group-folder {
  flex: none;
  color: var(--color-pass);
}
.todo-group-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.todo-list-row {
  position: relative;
}
.todo-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 0 58px 0 32px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-ink);
  text-align: left;
}
.todo-list-item:hover {
  background: var(--color-surface);
}
.todo-list-item.active {
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.todo-list-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  overflow: hidden;
  border-radius: 999px;
}
.todo-list-avatar img {
  display: block;
  width: 17px;
  height: 17px;
  object-fit: contain;
}
.todo-list-avatar.large {
  width: 56px;
  height: 56px;
}
.todo-list-avatar.large img {
  width: 38px;
  height: 38px;
}
.todo-list-item.active .todo-list-avatar {
  box-shadow: 0 0 0 1px var(--color-on-brand);
}
.todo-list-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-subsection);
  font-weight: 500;
}
.todo-list-count {
  flex: none;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
}
.todo-list-item.active .todo-list-count {
  color: var(--color-on-brand);
}
.todo-list-actions {
  position: absolute;
  top: 50%;
  right: 4px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.todo-list-row:hover .todo-list-actions,
.todo-list-row:focus-within .todo-list-actions {
  opacity: 1;
}
.todo-list-action {
  display: grid;
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
.todo-list-action:hover {
  background: var(--color-surface);
  color: var(--color-ink);
}
.todo-list-action.danger:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.todo-list-row.active .todo-list-action {
  color: var(--color-on-brand);
}
.todo-list-row.active .todo-list-action:hover {
  background: var(--color-on-brand);
  color: var(--color-brand-ink);
}
.todo-inline {
  display: flex;
  gap: 4px;
  margin: 4px 0 2px;
  padding-left: 7px;
}
.todo-inline input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-label);
}
.todo-inline-cancel,
.todo-inline-submit {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  min-height: 30px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
}
.todo-inline-cancel {
  background: transparent;
  color: var(--color-muted);
}
.todo-inline-cancel:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.todo-inline-submit {
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.todo-inline-submit:disabled {
  background: var(--color-disabled-bg);
  color: var(--color-disabled-text);
}
.todo-tags-panel {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 2px 0;
}
.todo-tags-panel .todo-rail-title {
  margin-top: 10px;
}
.todo-tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.todo-tag-chip {
  min-height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--color-fill-secondary);
  color: var(--color-ink);
  font-size: var(--font-size-label);
  font-weight: 500;
  white-space: nowrap;
}
.todo-tag-chip:hover {
  background: var(--color-brand-soft);
}
.todo-tag-chip.active {
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.todo-tag-rename {
  width: 96px;
  height: 26px;
  border: 1px solid var(--color-brand);
  background: var(--color-surface);
  outline: none;
}
.todo-tags-empty {
  margin: 6px 2px 0 7px;
  color: var(--color-subtle);
  font-size: var(--font-size-caption);
}
.todo-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.todo-main-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  margin-top: 2px;
}
.todo-main-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-section-lg);
  font-weight: 650;
}
.todo-main-count {
  margin-left: 2px;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.todo-clear {
  flex: none;
  padding: 0 6px;
  min-height: 26px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-brand-ink);
  font-size: var(--font-size-label);
}
.todo-clear:hover {
  background: var(--color-brand-soft);
}
.todo-main-action {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  transition:
    color var(--motion-fast) var(--ease-standard),
    background var(--motion-fast) var(--ease-standard);
}
.todo-main-action:hover {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.todo-add {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.todo-add input {
  flex: 1;
  min-width: 0;
  height: var(--tap-min);
  padding: 0 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.todo-add .todo-add-submit {
  flex: none;
  gap: 0;
  width: var(--tap-min);
  height: var(--tap-min);
  min-height: var(--tap-min);
  padding: 0;
  border-radius: 999px;
}
.todo-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}
.todo-items {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 2px;
  border-bottom: 1px solid var(--color-line);
  transition: background-color 220ms ease-out;
}
.todo-item.revealed {
  border-radius: var(--radius-sm);
  background: var(--color-brand-soft);
}
.todo-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.todo-content.view {
  cursor: pointer;
}
.todo-content.view:hover .todo-text {
  color: var(--color-brand-ink);
}
.todo-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-body);
  font-weight: 500;
}
.todo-text.done {
  color: var(--color-muted);
  text-decoration: line-through;
}
.todo-view-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
  min-width: 0;
  font-size: var(--font-size-label);
}
.todo-view-due {
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.todo-view-due.today {
  color: var(--color-info);
}
.todo-view-due.overdue {
  color: var(--color-danger);
}
.todo-view-tag {
  color: var(--color-brand-ink);
  white-space: nowrap;
}
.todo-view-repeat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--color-muted);
  white-space: nowrap;
}
.todo-title-input {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
  font-weight: 500;
}
.todo-title-input:focus {
  outline: none;
}
.todo-notes {
  width: 100%;
  min-height: 20px;
  max-height: 80px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
  line-height: 1.45;
  resize: none;
  field-sizing: content;
  overflow-y: auto;
}
.todo-notes::placeholder,
.todo-tag-input::placeholder {
  color: var(--color-subtle);
}
.todo-notes:focus {
  outline: none;
  color: var(--color-ink);
}
.todo-inline-tags {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.todo-inline-tag {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 22px;
  padding: 0 4px 0 7px;
  border-radius: var(--radius-control);
  background: var(--color-brand-soft);
  color: var(--color-brand-on-soft);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.todo-inline-tag button {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  min-height: 16px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  opacity: 0.65;
}
.todo-inline-tag button:hover {
  opacity: 1;
}
.todo-tag-input {
  width: 92px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  font-size: var(--font-size-label);
}
.todo-tag-input:focus {
  outline: none;
  color: var(--color-ink);
}
.todo-tag-input:disabled {
  cursor: default;
  opacity: 0.6;
}
.todo-tag-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
  max-height: 170px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--shadow-deck);
}
.todo-tag-suggestions-title {
  padding: 2px 6px 4px;
  color: var(--color-muted);
  font-size: var(--font-size-caption);
  font-weight: 600;
}
.todo-tag-suggestions button {
  min-height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  text-align: left;
  font-size: var(--font-size-label);
}
.todo-tag-suggestions button:hover {
  background: var(--color-brand-soft);
  color: var(--color-brand-on-soft);
}
.todo-edit-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.todo-edit-due {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: var(--color-fill-secondary);
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.todo-edit-due.active {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.todo-edit-repeat.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-on-soft);
}
.todo-edit-tool {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--color-fill-secondary);
  color: var(--color-muted);
}
.todo-edit-tool.urgent.active {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.todo-edit-tool.flag.active {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.todo-edit-tool.danger:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.todo-edit-spacer {
  flex: 1;
}
.todo-check {
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 0;
  min-height: 18px;
  padding: 0;
  border: 1.5px solid var(--color-line);
  border-radius: 999px;
  background: transparent;
  color: var(--color-on-brand);
}
.todo-check.done {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.todo-empty {
  margin: auto;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.todo-error {
  margin: 10px 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-label);
}
.todo-group-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}
.todo-group-menu {
  position: fixed;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 156px;
  padding: 4px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}
.todo-group-menu button {
  min-height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  text-align: left;
  font-size: var(--font-size-label);
}
.todo-group-menu button:hover,
.todo-group-menu button:focus-visible {
  outline: none;
  background: var(--color-fill-secondary);
}
.todo-group-menu button.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-on-soft);
  font-weight: 600;
}
.todo-group-menu button.danger {
  color: var(--color-danger);
}
.todo-group-menu button.danger:hover {
  background: var(--color-danger-soft);
}
.todo-due-backdrop {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border-radius: var(--radius-sheet);
  background: var(--color-overlay);
}
.todo-due-dialog {
  width: min(360px, 100%);
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}
.todo-due-dialog h2 {
  margin: 0 0 12px;
  text-align: center;
  font-size: var(--font-size-section);
  font-weight: 650;
}
.todo-due-dialog input {
  width: 100%;
  height: var(--tap-min);
  padding: 0 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-canvas);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.todo-due-dialog input:focus-visible {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-soft);
}
.todo-due-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.todo-due-spacer {
  flex: 1;
}
.todo-due-clear {
  color: var(--color-danger);
}
.todo-editor-backdrop {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border-radius: var(--radius-sheet);
  background: var(--color-overlay);
}
.todo-editor {
  display: flex;
  flex-direction: column;
  width: min(500px, 100%);
  max-height: 100%;
  padding: 16px 20px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}
.todo-editor-title {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  margin-bottom: 10px;
}
.todo-editor-title h2 {
  margin: 0;
  font-size: var(--font-size-section);
  font-weight: 650;
}
.todo-editor-body {
  width: 100%;
}
.todo-editor-name {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}
.todo-editor-name .todo-editor-label {
  flex: none;
  width: 44px;
}
.todo-editor-name input {
  flex: 1;
  min-width: 0;
  height: var(--tap-min);
  padding: 0 12px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  background: var(--color-canvas);
  color: var(--color-ink);
  font: inherit;
  font-size: var(--font-size-body);
}
.todo-editor-name input:focus-visible {
  outline: none;
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-brand-soft);
}
.todo-editor-label {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.todo-editor-options {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
}
.todo-editor-section {
  min-width: 0;
}
.todo-editor-colors-section {
  flex: none;
  display: grid;
  grid-template-columns: 44px auto;
  align-items: center;
  gap: 12px;
}
.todo-editor-colors-section .todo-editor-label,
.todo-editor-icon-section .todo-editor-label {
  flex: none;
  width: 44px;
}
.todo-editor-icon-section .todo-editor-label {
  width: 34px;
}
.todo-editor-colors {
  display: grid;
  grid-template-columns: repeat(6, 24px);
  gap: 8px;
}
.todo-editor-color {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: var(--color-on-brand);
  box-shadow: 0 0 0 1px var(--color-line);
}
.todo-editor-color.active {
  box-shadow:
    0 0 0 2px var(--color-surface),
    0 0 0 4px var(--color-brand);
}
.todo-editor-color svg {
  filter: drop-shadow(0 1px 1px var(--color-overlay));
}
.todo-editor-icon-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 16px;
  border-left: 1px solid var(--color-line);
}
.todo-editor-previews {
  display: flex;
  align-items: center;
  gap: 20px;
}
.todo-editor-preview-mini {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--color-info-soft);
}
.todo-editor-preview-mini:hover,
.todo-editor-preview-mini:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-brand);
}
.todo-editor-preview-mini img {
  display: block;
  width: 34px;
  height: 34px;
  object-fit: contain;
}
.todo-editor-preview {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  min-height: 56px;
  border-radius: 999px;
  box-shadow: 0 0 0 2px var(--color-brand);
}
.todo-editor-preview img {
  display: block;
  width: 34px;
  height: 34px;
  object-fit: contain;
}
.todo-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.todo-editor-button {
  height: 34px;
  min-height: 34px;
  padding: 0 18px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-control);
  font: inherit;
  font-size: var(--font-size-subsection);
  font-weight: 600;
}
.todo-editor-button.soft {
  background: var(--color-fill-secondary);
  color: var(--color-ink);
}
.todo-editor-button.soft:hover {
  background: var(--color-brand-soft);
}
.todo-editor-button.primary {
  border-color: transparent;
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.todo-editor-button.primary:hover:not(:disabled) {
  border-color: var(--color-brand);
}
.todo-editor-button.primary:disabled {
  background: var(--color-disabled-bg);
  color: var(--color-muted);
}
.todo-icon-popover-backdrop {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  border-radius: var(--radius-sheet);
  background: var(--color-overlay);
}
.todo-icon-popover {
  display: flex;
  flex-direction: column;
  width: min(460px, 100%);
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
}
.todo-icon-grid {
  height: 150px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-auto-rows: 46px;
  align-content: start;
  gap: 6px;
  padding-right: 6px;
}
.todo-icon-choice {
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
}
.todo-icon-choice:hover {
  background: var(--color-canvas);
}
.todo-icon-choice.active {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}
.todo-icon-choice img {
  display: block;
  width: 30px;
  height: 30px;
  object-fit: contain;
}
.todo-icon-tabs {
  display: flex;
  gap: 2px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-line);
  overflow-x: auto;
  scrollbar-width: none;
}
.todo-icon-tabs::-webkit-scrollbar {
  display: none;
}
.todo-icon-tab {
  flex: none;
  min-height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 600;
  white-space: nowrap;
}
.todo-icon-tab:hover {
  background: var(--color-fill-secondary);
}
.todo-icon-tab.active {
  background: var(--color-brand-soft);
  color: var(--color-brand-on-soft);
}
@media (prefers-reduced-motion: reduce) {
  .todo-smart,
  .todo-list-actions,
  .todo-tag,
  .todo-remove {
    transition: none;
  }
  .todo-item {
    transition: none;
  }
}
</style>
