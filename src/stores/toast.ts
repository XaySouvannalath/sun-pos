import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface Toast {
  id: number
  message: string
  tone: 'default' | 'success' | 'error'
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  let seq = 0

  function show(message: string, tone: Toast['tone'] = 'default', ms = 2200) {
    const id = ++seq
    toasts.value.push({ id, message, tone })
    if (toasts.value.length > 4) toasts.value.shift()
    setTimeout(() => dismiss(id), ms)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, show, dismiss }
})
