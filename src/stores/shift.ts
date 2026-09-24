import { computed } from 'vue'
import { defineStore } from 'pinia'
import { persisted } from '@/composables/persisted'
import { netCash, uid } from '@/utils/pos'
import { useAuthStore } from './auth'
import { useOrdersStore } from './orders'
import { useSettingsStore } from './settings'
import type { PaymentMethod, Shift } from '@/types'

export interface ShiftSummary {
  orders: number
  refunds: number
  gross: number
  refunded: number
  byMethod: Record<PaymentMethod, number>
  cashSales: number
  cashRefunds: number
  cashIn: number
  cashOut: number
  expectedCash: number
}

export const useShiftStore = defineStore('shift', () => {
  const shifts = persisted<Shift[]>('shifts', () => [])
  const current = computed(() => shifts.value.find((s) => s.closedAt === null) ?? null)
  const history = computed(() => shifts.value.filter((s) => s.closedAt !== null))

  function summary(shift: Shift): ShiftSummary {
    const orders = useOrdersStore().orders
    const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0 }
    let count = 0
    let gross = 0
    let cashSales = 0
    let refunds = 0
    let refunded = 0
    let cashRefunds = 0
    for (const o of orders) {
      if (o.shiftId === shift.id) {
        count++
        gross += o.total
        const cash = netCash(o.payments, o.change)
        cashSales += cash
        byMethod.cash += cash
        for (const p of o.payments) if (p.method !== 'cash') byMethod[p.method] += p.amount
      }
      if (o.refund && o.refund.shiftId === shift.id) {
        refunds++
        refunded += o.total
        cashRefunds += netCash(o.payments, o.change)
      }
    }
    const cashIn = shift.cashMoves.filter((m) => m.type === 'in').reduce((s, m) => s + m.amount, 0)
    const cashOut = shift.cashMoves
      .filter((m) => m.type === 'out')
      .reduce((s, m) => s + m.amount, 0)
    const round = useSettingsStore().round
    return {
      orders: count,
      refunds,
      gross: round(gross),
      refunded: round(refunded),
      byMethod: { cash: round(byMethod.cash), card: round(byMethod.card), qr: round(byMethod.qr) },
      cashSales: round(cashSales),
      cashRefunds: round(cashRefunds),
      cashIn: round(cashIn),
      cashOut: round(cashOut),
      expectedCash: round(shift.openingFloat + cashSales - cashRefunds + cashIn - cashOut),
    }
  }

  function open(openingFloat: number) {
    if (current.value) return
    shifts.value.unshift({
      id: uid(),
      openedAt: Date.now(),
      openedBy: useAuthStore().user?.name ?? '',
      openingFloat,
      cashMoves: [],
      closedAt: null,
      closedBy: null,
      countedCash: null,
      expectedCash: null,
      note: '',
    })
  }

  function moveCash(type: 'in' | 'out', amount: number, reason: string) {
    current.value?.cashMoves.push({
      at: Date.now(),
      type,
      amount,
      reason,
      by: useAuthStore().user?.name ?? '',
    })
  }

  function close(countedCash: number, note: string) {
    const s = current.value
    if (!s) return
    s.expectedCash = summary(s).expectedCash
    s.countedCash = countedCash
    s.note = note
    s.closedBy = useAuthStore().user?.name ?? ''
    s.closedAt = Date.now()
  }

  function reset() {
    shifts.value = []
  }

  return { shifts, current, history, summary, open, moveCash, close, reset }
})
