/** Local-calendar helpers for todo due dates. */
import type { TodoRepeat } from './protocol'

const DAY_MS = 24 * 60 * 60 * 1000

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function endOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

export function isSameLocalDay(left: number, right: number): boolean {
  return startOfLocalDay(left) === startOfLocalDay(right)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Formats a due timestamp for the compact chip in a todo row. */
export function formatDueLabel(dueAt: number, now = Date.now()): string {
  const due = new Date(dueAt)
  const time = `${pad(due.getHours())}:${pad(due.getMinutes())}`
  const dueDay = startOfLocalDay(dueAt)
  if (dueDay === startOfLocalDay(now)) return `今天 ${time}`
  if (dueDay === startOfLocalDay(now + DAY_MS)) return `明天 ${time}`
  if (dueDay === startOfLocalDay(now - DAY_MS)) return `昨天 ${time}`
  const monthDay = `${due.getMonth() + 1}月${due.getDate()}日`
  if (due.getFullYear() !== new Date(now).getFullYear())
    return `${due.getFullYear()}年${monthDay} ${time}`
  return `${monthDay} ${time}`
}

/** Value for an `<input type="datetime-local">` in local time. */
export function toDateTimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Parses a local datetime-local value; invalid/empty values become null. */
export function fromDateTimeLocalValue(value: string): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export type DueTodoLike = {
  id: string
  text: string
  done: boolean
  dueAt: number | null
}

/** Next local occurrence for a repeating todo; null means it does not repeat. */
export function nextRepeatDueAt(
  previousDueAt: number | null,
  repeat: TodoRepeat,
  now = Date.now(),
): number | null {
  if (repeat === 'none') return null
  // Repeats follow the calendar date, like Reminders; never use the exact
  // completion time as a new series start.
  const date = new Date(previousDueAt ?? endOfLocalDay(now))
  switch (repeat) {
    case 'daily':
      date.setDate(date.getDate() + 1)
      break
    case 'weekdays':
      do {
        date.setDate(date.getDate() + 1)
      } while (date.getDay() === 0 || date.getDay() === 6)
      break
    case 'weekly':
      date.setDate(date.getDate() + 7)
      break
    case 'monthly': {
      const day = date.getDate()
      const targetMonth = date.getMonth() + 1
      const lastDay = new Date(
        date.getFullYear(),
        targetMonth + 1,
        0,
      ).getDate()
      date.setMonth(targetMonth, Math.min(day, lastDay))
      break
    }
    case 'yearly': {
      const month = date.getMonth()
      const day = date.getDate()
      const targetYear = date.getFullYear() + 1
      const lastDay = new Date(targetYear, month + 1, 0).getDate()
      date.setDate(1)
      date.setFullYear(targetYear)
      date.setMonth(month, Math.min(day, lastDay))
      break
    }
  }
  return date.getTime()
}

/**
 * Returns open todos whose deadline passed since the previous check. A short
 * grace window avoids notifying a backlog of old items after the app sleeps.
 */
export function dueTodosToNotify<T extends DueTodoLike>(
  todos: readonly T[],
  lastCheck: number,
  now: number,
): T[] {
  const grace = 5 * 60 * 1000
  return todos.filter(
    (todo) =>
      !todo.done &&
      todo.dueAt !== null &&
      todo.dueAt > lastCheck &&
      todo.dueAt <= now &&
      now - todo.dueAt <= grace,
  )
}

/**
 * Removes deadlines already announced in this process. The map is shared with
 * water/break reminders, so todo keys carry their own prefix. A changed due
 * date is treated as a new reminder.
 */
export function filterUnnotifiedDueTodos<T extends DueTodoLike>(
  todos: readonly T[],
  notified: Map<string, number>,
): T[] {
  const fresh: T[] = []
  for (const todo of todos) {
    if (todo.dueAt === null) continue
    const key = `todo:${todo.id}`
    if (notified.get(key) === todo.dueAt) continue
    notified.set(key, todo.dueAt)
    fresh.push(todo)
  }
  return fresh
}
