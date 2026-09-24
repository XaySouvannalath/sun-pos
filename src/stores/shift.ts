import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import type { ShiftWithSummary } from '@/types'

export const useShiftStore = defineStore('shift', () => {
  /** The open shift and its live cash summary, or null when no shift is open. */
  const open_ = ref<ShiftWithSummary | null>(null)
  const current = computed(() => open_.value?.shift ?? null)
  const summary = computed(() => open_.value?.summary ?? null)

  async function load() {
    open_.value = await api.shifts.current()
  }

  async function open(openingFloat: number) {
    open_.value = await api.shifts.open(openingFloat)
  }

  async function moveCash(type: 'in' | 'out', amount: number, reason: string) {
    open_.value = await api.shifts.moveCash({ type, amount, reason })
  }

  async function close(countedCash: number, note: string) {
    const closed = await api.shifts.close({ countedCash, note })
    open_.value = null
    return closed
  }

  return { current, summary, load, open, moveCash, close }
})
