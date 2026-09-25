import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface ToastAction {
  label: string
  run: () => unknown
}

export interface Toast {
  id: number
  message: string
  tone: 'default' | 'success' | 'error'
  /** An optional button, such as Undo. */
  action?: ToastAction
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  let seq = 0

  function show(message: string, tone: Toast['tone'] = 'default', ms = 2200, action?: ToastAction) {
    const id = ++seq
    toasts.value.push({ id, message, tone, action })
    if (toasts.value.length > 4) toasts.value.shift()
    // Messages with a button stay longer, so there is time to press it.
    setTimeout(() => dismiss(id), action ? Math.max(ms, 6000) : ms)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  async function act(t: Toast) {
    dismiss(t.id)
    await t.action?.run()
  }

  return { toasts, show, dismiss, act }
})
