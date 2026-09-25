import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, api } from '@/api'
import { useAuthStore } from './auth'
import type { ApprovalAction } from '@/types'

interface Pending {
  action: ApprovalAction
  /** For discounts: the percent to approve. */
  amount: number
  /** What is being approved, in words ("20% off", "1 × Latte"). */
  detail: string
  resolve: (id: string | null) => void
}

/**
 * Manager approval. `ask()` opens the PIN pad (ApprovalModal) and resolves with the approval id,
 * or null if cancelled. A manager signed in approves their own actions: it resolves with ''.
 */
export const useApprovalStore = defineStore('approval', () => {
  const pending = ref<Pending | null>(null)
  const error = ref('')
  const busy = ref(false)

  function ask(
    action: ApprovalAction,
    opts: { amount?: number; detail?: string } = {},
  ): Promise<string | null> {
    if (useAuthStore().isAdmin) return Promise.resolve('')
    pending.value?.resolve(null)
    error.value = ''
    return new Promise((resolve) => {
      pending.value = { action, amount: opts.amount ?? 0, detail: opts.detail ?? '', resolve }
    })
  }

  async function submit(pin: string) {
    const p = pending.value
    if (!p || busy.value) return
    busy.value = true
    error.value = ''
    try {
      const a = await api.approvals.request({ pin, action: p.action, amount: p.amount })
      pending.value = null
      p.resolve(a.id)
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : String(e)
    } finally {
      busy.value = false
    }
  }

  function cancel() {
    const p = pending.value
    pending.value = null
    p?.resolve(null)
  }

  return { pending, error, busy, ask, submit, cancel }
})
