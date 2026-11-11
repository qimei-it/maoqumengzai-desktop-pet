<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Component } from 'vue'
import {
  CalendarDays,
  Check,
  Circle,
  CircleCheck,
  Flag,
  FolderPlus,
  ListPlus,
  ListTodo,
  Plus,
  Trash2,
  Zap,
} from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

type SmartId = 'all' | 'today' | 'urgent' | 'flagged' | 'open' | 'done'
type Selection = { kind: 'smart'; id: SmartId } | { kind: 'list'; id: string }
type Tone = 'brand' | 'info' | 'danger' | 'warning' | 'neutral' | 'success'

const smartLists = [
  { id: 'all', label: '全部', icon: ListTodo, tone: 'brand' },
  { id: 'today', label: '今天', icon: CalendarDays, tone: 'info' },
  { id: 'urgent', label: '紧急', icon: Zap, tone: 'danger' },
  { id: 'flagged', label: '旗标', icon: Flag, tone: 'warning' },
  { id: 'open', label: '未完成', icon: Circle, tone: 'neutral' },
  { id: 'done', label: '已完成', icon: CircleCheck, tone: 'success' },
] as const satisfies readonly { id: SmartId; label: string; icon: Component; tone: Tone }[]

const draft = ref('')
const selection = ref<Selection>({ kind: 'smart', id: 'all' })

const todos = computed(() => props.state?.focus.todos ?? [])
const lists = computed(() => props.state?.focus.todoLists ?? [])
const groups = computed(() => props.state?.focus.todoGroups ?? [])
const activeList = computed(() => {
  const current = selection.value
  return current.kind === 'list'
    ? lists.value.find((list) => list.id === current.id)
    : undefined
})
const activeSmart = computed<SmartId | undefined>(() =>
  selection.value.kind === 'smart' ? selection.value.id : undefined,
)

const smartCounts = computed<Record<SmartId, number>>(() => {
  const value = todos.value
  return {
    all: value.length,
    today: value.filter((todo) => todo.today).length,
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
  const smart = selection.value.id
  if (smart === 'today') return todos.value.filter((todo) => todo.today)
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
const heading = computed(() => {
  if (activeList.value) return activeList.value.name
  return smartLists.find((item) => item.id === activeSmart.value)?.label ?? '全部'
})
const emptyText = computed(() => {
  if (selection.value.kind === 'list') return '清单里还没有待办'
  if (activeSmart.value === 'done') return '还没有已完成事项'
  if (activeSmart.value === 'today') return '今天没有安排'
  if (activeSmart.value === 'urgent') return '没有紧急事项'
  if (activeSmart.value === 'flagged') return '没有旗标事项'
  return '没有待办事项'
})

const newGroupOpen = ref(false)
const groupDraft = ref('')
const groupInput = ref<HTMLInputElement>()
const newListFor = ref<string | null | undefined>(undefined)
const listDraft = ref('')
const listInput = ref<HTMLInputElement | null>(null)

function setListInput(element: unknown): void {
  listInput.value = (element as HTMLInputElement | null) ?? null
}

function selectSmart(id: SmartId): void {
  selection.value = { kind: 'smart', id }
}
function selectList(id: string): void {
  selection.value = { kind: 'list', id }
}
function addTodo(): void {
  const text = draft.value.trim()
  if (!text) return
  const id = selection.value.kind === 'list' ? selection.value.id : null
  const smart = selection.value.kind === 'smart' ? selection.value.id : null
  emit('command', {
    type: 'todo-add',
    text,
    listId: id,
    today: smart === 'today',
    urgent: smart === 'urgent',
    flagged: smart === 'flagged',
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
  field: 'today' | 'urgent' | 'flagged',
  value: boolean,
): void {
  emit('command', { type: 'todo-update', id, patch: { [field]: value } })
}
function close(): void {
  emit('command', { type: 'todo-close' })
}

async function openGroupInput(): Promise<void> {
  newListFor.value = undefined
  newGroupOpen.value = true
  groupDraft.value = ''
  await nextTick()
  groupInput.value?.focus()
}
function createGroup(): void {
  const name = groupDraft.value.trim()
  if (!name) return
  emit('command', { type: 'todo-group-add', name })
  newGroupOpen.value = false
  groupDraft.value = ''
}
async function openListInput(groupId: string | null): Promise<void> {
  newGroupOpen.value = false
  newListFor.value = groupId
  listDraft.value = ''
  await nextTick()
  listInput.value?.focus()
}
function createList(): void {
  const name = listDraft.value.trim()
  if (!name) return
  emit('command', {
    type: 'todo-list-add',
    name,
    groupId: newListFor.value ?? null,
  })
  newListFor.value = undefined
  listDraft.value = ''
}
function cancelListInput(): void {
  newListFor.value = undefined
  listDraft.value = ''
}
function removeList(id: string): void {
  if (selection.value.kind === 'list' && selection.value.id === id)
    selection.value = { kind: 'smart', id: 'all' }
  emit('command', { type: 'todo-list-remove', id })
}
function removeGroup(id: string): void {
  emit('command', { type: 'todo-group-remove', id })
}

watch(lists, (value) => {
  const current = selection.value
  if (
    current.kind === 'list' &&
    !value.some((list) => list.id === current.id)
  )
    selection.value = { kind: 'smart', id: 'all' }
})
</script>

<template>
  <main class="todo-shell" @keydown.esc="close">
    <section class="todo-surface" aria-label="待办清单">
      <PanelHeader
        title="待办清单"
        :platform="state?.runtime.platform"
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
              <span class="todo-smart-icon" :class="`tone-${item.tone}`">
                <component
                  :is="item.icon"
                  :size="14"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </span>
              <span class="todo-smart-name">{{ item.label }}</span>
              <span class="todo-smart-count">{{ smartCounts[item.id] }}</span>
            </button>
          </div>

          <div class="todo-rail-title">
            <span>我的清单</span>
            <button
              type="button"
              class="todo-rail-action"
              aria-label="新建组"
              title="新建组"
              @click="openGroupInput"
            >
              <FolderPlus :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>

          <form
            v-if="newGroupOpen"
            class="todo-inline"
            @submit.prevent="createGroup"
          >
            <input
              ref="groupInput"
              v-model="groupDraft"
              type="text"
              maxlength="40"
              placeholder="组名称"
              aria-label="组名称"
              @keydown.esc.stop="newGroupOpen = false"
            />
            <button
              type="submit"
              class="todo-inline-submit"
              aria-label="创建组"
              :disabled="!groupDraft.trim()"
            >
              <Check :size="14" :stroke-width="2.4" aria-hidden="true" />
            </button>
          </form>

          <div
            v-for="group in groups"
            :key="group.id"
            class="todo-rail-group"
          >
            <div class="todo-group-row">
              <span class="todo-group-name">{{ group.name }}</span>
              <span class="todo-group-actions">
                <button
                  type="button"
                  class="todo-rail-action"
                  aria-label="在组内新建清单"
                  title="新建清单"
                  @click="openListInput(group.id)"
                >
                  <ListPlus :size="13" :stroke-width="2" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="todo-rail-action"
                  aria-label="删除组"
                  title="删除组"
                  @click="removeGroup(group.id)"
                >
                  <Trash2 :size="13" :stroke-width="2" aria-hidden="true" />
                </button>
              </span>
            </div>
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
                <ListTodo :size="14" :stroke-width="2" aria-hidden="true" />
                <span class="todo-list-name">{{ list.name }}</span>
                <span class="todo-list-count">{{
                  listCounts.get(list.id) ?? 0
                }}</span>
              </button>
              <button
                type="button"
                class="todo-list-remove"
                aria-label="删除清单"
                title="删除清单"
                @click="removeList(list.id)"
              >
                <Trash2 :size="12" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
            <form
              v-if="newListFor === group.id"
              class="todo-inline"
              @submit.prevent="createList"
            >
              <input
                :ref="setListInput"
                v-model="listDraft"
                type="text"
                maxlength="40"
                placeholder="清单名称"
                aria-label="清单名称"
                @keydown.esc.stop="cancelListInput"
              />
              <button
                type="submit"
                class="todo-inline-submit"
                aria-label="创建清单"
                :disabled="!listDraft.trim()"
              >
                <Check :size="14" :stroke-width="2.4" aria-hidden="true" />
              </button>
            </form>
          </div>

          <div v-if="ungrouped.length" class="todo-rail-group">
            <div class="todo-group-row">
              <span class="todo-group-name">未分组</span>
            </div>
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
                <ListTodo :size="14" :stroke-width="2" aria-hidden="true" />
                <span class="todo-list-name">{{ list.name }}</span>
                <span class="todo-list-count">{{
                  listCounts.get(list.id) ?? 0
                }}</span>
              </button>
              <button
                type="button"
                class="todo-list-remove"
                aria-label="删除清单"
                title="删除清单"
                @click="removeList(list.id)"
              >
                <Trash2 :size="12" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </div>

          <form
            v-if="newListFor === null"
            class="todo-inline"
            @submit.prevent="createList"
          >
            <input
              :ref="setListInput"
              v-model="listDraft"
              type="text"
              maxlength="40"
              placeholder="清单名称"
              aria-label="清单名称"
              @keydown.esc.stop="cancelListInput"
            />
            <button
              type="submit"
              class="todo-inline-submit"
              aria-label="创建清单"
              :disabled="!listDraft.trim()"
            >
              <Check :size="14" :stroke-width="2.4" aria-hidden="true" />
            </button>
          </form>

          <button
            v-if="newListFor === undefined"
            type="button"
            class="todo-add-list"
            @click="openListInput(null)"
          >
            <Plus :size="13" :stroke-width="2" aria-hidden="true" />
            新建清单
          </button>
        </aside>

        <section class="todo-main">
          <div class="todo-main-head">
            <h2 class="todo-main-title">
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
          </div>

          <form class="todo-add" @submit.prevent="addTodo">
            <input
              v-model="draft"
              type="text"
              maxlength="200"
              placeholder="新建待办"
              aria-label="新建待办"
            />
            <button
              type="submit"
              class="button-glass"
              :disabled="!draft.trim()"
            >
              <Plus :size="16" :stroke-width="2" aria-hidden="true" />
              添加
            </button>
          </form>

          <div class="todo-list">
            <ul v-if="ordered.length" class="todo-items">
              <li
                v-for="todo in ordered"
                :key="todo.id"
                class="todo-item"
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
                    :size="13"
                    :stroke-width="2.6"
                    aria-hidden="true"
                  />
                </button>
                <span class="todo-text" :class="{ done: todo.done }">{{
                  todo.text
                }}</span>
                <div class="todo-item-actions">
                  <button
                    type="button"
                    class="todo-tag today"
                    :class="{ active: todo.today }"
                    :aria-pressed="todo.today"
                    aria-label="标记今天"
                    title="今天"
                    @click="toggleField(todo.id, 'today', !todo.today)"
                  >
                    <CalendarDays
                      :size="14"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    class="todo-tag urgent"
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
                    class="todo-tag flag"
                    :class="{ active: todo.flagged }"
                    :aria-pressed="todo.flagged"
                    aria-label="标记旗标"
                    title="旗标"
                    @click="toggleField(todo.id, 'flagged', !todo.flagged)"
                  >
                    <Flag :size="14" :stroke-width="2" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="todo-remove"
                    aria-label="删除待办"
                    title="删除待办"
                    @click="
                      emit('command', { type: 'todo-remove', id: todo.id })
                    "
                  >
                    <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
                  </button>
                </div>
              </li>
            </ul>
            <p v-else class="todo-empty">{{ emptyText }}</p>
          </div>
        </section>
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
.todo-surface {
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
  grid-template-columns: 212px minmax(0, 1fr);
  gap: 18px;
}
.todo-rail {
  min-height: 0;
  overflow: auto;
  padding: 8px;
  background: var(--color-surface-muted);
  border-radius: var(--radius-card);
}
.todo-smart-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.todo-smart {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 0 7px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-ink);
  text-align: left;
  transition:
    background var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}
.todo-smart:hover {
  background: var(--color-surface);
}
.todo-smart.active {
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.todo-smart-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 7px;
}
.todo-smart-icon.tone-brand {
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.todo-smart-icon.tone-info {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.todo-smart-icon.tone-danger {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.todo-smart-icon.tone-warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.todo-smart-icon.tone-neutral {
  background: var(--color-fill-secondary);
  color: var(--color-muted);
}
.todo-smart-icon.tone-success {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.todo-smart-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-body);
  font-weight: 500;
}
.todo-smart.active .todo-smart-name {
  font-weight: 600;
}
.todo-smart.active .todo-smart-icon {
  background: transparent;
  color: var(--color-on-brand);
}
.todo-smart-count {
  flex: none;
  font-size: var(--font-size-label);
  font-variant-numeric: tabular-nums;
  color: var(--color-muted);
}
.todo-smart.active .todo-smart-count {
  color: var(--color-on-brand);
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
.todo-group-actions {
  display: flex;
  gap: 2px;
  opacity: 0.5;
  transition: opacity var(--motion-fast) var(--ease-standard);
}
.todo-group-row:hover .todo-group-actions,
.todo-group-row:focus-within .todo-group-actions {
  opacity: 1;
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
  padding: 0 30px 0 12px;
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
.todo-list-remove {
  position: absolute;
  top: 50%;
  right: 4px;
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
  opacity: 0;
  transform: translateY(-50%);
}
.todo-list-row:hover .todo-list-remove,
.todo-list-row:focus-within .todo-list-remove {
  opacity: 1;
}
.todo-list-row.active .todo-list-remove {
  color: var(--color-on-brand);
}
.todo-list-row.active:hover .todo-list-remove {
  background: var(--color-on-brand);
  color: var(--color-brand-ink);
}
.todo-list-remove:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger);
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
  background: var(--color-brand-ink);
  color: var(--color-on-brand);
}
.todo-inline-submit:disabled {
  background: var(--color-disabled-bg);
  color: var(--color-disabled-text);
}
.todo-add-list {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  margin-top: 4px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-muted);
  font-size: var(--font-size-label);
}
.todo-add-list:hover {
  background: var(--color-surface);
  color: var(--color-ink);
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
.todo-add .button-glass {
  flex: none;
  gap: 5px;
  padding-inline: 14px;
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
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding-right: 2px;
  border-bottom: 1px solid var(--color-line);
}
.todo-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-body);
}
.todo-text.done {
  color: var(--color-muted);
  text-decoration: line-through;
}
.todo-check {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  min-height: 26px;
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
.todo-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.todo-tag,
.todo-remove {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-subtle);
  transition:
    color var(--motion-fast) var(--ease-standard),
    background var(--motion-fast) var(--ease-standard),
    opacity var(--motion-fast) var(--ease-standard);
}
.todo-tag {
  opacity: 0.55;
}
.todo-item:hover .todo-tag,
.todo-tag:focus-visible {
  opacity: 1;
}
.todo-tag.today.active {
  background: var(--color-info-soft);
  color: var(--color-info);
  opacity: 1;
}
.todo-tag.urgent.active {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  opacity: 1;
}
.todo-tag.flag.active {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  opacity: 1;
}
.todo-remove {
  opacity: 0;
}
.todo-item:hover .todo-remove,
.todo-remove:focus-visible {
  opacity: 1;
}
.todo-remove:hover {
  color: var(--color-danger);
  background: var(--color-danger-soft);
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
@media (prefers-reduced-motion: reduce) {
  .todo-smart,
  .todo-group-actions,
  .todo-tag,
  .todo-remove {
    transition: none;
  }
}
</style>
