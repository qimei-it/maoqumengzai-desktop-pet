import { reactive, ref } from 'vue'

export type ToastType = 'error' | 'warning' | 'success'
export type ToastItem = { id: number; message: string; type: ToastType }

export const toastItems = ref<ToastItem[]>([])
const closing = reactive(new Set<number>())
let nextId = 0

export function dismissToast(id: number): void {
  if (closing.has(id)) return
  closing.add(id)
  setTimeout(() => {
    toastItems.value = toastItems.value.filter((toast) => toast.id !== id)
    closing.delete(id)
  }, 220)
}

export function pushToast(
  message: string,
  type: ToastType = 'error',
  duration = 4200,
): void {
  const id = ++nextId
  toastItems.value.push({ id, message, type })
  setTimeout(() => dismissToast(id), duration)
}
