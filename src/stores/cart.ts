import { computed } from 'vue'
import { defineStore } from 'pinia'
import { persisted } from '@/composables/persisted'
import { clone, computeTotals, lineKey, uid } from '@/utils/pos'
import { useSettingsStore } from './settings'
import { useOrdersStore } from './orders'
import type {
  Discount,
  HeldOrder,
  Order,
  OrderLine,
  OrderType,
  Payment,
  Product,
  SelectedOption,
} from '@/types'

interface CartState {
  lines: OrderLine[]
  discount: Discount
  orderType: OrderType
  table: string
  note: string
  customerId: string | null
}

const emptyCart = (): CartState => ({
  lines: [],
  discount: { type: 'percent', value: 0 },
  orderType: 'dine-in',
  table: '',
  note: '',
  customerId: null,
})

/** Options pre-selected when a product is added in one tap: the first choice of each required group. */
export function defaultOptions(p: Product): SelectedOption[] {
  return p.options
    .filter((g) => g.required && g.choices.length)
    .map((g) => ({ group: g.name, name: g.choices[0]!.name, price: g.choices[0]!.price }))
}

export const useCartStore = defineStore('cart', () => {
  // The open cart survives a page reload so an order is never lost mid-sale.
  const state = persisted<CartState>('cart', emptyCart)
  const held = persisted<HeldOrder[]>('held', () => [])

  const settings = useSettingsStore()
  const totals = computed(() => computeTotals(state.value.lines, state.value.discount, settings.s))
  const isEmpty = computed(() => state.value.lines.length === 0)

  function add(p: Product, options: SelectedOption[] = defaultOptions(p), qty = 1) {
    const key = lineKey(p.id, options)
    const existing = state.value.lines.find((l) => l.key === key && !l.note && !l.discountPct)
    if (existing) {
      existing.qty += qty
      return
    }
    state.value.lines.push({
      key,
      productId: p.id,
      name: p.name,
      emoji: p.emoji,
      categoryId: p.categoryId,
      unitPrice: settings.round(p.price + options.reduce((s, o) => s + o.price, 0)),
      qty,
      options,
      note: '',
      discountPct: 0,
    })
  }

  function setQty(index: number, qty: number) {
    const l = state.value.lines[index]
    if (!l) return
    if (qty <= 0) state.value.lines.splice(index, 1)
    else l.qty = qty
  }

  function remove(index: number) {
    state.value.lines.splice(index, 1)
  }

  function clear() {
    state.value = emptyCart()
  }

  function hold(label: string) {
    if (isEmpty.value) return
    held.value.unshift({
      id: uid(),
      label: label || `Order ${held.value.length + 1}`,
      heldAt: Date.now(),
      ...clone(state.value),
    })
    clear()
  }

  function resume(id: string) {
    const h = held.value.find((x) => x.id === id)
    if (!h) return
    // Park whatever is on screen so nothing is lost when switching orders.
    if (!isEmpty.value) hold(state.value.table ? `Table ${state.value.table}` : '')
    state.value = {
      lines: h.lines,
      discount: h.discount,
      orderType: h.orderType,
      table: h.table,
      note: h.note,
      customerId: h.customerId,
    }
    held.value = held.value.filter((x) => x.id !== id)
  }

  function discardHeld(id: string) {
    held.value = held.value.filter((x) => x.id !== id)
  }

  function checkout(payments: Payment[]): Order {
    const t = totals.value
    const tendered = settings.round(payments.reduce((s, p) => s + p.amount, 0))
    const order = useOrdersStore().complete({
      ...t,
      lines: state.value.lines,
      orderDiscount: state.value.discount,
      orderType: state.value.orderType,
      table: state.value.table,
      note: state.value.note,
      customerId: state.value.customerId,
      payments,
      tendered,
      change: settings.round(Math.max(tendered - t.total, 0)),
      pointsEarned: state.value.customerId ? Math.floor(t.total * settings.s.pointsPerUnit) : 0,
    })
    clear()
    return order
  }

  return {
    state,
    held,
    totals,
    isEmpty,
    add,
    setQty,
    remove,
    clear,
    hold,
    resume,
    discardHeld,
    checkout,
  }
})
