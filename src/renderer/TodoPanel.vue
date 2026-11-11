<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Circle, CircleCheck, ListTodo, Plus, Trash2 } from '@lucide/vue'
import type { Command, Snapshot } from '../shared/protocol'
import PanelHeader from './PanelHeader.vue'

const props = defineProps<{ state?: Snapshot; error?: string }>()
const emit = defineEmits<{ command: [command: Command] }>()

type Filter = 'all' | 'open' | 'done'
const filters = [
  { id: 'all', label: '全部', icon: ListTodo },
  { id: 'open', label: '未完成', icon: Circle },
  { id: 'done', label: '已完成', icon: CircleCheck },
] as const

const draft = ref('')
const filter = ref<Filter>('open')

const todos = computed(() => props.state?.focus.todos ?? [])
const openCount = computed(() => todos.value.filter((todo) => !todo.done).length)
const doneCount = computed(() => todos.value.filter((todo) => todo.done).length)
const counts = computed<Record<Filter, number>>(() => ({
  all: todos.value.length,
  open: openCount.value,
  done: doneCount.value,
}))
const visible = computed(() => {
  if (filter.value === 'open') return todos.value.filter((todo) => !todo.done)
  if (filter.value === 'done') return todos.value.filter((todo) => todo.done)
  return todos.value
})
/** Completed items sink below open ones so the list keeps its pace. */
const ordered = computed(() => [
  ...visible.value.filter((todo) => !todo.done),
  ...visible.value.filter((todo) => todo.done),
])
const emptyText = computed(() =>
  filter.value === 'done' ? '还没有已完成事项' : '没有待办事项',
)

function countFor(id: Filter): number {
  return counts.value[id]
}
function select(next: Filter): void {
  filter.value = next
}
function addTodo(): void {
  const text = draft.value.trim()
  if (!text) return
  emit('command', { type: 'todo-add', text })
  draft.value = ''
}
function clearDone(): void {
  emit('command', { type: 'todo-clear-done' })
}
function close(): void {
  emit('command', { type: 'todo-close' })
}
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

      <div class="todo-cards" role="tablist" aria-label="待办分类">
        <button
          v-for="item in filters"
          :key="item.id"
          type="button"
          role="tab"
          class="todo-card"
          :class="[item.id, { active: filter === item.id }]"
          :aria-selected="filter === item.id"
          @click="select(item.id)"
        >
          <span class="todo-card-top">
            <component
              :is="item.icon"
              :size="16"
              :stroke-width="2"
              aria-hidden="true"
            />
            <span class="todo-card-count">{{ countFor(item.id) }}</span>
          </span>
          <span class="todo-card-name">{{ item.label }}</span>
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
        <div class="todo-group">
          <span class="todo-group-title">
            {{ filter === 'all' ? '全部' : filter === 'open' ? '未完成' : '已完成' }}
          </span>
          <button
            v-if="doneCount && filter !== 'open'"
            type="button"
            class="todo-clear"
            @click="clearDone"
          >
            清除
          </button>
        </div>

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
            <span :class="{ done: todo.done }">{{ todo.text }}</span>
            <button
              type="button"
              class="todo-remove"
              aria-label="删除待办"
              title="删除待办"
              @click="emit('command', { type: 'todo-remove', id: todo.id })"
            >
              <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <p v-else class="todo-empty">{{ emptyText }}</p>
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
.todo-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 10px;
}
.todo-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-height: 74px;
  min-width: 0;
  padding: 9px 10px 8px;
  border: 0;
  border-radius: var(--radius-card);
  text-align: left;
  transition:
    transform var(--motion-normal) var(--ease-spring),
    box-shadow var(--motion-fast) var(--ease-standard);
}
.todo-card:hover {
  transform: translateY(-1px);
}
.todo-card.active {
  box-shadow: 0 0 0 2px var(--color-brand) inset;
}
.todo-card.all {
  background: var(--color-ink);
  color: var(--color-canvas);
}
.todo-card.open {
  background: var(--color-info-soft);
  color: var(--color-info);
}
.todo-card.done {
  background: var(--color-fill-secondary);
  color: var(--color-muted);
}
.todo-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.todo-card-count {
  font-size: 18px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.todo-card-name {
  margin-top: auto;
  font-size: var(--font-size-label);
  font-weight: 600;
}
.todo-add {
  display: flex;
  gap: 8px;
  margin-top: 12px;
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
  margin-top: 14px;
}
.todo-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 26px;
}
.todo-group-title {
  color: var(--color-muted);
  font-size: var(--font-size-label);
  font-weight: 600;
}
.todo-clear {
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
  min-height: 44px;
  border-bottom: 1px solid var(--color-line);
}
.todo-item > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-body);
}
.todo-item > span.done {
  color: var(--color-muted);
  text-decoration: line-through;
}
.todo-check,
.todo-remove {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
}
.todo-check {
  border: 1.5px solid var(--color-line);
  color: var(--color-on-brand);
}
.todo-check.done {
  border-color: transparent;
  background: var(--color-brand-ink);
}
.todo-remove {
  border: 0;
  color: var(--color-muted);
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-standard);
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
  .todo-card {
    transition: none;
  }
}
</style>
